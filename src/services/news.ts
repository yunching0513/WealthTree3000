/**
 * 每日財經速報 — 資料合約 + 取得 / 本機加密快取。
 *
 * 架構（見規劃）：雲端 Cloudflare Worker 每日抓 RSS + 報價 → 交給 Claude 產生
 * 繁中摘要（本檔的 NewsDigest 結構）→ 存 KV 並 Expo Push 推播。App 端：
 *  - 開啟「今日財經」分頁時向後端拉 `/digest/latest`（Phase 2 接上）。
 *  - 拉到後以 AES 靜置加密快取於本機，離線可看上次內容（沿用 secureStorage）。
 *  - 後端尚未設定時（Phase 1），先顯示內建範例，讓畫面與資料格式可先驗收。
 *
 * 後端只存「匿名 push token + 公開新聞摘要」，不碰任何個人財務資料。
 */
import { getDecrypted, setEncrypted } from '../store/secureStorage';

/** 六大市場分類。 */
export type NewsCategory = 'metals' | 'futures' | 'us' | 'tw' | 'eu' | 'asia';

/** 單一市場/商品的重點報價（漲跌以台股慣例「紅漲綠跌」呈現，見 NewsScreen）。 */
export interface NewsQuote {
  symbol: string; // 例：'^SPX'、'XAUUSD'
  label: string; // 顯示名稱，例：'S&P 500'、'黃金'
  price: number; // 最新價
  changePct: number; // 當日漲跌百分比，例：-0.42 表示 -0.42%
}

/** 單則新聞條目。 */
export interface NewsItem {
  title: string; // 繁中標題
  summary?: string; // AI 一句話摘要
  source: string; // 來源名稱，例：'鉅亨網'
  url: string; // 原文連結（點擊開啟外部瀏覽器）
}

/** 一個市場分類的整段內容（報價 + 新聞）。 */
export interface NewsSection {
  category: NewsCategory;
  label: string; // '貴金屬'
  emoji: string; // '🥇'
  quotes?: NewsQuote[];
  items: NewsItem[];
}

/** 一份每日速報（後端產出、App 渲染的完整合約）。 */
export interface NewsDigest {
  date: string; // 'YYYY-MM-DD'（台北時間）
  headline: string; // 一句話速報，推播標題用
  brief: string; // 2–4 句總結，推播內文 / 頁面導言用
  sections: NewsSection[];
  generatedAt: string; // ISO，產生時間
  model?: string; // 產生摘要的模型，例：'claude-haiku-4-5'
}

const NEWS_CACHE_KEY = '@wealthtree3000/news/v1';

/**
 * 後端網址。Phase 2 部署 Worker 後填入，例如
 * 'https://wealthtree-news.<你的帳號>.workers.dev'。留空則走範例 / 快取。
 */
export const NEWS_BACKEND_URL = '';

export type DigestSource = 'network' | 'cache' | 'sample';

export interface DigestResult {
  digest: NewsDigest;
  source: DigestSource; // 來源指示，UI 會據此標示「線上 / 已快取 / 範例」
}

/** 讀出本機加密快取的速報；無資料或解密失敗回傳 null。 */
export async function loadCachedDigest(): Promise<NewsDigest | null> {
  try {
    const raw = await getDecrypted(NEWS_CACHE_KEY);
    return raw ? (JSON.parse(raw) as NewsDigest) : null;
  } catch {
    return null;
  }
}

async function saveDigest(digest: NewsDigest): Promise<void> {
  try {
    await setEncrypted(NEWS_CACHE_KEY, JSON.stringify(digest));
  } catch {
    // 快取失敗不影響顯示（離線優先）
  }
}

/**
 * 取得最新速報。優先順序：
 *  1. 後端線上（成功則更新快取）
 *  2. 本機快取（離線 / 連線失敗時）
 *  3. 內建範例（從未取得過任何資料時）
 */
