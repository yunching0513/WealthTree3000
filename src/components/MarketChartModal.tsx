/** 台股個股 / 指數走勢視窗：點自選股任一列彈出，可切換時間長度看走勢折線圖（視覺比照 QuoteChartModal）。 */
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
import type { PricePoint } from '../services/news';
import { getSeries } from '../services/twstock';
import type { SeriesPoint, TwQuote } from '../services/twstockParsers';
import { TrendChart } from './TrendChart';
import { colors, font, radius, space } from '../theme';

/** getSeries 支援的時間長度（與 twstock.ts 合約一致）。 */
type MarketRange = '1d' | '5d' | '1mo' | '3mo' | '1y';

const RANGES: { key: MarketRange; label: string }[] = [
  { key: '1d', label: '1日' },
  { key: '5d', label: '5日' },
  { key: '1mo', label: '1月' },
  { key: '3mo', label: '3月' },
  { key: '1y', label: '1年' },
];

/** 數字格式（null / undefined 顯示長破折號）。 */
function fmt(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

/** 成交量格式：大數換算 萬 / 億，來源單位不一（股或張）故不加單位字。 */
function fmtVolume(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  if (v >= 1e8) return `${(v / 1e8).toFixed(2)} 億`;
  if (v >= 1e4) return `${(v / 1e4).toFixed(1)} 萬`;
  return v.toLocaleString('en-US');
}

/** 時間戳（秒或毫秒皆容忍）→ 台北時間字串；盤中走勢含時分，長天期只到日期。 */
function fmtTs(t: number, intraday: boolean): string {
  const ms = t < 1e12 ? t * 1000 : t;
  try {
    return new Intl.DateTimeFormat('zh-TW', {
      timeZone: 'Asia/Taipei',
      month: '2-digit',
      day: '2-digit',
      ...(intraday
        ? { hour: '2-digit', minute: '2-digit', hour12: false }
        : { year: 'numeric' }),
    }).format(new Date(ms));
  } catch {
    return String(t);
  }
}

export function MarketChartModal({
  visible,
  onClose,
  code,
  name,
  quote,
}: {
  visible: boolean;
  onClose: () => void;
  code: string;
  name: string;
  quote?: TwQuote | null;
}) {
  const [range, setRange] = React.useState<MarketRange>('1d');
  const [points, setPoints] = React.useState<SeriesPoint[]>([]);
  const [sourceLabel, setSourceLabel] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const { width } = useWindowDimensions();
  const chartWidth = Math.min(width, 560) - space.md * 2 - space.md * 2;

  React.useEffect(() => {
    if (!visible) {
      // 關閉即重置：下次開啟（可能換了股票）不殘留前一檔的圖表 / 來源標籤一幀
      setPoints([]);
      setSourceLabel('');
      setLoading(true);
      return;
    }
    let active = true; // 避免競態：關閉或切換後不再 setState
    setLoading(true);
    getSeries(code, range)
      .then((res) => {
        if (!active) return;
        setPoints(res.points);
        setSourceLabel(res.sourceLabel);
        setLoading(false);
      })
      .catch(() => {
        // 合約規定 getSeries 絕不 throw，此處僅為雙重保險
        if (!active) return;
        setPoints([]);
        setSourceLabel('無法取得');
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [visible, code, range]);

  // 走勢區間漲跌（以序列首尾計算）；報價有當日漲跌 % 時整行採當日值，
  // 否則整行退用區間值（漲跌額與 % 必須同期間，不可混用）
  const first = points[0]?.v;
  const last = points[points.length - 1]?.v;
  const seriesPct = first != null && last != null && first !== 0 ? ((last - first) / first) * 100 : null;
  const todayPct = quote?.changePct;
  const shownPct = todayPct ?? seriesPct;
  const shownChange = todayPct != null ? quote?.change ?? null : null; // 區間模式無對應漲跌額
  const up = (seriesPct ?? shownPct ?? 0) >= 0; // 圖表顏色以區間方向為準（紅漲綠跌）
  const changeTint = (shownPct ?? 0) >= 0 ? colors.danger : colors.leafDeep;
  const rangeLabel = RANGES.find((r) => r.key === range)?.label ?? '';

  const intraday = range === '1d' || range === '5d';
  // SeriesPoint { t:number, v:number } → TrendChart 需要的 PricePoint { t:string, c:number }
  const chartPts: PricePoint[] = points.map((p) => ({ t: fmtTs(p.t, intraday), c: p.v }));

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropTap} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />

          <View style={styles.headerRow}>
            <Text style={styles.title}>
              {name}
              <Text style={styles.code}>（{code}）</Text>
            </Text>
            {/* react-native-web 不支援 hitSlop，另以 padding + 負 margin 擴大可點範圍（不影響版面） */}
            <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
              <Text style={styles.close}>✕</Text>
            </Pressable>
          </View>

          <View style={styles.priceRow}>
            <Text style={styles.price}>{fmt(quote?.price ?? last)}</Text>
            {shownPct != null && (
              <Text style={[styles.change, { color: changeTint }]}>
                {`${shownPct >= 0 ? '▲' : '▼'} ` +
                  (shownChange != null ? `${shownChange >= 0 ? '+' : ''}${fmt(shownChange)}（` : '') +
                  `${shownPct >= 0 ? '+' : ''}${shownPct.toFixed(2)}%` +
                  (shownChange != null ? '）' : '') +
                  (todayPct != null ? '・今日' : `・近${rangeLabel}`)}
              </Text>
            )}
          </View>

          {/* 開 / 高 / 低 / 量（來自即時報價，缺值顯示 —） */}
          <View style={styles.statsRow}>
            <Stat label="開" value={fmt(quote?.open)} />
            <Stat label="高" value={fmt(quote?.high)} />
            <Stat label="低" value={fmt(quote?.low)} />
            <Stat label="量" value={fmtVolume(quote?.volume)} />
          </View>

          <View style={styles.rangeRow}>
            {RANGES.map((r) => {
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
            ) : chartPts.length >= 2 ? (
              <TrendChart points={chartPts} up={up} width={chartWidth} height={200} />
            ) : (
              // 取不到走勢時顯示來源說明，不留空白
              <Text style={styles.failText}>{sourceLabel || '無法取得'}</Text>
            )}
          </View>

          {!loading && chartPts.length >= 2 && (
            <View style={styles.metaRow}>
              <Text style={styles.metaText}>
                期間 {chartPts[0].t} → {chartPts[chartPts.length - 1].t}
              </Text>
              {sourceLabel !== '' && <Text style={styles.metaText}>資料來源：{sourceLabel}</Text>}
            </View>
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
  code: { fontSize: font.section, fontWeight: '700', color: colors.inkSoft },
  close: { fontSize: font.section, color: colors.inkSoft, fontWeight: '700' },
  closeBtn: { padding: 12, margin: -12 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm, marginTop: 2 },
  price: { fontSize: 30, fontWeight: '800', color: colors.ink, lineHeight: 34 },
  change: { fontSize: font.small, fontWeight: '700' },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space.sm, gap: space.sm },
  stat: { flex: 1 },
  statLabel: { fontSize: font.tiny, color: colors.inkSoft },
  statValue: { fontSize: font.small, fontWeight: '700', color: colors.ink, marginTop: 2 },
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
  failText: { fontSize: font.small, color: colors.inkFaint },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space.md, gap: space.sm, flexWrap: 'wrap' },
  metaText: { fontSize: font.tiny, color: colors.inkFaint },
});
