/** RSS 抓取與解析（cnyes 分類 RSS + Google News 繁中搜尋 RSS）。 */
import { CategoryConfig, USER_AGENT } from './config';

export interface RawArticle {
  title: string;
  url: string;
  source: string;
  publishedAt?: string;
}

type Feed = CategoryConfig['feeds'][number];

function stripCdata(s: string): string {
  return s.replace(/<!\[CDATA\[/g, '').replace(/\]\]>/g, '').trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function pick(block: string, tag: string): string | undefined {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return m ? decodeEntities(stripCdata(m[1])) : undefined;
}

/**
 * 解析 RSS 2.0 的 <item>，回傳前 limit 則。
 *  - Google News：標題為「標題 - 來源」、且帶 <source> 標籤 → 拆出來源。
 *  - cnyes：標題本身乾淨（可能含 " - "），不可拆；來源固定為「鉅亨網」。
 */
function parseRss(xml: string, limit: number, provider: Feed['type'], defaultSource: string): RawArticle[] {
  const items = xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];
  const out: RawArticle[] = [];
  for (const block of items.slice(0, limit)) {
    const rawTitle = pick(block, 'title');
    const link = pick(block, 'link');
    if (!rawTitle || !link) continue;

    let title = rawTitle.trim();
    let source = defaultSource;

    if (provider === 'gnews') {
      const sourceTag = block.match(/<source[^>]*>([\s\S]*?)<\/source>/i);
      if (sourceTag) source = decodeEntities(stripCdata(sourceTag[1])).trim();
      if (source && title.endsWith(` - ${source}`)) {
        title = title.slice(0, -(source.length + 3)).trim();
      } else if (!sourceTag) {
        const dash = title.lastIndexOf(' - ');
        if (dash > 0) {
          source = title.slice(dash + 3).trim();
          title = title.slice(0, dash).trim();
        }
      }
    }

    out.push({ title, url: link.trim(), source: source || defaultSource, publishedAt: pick(block, 'pubDate') });
  }
  return out;
}

function feedUrl(feed: Feed): string {
  if (feed.type === 'cnyes') {
    return `https://news.cnyes.com/rss/v1/news/category/${feed.slug}`;
  }
  const params = new URLSearchParams({ q: feed.query, hl: 'zh-TW', gl: 'TW', ceid: 'TW:zh-Hant' });
  return `https://news.google.com/rss/search?${params.toString()}`;
}

async function fetchFeed(feed: Feed, limit: number): Promise<RawArticle[]> {
  try {
    const res = await fetch(feedUrl(feed), { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) return [];
    const defaultSource = feed.type === 'cnyes' ? '鉅亨網' : '來源';
    return parseRss(await res.text(), limit, feed.type, defaultSource);
  } catch {
    return [];
  }
}

/** 抓取某分類的所有來源、合併去重，回傳候選文章。 */
export async function fetchCategoryArticles(cat: CategoryConfig, perFeed = 8, cap = 8): Promise<RawArticle[]> {
  const lists = await Promise.all(cat.feeds.map((f) => fetchFeed(f, perFeed)));
  const seen = new Set<string>();
  const merged: RawArticle[] = [];
  // 交錯各來源，避免單一來源洗版
  for (let i = 0; i < perFeed; i++) {
    for (const list of lists) {
      const a = list[i];
      if (!a) continue;
      const key = a.title.replace(/\s+/g, '').slice(0, 24);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(a);
      if (merged.length >= cap) return merged;
    }
  }
  return merged;
}
