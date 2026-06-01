/** 模組四：暴風雨模擬器 (壓力測試與心理建設) */
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useApp } from '../store/AppContext';
import {
  STORMS,
  StormScenario,
  formatWan,
  growthFactor,
  projectGrowth,
  rootDepth,
  seasonFromTrend,
  totalAssets,
  unlockedCompanions,
} from '../store/finance';
import { WealthTree } from '../components/WealthTree';
import { Card, Caption, PrimaryButton, SectionTitle } from '../components/ui';
import { colors, font, radius, space } from '../theme';

export function StormScreen() {
  const { state } = useApp();
  const baseGrowth = growthFactor(state);

  const [growth, setGrowth] = useState(baseGrowth);
  const [lean, setLean] = useState(0);
  const [caption, setCaption] = useState('感到動搖時，按下按鈕，看看這棵樹熬過風暴後的模樣。');
  const [busy, setBusy] = useState(false);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!busy) setGrowth(baseGrowth);
  }, [baseGrowth, busy]);

  const fastForward = (years: number) => {
    if (busy) return;
    const points = projectGrowth(state, years);
    const final = points[points.length - 1];
    const targetGrowth = Math.sqrt(final.progress);
    setBusy(true);
    setCaption(`時光快轉 ${years} 年…`);

    anim.setValue(0);
    const id = anim.addListener(({ value }) => {
      setGrowth(baseGrowth + (targetGrowth - baseGrowth) * value);
    });
    Animated.timing(anim, { toValue: 1, duration: 1600, useNativeDriver: false }).start(() => {
      anim.removeListener(id);
      setCaption(
        `${years} 年後（${Math.round(final.age)} 歲）在複利下，總資產可達約 ${formatWan(final.assets)}，達標 ${(
          final.progress * 100
        ).toFixed(0)}%。`,
      );
      setBusy(false);
    });
  };

  const simulateStorm = (storm: StormScenario) => {
    if (busy) return;
    setBusy(true);
    setCaption(`模擬 ${storm.label}：${storm.blurb}`);

    const dip = baseGrowth * (1 - storm.drawdown * 0.6);
    const recovered = Math.min(1, baseGrowth * 1.08); // 風暴後因持續灌溉長得更高

    anim.setValue(0);
    const id = anim.addListener(({ value }) => {
      // 0..0.45 狂搖落葉 → 跌；0.45..1 復原並超越
      if (value < 0.45) {
        const k = value / 0.45;
        setGrowth(baseGrowth + (dip - baseGrowth) * k);
        setLean(Math.sin(value * 40) * 9 * (1 - k * 0.3));
      } else {
        const k = (value - 0.45) / 0.55;
        setGrowth(dip + (recovered - dip) * k);
        setLean(Math.sin(value * 20) * 3 * (1 - k));
      }
    });
    Animated.timing(anim, { toValue: 1, duration: 4200, useNativeDriver: false }).start(() => {
      anim.removeListener(id);
      setLean(0);
      setGrowth(recovered);
      setCaption(
        `${storm.label}過後：因為根系（持續繳房貸）與逢低不停扣，樹木比風暴前長得更高大。歷史上約 ${storm.recoveryMonths} 個月內收復。`,
      );
      setBusy(false);
    });
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Card style={styles.treeCard}>
        <WealthTree
          growth={growth}
          root={rootDepth(state)}
          health={1}
          season={lean !== 0 ? 'autumn' : seasonFromTrend(state.marketTrend)}
          rings={state.rings}
          companions={unlockedCompanions(state)}
          lean={lean}
          width={300}
        />
        <Text style={styles.caption}>{caption}</Text>
      </Card>

      {/* 時光快轉 */}
      <Card>
        <SectionTitle>⏩ 時光快轉</SectionTitle>
        <Caption>以動畫快轉複利效應下，這棵樹未來長成的模樣。</Caption>
        <View style={styles.btnRow}>
          <ForwardChip label="快轉 10 年" onPress={() => fastForward(10)} disabled={busy} />
          <ForwardChip label="快轉 20 年" onPress={() => fastForward(20)} disabled={busy} />
          <ForwardChip label={`到 ${state.startAge + state.targetYears} 歲`} onPress={() => fastForward(state.targetYears)} disabled={busy} />
        </View>
      </Card>

      {/* 歷史風暴 */}
      <Card>
        <SectionTitle>🌪️ 歷史風暴展示</SectionTitle>
        <Caption>模擬歷史大跌，看樹木如何狂搖落葉、又如何挺過。</Caption>
        <View style={{ height: space.sm }} />
        {STORMS.map((storm) => (
          <View key={storm.id} style={{ marginBottom: space.sm }}>
            <PrimaryButton label={storm.label} tone={colors.wither} onPress={() => simulateStorm(storm)} disabled={busy} />
          </View>
        ))}
      </Card>
    </ScrollView>
  );
}

function ForwardChip({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [styles.chip, { opacity: disabled ? 0.5 : pressed ? 0.8 : 1 }]}>
      <Text style={styles.chipText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.sand },
  content: { padding: space.md, paddingBottom: space.xl },
  treeCard: { alignItems: 'center', paddingVertical: space.lg },
  caption: { marginTop: space.sm, fontSize: font.small, color: colors.inkSoft, textAlign: 'center', lineHeight: 20 },
  btnRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm },
  chip: { backgroundColor: colors.leaf, paddingVertical: 10, paddingHorizontal: space.md, borderRadius: radius.pill },
  chipText: { color: '#FFFFFF', fontWeight: '700', fontSize: font.small },
});
