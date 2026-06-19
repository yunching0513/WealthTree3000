/**
 * 真實大盤指數串接（驅動「天氣 / 季節」）。
 *
 * 設計符合規格：核心功能離線可用，僅每月短暫連網更新一次指數。
 *  - 資料源：Stooq 月線 CSV，無需 API 金鑰。以 S&P 500（^spx）作為全球大盤代理。
 *  - 趨勢演算：當前收盤相對「12 個月均線」的偏離 → 映射成 -1..1 的 marketTrend。
 *    高於均線（多頭）→ 正值 → 春夏；低於均線（空頭）→ 負值 → 秋冬。
 *  - 失敗時不阻斷使用：沿用上次快取值。
 */

const INDEX_SYMBOL = '^spx';
export const INDEX_LABEL = 'S&P 500';
const CSV_URL = `https://stooq.com/q/d/l/?s=${encodeURIComponent(INDEX_SYMBOL)}&i=m`;
const SMA_MONTHS = 12;

export interface MarketSnapshot {
  trend: number; // -1..1
  price: number;
  sma: number;
  asOf: string; // 最新一筆月線日期
  label: string;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * 解析 Stooq 月線 CSV → 計算趨勢。純函式，可單獨測試。
 * CSV 第一列為表頭，含 Date 與 Close 欄。
 */
export function parseTrendFromCsv(csv: string): MarketSnapshot {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error('指數資料為空');

  const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const closeIdx = header.indexOf('close');
  const dateIdx = header.indexOf('date');
  if (closeIdx < 0) throw new Error('找不到 Close 欄位');

  const rows = lines
    .slice(1)
    .map((l) => l.split(','))
    .filter((c) => c.length > closeIdx && !Number.isNaN(parseFloat(c[closeIdx])));

  if (rows.length < 2) throw new Error('指數資料筆數不足');

  const closes = rows.map((c) => parseFloat(c[closeIdx]));
  const price = closes[closes.length - 1];
  const window = closes.slice(-SMA_MONTHS);
  const sma = window.reduce((s, v) => s + v, 0) / window.length;

  // 相對均線偏離；±16% 飽和到 ±1。
  const trend = clamp(((price / sma) - 1) * 6.25, -1, 1);
  const asOf = dateIdx >= 0 ? rows[rows.length - 1][dateIdx] : '';
  return { trend, price, sma, asOf, label: INDEX_LABEL };
}

/** 連網抓取最新指數並計算趨勢（呼叫端負責 try/catch 與快取）。 */
export async function fetchMarketSnapshot(signal?: AbortSignal): Promise<MarketSnapshot> {
  const res = await fetch(CSV_URL, { signal });
  if (!res.ok) throw new Error(`指數來源回應 ${res.status}`);
  const csv = await res.text();
  return parseTrendFromCsv(csv);
}

/** 距離上次同步是否已超過約一個月（28 天）。 */
export function isMarketStale(lastSyncISO?: string): boolean {
  if (!lastSyncISO) return true;
  const last = new Date(lastSyncISO).getTime();
  if (Number.isNaN(last)) return true;
  const days = (Date.now() - last) / 86_400_000;
  return days >= 28;
}
