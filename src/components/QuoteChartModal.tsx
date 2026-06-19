/** 報價走勢視窗：點任一報價彈出，可選時間長度看價格趨勢折線圖。 */
import React from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import {
  NewsQuote,
  PriceSeries,
  TREND_RANGES,
  TrendRange,
  fetchSeries,
} from '../services/news';
import { TrendChart } from './TrendChart';
import { colors, font, radius, space } from '../theme';

function fmt(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

export function QuoteChartModal({ quote, onClose }: { quote: NewsQuote | null; onClose: () => void }) {
  const [range, setRange] = React.useState<TrendRange>('3M');
  const [series, setSeries] = React.useState<PriceSeries | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [isSample, setIsSample] = React.useState(false);
  const { width } = useWindowDimensions();
  const chartWidth = Math.min(width, 560) - space.md * 2 - space.md * 2;

  React.useEffect(() => {
    if (!quote) return;
    let active = true;
    setLoading(true);
    fetchSeries(quote, range).then((res) => {
      if (!active) return;
      setSeries(res.series);
      setIsSample(res.source === 'sample');
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [quote, range]);

  const pts = series?.points ?? [];
  const first = pts[0]?.c;
  const last = pts[pts.length - 1]?.c;
  const changePct = first && last ? ((last - first) / first) * 100 : 0;
  const up = changePct >= 0;
  const hi = pts.length ? Math.max(...pts.map((p) => p.c)) : 0;
  const lo = pts.length ? Math.min(...pts.map((p) => p.c)) : 0;
  const rangeLabel = TREND_RANGES.find((r) => r.key === range)?.label ?? '';

  return (
    <Modal visible={quote != null} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropTap} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          {quote && (
            <>
              <View style={styles.headerRow}>
                <Text style={styles.title}>{quote.label}</Text>
                <Pressable onPress={onClose} hitSlop={12}>
                  <Text style={styles.close}>✕</Text>
                </Pressable>
              </View>

              <View style={styles.priceRow}>
                <Text style={styles.price}>{fmt(quote.price)}</Text>
                <Text style={[styles.change, { color: up ? colors.danger : colors.leafDeep }]}>
                  {up ? '▲' : '▼'} {up ? '+' : ''}
                  {changePct.toFixed(2)}%・近{rangeLabel}
                </Text>
              </View>

              <View style={styles.rangeRow}>
                {TREND_RANGES.map((r) => {
                  const on = r.key === range;
                  return (
                    <Pressable
                      key={r.key}
                      onPress={() => setRange(r.key)}
                      style={[styles.rangePill, on && styles.rangePillOn]}
                    >
                      <Text style={[styles.rangeText, on && styles.rangeTextOn]}>{r.label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={[styles.chartArea, { height: 200 }]}>
                {loading ? (
                  <ActivityIndicator color={colors.leaf} />
                ) : (
                  <TrendChart points={pts} up={up} width={chartWidth} height={200} />
                )}
              </View>

              <View style={styles.statsRow}>
                <Stat label="區間最高" value={fmt(hi)} />
                <Stat label="區間最低" value={fmt(lo)} />
                {pts.length > 0 && <Stat label="期間" value={`${pts[0].t} → ${pts[pts.length - 1].t}`} />}
              </View>

              {isSample && (
                <Text style={styles.note}>範例走勢資料（後端尚未設定）。接上 Phase 2 後即顯示真實歷史行情。</Text>
              )}
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(51,41,31,0.35)' },
  backdropTap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  sheet: {
    backgroundColor: colors.paper,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: space.md,
    paddingBottom: space.xl,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#D8D1C0', marginBottom: space.sm },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: font.title, fontWeight: '800', color: colors.ink },
  close: { fontSize: font.section, color: colors.inkSoft, fontWeight: '700' },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm, marginTop: 2 },
  price: { fontSize: 30, fontWeight: '800', color: colors.ink, lineHeight: 34 },
  change: { fontSize: font.small, fontWeight: '700' },
  rangeRow: { flexDirection: 'row', gap: space.xs, marginTop: space.md },
  rangePill: {
    flex: 1,
    paddingVertical: space.sm,
    borderRadius: radius.sm,
    backgroundColor: '#ECE7DA',
    alignItems: 'center',
  },
  rangePillOn: { backgroundColor: colors.leafDeep },
  rangeText: { fontSize: font.small, fontWeight: '700', color: colors.inkSoft },
  rangeTextOn: { color: '#FFFFFF' },
  chartArea: { marginTop: space.md, alignItems: 'center', justifyContent: 'center' },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space.md, gap: space.sm },
  stat: { flex: 1 },
  statLabel: { fontSize: font.tiny, color: colors.inkSoft },
  statValue: { fontSize: font.small, fontWeight: '700', color: colors.ink, marginTop: 2 },
  note: { fontSize: font.tiny, color: colors.inkFaint, marginTop: space.md, lineHeight: 16 },
});
