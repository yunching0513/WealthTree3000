/** 組裝每日速報：抓報價 + 新聞 → Claude 策展 → NewsDigest。 */
import { CATEGORIES, MODEL, NewsDigest, NewsItem, NewsSection, NewsQuote, CategoryConfig } from './config';
import { fetchCategoryArticles, RawArticle } from './sources';
import { fetchQuote } from './prices';
import { curate, CuratedDigest } from './curate';

function taipeiDate(now: Date): string {
  // 台北 = UTC+8
  return new Date(now.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

async function gather(cat: CategoryConfig) {
  const [quotes, articles] = await Promise.all([
    Promise.all(cat.quotes.map((q) => fetchQuote(q.symbol, q.label))).then(
      (qs) => qs.filter((q): q is NewsQuote => q != null),
    ),
    fetchCategoryArticles(cat),
  ]);
  return { cat, quotes, articles };
}

/** 只保留 url 確實來自候選清單的條目（防止模型竄改/編造網址）。 */
function validateItems(items: NewsItem[], articles: RawArticle[]): NewsItem[] {
  const valid = new Set(articles.map((a) => a.url));
  const out: NewsItem[] = [];
  for (const it of items) {
    if (it.url && valid.has(it.url)) {
      out.push(it);
    } else {
      // url 不在候選內：嘗試用標題比對找回正確連結
      const match = articles.find((a) => it.title && (a.title.includes(it.title) || it.title.includes(a.title)));
      if (match) out.push({ ...it, url: match.url, source: match.source });
    }
  }
  return out;
}

/** 候選新聞作為非 AI 後援：直接取原始標題。 */
function rawItems(articles: RawArticle[]): NewsItem[] {
  return articles.slice(0, 3).map((a) => ({ title: a.title, source: a.source, url: a.url }));
}

export async function buildDigest(env: { ANTHROPIC_API_KEY?: string }, now: Date): Promise<NewsDigest> {
  const gathered = await Promise.all(CATEGORIES.map(gather));

  let curated: CuratedDigest | null = null;
  if (env.ANTHROPIC_API_KEY) {
    try {
      curated = await curate(env.ANTHROPIC_API_KEY, gathered);
    } catch (e) {
      console.error('curate failed, falling back to raw headlines:', e);
    }
  }

  const sections: NewsSection[] = gathered.map(({ cat, quotes, articles }) => {
    const curatedSection = curated?.sections.find((s) => s.key === cat.key);
    const items = curatedSection ? validateItems(curatedSection.items, articles) : [];
    return {
      category: cat.key,
      label: cat.label,
      emoji: cat.emoji,
      quotes,
      items: items.length ? items : rawItems(articles),
    };
  });

  return {
    date: taipeiDate(now),
    headline: curated?.headline ?? '今日各市場速報（即時行情）',
    brief: curated?.brief ?? '以下為各市場最新報價與重點新聞。',
    sections,
    generatedAt: now.toISOString(),
    model: curated ? MODEL : `${MODEL}（未策展，原始標題）`,
  };
}
