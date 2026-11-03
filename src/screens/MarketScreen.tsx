/** 模組六：台股看盤（指數、三大法人、自選股清單與走勢圖）。 */
import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Card, Caption, Pill, PrimaryButton, SectionTitle } from '../components/ui';
import { MarketChartModal } from '../components/MarketChartModal';
import { Sparkline } from '../components/Sparkline';
import {
  addToWatchlist,
  fetchDashboard,
  getWatchlist,
  isTwMarketOpen,
  removeFromWatchlist,
} from '../services/twstock';
import type {
  DataFreshness,
  InstitutionalFlow,
  MarketDashboard,
  SeriesPoint,
  TwQuote,
} from '../services/twstock';
import { colors, font, radius, space } from '../theme';

// ── 紅漲綠跌（台股慣例，沿用 news 既有配色：漲=danger 紅、跌=leafDeep 綠）──
const UP_COLOR = colors.danger;
const DOWN_COLOR = colors.leafDeep;

/** 資料新鮮度 → 頂部狀態文字。 */
const FRESHNESS_NOTE: Record<DataFreshness, string> = {
  live: '即時',
  daily: '當日收盤',
  cache: '離線・上次快取',
  sample: '範例資料',
};

/** 自選股代號格式：4~6 位數字（涵蓋個股與 ETF）。 */
const CODE_PATTERN = /^[0-9]{4,6}$/;

/** 數字格式（null / 非有限值顯示長破折號）。 */
function fmtNum(n: number | null | undefined, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', { maximumFractionDigits: digits });
}

