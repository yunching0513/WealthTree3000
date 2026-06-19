/**
 * 用 Claude (Messages API, claude-haiku-4-5) 把各分類候選新聞策展成繁中速報。
 * 以 tool_choice 強制結構化輸出（emit_digest 工具），讀取 tool_use.input。
 * 價格由 Yahoo 取得、不交給模型，避免捏造數字。
 */
import { CategoryConfig, MODEL, NewsItem, NewsQuote } from './config';
import { RawArticle } from './sources';

export interface CuratedSection {
  key: string;
  items: NewsItem[];
}
export interface CuratedDigest {
  headline: string;
  brief: string;
  sections: CuratedSection[];
}

const EMIT_DIGEST_TOOL = {
  name: 'emit_digest',
  description: '輸出今日財經速報（繁體中文）',
  input_schema: {
    type: 'object',
    properties: {
      headline: { type: 'string', description: '一句話總結今日全球財經重點，繁體中文，40 字以內' },
      brief: { type: 'string', description: '2–4 句總結今日重點，繁體中文' },
      sections: {
        type: 'array',
        description: '六大分類，每類挑 2–3 則最重要的新聞',
        items: {
          type: 'object',
          properties: {
            key: { type: 'string', enum: ['metals', 'futures', 'us', 'tw', 'eu', 'asia'] },
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  title: { type: 'string', description: '繁體中文標題（可精簡原標題）' },
                  summary: { type: 'string', description: '一句話摘要，繁體中文' },
                  source: { type: 'string', description: '原文來源名稱，從候選逐字複製' },
                  url: { type: 'string', description: '原文連結，務必從候選逐字複製，不可自行編造' },
                },
                required: ['title', 'summary', 'source', 'url'],
              },
            },
          },
          required: ['key', 'items'],
        },
      },
    },
    required: ['headline', 'brief', 'sections'],
  },
} as const;

const SYSTEM = `你是專業的台灣財經編輯。根據提供的「候選新聞」與「即時報價」，為每個市場分類挑選 2–3 則最重要、最有時效性的新聞，寫成精簡的繁體中文速報。
規則：
- title 用通順的繁體中文（可精簡或改寫原標題），summary 一句話點出重點。
- source 與 url 必須從該分類的候選清單中「逐字複製」，絕對不可自行編造或竄改網址。
- 不要輸出沒有候選來源的新聞。
- headline 結合當日報價與最重要事件，brief 用 2–4 句綜述。
- 全程繁體中文、客觀中性，不做投資建議。`;

function buildUserContent(
  cats: { cat: CategoryConfig; articles: RawArticle[]; quotes: NewsQuote[] }[],
): string {
  const parts: string[] = [];
  for (const { cat, articles, quotes } of cats) {
    const q = quotes.map((x) => `${x.label} ${x.price}（${x.changePct >= 0 ? '+' : ''}${x.changePct}%）`).join('、');
    const list = articles
      .map((a, i) => `  [${i + 1}] 標題：${a.title}\n      來源：${a.source}\n      url：${a.url}`)
      .join('\n');
    parts.push(`# 分類 ${cat.key}（${cat.label}）\n報價：${q || '（無）'}\n候選新聞：\n${list || '（無）'}`);
  }
  return `以下是今日各分類的即時報價與候選新聞，請呼叫 emit_digest 輸出速報。\n\n${parts.join('\n\n')}`;
}

/** 呼叫 Claude 產生策展結果；失敗則丟出錯誤由上層回退。 */
export async function curate(
  apiKey: string,
  cats: { cat: CategoryConfig; articles: RawArticle[]; quotes: NewsQuote[] }[],
): Promise<CuratedDigest> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4096,
      system: SYSTEM,
      tools: [EMIT_DIGEST_TOOL],
      tool_choice: { type: 'tool', name: 'emit_digest' },
      messages: [{ role: 'user', content: buildUserContent(cats) }],
    }),
  });
  if (!res.ok) throw new Error(`anthropic ${res.status}: ${await res.text()}`);
  const data: any = await res.json();
  const block = (data.content ?? []).find((b: any) => b.type === 'tool_use');
  if (!block?.input) throw new Error('anthropic: no tool_use block');
  return block.input as CuratedDigest;
}
