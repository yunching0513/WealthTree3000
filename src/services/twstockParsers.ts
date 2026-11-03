/**
 * 台股看盤 — 純解析函式(零依賴)。
 *
 * 本檔絕不 import react-native / expo / 任何套件,且只使用「可抹除」的
 * TypeScript 語法(型別註記、interface;禁 enum),因此可直接用
 * `node --experimental-strip-types` 執行以便單元測試。
 *
 * 所有 parser 一律防禦式:任何欄位缺失 / 格式錯誤回傳 null 或空陣列,
 * 絕不 throw — 呼叫端(twstock.ts 供應鏈)據此靜默切換下一個資料來源。
 */

/** 單檔報價(指數與個股共用)。null 表示該欄位無法取得。 */
export interface TwQuote {
  symbol: string; // Yahoo 風格代號,例:'2330.TW'、'6488.TWO'、'^TWII'
  code: string; // 台股代號,例:'2330';指數用 't00' / 'o00'
  name: string; // 顯示名稱,例:'台積電'
  price: number | null; // 成交價(盤中無成交時退用昨收)
  prevClose: number | null; // 昨收
  change: number | null; // 漲跌(price - prevClose)
  changePct: number | null; // 漲跌百分比,例:1.25 表示 +1.25%
  open?: number | null;
  high?: number | null;
  low?: number | null;
  volume?: number | null; // 成交量(來源不同單位可能為張或股,僅供顯示)
  timeLabel?: string; // 資料時間,例:'13:30:00' 或 '2026-07-10'
}

/** 走勢圖單點(t 為 epoch 毫秒、v 為價格)。 */
export interface SeriesPoint {
  t: number;
  v: number;
}

/** 三大法人買賣超(單位:億元;正值買超、負值賣超)。 */
export interface InstitutionalFlow {
  date: string; // 'YYYY-MM-DD'
  foreignNet: number; // 外資(含外資自營商,多列相加)
  trustNet: number; // 投信
  dealerNet: number; // 自營商
  totalNet: number; // 三者合計
}

// ── 小工具 ──────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * 寬鬆數字轉換:處理 '1,234.56'、'-'、'--'、''、undefined 等台股 API
 * 常見表示法;無法解讀一律回 null(絕不回 NaN)。
 */
