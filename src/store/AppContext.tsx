/**
 * 全域狀態 + 本機端持久化（離線優先）。
 *
 * 財務數據屬高度隱私：此原型一律存於裝置本機（AsyncStorage），
 * 開發方伺服器不留存明碼財務數據。正式版會在此層加上本機加密與
 * iCloud / Google Drive 備份。
 */
import React, { createContext, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_STATE, FinanceState, Expense, clamp } from './finance';

const STORAGE_KEY = '@wealthtree3000/state/v1';

type Action =
  | { type: 'hydrate'; payload: FinanceState }
  | { type: 'addExpense'; amount: number; note: string }
  | { type: 'removeExpense'; id: string }
  | { type: 'closeMonth' } // 月度結算：判定紀律、推進月數、清空本月記帳
  | { type: 'setMarketTrend'; value: number }
  | { type: 'setBudget'; livingBudget: number }
  | { type: 'reset' };

function reducer(state: FinanceState, action: Action): FinanceState {
  switch (action.type) {
    case 'hydrate':
      return action.payload;

    case 'addExpense': {
      const expense: Expense = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        amount: action.amount,
        note: action.note.trim() || '日常支出',
        dateISO: new Date().toISOString(),
      };
      return { ...state, expenses: [expense, ...state.expenses] };
    }

    case 'removeExpense':
      return { ...state, expenses: state.expenses.filter((e) => e.id !== action.id) };

    case 'closeMonth': {
      const spent = state.expenses.reduce((sum, e) => sum + e.amount, 0);
      const withinBudget = spent <= state.livingBudget;
      const streak = withinBudget ? state.disciplineStreak + 1 : 0;

      // 投資成長：本月扣款 + 依大盤趨勢的月報酬
      const monthlyReturn = (0.06 + state.marketTrend * 0.08) / 12;
      const investmentValue = state.investmentValue * (1 + monthlyReturn) + state.monthlyInvest;
      const mortgageRemaining = Math.max(0, state.mortgageRemaining - state.monthlyMortgage);

      return {
        ...state,
        investmentValue,
        mortgageRemaining,
        monthsElapsed: state.monthsElapsed + 1,
        disciplineStreak: streak,
        rings: Math.floor(streak / 12),
        expenses: [],
      };
    }

    case 'setMarketTrend':
      return { ...state, marketTrend: clamp(action.value, -1, 1) };

    case 'setBudget':
      return { ...state, livingBudget: Math.max(0, action.livingBudget) };

    case 'reset':
      return { ...DEFAULT_STATE };

    default:
      return state;
  }
}

interface AppContextValue {
  state: FinanceState;
  ready: boolean;
  addExpense: (amount: number, note: string) => void;
  removeExpense: (id: string) => void;
  closeMonth: () => void;
  setMarketTrend: (value: number) => void;
  unlockAndSetBudget: (password: string, livingBudget: number) => boolean;
  restore: (payload: FinanceState) => void;
  reset: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, DEFAULT_STATE);
  const [ready, setReady] = React.useState(false);
  const hydrated = useRef(false);

  // 啟動時從本機載入
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) dispatch({ type: 'hydrate', payload: { ...DEFAULT_STATE, ...JSON.parse(raw) } });
      } catch {
        // 讀取失敗則沿用預設值（離線優先，不阻斷使用）
      } finally {
        hydrated.current = true;
        setReady(true);
      }
    })();
  }, []);

  // 變更時寫回本機
  useEffect(() => {
    if (!hydrated.current) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {});
  }, [state]);

  const value = useMemo<AppContextValue>(
    () => ({
      state,
      ready,
      addExpense: (amount, note) => dispatch({ type: 'addExpense', amount, note }),
      removeExpense: (id) => dispatch({ type: 'removeExpense', id }),
      closeMonth: () => dispatch({ type: 'closeMonth' }),
      setMarketTrend: (value) => dispatch({ type: 'setMarketTrend', value }),
      unlockAndSetBudget: (password, livingBudget) => {
        if (password !== state.budgetPassword) return false;
        dispatch({ type: 'setBudget', livingBudget });
        return true;
      },
      restore: (payload) => dispatch({ type: 'hydrate', payload: { ...DEFAULT_STATE, ...payload } }),
      reset: () => dispatch({ type: 'reset' }),
    }),
    [state, ready],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within <AppProvider>');
  return ctx;
}
