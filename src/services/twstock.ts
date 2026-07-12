/**
 * 台股看盤 — 服務層(多來源容錯 + 本機快取 + 內建範例)。
 *
 * 沙箱 / 離線環境下任何網路失敗都不可讓 UI 空白或崩潰,因此
 * fetchDashboard 採四層供應鏈(每個來源 8 秒逾時,失敗靜默進下一層):
 *  1. 台證所 MIS 即時報價(原生優先;web 有 CORS 限制)        → 'live'
 *  2. Yahoo 財經 v8 chart(原生;web 也嘗試但預期 CORS 失敗)  → 'live'(含盤中走勢)
 *  3. TWSE openapi(有 CORS 標頭,web 主力)                    → 'daily'
 *  4. 本機快取 → 'cache';連快取都沒有 → 內建範例 → 'sample'
 * 三大法人(BFI82U)與大盤成交值(FMTQIK)為獨立補充資料,
 * 各自 try、失敗給 null,不影響主鏈。所有 export 的 async 函式絕不 throw。
 *
 * 本檔快取皆為「公開行情資訊」(非個人財務資料),依既有慣例
 * (notifications.ts 的推播偏好)直接明碼存 AsyncStorage 即可。
 */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NEWS_BACKEND_URL } from './news';
import {
  InstitutionalFlow,
  SeriesPoint,
  TwQuote,
  isTwMarketOpen,
  parseBfi82u,
  parseFmtqik,
  parseMisQuotes,
  parseStockDayAll,
  parseYahooChart,
} from './twstockParsers';

// 畫面直接從本檔取用,不必再 import parsers
export { isTwMarketOpen };
export type { InstitutionalFlow, SeriesPoint, TwQuote };

/** 資料新鮮度(UI 據此標示「即時 / 當日收盤 / 離線快取 / 範例」)。 */
export type DataFreshness = 'live' | 'daily' | 'cache' | 'sample';

/** 看盤頁一次取回的完整資料包。 */
export interface MarketDashboard {
  updatedAtISO: string; // 資料取得時間(ISO)
  freshness: DataFreshness;
  indices: TwQuote[]; // 加權指數、櫃買指數
  watchlist: TwQuote[]; // 自選股(依傳入 codes 順序)
  seriesBySymbol: Record<string, SeriesPoint[]>; // 盤中走勢(key = TwQuote.symbol)
  flow: InstitutionalFlow | null; // 三大法人買賣超(億)
  turnoverBillions: number | null; // 大盤成交值(億)
}

// ── AsyncStorage keys(命名比照 @wealthtree3000/<領域>/v<版本>)──
const WATCHLIST_KEY = '@wealthtree3000/twwatchlist/v1';
const SUFFIX_KEY = '@wealthtree3000/twboard/v1'; // 每檔成功的 Yahoo 後綴(.TW / .TWO)
const CACHE_KEY = '@wealthtree3000/twmarket/cache/v1';

// 預設自選股。皆為公開股票代號(非個資),明碼寫死即可。
const DEFAULT_WATCHLIST = ['2330', '2317', '2454', '2308', '0050', '0056'];

const FETCH_TIMEOUT_MS = 8_000;
const MIS_BASE = 'https://mis.twse.com.tw/stock/api/getStockInfo.jsp';
const YAHOO_CHART_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart/';
const TWSE_OPENAPI = 'https://openapi.twse.com.tw/v1';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ── 自選股清單 ──────────────────────────────────────────────────

async function saveWatchlist(codes: string[]): Promise<void> {
  try {
    await AsyncStorage.setItem(WATCHLIST_KEY, JSON.stringify(codes));
  } catch {
    // 寫入失敗不影響本次操作(下次開啟回到舊清單)
  }
}

/** 讀自選股;從未存過或資料損毀時回預設清單(使用者清空則尊重空清單)。 */
export async function getWatchlist(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(WATCHLIST_KEY);
    if (raw != null) {
      const arr: unknown = JSON.parse(raw);
      if (Array.isArray(arr) && arr.every((c): c is string => typeof c === 'string')) return arr;
    }
  } catch {
    // 解析失敗視同未存過
  }
  return [...DEFAULT_WATCHLIST];
}

// 自選股寫入互斥:add / remove 的「讀→改→寫」以 promise 鏈序列化,
// 避免快速連續操作併發讀到同一份舊清單造成 lost update。
let watchlistLock: Promise<unknown> = Promise.resolve();