export async function fetchLatestDigest(signal?: AbortSignal): Promise<DigestResult> {
  if (!NEWS_BACKEND_URL) {
    const cached = await loadCachedDigest();
    return { digest: cached ?? SAMPLE_DIGEST, source: cached ? 'cache' : 'sample' };
  }
  try {
    const res = await fetch(`${NEWS_BACKEND_URL}/digest/latest`, { signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const digest = (await res.json()) as NewsDigest;
    await saveDigest(digest);
    return { digest, source: 'network' };
  } catch {
    const cached = await loadCachedDigest();
    return { digest: cached ?? SAMPLE_DIGEST, source: cached ? 'cache' : 'sample' };
  }
}

/**
 * 內建範例速報。僅供 Phase 1 預覽版面與資料格式，內容非即時行情；
 * UI 會明確標示「範例資料」。Phase 2 後端上線後即由真實內容取代。
 */
export const SAMPLE_DIGEST: NewsDigest = {
  date: '2026-06-18',
  headline: '美股收紅、金價站上 2,380；台股開盤聚焦台積電法說前卡位',
  brief:
    '隔夜美股因降息預期回溫收高，費半領漲；避險與通膨對沖需求推升黃金。歐股小幅收高，亞股今晨多開高。台股留意台積電法說前的權值股表現，以及新台幣匯率波動。',
  sections: [
    {
      category: 'metals',
      label: '貴金屬',
      emoji: '🥇',
      quotes: [
        { symbol: 'XAUUSD', label: '黃金', price: 2380.4, changePct: 0.82 },
        { symbol: 'XAGUSD', label: '白銀', price: 29.85, changePct: 1.14 },
      ],
      items: [
        {
          title: '金價站回 2,380 美元，市場押注下半年降息',
          summary: '美元走弱與實質殖利率下滑帶動黃金買盤，技術面看回測前高。',
          source: '鉅亨網',
          url: 'https://news.cnyes.com/news/cat/gold',
        },
        {
          title: '白銀工業需求題材延燒，比價偏向追趕黃金',
          summary: '太陽能與電動車用銀需求支撐，金銀比自高檔回落。',
          source: 'Kitco',
          url: 'https://www.kitco.com/news/',
        },
      ],
    },
    {
      category: 'futures',
      label: '期貨',
      emoji: '🛢️',
      quotes: [
        { symbol: 'CL.F', label: '西德州原油', price: 78.6, changePct: -0.65 },
        { symbol: 'NG.F', label: '天然氣', price: 2.94, changePct: 1.38 },
      ],
      items: [
        {
          title: '油價小幅回落，市場觀望 OPEC+ 產量訊號',
          summary: '需求端疑慮與庫存增加壓抑油價，短線區間整理。',
          source: 'Investing.com',
          url: 'https://www.investing.com/commodities/',
        },
      ],
    },
    {
      category: 'us',
      label: '美股',
      emoji: '🇺🇸',
      quotes: [
        { symbol: '^SPX', label: 'S&P 500', price: 5478.2, changePct: 0.45 },
        { symbol: '^NDX', label: '那斯達克', price: 17680.4, changePct: 0.62 },
        { symbol: '^DJI', label: '道瓊', price: 38790.0, changePct: 0.21 },
      ],
      items: [
        {
          title: '降息預期回溫，科技股領漲推升那指',
          summary: '通膨數據降溫帶動利率敏感族群，費半指數收高逾 1%。',
          source: 'MarketWatch',
          url: 'https://www.marketwatch.com/',
        },
        {
          title: 'AI 供應鏈財報展望樂觀，資金續抱權值龍頭',
          summary: '雲端資本支出上修，市場聚焦下一輪財報指引。',
          source: '鉅亨網',
          url: 'https://news.cnyes.com/news/cat/wd_stock',
        },
      ],
    },
    {
      category: 'tw',
      label: '臺股',
      emoji: '🇹🇼',
      quotes: [
        { symbol: '^TWII', label: '加權指數', price: 22850.0, changePct: 0.38 },
        { symbol: '2330.TW', label: '台積電', price: 1010.0, changePct: 0.99 },
      ],
      items: [
        {
          title: '台積電法說在即，外資卡位權值股',
          summary: '市場聚焦先進製程與 HBM 展望，盤面由半導體撐盤。',
          source: '經濟日報',
          url: 'https://money.udn.com/money/index',
        },
        {
          title: '新台幣匯率波動，留意出口電子族群評價',
          summary: '匯率與美債殖利率為短線變數，內資觀望氣氛仍濃。',
          source: 'MoneyDJ',
          url: 'https://www.moneydj.com/',
        },
      ],
    },
    {
      category: 'eu',
      label: '歐盟',
      emoji: '🇪🇺',
      quotes: [
        { symbol: '^DAX', label: '德國 DAX', price: 18420.0, changePct: 0.15 },
        { symbol: '^CAC', label: '法國 CAC', price: 7650.0, changePct: -0.1 },
        { symbol: '^FTSE', label: '英國 FTSE', price: 8190.0, changePct: 0.22 },
      ],
      items: [
        {
          title: '歐股小幅收高，市場消化 ECB 利率路徑',
          summary: '防禦與金融類股撐盤，政治不確定性壓抑法股。',
          source: 'Reuters',
          url: 'https://www.reuters.com/markets/europe/',
        },
      ],
    },
    {
      category: 'asia',
      label: '東亞',
      emoji: '🌏',
      quotes: [
        { symbol: '^N225', label: '日經 225', price: 38900.0, changePct: 0.55 },
        { symbol: '^HSI', label: '恆生指數', price: 18050.0, changePct: -0.3 },
        { symbol: '^KS11', label: '韓國 KOSPI', price: 2760.0, changePct: 0.4 },
      ],
      items: [
        {
          title: '日股隨美股走高開高，日圓貶值利多出口股',
          summary: '半導體與汽車類股領漲，市場關注日銀政策動向。',
          source: '鉅亨網',
          url: 'https://news.cnyes.com/news/cat/asia_stock',
        },
        {
          title: '港股震盪偏弱，資金觀望中國經濟數據',
          summary: '科技與地產股表現分歧，南向資金維持淨流入。',
          source: 'Reuters',
          url: 'https://www.reuters.com/markets/asia/',
        },
      ],
    },
  ],
  generatedAt: '2026-06-18T07:30:00+08:00',
  model: 'claude-haiku-4-5（範例）',
};
