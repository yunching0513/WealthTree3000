/** 模組一：溫室總覽 (Dashboard) */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useApp } from '../store/AppContext';
import {
  currentStage,
  growthFactor,
  homeEquity,
  leafHealth,
  lifecyclePhase,
  rootDepth,
  seasonFromTrend,
  seasonInfo,
  targetProgress,
  totalAssets,
  unlockedCompanions,
  formatWan,
} from '../store/finance';
import { WealthTree } from '../components/WealthTree';
import { Card, Caption, Pill, ProgressBar, SectionTitle } from '../components/ui';
import { colors, font, space } from '../theme';

export function DashboardScreen() {
  const { state } = useApp();
  const progress = targetProgress(state);
  const stage = currentStage(state);
  const phase = lifecyclePhase(state);
  const weather = seasonInfo(state);
  const health = leafHealth(state);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {/* 30 年生長進度條 */}
      <Card>
        <View style={styles.rowBetween}>
          <SectionTitle>30 年生長進度</SectionTitle>
          <Pill tone="neutral">{phase.label}</Pill>
        </View>
        <View style={styles.progressRow}>
          <Text style={styles.bigPct}>{(progress * 100).toFixed(1)}%</Text>
          <View style={styles.targetCol}>
            <Caption>目標 3,000 萬・{state.startAge + state.targetYears} 歲</Caption>
            <Caption>目前總資產 {formatWan(totalAssets(state))}</Caption>
          </View>
        </View>
        <ProgressBar value={progress} height={16} />
        <View style={styles.stageRow}>
          <Text style={styles.stageEmoji}>{stage.emoji}</Text>
          <Text style={styles.stageLabel}>目前階段：{stage.label}</Text>
        </View>
      </Card>

      {/* 主視覺互動區 */}
      <Card style={styles.treeCard}>
        <WealthTree
          growth={growthFactor(state)}
          root={rootDepth(state)}
          health={health}
          season={seasonFromTrend(state.marketTrend)}
          rings={state.rings}
          companions={unlockedCompanions(state)}
          width={300}
        />
        <Text style={styles.swipeHint}>地底是根系（房貸），天空是枝葉（投資）</Text>
        <View style={styles.legendRow}>
          <Legend emoji="☀️" label="陽光水分" value={`投資 ${formatWan(state.investmentValue)}`} />
          <Legend emoji="🌿" label="葉片健康" value={`${Math.round(health * 100)}%`} />
          <Legend emoji="🪵" label="樹根深度" value={`還款 ${Math.round(rootDepth(state) * 100)}%`} />
        </View>
      </Card>

      {/* 天氣系統 */}
      <Card style={[styles.weatherCard, weather.bear ? styles.weatherBear : styles.weatherBull]}>
        <View style={styles.rowBetween}>
          <SectionTitle>天氣・{weather.label}</SectionTitle>
          <Text style={styles.weatherEmoji}>{weather.emoji}</Text>
        </View>
        <Caption>{weather.message}</Caption>
      </Card>

      {/* 年輪 / 陪伴 */}
      <Card>
        <SectionTitle>年輪與陪伴</SectionTitle>
        <Caption>
          連續紀律 {state.disciplineStreak} 個月・已累積 {state.rings} 圈年輪
        </Caption>
        <View style={styles.companionRow}>
          {unlockedCompanions(state).length === 0 ? (
            <Caption>連續 12 個月達成現金流紀律，即可解鎖第一隻陪伴動物。</Caption>
          ) : (
            unlockedCompanions(state).map((c, i) => (
              <Text key={i} style={styles.companion}>
                {c}
              </Text>
            ))
          )}
        </View>
      </Card>
    </ScrollView>
  );
}

function Legend({ emoji, label, value }: { emoji: string; label: string; value: string }) {
  return (
    <View style={styles.legend}>
      <Text style={styles.legendEmoji}>{emoji}</Text>
      <Text style={styles.legendLabel}>{label}</Text>
      <Text style={styles.legendValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.sand },
  content: { padding: space.md, paddingBottom: space.xl },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressRow: { flexDirection: 'row', alignItems: 'flex-end', marginVertical: space.sm, gap: space.md },
  bigPct: { fontSize: 40, fontWeight: '800', color: colors.leafDeep, lineHeight: 44 },
  targetCol: { flex: 1, gap: 2, paddingBottom: 6 },
  stageRow: { flexDirection: 'row', alignItems: 'center', marginTop: space.sm, gap: space.sm },
  stageEmoji: { fontSize: 22 },
  stageLabel: { fontSize: font.body, color: colors.ink, fontWeight: '600' },
  treeCard: { alignItems: 'center', paddingVertical: space.lg },
  swipeHint: { fontSize: font.tiny, color: colors.inkFaint, marginTop: space.sm },
  legendRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginTop: space.md },
  legend: { alignItems: 'center', flex: 1 },
  legendEmoji: { fontSize: 20 },
  legendLabel: { fontSize: font.tiny, color: colors.inkSoft, marginTop: 2 },
  legendValue: { fontSize: font.small, color: colors.ink, fontWeight: '700', marginTop: 2 },
  weatherCard: {},
  weatherBull: { backgroundColor: '#EAF4E6' },
  weatherBear: { backgroundColor: '#EDE7DA' },
  weatherEmoji: { fontSize: 24 },
  companionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm },
  companion: { fontSize: 26 },
});