function withWatchlistLock<T>(op: () => Promise<T>): Promise<T> {
  const run = watchlistLock.then(op, op); // 前一項失敗也照常執行
  watchlistLock = run.then(
    () => undefined,
    () => undefined, // 鏈上不留 rejection,錯誤仍回傳給呼叫端
  );
  return run;
}

/** 加入自選股(去重);回傳更新後清單。 */
export function addToWatchlist(code: string): Promise<string[]> {
  return withWatchlistLock(async () => {
    const list = await getWatchlist();
    const c = code.trim();
    if (!c || list.includes(c)) return list;
    const next = [...list, c];
    await saveWatchlist(next);
    return next;
  });
}

/** 移除自選股;回傳更新後清單。 */
export function removeFromWatchlist(code: string): Promise<string[]> {
  return withWatchlistLock(async () => {
    const list = await getWatchlist();
    const next = list.filter((c) => c !== code.trim());
    if (next.length !== list.length) await saveWatchlist(next);
    return next;
  });
}

// ── 共用抓取工具 ────────────────────────────────────────────────

/** fetch JSON,固定 8 秒逾時(AbortController);非 2xx 即 throw 交由呼叫端換源。 */
async function fetchJsonWithTimeout(url: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// ── Yahoo 後綴記憶(.TW=上市 / .TWO=上櫃)────────────────────────

type TwSuffix = '.TW' | '.TWO';

async function loadSuffixMap(): Promise<Record<string, TwSuffix>> {
  try {
    const raw = await AsyncStorage.getItem(SUFFIX_KEY);
    if (!raw) return {};
    const obj: unknown = JSON.parse(raw);
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      const out: Record<string, TwSuffix> = {};
      for (const [k, v] of Object.entries(obj)) {
        if (v === '.TW' || v === '.TWO') out[k] = v;
      }
      return out;
    }
  } catch {
    // 損毀視同空表
  }
  return {};
}

async function saveSuffixMap(map: Record<string, TwSuffix>): Promise<void> {
  try {
    await AsyncStorage.setItem(SUFFIX_KEY, JSON.stringify(map));
  } catch {
    // 記憶失敗只是下次多試一次錯誤後綴,可忽略
  }
}

// ── 層 1:台證所 MIS 即時報價(原生優先)────────────────────────

async function fetchMisQuotes(chList: string[]): Promise<TwQuote[]> {
  const url = `${MIS_BASE}?ex_ch=${chList.join('|')}&json=1&delay=0`;
  const json = await fetchJsonWithTimeout(url);
  return parseMisQuotes(json);
}

/**
 * MIS 一次抓 加權(t00)+ 櫃買(o00)+ 全部個股(先當上市 tse_);
 * 沒拿到資料的個股再補試上櫃 otc_。整層失敗回 null。
 */
async function loadFromMis(codes: string[]): Promise<{ indices: TwQuote[]; watchlist: TwQuote[] } | null> {
  try {
    const chList = ['tse_t00.tw', 'otc_o00.tw', ...codes.map((c) => `tse_${c}.tw`)];
    const quotes = await fetchMisQuotes(chList);
    const byCode = new Map<string, TwQuote>(quotes.map((q) => [q.code, q]));
    // 上市查無 → 補試上櫃(失敗不影響其餘)
    const missing = codes.filter((c) => {
      const q = byCode.get(c);
      return !q || q.price == null;
    });
    if (missing.length > 0) {
      try {
        const otc = await fetchMisQuotes(missing.map((c) => `otc_${c}.tw`));
        for (const q of otc) {
          if (q.price != null) byCode.set(q.code, q);
        }
      } catch {
        // 上櫃補查失敗:該檔留空即可
      }
    }
    const indices: TwQuote[] = [];
    const taiex = byCode.get('t00');
    const tpex = byCode.get('o00');
    if (taiex) indices.push({ ...taiex, name: '加權指數' });
    if (tpex) indices.push({ ...tpex, name: '櫃買指數' });
    const watchlist: TwQuote[] = [];
    for (const c of codes) {
      const q = byCode.get(c);
      if (q) watchlist.push(q);
    }
    if (indices.length === 0 && watchlist.length === 0) return null;
    return { indices, watchlist };
  } catch {
    return null;
  }
}

// ── 層 2:Yahoo 財經 v8 chart ────────────────────────────────────

