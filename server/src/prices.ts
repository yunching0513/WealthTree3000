/** Yahoo Finance v8 chart API — 報價與歷史序列（單一端點同時供應兩者）。 */
import { NewsQuote, PricePoint, PriceSeries, TrendRange, YF_RANGE, USER_AGENT } from './config';

interface YahooResult {
  meta?: { regularMarketPrice?: number; chartPreviousClose?: number; previousClose?: number };
  timestamp?: number[];
  indicators?: { quote?: { close?: (number | null)[] }[]; adjclose?: { adjclose?: (number | null)[] }[] };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function isoDate(unixSec: number): string {
  return new Date(unixSec * 1000).toISOString().slice(0, 10);
}

async function fetchYahoo(symbol: string, range: string, interval: string): Promise<YahooResult> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol,
  )}?range=${range}&interval=${interval}`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`yahoo ${res.status} for ${symbol}`);
  const json: any = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error(`yahoo empty for ${symbol}`);
  return result as YahooResult;
}

/** 由 Yahoo 結果取出收盤序列（去除 null 點）。 */
function extractPoints(r: YahooResult): PricePoint[] {
  const ts = r.timestamp ?? [];
  const closes = r.indicators?.quote?.[0]?.close ?? r.indicators?.adjclose?.[0]?.adjclose ?? [];
  const points: PricePoint[] = [];
  for (let i = 0; i < ts.length; i++) {
    const c = closes[i];
    if (c == null || Number.isNaN(c)) continue;
    points.push({ t: isoDate(ts[i]), c: round2(c) });
  }
  return points;
}

/** 取單一商品最新報價 + 當日漲跌 %。 */
export async function fetchQuote(symbol: string, label: string): Promise<NewsQuote | null> {
  try {
    const r = await fetchYahoo(symbol, '5d', '1d');
    const points = extractPoints(r);
    const last = points.length ? points[points.length - 1].c : r.meta?.regularMarketPrice;
    if (last == null) return null;
    const prev =
      r.meta?.chartPreviousClose ??
      r.meta?.previousClose ??
      (points.length >= 2 ? points[points.length - 2].c : last);
    const changePct = prev ? round2(((last - prev) / prev) * 100) : 0;
    return { symbol, label, price: round2(last), changePct };
  } catch {
    return null; // 報價失敗不阻斷整份速報
  }
}

/** 取某商品指定時間長度的歷史序列。 */
export async function fetchSeries(symbol: string, label: string, range: TrendRange): Promise<PriceSeries> {
  const yf = YF_RANGE[range];
  const r = await fetchYahoo(symbol, yf.range, yf.interval);
  return { symbol, label, range, points: extractPoints(r) };
}
