/**
 * WealthTree News Worker —— 每日財經速報後端。
 *
 *  Cron（每日 07:30 台北 = 23:30 UTC）：抓 RSS + Yahoo 報價 → Claude 策展
 *  → 存 KV。HTTP：
 *    GET  /digest/latest            取最新速報（App 用，CORS 開放）
 *    GET  /series?symbol=&range=    取某商品歷史序列（走勢圖用）
 *    POST /admin/refresh            手動觸發產生（需 x-admin-key，供首次/測試）
 *    GET  /health                   健康檢查
 *
 * 後端只存「公開新聞速報」，不碰任何個人資料。Phase 3 將在 scheduled 內
 * 加上 Expo Push 推播（token 由 /register 收集）。
 */
import { ALLOWED_SYMBOLS, KV_DIGEST_KEY, TrendRange, YF_RANGE } from './config';
import { buildDigest } from './digest';
import { fetchSeries } from './prices';
import { addToken, isExpoToken, pushDigest, removeToken } from './push';

export interface Env {
  KV: KVNamespace;
  ANTHROPIC_API_KEY?: string;
  ADMIN_KEY?: string;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, x-admin-key',
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...CORS },
  });
}

async function refresh(env: Env): Promise<{ date: string; sections: number; sent: number; pruned: number }> {
  const digest = await buildDigest(env, new Date());
  await env.KV.put(KV_DIGEST_KEY, JSON.stringify(digest));
  const push = await pushDigest(env.KV, digest); // 推給所有已註冊裝置並清理失效 token
  return { date: digest.date, sections: digest.sections.length, ...push };
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const url = new URL(req.url);

    if (url.pathname === '/health') return json({ ok: true });

    if (url.pathname === '/digest/latest' && req.method === 'GET') {
      const cached = await env.KV.get(KV_DIGEST_KEY);
      if (!cached) return json({ error: 'no digest yet' }, 404);
      return new Response(cached, {
        headers: { 'content-type': 'application/json; charset=utf-8', ...CORS },
      });
    }

    if (url.pathname === '/register' && req.method === 'POST') {
      let body: any;
      try {
        body = await req.json();
      } catch {
        return json({ error: 'bad json' }, 400);
      }
      if (!isExpoToken(body?.token)) return json({ error: 'invalid token' }, 400);
      await addToken(env.KV, body.token, typeof body.platform === 'string' ? body.platform : 'unknown');
      return json({ ok: true });
    }

    if (url.pathname === '/unregister' && req.method === 'POST') {
      let body: any;
      try {
        body = await req.json();
      } catch {
        return json({ error: 'bad json' }, 400);
      }
      if (!isExpoToken(body?.token)) return json({ error: 'invalid token' }, 400);
      await removeToken(env.KV, body.token);
      return json({ ok: true });
    }

    if (url.pathname === '/series' && req.method === 'GET') {
      const symbol = url.searchParams.get('symbol') ?? '';
      const range = (url.searchParams.get('range') ?? '3M') as TrendRange;
      const label = ALLOWED_SYMBOLS[symbol];
      if (!label) return json({ error: 'unknown symbol' }, 400);
      if (!(range in YF_RANGE)) return json({ error: 'bad range' }, 400);
      try {
        return json(await fetchSeries(symbol, label, range));
      } catch (e) {
        return json({ error: String(e) }, 502);
      }
    }

    if (url.pathname === '/admin/refresh' && req.method === 'POST') {
      if (!env.ADMIN_KEY || req.headers.get('x-admin-key') !== env.ADMIN_KEY) {
        return json({ error: 'unauthorized' }, 401);
      }
      try {
        return json({ ok: true, ...(await refresh(env)) });
      } catch (e) {
        return json({ error: String(e) }, 500);
      }
    }

    return json({ error: 'not found' }, 404);
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      refresh(env).then(
        (r) => console.log('digest refreshed', r),
        (e) => console.error('scheduled refresh failed', e),
      ),
    );
  },
};
