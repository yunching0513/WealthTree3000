/**
 * 設定與資料合約。NewsDigest / PriceSeries 與 App 端 (src/services/news.ts)
 * 保持一致 —— 後端原樣產出這些 JSON。
 */

export type NewsCategory = 'metals' | 'futures' | 'us' | 'tw' | 'eu' | 'asia';
export type TrendRange = '1M' | '3M' | '6M' | '1Y' | '5Y';

export interface NewsQuote {
  symbol: string; // Yahoo Finance 代號（如 ^GSPC、GC=F、2330.TW）
  label: string; // 顯示名稱
  price: number;
  changePct: number; // 當日漲跌 %
}

export interface NewsItem {
  title: string;
  summary?: string;
  source: string;
  url: string;
}

export interface NewsSection {
  category: NewsCategory;
  label: string;
  emoji: string;
  quotes?: NewsQuote[];
  items: NewsItem[];
}

export interface NewsDigest {
  date: string; // 'YYYY-MM-DD'（台北）
  headline: string;
  brief: string;
  sections: NewsSection[];
  generatedAt: string; // ISO
  model?: string;
}

export interface PricePoint {
  t: string; // 'YYYY-MM-DD'
  c: number;
}

export interface PriceSeries {
  symbol: string;
  label: string;
  range: TrendRange;
  points: PricePoint[];
}

/** RSS 來源：cnyes 分類 RSS 或 Google News 搜尋 RSS。 */
type Feed = { type: 'cnyes'; slug: string } | { type: 'gnews'; query: string };

const cnyes = (slug: string): Feed => ({ type: 'cnyes', slug });
const gnews = (query: string): Feed => ({ type: 'gnews', query });

export interface CategoryConfig {
  key: NewsCategory;
  label: string;
  emoji: string;
  quotes: { symbol: string; label: string }[];
  feeds: Feed[];
}

/**
 * 六大類設定。報價代號經 Yahoo Finance v8 chart API 實測可用（2026-06）。
 * 新聞以 cnyes 分類 RSS 為主、Google News 繁中搜尋為輔/補強。
 */
export const CATEGORIES: CategoryConfig[] = [
  {
    key: 'metals',
    label: '貴金屬',
    emoji: '🥇',
    quotes: [
      { symbol: 'GC=F', label: '黃金' },
      { symbol: 'SI=F', label: '白銀' },
    ],
    feeds: [gnews('黃金 OR 金價 OR 白銀 OR 貴金屬'), cnyes('forex')],
  },
  {
    key: 'futures',
    label: '期貨',
    emoji: '🛢️',
    quotes: [
      { symbol: 'CL=F', label: '西德州原油' },
      { symbol: 'NG=F', label: '天然氣' },
    ],
    feeds: [cnyes('future'), gnews('原油 OR 期貨 OR 天然氣')],
  },
  {
    key: 'us',
    label: '美股',
    emoji: '🇺🇸',
    quotes: [
      { symbol: '^GSPC', label: 'S&P 500' },
      { symbol: '^IXIC', label: '那斯達克' },
      { symbol: '^DJI', label: '道瓊' },
    ],
    feeds: [gnews('美股 OR 道瓊 OR 那斯達克 OR 標普500')],
  },
  {
    key: 'tw',
    label: '臺股',
    emoji: '🇹🇼',
    quotes: [
      { symbol: '^TWII', label: '加權指數' },
      { symbol: '2330.TW', label: '台積電' },
    ],
    feeds: [cnyes('tw_stock'), gnews('台股 OR 台積電 OR 加權指數')],
  },
  {
    key: 'eu',
    label: '歐盟',
    emoji: '🇪🇺',
    quotes: [
      { symbol: '^GDAXI', label: '德國 DAX' },
      { symbol: '^FCHI', label: '法國 CAC' },
      { symbol: '^FTSE', label: '英國 FTSE' },
    ],
    feeds: [gnews('歐股 OR 歐洲股市 OR 德國DAX OR 英國FTSE')],
  },
  {
    key: 'asia',
    label: '東亞',
    emoji: '🌏',
    quotes: [
      { symbol: '^N225', label: '日經 225' },
      { symbol: '^HSI', label: '恆生指數' },
      { symbol: '^KS11', label: '韓國 KOSPI' },
    ],
    feeds: [gnews('日經 OR 恆生 OR 韓股 OR 亞股'), cnyes('wd_stock')],
  },
];

/** TrendRange → Yahoo chart range/interval。 */
export const YF_RANGE: Record<TrendRange, { range: string; interval: string }> = {
  '1M': { range: '1mo', interval: '1d' },
  '3M': { range: '3mo', interval: '1d' },
  '6M': { range: '6mo', interval: '1d' },
  '1Y': { range: '1y', interval: '1d' },
  '5Y': { range: '5y', interval: '1wk' },
};

/** /series 允許的代號白名單（防止後端被當成任意代理）。 */
export const ALLOWED_SYMBOLS: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const c of CATEGORIES) for (const q of c.quotes) map[q.symbol] = q.label;
  return map;
})();

export const MODEL = 'claude-haiku-4-5';
export const KV_DIGEST_KEY = 'digest:latest';
export const USER_AGENT = 'Mozilla/5.0 (compatible; WealthTreeNewsBot/1.0)';
