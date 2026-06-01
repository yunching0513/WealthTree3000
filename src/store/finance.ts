/**
 * 植富 3000 — 財務領域邏輯（純函式）
 *
 * 把使用者的財務行為映射成「樹的生長」：
 *  - 總資產（投資 + 房屋淨值） → 樹的生長階段與高度
 *  - 房貸還款進度            → 樹根扎根深度
 *  - 當月生活費 vs 預算      → 葉片健康度
 *  - 連續紀律月數            → 年輪與陪伴動物
 *  - 大盤趨勢                → 天氣 / 季節
 */

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

export interface FinanceState {
  // 規劃
  startISO: string; // 計畫起始日（用來推算已經過月數）
  startAge: number; // 起始年齡
  targetAmount: number; // 目標資產（千年神木）
  targetYears: number; // 計畫年數

  // 帳戶
  investmentValue: number; // 投資部位市值
  homeValue: number; // 房屋估值
  mortgageOriginal: number; // 房貸原始本金
  mortgageRemaining: number; // 房貸剩餘本金

  // 每月水源分配（剛性鎖定）
  netIncome: number; // 每月淨收入
  monthlyInvest: number; // 陽光水分（投資）
  monthlyMortgage: number; // 土壤養分（房貸本金）
  livingBudget: number; // 葉片健康度（生活費預算）
  budgetLocked: boolean; // 防呆鎖定
  budgetPassword: string; // 解鎖密碼

  // 進度與紀律
  monthsElapsed: number; // 已執行月數
  disciplineStreak: number; // 連續達成紀律的月數
  rings: number; // 年輪數（= floor(streak / 12)）
  marketTrend: number; // 大盤長期趨勢 -1..1（模擬）

  // 本月生活費記帳
  expenses: Expense[];
}

export interface Expense {
  id: string;
  amount: number;
  note: string;
  dateISO: string;
}

export interface GrowthStage {
  key: 'seedling' | 'young' | 'mature' | 'giant' | 'ancient';
  label: string;
  emoji: string;
}

export const STAGES: { stage: GrowthStage; minRatio: number }[] = [
  { stage: { key: 'seedling', label: '發芽樹苗', emoji: '🌱' }, minRatio: 0 },
  { stage: { key: 'young', label: '小樹', emoji: '🌿' }, minRatio: 0.05 },
  { stage: { key: 'mature', label: '大樹', emoji: '🌳' }, minRatio: 0.2 },
  { stage: { key: 'giant', label: '巨木', emoji: '🎄' }, minRatio: 0.5 },
  { stage: { key: 'ancient', label: '千年神木', emoji: '🌲' }, minRatio: 0.8 },
];

// 陪伴動物：每多一圈年輪解鎖一隻
export const COMPANIONS = ['🐿️', '🐦', '🦔', '🦉', '🐝', '🦋', '🐞', '🪺'];

export const DEFAULT_STATE: FinanceState = {
  startISO: '2026-06-01',
  startAge: 34,
  targetAmount: 30_000_000,
  targetYears: 30,

  investmentValue: 900_000,
  homeValue: 5_000_000,
  mortgageOriginal: 4_500_000,
  mortgageRemaining: 4_500_000,

  netIncome: 50_000,
  monthlyInvest: 20_000,
  monthlyMortgage: 20_000,
  livingBudget: 10_000,
  budgetLocked: true,
  budgetPassword: '3000',

  monthsElapsed: 0,
  disciplineStreak: 0,
  rings: 0,
  marketTrend: 0.45,

  expenses: [],
};

/** 房屋淨值 = 估值 − 房貸剩餘 */
export function homeEquity(s: FinanceState): number {
  return Math.max(0, s.homeValue - s.mortgageRemaining);
}

/** 總資產 = 投資市值 + 房屋淨值 */
export function totalAssets(s: FinanceState): number {
  return s.investmentValue + homeEquity(s);
}

/** 目標達成比例 0..1 */
export function targetProgress(s: FinanceState): number {
  return clamp(totalAssets(s) / s.targetAmount, 0, 1);
}

/** 房貸還款進度 0..1（= 樹根扎根深度） */
export function rootDepth(s: FinanceState): number {
  if (s.mortgageOriginal <= 0) return 1;
  return clamp(1 - s.mortgageRemaining / s.mortgageOriginal, 0, 1);
}

/** 本月生活費已花費 */
export function spentThisMonth(s: FinanceState): number {
  return s.expenses.reduce((sum, e) => sum + e.amount, 0);
}

/** 本月剩餘可用餘額（桌面小工具只顯示這個） */
export function remainingBudget(s: FinanceState): number {
  return s.livingBudget - spentThisMonth(s);
}

/** 葉片健康度 0..1：花在預算內 → 1；超支愈多 → 愈低 */
export function leafHealth(s: FinanceState): number {
  const spent = spentThisMonth(s);
  if (spent <= s.livingBudget) return 1;
  const overshoot = (spent - s.livingBudget) / s.livingBudget;
  return clamp(1 - overshoot, 0.15, 1);
}

