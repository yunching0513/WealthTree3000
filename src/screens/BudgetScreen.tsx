/** 模組二：水源分配器 (預算與現金流管理) */
import React, { useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useApp } from '../store/AppContext';
import { formatTWD, remainingBudget, spentThisMonth } from '../store/finance';
import { maybeWarnOverspend } from '../services/notifications';
import { Card, Caption, Pill, ProgressBar, PrimaryButton, SectionTitle } from '../components/ui';
import { colors, font, radius, space } from '../theme';

export function BudgetScreen() {
  const { state, addExpense, removeExpense, unlockAndSetBudget } = useApp();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  const remaining = remainingBudget(state);
  const spent = spentThisMonth(state);
  const overspent = remaining < 0;

  const onAdd = () => {
    const value = Math.round(Number(amount));
    if (!value || value <= 0) return;
    // 低干擾提醒：只在這筆讓餘額「剛跨過警戒線」時發一次通知。
    const prevRemaining = remaining;
    maybeWarnOverspend(prevRemaining, prevRemaining - value, state.livingBudget);
    addExpense(value, note);
    setAmount('');
    setNote('');
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {/* 桌面小工具預覽：只顯示剩餘餘額 */}
      <View style={[styles.widget, overspent && styles.widgetOver]}>
        <Text style={styles.widgetLabel}>本月剩餘可用</Text>
        <Text style={styles.widgetAmount}>{formatTWD(remaining)}</Text>
        <Text style={styles.widgetHint}>桌面小工具預覽・不顯示花費細項，降低記帳疲勞</Text>
      </View>

      {/* 每月淨流 + 剛性鎖定管線 */}
      <Card>
        <SectionTitle>每月淨流分配</SectionTitle>
        <FlowRow label="每月淨收入" value={state.netIncome} tone="ink" />
        <View style={styles.divider} />
        <LockedRow emoji="☀️" label="陽光水分・投資" value={state.monthlyInvest} />
        <LockedRow emoji="🪵" label="土壤養分・房貸本金" value={state.monthlyMortgage} />
        <FlowRow label="🌿 葉片健康・生活費預算" value={state.livingBudget} tone="leaf" />
        <Caption>投資與房貸為防呆鎖定 🔒，需密碼才能調整。</Caption>
      </Card>

      {/* 本月生活費進度 */}
      <Card>
        <View style={styles.rowBetween}>
          <SectionTitle>本月生活費</SectionTitle>
          <Pill tone={overspent ? 'warn' : 'good'}>{overspent ? '已超支' : '預算內'}</Pill>
        </View>
        <ProgressBar
          value={state.livingBudget ? spent / state.livingBudget : 0}
          color={overspent ? colors.warn : colors.leaf}
        />
        <Text style={styles.spentLine}>
          已花 {formatTWD(spent)} / 預算 {formatTWD(state.livingBudget)}
        </Text>
        {overspent && (
          <Caption>超支會讓部分葉片轉黃，作為溫和提示。下個月回到預算內即可恢復翠綠。</Caption>
        )}
      </Card>

      {/* 極簡記帳 */}
      <Card>
        <SectionTitle>日常記帳</SectionTitle>
        <View style={styles.inputRow}>
          <TextInput
            style={[styles.input, styles.amountInput]}
            placeholder="金額"
            placeholderTextColor={colors.inkFaint}
            keyboardType="number-pad"
            value={amount}
            onChangeText={setAmount}
          />
          <TextInput
            style={[styles.input, styles.noteInput]}
            placeholder="備註（選填）"
            placeholderTextColor={colors.inkFaint}
            value={note}
            onChangeText={setNote}
          />
        </View>
        <PrimaryButton label="記一筆" onPress={onAdd} disabled={!amount} />

        {state.expenses.length > 0 && (
          <View style={styles.list}>
            {state.expenses.map((e) => (
              <Pressable
                key={e.id}
                onLongPress={() => removeExpense(e.id)}
                style={styles.expenseRow}
              >
                <Text style={styles.expenseNote}>{e.note}</Text>
                <Text style={styles.expenseAmount}>-{formatTWD(e.amount)}</Text>
              </Pressable>
            ))}
            <Caption>長按一筆即可刪除。</Caption>
          </View>
        )}
      </Card>

      <UnlockBudget
        onUnlock={(pwd, budget) => {
          const ok = unlockAndSetBudget(pwd, budget);
          Alert.alert(ok ? '已更新生活費預算' : '密碼錯誤', ok ? `新預算 ${formatTWD(budget)}` : '請重新輸入特殊密碼。');
          return ok;
        }}
      />
    </ScrollView>
  );
}