interface YahooParsed {
  price: number | null;
  prevClose: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
  series: SeriesPoint[];
}

async function fetchYahooChart(symbol: string, range: string, interval: string): Promise<YahooParsed> {
  const url = `${YAHOO_CHART_BASE}${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`;
  const json = await fetchJsonWithTimeout(url);
  return parseYahooChart(json);
}

/** 依後綴記憶決定 .TW / .TWO 嘗試順序,成功即回報所用後綴。 */
async function fetchYahooStock(
  code: string,
  preferred: TwSuffix | undefined,
): Promise<{ quote: TwQuote; series: SeriesPoint[]; suffix: TwSuffix } | null> {
  const order: TwSuffix[] = preferred === '.TWO' ? ['.TWO', '.TW'] : ['.TW', '.TWO'];
  for (const suffix of order) {
    try {
      const parsed = await fetchYahooChart(`${code}${suffix}`, '1d', '5m');
      if (parsed.price != null) {
        const { price, prevClose } = parsed;
        const change = prevClose != null ? round2(price - prevClose) : null;
        const changePct = prevClose != null && prevClose !== 0 ? round2(((price - prevClose) / prevClose) * 100) : null;
        const quote: TwQuote = {
          symbol: `${code}${suffix}`,
          code,
          name: code, // Yahoo chart 無中文名稱,以代號代替
          price,
          prevClose,
          change,
          changePct,
          open: parsed.open,
          high: parsed.high,
          low: parsed.low,
          volume: parsed.volume,
        };
        return { quote, series: parsed.series, suffix };
      }
    } catch {
      // 換下一個後綴
    }
  }
  return null;
}

/** Yahoo 指數報價(加權 ^TWII;櫃買嘗試 ^TWOII,失敗即略過)。 */
async function fetchYahooIndex(symbol: string, code: string, name: string): Promise<{ quote: TwQuote; series: SeriesPoint[] } | null> {
  try {
    const parsed = await fetchYahooChart(symbol, '1d', '5m');
    if (parsed.price == null) return null;
    const { price, prevClose } = parsed;
    const change = prevClose != null ? round2(price - prevClose) : null;
    const changePct = prevClose != null && prevClose !== 0 ? round2(((price - prevClose) / prevClose) * 100) : null;
    return {
      quote: { symbol, code, name, price, prevClose, change, changePct, open: parsed.open, high: parsed.high, low: parsed.low, volume: parsed.volume },
      series: parsed.series,
    };
  } catch {
    return null;
  }
}

async function loadFromYahoo(
  codes: string[],
): Promise<{ indices: TwQuote[]; watchlist: TwQuote[]; seriesBySymbol: Record<string, SeriesPoint[]> } | null> {
  const suffixMap = await loadSuffixMap();
  const seriesBySymbol: Record<string, SeriesPoint[]> = {};
  const [taiex, tpex, ...stocks] = await Promise.all([
    fetchYahooIndex('^TWII', 't00', '加權指數'),
    fetchYahooIndex('^TWOII', 'o00', '櫃買指數'),
    ...codes.map((c) => fetchYahooStock(c, suffixMap[c])),
  ]);
  const indices: TwQuote[] = [];
  for (const idx of [taiex, tpex]) {
    if (idx) {
      indices.push(idx.quote);
      if (idx.series.length >= 2) seriesBySymbol[idx.quote.symbol] = idx.series;
    }
  }
  const watchlist: TwQuote[] = [];
  let suffixChanged = false;
  stocks.forEach((r, i) => {
    if (!r) return;
    watchlist.push(r.quote);
    if (r.series.length >= 2) seriesBySymbol[r.quote.symbol] = r.series;
    if (suffixMap[codes[i]] !== r.suffix) {
      suffixMap[codes[i]] = r.suffix;
      suffixChanged = true;
    }
  });
  if (suffixChanged) await saveSuffixMap(suffixMap);
  if (indices.length === 0 && watchlist.length === 0) return null;
  return { indices, watchlist, seriesBySymbol };
}

/** MIS 成功後補抓 Yahoo 盤中走勢(僅供 Sparkline;全部失敗給空表)。 */
async function loadYahooSeriesBestEffort(quotes: TwQuote[]): Promise<Record<string, SeriesPoint[]>> {
  const out: Record<string, SeriesPoint[]> = {};
  await Promise.all(
    quotes.map(async (q) => {
      try {
        const parsed = await fetchYahooChart(q.symbol, '1d', '5m');
        if (parsed.series.length >= 2) out[q.symbol] = parsed.series;
      } catch {
        // 走勢缺漏只影響 Sparkline,靜默即可
      }
    }),
  );
  return out;
}