/** 生長階段 */
export function currentStage(s: FinanceState): GrowthStage {
  const ratio = targetProgress(s);
  let result = STAGES[0].stage;
  for (const entry of STAGES) {
    if (ratio >= entry.minRatio) result = entry.stage;
  }
  return result;
}

/**
 * 視覺生長係數 0..1。
 * 用平方根曲線讓早期（樹苗）的成長也看得見回饋，避免長期都是一根小苗。
 */
export function growthFactor(s: FinanceState): number {
  return Math.sqrt(targetProgress(s));
}

/** 已解鎖的陪伴動物 */
export function unlockedCompanions(s: FinanceState): string[] {
  return COMPANIONS.slice(0, Math.min(s.rings, COMPANIONS.length));
}

export interface Phase {
  index: number;
  label: string;
}

/** 30 年生命週期階段 */
export function lifecyclePhase(s: FinanceState): Phase {
  const year = s.monthsElapsed / 12;
  if (year < 5) return { index: 1, label: '階段一・博士班醞釀期' };
  if (year < 15) return { index: 2, label: '階段二・穩健扎根期' };
  if (year < 25) return { index: 3, label: '階段三・氣候防護期' };
  return { index: 4, label: '階段四・神木成形期' };
}

/** 是否到達第 15 年再平衡（氣候變遷準備）提醒 */
export function needsRebalanceNudge(s: FinanceState): boolean {
  const year = s.monthsElapsed / 12;
  return year >= 15;
}

/** 大盤趨勢 → 季節 */
export function seasonFromTrend(trend: number): Season {
  if (trend > 0.3) return 'summer';
  if (trend >= 0) return 'spring';
  if (trend > -0.3) return 'autumn';
  return 'winter';
}

export interface SeasonInfo {
  season: Season;
  label: string;
  emoji: string;
  message: string;
  bear: boolean;
}

export function seasonInfo(s: FinanceState): SeasonInfo {
  const season = seasonFromTrend(s.marketTrend);
  switch (season) {
    case 'summer':
      return { season, label: '盛夏・多頭繁盛', emoji: '☀️', message: '陽光充足，枝葉繁茂。維持紀律即可。', bear: false };
    case 'spring':
      return { season, label: '初春・穩步回暖', emoji: '🌤️', message: '萬物生長，持續灌溉。', bear: false };
    case 'autumn':
      return { season, label: '秋季・市場轉涼', emoji: '🍂', message: '秋天是樹木扎根的好時機，請持續灌溉。', bear: true };
    case 'winter':
      return { season, label: '寒冬・空頭落葉', emoji: '❄️', message: '冬天是樹木扎根的最佳時機，請持續灌溉。', bear: true };
  }
}

export interface ProjectionPoint {
  year: number;
  age: number;
  assets: number;
  progress: number;
}

/**
 * 複利成長投影（暴風雨模擬器・時光快轉用）。
 * - 投資部位：每月扣款 monthlyInvest，年化實質報酬 annualReturn。
 * - 房屋淨值：每月還本 monthlyMortgage，直到房貸還清。
 */
export function projectGrowth(s: FinanceState, years: number, annualReturn = 0.06): ProjectionPoint[] {
  const monthlyReturn = Math.pow(1 + annualReturn, 1 / 12) - 1;
  let invest = s.investmentValue;
  let mortgage = s.mortgageRemaining;
  const points: ProjectionPoint[] = [];

  for (let m = 1; m <= years * 12; m++) {
    invest = invest * (1 + monthlyReturn) + s.monthlyInvest;
    mortgage = Math.max(0, mortgage - s.monthlyMortgage);
    if (m % 12 === 0) {
      const equity = Math.max(0, s.homeValue - mortgage);
      const assets = invest + equity;
      points.push({
        year: s.monthsElapsed / 12 + m / 12,
        age: s.startAge + (s.monthsElapsed + m) / 12,
        assets,
        progress: clamp(assets / s.targetAmount, 0, 1),
      });
    }
  }
  return points;
}

// ── 歷史風暴情境（壓力測試） ──────────────────────────────
export interface StormScenario {
  id: string;
  label: string;
  drawdown: number; // 投資部位最大跌幅
  recoveryMonths: number; // 復原所需月數
  blurb: string;
}

export const STORMS: StormScenario[] = [
  {
    id: 'gfc2008',
    label: '2008 金融海嘯',
    drawdown: 0.55,
    recoveryMonths: 36,
    blurb: '大盤腰斬，樹冠狂搖落葉。但根系（持續繳房貸）與逢低不停扣，讓風暴後的樹反而更高大。',
  },
  {
    id: 'covid2020',
    label: '2020 疫情大跌',
    drawdown: 0.34,
    recoveryMonths: 6,
    blurb: '閃崩三成，葉片瞬間枯黃。持續灌溉者在六個月內看著新葉冒得比以前更密。',
  },
];

export function formatTWD(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-US');
}

/** 以「萬」為單位的精簡顯示 */
export function formatWan(n: number): string {
  const wan = n / 10_000;
  if (wan >= 1000) return (wan / 1000).toFixed(2) + ' 千萬';
  return Math.round(wan).toLocaleString('en-US') + ' 萬';
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