function FlowRow({ label, value, tone }: { label: string; value: number; tone: 'ink' | 'leaf' }) {
  return (
    <View style={styles.flowRow}>
      <Text style={[styles.flowLabel, tone === 'leaf' && { color: colors.leafDeep, fontWeight: '700' }]}>{label}</Text>
      <Text style={[styles.flowValue, tone === 'leaf' && { color: colors.leafDeep }]}>{formatTWD(value)}</Text>
    </View>
  );
}

function LockedRow({ emoji, label, value }: { emoji: string; label: string; value: number }) {
  return (
    <View style={styles.flowRow}>
      <Text style={styles.flowLabel}>
        {emoji} {label} 🔒
      </Text>
      <Text style={styles.flowValue}>{formatTWD(value)}</Text>
    </View>
  );
}

function UnlockBudget({ onUnlock }: { onUnlock: (pwd: string, budget: number) => boolean }) {
  const [open, setOpen] = useState(false);
  const [pwd, setPwd] = useState('');
  const [budget, setBudget] = useState('');

  if (!open) {
    return (
      <Pressable onPress={() => setOpen(true)} style={styles.unlockToggle}>
        <Text style={styles.unlockToggleText}>🔒 調整鎖定預算（需密碼）</Text>
      </Pressable>
    );
  }
  return (
    <Card>
      <SectionTitle>調整生活費預算</SectionTitle>
      <TextInput
        style={styles.input}
        placeholder="特殊密碼"
        placeholderTextColor={colors.inkFaint}
        secureTextEntry
        value={pwd}
        onChangeText={setPwd}
      />
      <TextInput
        style={[styles.input, { marginTop: space.sm }]}
        placeholder="新生活費預算"
        placeholderTextColor={colors.inkFaint}
        keyboardType="number-pad"
        value={budget}
        onChangeText={setBudget}
      />
      <View style={{ height: space.sm }} />
      <PrimaryButton
        label="確認"
        onPress={() => {
          const ok = onUnlock(pwd, Math.round(Number(budget)) || 0);
          if (ok) {
            setOpen(false);
            setPwd('');
            setBudget('');
          }
        }}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.sand },
  content: { padding: space.md, paddingBottom: space.xl },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },

  widget: {
    backgroundColor: colors.leafDeep,
    borderRadius: radius.lg,
    padding: space.lg,
    marginBottom: space.md,
    alignItems: 'center',
  },
  widgetOver: { backgroundColor: colors.wither },
  widgetLabel: { color: '#D7E8D2', fontSize: font.small, fontWeight: '600' },
  widgetAmount: { color: '#FFFFFF', fontSize: 44, fontWeight: '800', marginVertical: 4 },
  widgetHint: { color: '#C9DCC3', fontSize: font.tiny, textAlign: 'center' },

  flowRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  flowLabel: { fontSize: font.body, color: colors.inkSoft },
  flowValue: { fontSize: font.body, color: colors.ink, fontWeight: '600' },
  divider: { height: 1, backgroundColor: '#EFE9DB', marginVertical: 6 },

  spentLine: { marginTop: space.sm, fontSize: font.small, color: colors.inkSoft },

  inputRow: { flexDirection: 'row', gap: space.sm, marginBottom: space.sm },
  input: {
    backgroundColor: '#F4F0E6',
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    paddingVertical: 12,
    fontSize: font.body,
    color: colors.ink,
  },
  amountInput: { width: 110 },
  noteInput: { flex: 1 },

  list: { marginTop: space.md, gap: 2 },
  expenseRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F0EBDD',
  },
  expenseNote: { fontSize: font.body, color: colors.ink },
  expenseAmount: { fontSize: font.body, color: colors.wither, fontWeight: '600' },

  unlockToggle: { alignItems: 'center', paddingVertical: space.md },
  unlockToggleText: { color: colors.inkSoft, fontSize: font.small, fontWeight: '600' },
});