// ── 層 3:TWSE openapi(日收盤;web 主力)────────────────────────

interface FmtqikSummary {
  date: string;
  taiex: number | null;
  change: number | null;
  turnoverBillions: number | null;
}

/** 大盤成交值 + 加權指數收盤(FMTQIK);獨立 try,失敗給 null。 */
async function fetchFmtqikSummary(): Promise<FmtqikSummary | null> {
  try {
    const json = await fetchJsonWithTimeout(`${TWSE_OPENAPI}/exchangeReport/FMTQIK`);
    return parseFmtqik(json);
  } catch {
    return null;
  }
}

/** 三大法人買賣超(BFI82U);獨立 try,失敗給 null。 */
async function fetchFlow(): Promise<InstitutionalFlow | null> {
  try {
    const json = await fetchJsonWithTimeout(`${TWSE_OPENAPI}/fund/BFI82U`);
    return parseBfi82u(json);
  } catch {
    return null;
  }
}

/** 個股日收盤(STOCK_DAY_ALL,僅上市)+ 加權指數(取自 FMTQIK)。 */
async function loadFromTwseOpen(codes: string[], fmt: FmtqikSummary | null): Promise<{ indices: TwQuote[]; watchlist: TwQuote[] } | null> {
  let watchlist: TwQuote[] = [];
  try {
    const json = await fetchJsonWithTimeout(`${TWSE_OPENAPI}/exchangeReport/STOCK_DAY_ALL`);
    watchlist = parseStockDayAll(json, codes);
  } catch {
    watchlist = [];
  }
  const indices: TwQuote[] = [];
  if (fmt && fmt.taiex != null) {
    const prevClose = fmt.change != null ? round2(fmt.taiex - fmt.change) : null;
    const changePct = fmt.change != null && prevClose != null && prevClose !== 0 ? round2((fmt.change / prevClose) * 100) : null;
    indices.push({
      symbol: '^TWII',
      code: 't00',
      name: '加權指數',
      price: fmt.taiex,
      prevClose,
      change: fmt.change,
      changePct,
      timeLabel: fmt.date,
    });
  }
  if (indices.length === 0 && watchlist.length === 0) return null;
  return { indices, watchlist };
}

// ── 層 4:本機快取 ──────────────────────────────────────────────

async function saveCache(dashboard: MarketDashboard): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(dashboard));
  } catch {
    // 快取失敗不影響本次顯示
  }
}

/** 快取數值欄位:null / undefined / 有限數字皆合法,其餘視為損毀。 */
function isNumOrNull(v: unknown): boolean {
  return v == null || (typeof v === 'number' && Number.isFinite(v));
}

/** 快取報價物件深度驗證(UI 會對這些欄位做 toFixed / 屬性取值,型別錯誤會崩潰)。 */
function isValidCachedQuote(q: unknown): q is TwQuote {
  if (!q || typeof q !== 'object' || Array.isArray(q)) return false;
  const o = q as Record<string, unknown>;
  return (
    typeof o.symbol === 'string' &&
    typeof o.code === 'string' &&
    typeof o.name === 'string' &&
    isNumOrNull(o.price) &&
    isNumOrNull(o.prevClose) &&
    isNumOrNull(o.change) &&
    isNumOrNull(o.changePct) &&
    isNumOrNull(o.open) &&
    isNumOrNull(o.high) &&
    isNumOrNull(o.low) &&
    isNumOrNull(o.volume) &&
    (o.timeLabel === undefined || typeof o.timeLabel === 'string')
  );
}

/** 快取走勢表:僅保留「值為合法點陣列」的項目;非物件(含 null)一律回空表。 */
function sanitizeSeriesMap(raw: unknown): Record<string, SeriesPoint[]> {
  const out: Record<string, SeriesPoint[]> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [k, arr] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(arr)) continue;
    const pts: SeriesPoint[] = [];
    for (const p of arr) {
      const t: unknown = p?.t;
      const v: unknown = p?.v;
      if (typeof t === 'number' && Number.isFinite(t) && typeof v === 'number' && Number.isFinite(v)) pts.push({ t, v });
    }
    if (pts.length > 0) out[k] = pts;
  }
  return out;
}