/** 買賣超金額：正值加 '+'，固定一位小數、千分位。 */
function fmtSigned(n: number): string {
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`;
}

/** 買賣超顏色：正紅、負綠、零中性。 */
function flowTint(n: number): string {
  if (n > 0) return UP_COLOR;
  if (n < 0) return DOWN_COLOR;
  return colors.inkSoft;
}

/** 報價漲跌行：'▲ +123.45（+0.54%）'；缺值部分省略，全缺回 '—'。 */
function changeLine(q: TwQuote): { text: string; tint: string } {
  if (q.change == null && q.changePct == null) return { text: '—', tint: colors.inkSoft };
  const up = (q.change ?? q.changePct ?? 0) >= 0;
  const arrow = up ? '▲' : '▼';
  const sign = up ? '+' : '';
  const chg = q.change != null ? `${sign}${fmtNum(q.change)}` : '';
  const pct = q.changePct != null ? `${sign}${q.changePct.toFixed(2)}%` : '';
  const body = chg && pct ? `${chg}（${pct}）` : chg || pct;
  return { text: `${arrow} ${body}`, tint: up ? UP_COLOR : DOWN_COLOR };
}

/** 更新時間（ISO）→ 裝置當地 'HH:MM'；解析失敗原樣回傳。 */
function fmtUpdatedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/**
 * 移除確認對話框：react-native-web 未實作帶按鈕的 Alert.alert，
 * web 平台退用 globalThis.confirm，原生用 Alert.alert。
 */
function confirmRemove(title: string, message: string, onConfirm: () => void): void {
  if (Platform.OS === 'web') {
    const g = globalThis as { confirm?: (msg: string) => boolean };
    const ok = typeof g.confirm === 'function' ? g.confirm(`${title}\n${message}`) : true;
    if (ok) onConfirm();
  } else {
    Alert.alert(title, message, [
      { text: '取消', style: 'cancel' },
      { text: '移除', style: 'destructive', onPress: onConfirm },
    ]);
  }
}

export function MarketScreen() {
  const mountedRef = React.useRef(true); // unmount 後禁止任何 setState
  const codesRef = React.useRef<string[]>([]); // 讓非同步回呼永遠拿到最新自選清單
  const loadSeqRef = React.useRef(0); // 併發 load 序號：只有最新一次請求能寫入狀態
  const [codes, setCodes] = React.useState<string[]>([]);
  const [board, setBoard] = React.useState<MarketDashboard | null>(null);
  const [loading, setLoading] = React.useState(true); // 首次載入 / 按「更新」
  const [refreshing, setRefreshing] = React.useState(false); // 下拉更新
  const [input, setInput] = React.useState('');
  const [selected, setSelected] = React.useState<TwQuote | null>(null); // 開走勢視窗的個股

  /** 重抓看盤資料。kind：button=按「更新」顯示轉圈、pull=下拉更新。兩者都由使用者發起。 */
  const load = React.useCallback(async (kind: 'button' | 'pull') => {
    const seq = ++loadSeqRef.current;
    if (kind === 'button') setLoading(true);
    if (kind === 'pull') setRefreshing(true);
    const next = await fetchDashboard(codesRef.current); // 服務層合約：絕不 throw
    if (!mountedRef.current) return;
    // 期間已有較新的 load 啟動：丟棄本次（可能較舊）結果，
    // 看板與轉圈一律交由最新請求收尾，避免快取舊資料倒退覆蓋即時看板
    if (seq !== loadSeqRef.current) return;
    setBoard(next);
    setLoading(false);
    setRefreshing(false);
  }, []);

  React.useEffect(() => {
    mountedRef.current = true;
    void (async () => {
      const list = await getWatchlist();
      if (!mountedRef.current) return;
      codesRef.current = list;
      setCodes(list);
      await load('button');
    })();
    // 刻意沒有自動更新：本 App 的定位是反焦慮，行情不該自己跳動把人拉回來。
    // 要更新只有兩條路——使用者下拉，或按右上角「更新」。
    return () => {
      mountedRef.current = false;
    };
  }, [load]);

  const inputValid = CODE_PATTERN.test(input.trim());

  /** 加入自選：寫入清單後重抓，取得新個股報價。 */
  const handleAdd = React.useCallback(async () => {
    const code = input.trim();
    if (!CODE_PATTERN.test(code)) return; // 按鈕已 disabled，此為雙重防護
    const next = await addToWatchlist(code);
    if (!mountedRef.current) return;
    const grew = next.length !== codesRef.current.length;
    codesRef.current = next;
    setCodes(next);
    setInput('');
    if (grew) void load('button'); // 重複代號不重抓
  }, [input, load]);

  /** 長按移除自選：確認後就地移除該列（不重抓）。 */
  const handleRemove = React.useCallback((q: TwQuote) => {
    confirmRemove('移除自選股', `確定將 ${q.name}（${q.code}）從自選清單移除？`, () => {
      void (async () => {
        const next = await removeFromWatchlist(q.code);
        if (!mountedRef.current) return;
        codesRef.current = next;
        setCodes(next);
        setBoard((b) => (b ? { ...b, watchlist: b.watchlist.filter((w) => w.code !== q.code) } : b));
      })();
    });
  }, []);

  const marketOpen = isTwMarketOpen(new Date());

  if (loading && !board) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.leaf} />
        <Text style={styles.centerText}>正在載入台股行情…</Text>
      </View>
    );
  }

  // 自選列以「自選清單」為準：來源缺漏的代號仍顯示（價格 —），確保可長按移除
  const quoteByCode = new Map<string, TwQuote>((board?.watchlist ?? []).map((q) => [q.code, q]));
  const watchRows: TwQuote[] = codes.map(
    (c) =>
      quoteByCode.get(c) ?? {
        symbol: c,
        code: c,
        name: c,
        price: null,
        prevClose: null,
        change: null,
        changePct: null,
      },
  );

  return (
    <>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void load('pull')} tintColor={colors.leaf} />
        }
      >
        {/* 頂部列：盤中/收盤 + 更新鈕（靠右）；下行為資料狀態。
            標題由外層 MarketModal 的 sheet header 顯示，這裡不重複。 */}
        <View style={styles.topRow}>
          <View style={styles.topTitle} />
          <Pill tone={marketOpen ? 'good' : 'neutral'}>{marketOpen ? '盤中' : '收盤'}</Pill>
          <Pressable
            onPress={() => void load('button')}
            disabled={loading}
            style={({ pressed }) => [styles.refreshBtn, pressed && styles.pressed]}
          >
            {loading ? (
              <ActivityIndicator size="small" color={colors.leaf} />
            ) : (
              <Text style={styles.refreshText}>更新</Text>
            )}
          </Pressable>
        </View>
        {board && (
          <Caption>
            {FRESHNESS_NOTE[board.freshness]}・更新於 {fmtUpdatedAt(board.updatedAtISO)}
          </Caption>
        )}
        <View style={styles.topGap} />

        {/* 指數區：加權指數、櫃買指數（加權另顯示大盤成交值） */}
        {board && board.indices.length > 0 && (
          <View style={styles.indexRow}>
            {board.indices.map((q) => (
              <IndexCard
                key={q.symbol}
                quote={q}
                series={board.seriesBySymbol[q.symbol] ?? []}
                turnoverBillions={q.code === 't00' ? board.turnoverBillions : null}
              />
            ))}
          </View>
        )}

        {/* 三大法人買賣超 */}
        <FlowCard flow={board?.flow ?? null} />

        {/* 自選股清單 + 加入自選 */}
        <Card>
          <View style={styles.rowBetween}>
            <SectionTitle>自選股</SectionTitle>
            <Caption>點列看走勢・長按移除</Caption>
          </View>
          {watchRows.length === 0 ? (
            <Caption>目前沒有自選股，輸入代號加入追蹤。</Caption>
          ) : (
            watchRows.map((q, i) => (
              <WatchRow
                key={q.code}
                quote={q}
                series={board?.seriesBySymbol[q.symbol] ?? []}
                last={i === watchRows.length - 1}
                onPress={() => setSelected(q)}
                onLongPress={() => handleRemove(q)}
              />
            ))
          )}
          <View style={styles.addRow}>
            <TextInput
              style={styles.input}
              value={input}
              onChangeText={setInput}
              keyboardType="number-pad"
              placeholder="輸入代號（4~6 位數字）"
              placeholderTextColor={colors.inkFaint}
              maxLength={6}
            />
            <View style={styles.addBtnWrap}>
              <PrimaryButton label="加入自選" onPress={() => void handleAdd()} disabled={!inputValid} />
            </View>
          </View>
        </Card>

        <Text style={styles.footer}>行情資料僅供參考，非投資建議。</Text>
      </ScrollView>

      {/* 個股 / 指數走勢視窗 */}
      <MarketChartModal
        visible={selected != null}
        onClose={() => setSelected(null)}
        code={selected?.code ?? ''}
        name={selected?.name ?? ''}
        quote={selected}
      />
    </>
  );
}

/** 指數卡：價格、漲跌、Sparkline；加權指數另顯示大盤成交值（億）。 */
function IndexCard({
  quote,
  series,
  turnoverBillions,
}: {
  quote: TwQuote;
  series: SeriesPoint[];
  turnoverBillions: number | null;
}) {
  const chg = changeLine(quote);
  return (
    <Card style={styles.indexCard}>
      <Text style={styles.indexName}>{quote.name}</Text>
      <Text style={styles.indexPrice}>{fmtNum(quote.price)}</Text>
      <Text style={[styles.indexChange, { color: chg.tint }]}>{chg.text}</Text>
      <View style={styles.indexSpark}>
        <Sparkline points={series.map((p) => p.v)} width={96} height={28} color={chg.tint} />
      </View>
      {turnoverBillions != null && (
        <Text style={styles.turnover}>成交 {fmtNum(turnoverBillions, 1)} 億</Text>
      )}
    </Card>
  );
}

/** 三大法人卡：外資 / 投信 / 自營商買賣超（億），正紅負綠。 */
function FlowCard({ flow }: { flow: InstitutionalFlow | null }) {
  return (
    <Card>
      <View style={styles.rowBetween}>
        <SectionTitle>三大法人買賣超</SectionTitle>
        {flow != null && <Caption>{flow.date}</Caption>}
      </View>
      {flow != null ? (
        <>
          <View style={styles.flowRow}>
            <FlowStat label="外資" value={flow.foreignNet} />
            <FlowStat label="投信" value={flow.trustNet} />
            <FlowStat label="自營商" value={flow.dealerNet} />
          </View>
          <Text style={styles.flowTotal}>
            合計{' '}
            <Text style={[styles.flowTotalValue, { color: flowTint(flow.totalNet) }]}>
              {fmtSigned(flow.totalNet)} 億
            </Text>
          </Text>
        </>
      ) : (
        <Caption>今日資料未取得</Caption>
      )}
    </Card>
  );
}

function FlowStat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.flowStat}>
      <Text style={styles.flowLabel}>{label}</Text>
      <Text style={[styles.flowValue, { color: flowTint(value) }]}>{fmtSigned(value)}</Text>
      <Text style={styles.flowUnit}>億</Text>
    </View>
  );
}

/** 自選股單列：代號+名稱 | Sparkline | 現價 | 漲跌%。 */
function WatchRow({
  quote,
  series,
  last,
  onPress,
  onLongPress,
}: {
  quote: TwQuote;
  series: SeriesPoint[];
  last: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const hasChange = quote.change != null || quote.changePct != null;
  const up = (quote.changePct ?? quote.change ?? 0) >= 0;
  const tint = hasChange ? (up ? UP_COLOR : DOWN_COLOR) : colors.inkSoft;
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [styles.watchRow, !last && styles.watchDivider, pressed && styles.pressed]}
    >
      <View style={styles.watchNameCol}>
        <Text style={styles.watchName} numberOfLines={1}>
          {quote.name}
        </Text>
        <Text style={styles.watchCode}>{quote.code}</Text>
      </View>
      <View style={styles.watchSpark}>
        <Sparkline points={series.map((p) => p.v)} color={tint} />
      </View>
      <View style={styles.watchPriceCol}>
        <Text style={styles.watchPrice}>{fmtNum(quote.price)}</Text>
        <Text style={[styles.watchPct, { color: tint }]}>
          {quote.changePct != null ? `${up ? '▲' : '▼'} ${up ? '+' : ''}${quote.changePct.toFixed(2)}%` : '—'}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.sand },
  content: { padding: space.md, paddingBottom: space.xl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.sand, gap: space.sm, padding: space.lg },
  centerText: { color: colors.inkSoft, fontSize: font.small, textAlign: 'center' },

  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pressed: { opacity: 0.6 },

  topRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  topTitle: { flex: 1 },
  refreshBtn: {
    minWidth: 56,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.sm + 2,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: '#ECE7DA',
  },
  refreshText: { fontSize: font.small, fontWeight: '700', color: colors.leafDeep },
  topGap: { height: space.sm },

  indexRow: { flexDirection: 'row', gap: space.md },
  indexCard: { flex: 1 },
  indexName: { fontSize: font.small, color: colors.inkSoft, fontWeight: '700' },
  indexPrice: { fontSize: font.title, fontWeight: '800', color: colors.ink, marginTop: 2 },
  indexChange: { fontSize: font.small, fontWeight: '700', marginTop: 2 },
  indexSpark: { marginTop: space.sm, minHeight: 28 },
  turnover: { fontSize: font.tiny, color: colors.inkSoft, marginTop: space.xs },

  flowRow: { flexDirection: 'row', gap: space.sm, marginTop: space.xs },
  flowStat: { flex: 1, alignItems: 'center', backgroundColor: colors.paper, borderRadius: radius.sm, paddingVertical: space.sm },
  flowLabel: { fontSize: font.tiny, color: colors.inkSoft },
  flowValue: { fontSize: font.body, fontWeight: '800', marginTop: 2 },
  flowUnit: { fontSize: font.tiny, color: colors.inkFaint, marginTop: 1 },
  flowTotal: { fontSize: font.small, color: colors.inkSoft, marginTop: space.sm },
  flowTotalValue: { fontWeight: '700' },

  watchRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: space.sm, gap: space.sm },
  watchDivider: { borderBottomWidth: 1, borderBottomColor: 'rgba(51,41,31,0.07)' },
  watchNameCol: { flex: 1, minWidth: 0 },
  watchName: { fontSize: font.body, fontWeight: '700', color: colors.ink },
  watchCode: { fontSize: font.tiny, color: colors.inkFaint, marginTop: 1 },
  watchSpark: { width: 64, alignItems: 'center' },
  watchPriceCol: { width: 92, alignItems: 'flex-end' },
  watchPrice: { fontSize: font.body, fontWeight: '800', color: colors.ink },
  watchPct: { fontSize: font.tiny, fontWeight: '700', marginTop: 1 },

  addRow: { flexDirection: 'row', gap: space.sm, marginTop: space.md, alignItems: 'center' },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E3DECF',
    borderRadius: radius.sm,
    backgroundColor: colors.paper,
    paddingHorizontal: space.sm + 2,
    paddingVertical: 10,
    fontSize: font.body,
    color: colors.ink,
  },
  addBtnWrap: { width: 112 },

  footer: { fontSize: font.tiny, color: colors.inkFaint, textAlign: 'center', marginTop: space.sm },
});