export function toNum(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const s = v.replace(/,/g, '').trim();
    if (!s || s === '-' || s === '--') return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** 民國日期('1150618' 或 '115/06/18')轉 'YYYY-MM-DD';非民國格式原樣回傳。 */
function normalizeRocDate(raw: string): string {
  const compact = raw.match(/^(\d{2,3})(\d{2})(\d{2})$/);
  if (compact) return `${Number(compact[1]) + 1911}-${compact[2]}-${compact[3]}`;
  const slashed = raw.match(/^(\d{2,3})\/(\d{1,2})\/(\d{1,2})$/);
  if (slashed) {
    const mm = slashed[2].padStart(2, '0');
    const dd = slashed[3].padStart(2, '0');
    return `${Number(slashed[1]) + 1911}-${mm}-${dd}`;
  }
  return raw;
}

/** 由現價與昨收計算漲跌 / 漲跌 %(昨收缺失或為 0 時回 null)。 */
function calcChange(price: number | null, prevClose: number | null): { change: number | null; changePct: number | null } {
  if (price == null || prevClose == null) return { change: null, changePct: null };
  const change = round2(price - prevClose);
  const changePct = prevClose !== 0 ? round2(((price - prevClose) / prevClose) * 100) : null;
  return { change, changePct };
}

// ── Yahoo 財經 v8 chart ─────────────────────────────────────────

/**
 * 解析 Yahoo v8 chart JSON(query1.finance.yahoo.com/v8/finance/chart/...)。
 * price / prevClose 取 chart.result[0].meta 的 regularMarketPrice /
 * chartPreviousClose;series 由 timestamp[] × indicators.quote[0].close[]
 * 組成(null 值跳過)。任何結構錯誤回傳全 null + 空 series。
 */
export function parseYahooChart(json: any): {
  price: number | null;
  prevClose: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
  series: SeriesPoint[];
} {
  const empty = { price: null, prevClose: null, open: null, high: null, low: null, volume: null, series: [] as SeriesPoint[] };
  const result = json?.chart?.result?.[0];
  if (!result || typeof result !== 'object') return empty;

  const meta = result.meta ?? {};
  const quote = result.indicators?.quote?.[0] ?? {};
  const timestamps: unknown[] = Array.isArray(result.timestamp) ? result.timestamp : [];
  const closes: unknown[] = Array.isArray(quote.close) ? quote.close : [];
  const opens: unknown[] = Array.isArray(quote.open) ? quote.open : [];
  const highs: unknown[] = Array.isArray(quote.high) ? quote.high : [];
  const lows: unknown[] = Array.isArray(quote.low) ? quote.low : [];
  const volumes: unknown[] = Array.isArray(quote.volume) ? quote.volume : [];

  // 走勢序列:timestamp(秒)× close;任一端為 null / 非數字即跳過
  const series: SeriesPoint[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const t = toNum(timestamps[i]);
    const v = toNum(closes[i]);
    if (t != null && v != null) series.push({ t: t * 1000, v });
  }

  const price = toNum(meta.regularMarketPrice) ?? (series.length > 0 ? series[series.length - 1].v : null);
  const prevClose = toNum(meta.chartPreviousClose) ?? toNum(meta.previousClose);

  // 開盤:第一個非 null 的 open;高低:meta 優先,否則掃描序列
  let open: number | null = null;
  for (const o of opens) {
    const n = toNum(o);
    if (n != null) {
      open = n;
      break;
    }
  }
  let high: number | null = toNum(meta.regularMarketDayHigh);
  let low: number | null = toNum(meta.regularMarketDayLow);
  if (high == null) {
    for (const h of highs) {
      const n = toNum(h);
      if (n != null) high = high == null ? n : Math.max(high, n);
    }
  }
  if (low == null) {
    for (const l of lows) {
      const n = toNum(l);
      if (n != null) low = low == null ? n : Math.min(low, n);
    }
  }
  let volume: number | null = toNum(meta.regularMarketVolume);
  if (volume == null) {
    let sum = 0;
    let any = false;
    for (const v of volumes) {
      const n = toNum(v);
      if (n != null) {
        sum += n;
        any = true;
      }
    }
    volume = any ? sum : null;
  }

  return { price, prevClose, open, high, low, volume, series };
}

// ── 台證所 MIS 即時報價 ─────────────────────────────────────────

/** MIS 代號 → Yahoo 風格 symbol(t00=加權指數、o00=櫃買指數)。 */
function misSymbol(code: string, ex: string): string {
  if (code === 't00') return '^TWII';
  if (code === 'o00') return '^TWOII';
  return ex === 'otc' ? `${code}.TWO` : `${code}.TW`;
}

/**
 * 解析台證所 MIS getStockInfo.jsp 回應:msgArray[] 欄位
 * c=代號 n=名稱 z=成交價 y=昨收 o=開 h=高 l=低 v=量 t=時間 ex=tse/otc。
 * z 為 '-'(盤中尚無成交)時退用 y;change / changePct 由 z、y 計算。
 */
export function parseMisQuotes(json: any): TwQuote[] {
  const arr = json?.msgArray;
  if (!Array.isArray(arr)) return [];
  const out: TwQuote[] = [];
  for (const row of arr) {
    if (!row || typeof row !== 'object') continue;
    const code = typeof row.c === 'string' ? row.c.trim() : '';
    if (!code) continue;
    const name = typeof row.n === 'string' && row.n ? row.n : code;
    const ex = typeof row.ex === 'string' ? row.ex : 'tse';
    const last = toNum(row.z);
    const prevClose = toNum(row.y);
    const price = last ?? prevClose; // z='-' 時退用昨收
    const { change, changePct } = calcChange(price, prevClose);
    out.push({
      symbol: misSymbol(code, ex),
      code,
      name,
      price,
      prevClose,
      change,
      changePct,
      open: toNum(row.o),
      high: toNum(row.h),
      low: toNum(row.l),
      volume: toNum(row.v),
      timeLabel: typeof row.t === 'string' ? row.t : undefined,
    });
  }
  return out;
}

// ── TWSE openapi /v1/exchangeReport/STOCK_DAY_ALL ───────────────

/**
 * 解析 TWSE openapi STOCK_DAY_ALL(全市場日收盤,上市):
 * [{Code,Name,ClosingPrice,Change,OpeningPrice,HighestPrice,LowestPrice,TradeVolume}]。
 * 只回傳 codes 內的個股,並依 codes 順序排列;昨收 = 收盤 - 漲跌。
 */
export function parseStockDayAll(json: any, codes: string[]): TwQuote[] {
  if (!Array.isArray(json)) return [];
  const wanted = new Set(codes);
  const byCode = new Map<string, TwQuote>();
  for (const row of json) {
    if (!row || typeof row !== 'object') continue;
    const code = typeof row.Code === 'string' ? row.Code.trim() : '';
    if (!code || !wanted.has(code)) continue;
    const price = toNum(row.ClosingPrice);
    const change = toNum(row.Change);
    const prevClose = price != null && change != null ? round2(price - change) : null;
    const changePct = change != null && prevClose != null && prevClose !== 0 ? round2((change / prevClose) * 100) : null;
    byCode.set(code, {
      symbol: `${code}.TW`,
      code,
      name: typeof row.Name === 'string' && row.Name ? row.Name : code,
      price,
      prevClose,
      change,
      changePct,
      open: toNum(row.OpeningPrice),
      high: toNum(row.HighestPrice),
      low: toNum(row.LowestPrice),
      volume: toNum(row.TradeVolume),
    });
  }
  const out: TwQuote[] = [];
  for (const c of codes) {
    const q = byCode.get(c);
    if (q) out.push(q);
  }
  return out;
}

// ── TWSE openapi /v1/exchangeReport/FMTQIK ──────────────────────

/**
 * 解析 FMTQIK(市場成交資訊,日資料)取「最後一列」:
 * {Date,TAIEX,Change,TradeValue(元)};TradeValue 換算為億元。
 * 結構錯誤(非陣列 / 空陣列)回 null。
 */
export function parseFmtqik(json: any): { date: string; taiex: number | null; change: number | null; turnoverBillions: number | null } | null {
  if (!Array.isArray(json) || json.length === 0) return null;
  const row = json[json.length - 1];
  if (!row || typeof row !== 'object') return null;
  const date = normalizeRocDate(typeof row.Date === 'string' ? row.Date.trim() : '');
  const taiex = toNum(row.TAIEX);
  const change = toNum(row.Change);
  const tradeValue = toNum(row.TradeValue);
  const turnoverBillions = tradeValue != null ? round1(tradeValue / 1e8) : null;
  return { date, taiex, change, turnoverBillions };
}

// ── TWSE openapi /v1/fund/BFI82U ────────────────────────────────

/**
 * 解析 BFI82U(三大法人買賣金額統計):
 * [{日期?,單位名稱,買進金額,賣出金額,買賣差額}](金額單位:元)。
 * 單位名稱含「外資」→ foreignNet(外資及陸資 + 外資自營商,多列相加)、
 * 含「投信」→ trustNet、含「自營商」→ dealerNet(注意「外資自營商」
 * 先歸外資)。金額換算億元,四捨五入到小數 1 位。無任何可辨識列回 null。
 */
export function parseBfi82u(json: any): InstitutionalFlow | null {
  if (!Array.isArray(json)) return null;
  let foreign = 0;
  let trust = 0;
  let dealer = 0;
  let matched = false;
  let date = '';
  for (const row of json) {
    if (!row || typeof row !== 'object') continue;
    // 欄位名以中文為主(openapi 實際回傳),保留少數英文別名容錯
    const rawName = row['單位名稱'] ?? row.Name ?? row.Item;
    const name = typeof rawName === 'string' ? rawName : '';
    if (!name) continue;
    if (!date) {
      const d = row['日期'] ?? row.Date;
      if (typeof d === 'string' && d.trim()) date = normalizeRocDate(d.trim());
    }
    // 買賣差額優先;缺失時退用 買進 - 賣出
    let net = toNum(row['買賣差額'] ?? row.Difference);
    if (net == null) {
      const buy = toNum(row['買進金額'] ?? row.BuyValue);
      const sell = toNum(row['賣出金額'] ?? row.SellValue);
      if (buy != null && sell != null) net = buy - sell;
    }
    if (net == null) continue;
    if (name.includes('外資')) {
      foreign += net;
      matched = true;
    } else if (name.includes('投信')) {
      trust += net;
      matched = true;
    } else if (name.includes('自營商')) {
      dealer += net;
      matched = true;
    }
  }
  if (!matched) return null;
  return {
    date,
    foreignNet: round1(foreign / 1e8),
    trustNet: round1(trust / 1e8),
    dealerNet: round1(dealer / 1e8),
    totalNet: round1((foreign + trust + dealer) / 1e8),
  };
}

// ── 台股開盤時間判斷 ────────────────────────────────────────────

/**
 * 台股是否盤中:Asia/Taipei 週一~週五 09:00–13:30(含端點)。
 * 用 Intl.DateTimeFormat 取台北時間的 weekday / hour / minute,
 * 不可用執行環境本地時區直算(裝置可能不在台灣)。
 */
export function isTwMarketOpen(now: Date): boolean {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Taipei',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now);
    let weekday = '';
    let hour = -1;
    let minute = -1;
    for (const p of parts) {
      if (p.type === 'weekday') weekday = p.value;
      else if (p.type === 'hour') hour = parseInt(p.value, 10);
      else if (p.type === 'minute') minute = parseInt(p.value, 10);
    }
    if (!weekday || Number.isNaN(hour) || Number.isNaN(minute) || hour < 0 || minute < 0) return false;
    if (weekday === 'Sat' || weekday === 'Sun') return false;
    const mins = hour * 60 + minute;
    return mins >= 9 * 60 && mins <= 13 * 60 + 30;
  } catch {
    // Intl 不可用時退用 UTC+8 直算(台灣無夏令時間,固定偏移安全)
    const t = new Date(now.getTime() + 8 * 3_600_000);
    const day = t.getUTCDay();
    if (day === 0 || day === 6) return false;
    const mins = t.getUTCHours() * 60 + t.getUTCMinutes();
    return mins >= 540 && mins <= 810;
  }
}