/** 快取三大法人:結構不符給 null(FlowCard 對 null 顯示「未取得」)。 */
function sanitizeFlow(raw: unknown): InstitutionalFlow | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (
    typeof o.date === 'string' &&
    typeof o.foreignNet === 'number' && Number.isFinite(o.foreignNet) &&
    typeof o.trustNet === 'number' && Number.isFinite(o.trustNet) &&
    typeof o.dealerNet === 'number' && Number.isFinite(o.dealerNet) &&
    typeof o.totalNet === 'number' && Number.isFinite(o.totalNet)
  ) {
    return { date: o.date, foreignNet: o.foreignNet, trustNet: o.trustNet, dealerNet: o.dealerNet, totalNet: o.totalNet };
  }
  return null;
}

async function loadCache(): Promise<MarketDashboard | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const d: unknown = JSON.parse(raw);
    // 深度驗證:JSON 合法但內容損毀(部分寫入 / 外部竄改)不可放行,
    // 否則 seriesBySymbol=null 或報價欄位型別錯誤會讓看盤頁渲染崩潰
    if (!d || typeof d !== 'object' || Array.isArray(d)) return null;
    const o = d as Record<string, unknown>;
    if (typeof o.updatedAtISO !== 'string') return null;
    const indices = o.indices;
    const watchlist = o.watchlist;
    if (!Array.isArray(indices) || !indices.every(isValidCachedQuote)) return null;
    if (!Array.isArray(watchlist) || !watchlist.every(isValidCachedQuote)) return null;
    return {
      updatedAtISO: o.updatedAtISO,
      freshness: 'cache',
      indices,
      watchlist,
      seriesBySymbol: sanitizeSeriesMap(o.seriesBySymbol),
      flow: sanitizeFlow(o.flow),
      turnoverBillions: typeof o.turnoverBillions === 'number' && Number.isFinite(o.turnoverBillions) ? o.turnoverBillions : null,
    };
  } catch {
    return null;
  }
}

// ── 內建範例(連快取都沒有時的最後防線)──────────────────────────

/** FNV-1a 雜湊 + mulberry32:同代號永遠同一組假資料,避免畫面跳動。 */
function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 常見代號的範例名稱與價位(其餘代號由雜湊產生合理數字)
const SAMPLE_STOCKS: Record<string, { name: string; price: number; prevClose: number }> = {
  '2330': { name: '台積電', price: 1100, prevClose: 1085 },
  '2317': { name: '鴻海', price: 186.5, prevClose: 184 },
  '2454': { name: '聯發科', price: 1290, prevClose: 1305 },
  '2308': { name: '台達電', price: 402, prevClose: 398.5 },
  '0050': { name: '元大台灣50', price: 206.9, prevClose: 204.6 },
  '0056': { name: '元大高股息', price: 39.86, prevClose: 39.92 },
};

// 範例資料錨定日(收盤後的一個平常日)
const SAMPLE_DATE = '2026-06-18';
// 09:00 台北 = 01:00 UTC;每 5 分鐘一點共 55 點(09:00–13:30)
const SAMPLE_SESSION_START_MS = Date.UTC(2026, 5, 18, 1, 0, 0);
const SAMPLE_POINT_COUNT = 55;

/** 由昨收走到現價的確定性盤中假走勢。 */
function buildSampleSeries(symbol: string, prevClose: number, price: number): SeriesPoint[] {
  const rng = mulberry32(hashSeed(symbol));
  const points: SeriesPoint[] = [];
  for (let i = 0; i < SAMPLE_POINT_COUNT; i++) {
    const progress = i / (SAMPLE_POINT_COUNT - 1);
    const base = prevClose + (price - prevClose) * progress;
    const noise = (rng() - 0.5) * price * 0.004; // ±0.2% 抖動
    const v = i === SAMPLE_POINT_COUNT - 1 ? price : round2(base + noise);
    points.push({ t: SAMPLE_SESSION_START_MS + i * 5 * 60_000, v });
  }
  return points;
}

