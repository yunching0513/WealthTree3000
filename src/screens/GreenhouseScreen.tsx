/** 模組三：時光溫室 (投資與資產追蹤) */
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useApp } from '../store/AppContext';
import {
  formatTWD,
  formatWan,
  homeEquity,
  needsRebalanceNudge,
  totalAssets,
} from '../store/finance';
import { Card, Caption, Pill, ProgressBar, PrimaryButton, SectionTitle } from '../components/ui';
import { colors, font, space } from '../theme';

export function GreenhouseScreen() {
  const { state, closeMonth } = useApp();
  const [unlocked, setUnlocked] = useState(false);

  // 生命週期股債配置（glide path）：第 15 年起逐步增加債券（防風支架）。
  const rebalance = needsRebalanceNudge(state);
  const stockPct = rebalance ? 70 : 90;
  const bondPct = 100 - stockPct;

  const onUnlock = () => {
    closeMonth();
    setUnlocked(true);
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {/* 盲盒模式說明 */}
      <Card style={styles.blindCard}>
        <SectionTitle>盲盒模式</SectionTitle>
        <Caption>
          日常介面絕對不顯示當日或當週的未實現損益。把注意力放在紀律執行，而非市場波動。
        </Caption>
        <View style={styles.blindBox}>
          <Text style={styles.blindEmoji}>🎁</Text>
          <Text style={styles.blindText}>本月損益・封存中</Text>
        </View>
      </Card>

      {/* 月度解鎖報告 */}
      {!unlocked ? (
        <Card>
          <SectionTitle>月度生長報告</SectionTitle>
          <Caption>僅在每月最後一天解鎖。結算本月後，即可查看股債比例與資產實際市值。</Caption>
          <View style={{ height: space.md }} />
          <PrimaryButton label="🔓 結算本月並解鎖報告" onPress={onUnlock} />
          <Caption>（原型：點擊會推進一個月，模擬扣款、房貸還本與市場報酬）</Caption>
        </Card>
      ) : (
        <Card>
          <View style={styles.rowBetween}>
            <SectionTitle>本月生長報告</SectionTitle>
            <Pill tone="good">已解鎖</Pill>
          </View>

          <Text style={styles.reportLabel}>資產實際市值</Text>
          <ReportRow label="投資部位" value={state.investmentValue} />
          <ReportRow label="房屋淨值" value={homeEquity(state)} />
          <ReportRow label="房貸剩餘" value={-state.mortgageRemaining} />
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>總資產</Text>
            <Text style={styles.totalValue}>{formatWan(totalAssets(state))}</Text>
          </View>

          <View style={{ height: space.md }} />
          <Text style={styles.reportLabel}>股債比例</Text>
          <View style={styles.ratioBar}>
            <View style={[styles.ratioStock, { flex: stockPct }]}>
              <Text style={styles.ratioText}>股 {stockPct}%</Text>
            </View>
            <View style={[styles.ratioBond, { flex: bondPct }]}>
              <Text style={styles.ratioText}>債 {bondPct}%</Text>
            </View>
          </View>

          <Caption>
            已執行 {state.monthsElapsed} 個月・連續紀律 {state.disciplineStreak} 個月
          </Caption>
        </Card>
      )}

      {/* 第 15 年再平衡提醒 */}
      {rebalance && (
        <Card style={styles.nudgeCard}>
          <SectionTitle>🌬️ 氣候變遷準備</SectionTitle>
          <Caption>
            已邁入第 15 年。建議將部分股票資產轉換為債券，象徵為樹木加裝防風支架，降低退休前的波動。
          </Caption>
        </Card>
      )}
    </ScrollView>
  );
}

function ReportRow({ label, value }: { label: string; value: number }) {
  const negative = value < 0;
  return (
    <View style={styles.reportRow}>
      <Text style={styles.reportRowLabel}>{label}</Text>
      <Text style={[styles.reportRowValue, negative && { color: colors.wither }]}>{formatTWD(value)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.sand },
  content: { padding: space.md, paddingBottom: space.xl },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },

  blindCard: {},
  blindBox: {
    backgroundColor: '#EFE9DB',
    borderRadius: 16,
    paddingVertical: space.lg,
    alignItems: 'center',
    marginTop: space.md,
  },
  blindEmoji: { fontSize: 40 },
  blindText: { marginTop: space.sm, color: colors.inkSoft, fontWeight: '600' },

  reportLabel: { fontSize: font.small, color: colors.inkFaint, fontWeight: '700', marginTop: space.sm, marginBottom: 4 },
  reportRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#F0EBDD' },
  reportRowLabel: { fontSize: font.body, color: colors.inkSoft },
  reportRowValue: { fontSize: font.body, color: colors.ink, fontWeight: '600' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10 },
  totalLabel: { fontSize: font.section, color: colors.ink, fontWeight: '700' },
  totalValue: { fontSize: font.section, color: colors.leafDeep, fontWeight: '800' },

  ratioBar: { flexDirection: 'row', height: 30, borderRadius: 8, overflow: 'hidden', marginBottom: space.sm },
  ratioStock: { backgroundColor: colors.leaf, alignItems: 'center', justifyContent: 'center' },
  ratioBond: { backgroundColor: colors.ring, alignItems: 'center', justifyContent: 'center' },
  ratioText: { color: '#FFFFFF', fontSize: font.small, fontWeight: '700' },

  nudgeCard: { backgroundColor: '#EDE7DA' },
});
