/**
 * Expo Push 推播：匿名 token 存 KV、每日推送速報、清理失效 token。
 * token 為裝置端的 ExponentPushToken，後端不掌握任何個人資料。
 */
import { EXPO_PUSH_URL, NewsDigest, PUSH_CHANNEL, TOKEN_PREFIX } from './config';

/** Expo push token 格式：ExponentPushToken[...] 或 ExpoPushToken[...]。 */
export function isExpoToken(token: unknown): token is string {
  return typeof token === 'string' && /^Expo(nent)?PushToken\[[^\]]+\]$/.test(token);
}

export async function addToken(kv: KVNamespace, token: string, platform: string): Promise<void> {
  await kv.put(TOKEN_PREFIX + token, JSON.stringify({ platform, registeredAt: new Date().toISOString() }));
}

export async function removeToken(kv: KVNamespace, token: string): Promise<void> {
  await kv.delete(TOKEN_PREFIX + token);
}

export async function listTokens(kv: KVNamespace): Promise<string[]> {
  const out: string[] = [];
  let cursor: string | undefined;
  do {
    const res = await kv.list({ prefix: TOKEN_PREFIX, cursor });
    for (const k of res.keys) out.push(k.name.slice(TOKEN_PREFIX.length));
    cursor = res.list_complete ? undefined : res.cursor;
  } while (cursor);
  return out;
}

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

/** 送出推播，回傳「已失效（DeviceNotRegistered）」的 token 清單。 */
async function sendExpoPush(tokens: string[], title: string, body: string, data: unknown): Promise<string[]> {
  const invalid: string[] = [];
  for (const group of chunk(tokens, 100)) {
    const messages = group.map((to) => ({ to, title, body, data, channelId: PUSH_CHANNEL, sound: null }));
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(messages),
      });
      if (!res.ok) {
        console.error('expo push http', res.status, await res.text());
        continue;
      }
      const json: any = await res.json();
      (json.data ?? []).forEach((ticket: any, i: number) => {
        if (ticket?.status === 'error' && ticket?.details?.error === 'DeviceNotRegistered') {
          invalid.push(group[i]);
        }
      });
    } catch (e) {
      console.error('expo push failed', e);
    }
  }
  return invalid;
}

/** 把速報推給所有已註冊裝置；同時清理失效 token。 */
export async function pushDigest(kv: KVNamespace, digest: NewsDigest): Promise<{ sent: number; pruned: number }> {
  const tokens = await listTokens(kv);
  if (!tokens.length) return { sent: 0, pruned: 0 };
  const md = digest.date.slice(5).replace('-', '/'); // 'MM/DD'
  const invalid = await sendExpoPush(
    tokens,
    `📈 今日財經速報 ${md}`,
    digest.headline,
    { type: 'news', date: digest.date },
  );
  await Promise.all(invalid.map((t) => removeToken(kv, t)));
  return { sent: tokens.length - invalid.length, pruned: invalid.length };
}