function buildSampleQuote(symbol: string, code: string, name: string, price: number, prevClose: number): TwQuote {
  const change = round2(price - prevClose);
  const changePct = prevClose !== 0 ? round2((change / prevClose) * 100) : null;
  const rng = mulberry32(hashSeed(`${symbol}/ohlc`));
  const hi = Math.max(price, prevClose);
  const lo = Math.min(price, prevClose);
  return {
    symbol,
    code,
    name,
    price,
    prevClose,
    change,
    changePct,
    open: round2(prevClose * (1 + (rng() - 0.5) * 0.006)),
    high: round2(hi * (1 + rng() * 0.006)),
    low: round2(lo * (1 - rng() * 0.006)),
    volume: Math.floor(rng() * 45_000 + 5_000) * 1_000,
    timeLabel: '13:30:00',
  };
}

/** 未知代號:由雜湊產生 20~520 元間的穩定價位。 */
function sampleStockMeta(code: string): { name: string; price: number; prevClose: number } {
  const known = SAMPLE_STOCKS[code];
  if (known) return known;
  const rng = mulberry32(hashSeed(code));
  const price = round2(20 + rng() * 500);
  const prevClose = round2(price / (1 + (rng() - 0.5) * 0.04));
  return { name: code, price, prevClose };
}

/** 內建範例看盤資料(UI 會標示「範例資料」)。 */
function buildSampleDashboard(codes: string[]): MarketDashboard {
  const indices: TwQuote[] = [
    buildSampleQuote('^TWII', 't00', '加權指數', 23012.6, 22894.3),
    buildSampleQuote('^TWOII', 'o00', '櫃買指數', 249.8, 248.6),
  ];
  const watchlist = codes.map((code) => {
    const meta = sampleStockMeta(code);
    return buildSampleQuote(`${code}.TW`, code, meta.name, meta.price, meta.prevClose);
  });
  const seriesBySymbol: Record<string, SeriesPoint[]> = {};
  for (const q of [...indices, ...watchlist]) {
    if (q.price != null && q.prevClose != null) seriesBySymbol[q.symbol] = buildSampleSeries(q.symbol, q.prevClose, q.price);
  }
  return {
    updatedAtISO: `${SAMPLE_DATE}T13:30:00+08:00`,
    freshness: 'sample',
    indices,
    watchlist,
    seriesBySymbol,
    flow: { date: SAMPLE_DATE, foreignNet: 123.5, trustNet: 18.2, dealerNet: -6.4, totalNet: 135.3 },
    turnoverBillions: 4132.8,
  };
}

// ── 看盤資料主入口 ──────────────────────────────────────────────

/**
 * 取回看盤頁完整資料。絕不 throw:四層供應鏈依序退讓,
 * 最壞情況回傳內建範例(freshness='sample')。
 */
export async function fetchDashboard(codes: string[]): Promise<MarketDashboard> {
  // 補充資料與主鏈並行:三大法人 + 大盤成交值(各自失敗給 null)
  const flowPromise = fetchFlow();
  const fmtPromise = fetchFmtqikSummary();

  let core: { indices: TwQuote[]; watchlist: TwQuote[]; seriesBySymbol: Record<string, SeriesPoint[]>; freshness: DataFreshness } | null = null;

  // 層 1:MIS(原生限定;web 有 CORS 直接跳過)
  if (Platform.OS !== 'web') {
    const mis = await loadFromMis(codes);
    if (mis) {
      // MIS 沒有盤中序列,補抓 Yahoo 走勢供 Sparkline(全失敗也不影響報價)
      const seriesBySymbol = await loadYahooSeriesBestEffort([...mis.indices, ...mis.watchlist]);
      core = { ...mis, seriesBySymbol, freshness: 'live' };
    }
  }

  // 層 2:Yahoo(web 也嘗試,預期 CORS 失敗即靜默進下一層)
  if (!core) {
    const yahoo = await loadFromYahoo(codes);
    if (yahoo) core = { ...yahoo, freshness: 'live' };
  }

  // 層 3:TWSE openapi 日收盤(需要 FMTQIK 結果組加權指數)
  const fmt = await fmtPromise;
  if (!core) {
    const daily = await loadFromTwseOpen(codes, fmt);
    if (daily) {
      // openapi 本來就沒有盤中序列;以「昨收→收盤」確定性合成走勢補 Sparkline,
      // 讓 web 主力路徑(daily)不再固定空白(離線 sample 反而有線的不一致)
      const seriesBySymbol: Record<string, SeriesPoint[]> = {};
      for (const q of [...daily.indices, ...daily.watchlist]) {
        if (q.price != null && q.prevClose != null) seriesBySymbol[q.symbol] = buildSampleSeries(q.symbol, q.prevClose, q.price);
      }
      core = { ...daily, seriesBySymbol, freshness: 'daily' };
    }
  }

  const flow = await flowPromise;

  if (core) {
    const dashboard: MarketDashboard = {
      updatedAtISO: new Date().toISOString(),
      freshness: core.freshness,
      indices: core.indices,
      watchlist: core.watchlist,
      seriesBySymbol: core.seriesBySymbol,
      flow,
      turnoverBillions: fmt?.turnoverBillions ?? null,
    };
    await saveCache(dashboard);
    return dashboard;
  }

  // 層 4:快取 → 內建範例
  const cached = await loadCache();
  if (cached) {
    return {
      ...cached,
      freshness: 'cache',
      // 快取若恰好帶回法人 / 成交值以外,本次獨立抓到的新資料仍可覆蓋
      flow: flow ?? cached.flow,
      turnoverBillions: fmt?.turnoverBillions ?? cached.turnoverBillions,
    };
  }
  return buildSampleDashboard(codes);
}

// ── 個股 / 指數歷史走勢(圖表 Modal 用)──────────────────────────

/** 走勢時間長度 → Yahoo chart 的 range / interval 參數。 */
const YAHOO_RANGE_PARAMS: Record<'1d' | '5d' | '1mo' | '3mo' | '1y', { range: string; interval: string }> = {
  '1d': { range: '1d', interval: '5m' },
  '5d': { range: '5d', interval: '15m' },
  '1mo': { range: '1mo', interval: '1d' },
  '3mo': { range: '3mo', interval: '1d' },
  '1y': { range: '1y', interval: '1wk' },
};

/** 走勢時間長度 → news 後端 /series 的 TrendRange(僅日線以上有對應)。 */
const BACKEND_RANGE_MAP: Partial<Record<'1d' | '5d' | '1mo' | '3mo' | '1y', string>> = {
  '1mo': '1M',
  '3mo': '3M',
  '1y': '1Y',
};

/** 後端 PricePoint[]({t:'YYYY-MM-DD',c}) → SeriesPoint[]。 */
function pricePointsToSeries(points: unknown): SeriesPoint[] {
  if (!Array.isArray(points)) return [];
  const out: SeriesPoint[] = [];
  for (const p of points) {
    if (!p || typeof p !== 'object') continue;
    const t = typeof (p as { t?: unknown }).t === 'string' ? Date.parse(`${(p as { t: string }).t}T00:00:00Z`) : NaN;
    const c = (p as { c?: unknown }).c;
    if (Number.isFinite(t) && typeof c === 'number' && Number.isFinite(c)) out.push({ t, v: c });
  }
  return out;
}

/** 範例歷史走勢:每個範圍的點數與間隔(1d 直接沿用盤中範例)。 */
const SAMPLE_RANGE_STEPS: Record<'5d' | '1mo' | '3mo' | '1y', { count: number; stepMs: number }> = {
  '5d': { count: 5, stepMs: 24 * 3_600_000 }, // 5 個交易日
  '1mo': { count: 22, stepMs: 24 * 3_600_000 }, // 約 22 個交易日
  '3mo': { count: 66, stepMs: 24 * 3_600_000 },
  '1y': { count: 52, stepMs: 7 * 24 * 3_600_000 }, // 52 週
};

/** 由代號決定範例走勢的 symbol 與價位錨點(指數用固定樣本值,個股用 sampleStockMeta)。 */
function sampleSeriesMeta(code: string): { symbol: string; price: number; prevClose: number } {
  if (code === 't00' || code === '^TWII') return { symbol: '^TWII', price: 23012.6, prevClose: 22894.3 };
  if (code === 'o00' || code === '^TWOII') return { symbol: '^TWOII', price: 249.8, prevClose: 248.6 };
  const bare = code.replace(/\.(TW|TWO)$/, '');
  const meta = sampleStockMeta(bare);
  const symbol = code.includes('.') || code.startsWith('^') ? code : `${bare}.TW`;
  return { symbol, price: meta.price, prevClose: meta.prevClose };
}

/** 確定性範例歷史走勢(同代號同範圍永遠同一條線),終點固定為範例現價。 */
function buildSampleRangeSeries(code: string, range: '1d' | '5d' | '1mo' | '3mo' | '1y'): SeriesPoint[] {
  const { symbol, price, prevClose } = sampleSeriesMeta(code);
  if (range === '1d') return buildSampleSeries(symbol, prevClose, price);
  const { count, stepMs } = SAMPLE_RANGE_STEPS[range];
  const drift = { '5d': 0.02, '1mo': 0.05, '3mo': 0.09, '1y': 0.18 }[range];
  const rng = mulberry32(hashSeed(`${symbol}/${range}`));
  const endMs = SAMPLE_SESSION_START_MS + 4.5 * 3_600_000; // 範例日 13:30 收盤
  const start = round2(price / (1 + (rng() - 0.4) * drift)); // 範圍越長漂移幅度越大
  const points: SeriesPoint[] = [];
  for (let i = 0; i < count; i++) {
    const progress = i / (count - 1);
    const base = start + (price - start) * progress;
    const noise = (rng() - 0.5) * price * 0.01;
    const v = i === count - 1 ? price : round2(base + noise);
    points.push({ t: endMs - (count - 1 - i) * stepMs, v });
  }
  return points;
}

/** 決定 Yahoo 代號候選:指數直接對應;個股依後綴記憶排順序。 */
async function resolveYahooCandidates(code: string): Promise<string[]> {
  if (code.startsWith('^') || code.includes('.')) return [code]; // 已是完整代號
  if (code === 't00') return ['^TWII'];
  if (code === 'o00') return ['^TWOII'];
  const suffixMap = await loadSuffixMap();
  const first: TwSuffix = suffixMap[code] ?? '.TW';
  const second: TwSuffix = first === '.TW' ? '.TWO' : '.TW';
  return [`${code}${first}`, `${code}${second}`];
}

/**
 * 取歷史走勢:後端(若已設定且該 range 有對應端點)→ Yahoo chart →
 * 快取盤中走勢(僅 1d)→ 內建範例(web 上前兩層可能都因 CORS 失敗,
 * 比照 fetchDashboard 絕不留白)。絕不 throw。
 */
export async function getSeries(
  code: string,
  range: '1d' | '5d' | '1mo' | '3mo' | '1y',
): Promise<{ points: SeriesPoint[]; sourceLabel: string }> {
  // 1) news 後端 /series(僅 1mo / 3mo / 1y 有對應的 TrendRange)
  const backendRange = BACKEND_RANGE_MAP[range];
  if (NEWS_BACKEND_URL && backendRange) {
    try {
      const url = `${NEWS_BACKEND_URL}/series?symbol=${encodeURIComponent(code)}&range=${backendRange}`;
      const json = await fetchJsonWithTimeout(url);
      const points = pricePointsToSeries(json?.points);
      if (points.length >= 2) return { points, sourceLabel: '後端歷史資料' };
    } catch {
      // 靜默改走 Yahoo
    }
  }

  // 2) Yahoo chart(個股依後綴記憶試 .TW / .TWO,成功即記住)
  const { range: yahooRange, interval } = YAHOO_RANGE_PARAMS[range];
  const candidates = await resolveYahooCandidates(code);
  for (const symbol of candidates) {
    try {
      const parsed = await fetchYahooChart(symbol, yahooRange, interval);
      if (parsed.series.length >= 2) {
        if (symbol.endsWith('.TW') || symbol.endsWith('.TWO')) {
          const suffix: TwSuffix = symbol.endsWith('.TWO') ? '.TWO' : '.TW';
          const suffixMap = await loadSuffixMap();
          if (suffixMap[code] !== suffix) {
            suffixMap[code] = suffix;
            await saveSuffixMap(suffixMap);
          }
        }
        return { points: parsed.series, sourceLabel: 'Yahoo 財經' };
      }
    } catch {
      // 換下一個候選代號
    }
  }

  // 3) 快取退路(僅 1d:dashboard 快取的盤中走勢與 1d 同義)
  if (range === '1d') {
    const cached = await loadCache();
    if (cached) {
      for (const symbol of candidates) {
        const pts = cached.seriesBySymbol[symbol];
        if (pts && pts.length >= 2) return { points: pts, sourceLabel: '離線快取' };
      }
    }
  }

  // 4) 內建範例走勢(最後防線;web 平台兩個線上來源常態不可用)
  const sample = buildSampleRangeSeries(code, range);
  if (sample.length >= 2) return { points: sample, sourceLabel: '範例資料' };

  // 理論上到不了這裡:空資料 + 說明文字(UI 顯示 sourceLabel)
  return { points: [], sourceLabel: '無法取得' };
}
