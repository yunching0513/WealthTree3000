# 植富 3000 — 每日財經速報後端（Cloudflare Worker）

每日定時抓取 RSS 新聞（鉅亨網 cnyes + Google News 繁中）與 Yahoo Finance 即時報價，
交給 **Claude（claude-haiku-4-5）** 策展成一份繁中《今日財經速報》，存進 KV 供 App 取用。
走勢圖的歷史行情也由本 Worker 的 `/series` 端點供應（順便繞過 Stooq/Yahoo 在瀏覽器的 CORS）。

> 後端只存「公開新聞速報」，**不碰任何個人理財資料**。個人資料維持 100% 留在手機。

## 端點

| 方法 | 路徑 | 用途 |
|---|---|---|
| `GET` | `/digest/latest` | 取最新速報 JSON（App 今日財經分頁用） |
| `GET` | `/series?symbol=^GSPC&range=3M` | 取某商品歷史序列（走勢圖用，range：1M/3M/6M/1Y/5Y） |
| `POST` | `/admin/refresh` | 手動觸發產生速報（需 `x-admin-key`，供首次/測試） |
| `GET` | `/health` | 健康檢查 |

## 部署步驟

```bash
cd server
npm install

# 1) 登入 Cloudflare（免費帳號即可）
npx wrangler login

# 2) 建立 KV namespace，把回傳的 id 填進 wrangler.toml 的 kv_namespaces.id
npx wrangler kv namespace create KV

# 3) 設定密鑰（不會寫進程式碼）
npx wrangler secret put ANTHROPIC_API_KEY   # 貼上 Anthropic API 金鑰
npx wrangler secret put ADMIN_KEY           # 自訂一組隨機字串，給 /admin/refresh 用

# 4) 部署
npx wrangler deploy
# → 取得 Worker 網址，例如 https://wealthtree-news.<你的帳號>.workers.dev

# 5) 立刻產生第一份速報（不必等 07:30 cron）
export WORKER_URL=https://wealthtree-news.<你的帳號>.workers.dev
export ADMIN_KEY=<你剛設定的 ADMIN_KEY>
npm run refresh        # = curl -X POST -H "x-admin-key: $ADMIN_KEY" $WORKER_URL/admin/refresh

# 驗證
curl "$WORKER_URL/digest/latest" | head -c 600
curl "$WORKER_URL/series?symbol=^GSPC&range=1M"
```

## 接上 App

部署後，把 Worker 網址填進 App 端的 [src/services/news.ts](../src/services/news.ts)：

```ts
export const NEWS_BACKEND_URL = 'https://wealthtree-news.<你的帳號>.workers.dev';
```

App 的 `fetchLatestDigest()` 與 `fetchSeries()` 會自動改抓真實資料，失敗時仍回退本機快取/範例。

## 排程

`wrangler.toml` 的 cron `30 23 * * *`（UTC）＝ **每日 07:30 台北**。
要改時間就改這行（Cloudflare cron 一律 UTC）。

## 成本

- Cloudflare Workers / KV / Cron：免費額度即足夠（每天 1 次 cron + 少量讀取）。
- Anthropic API：每天約 1 次 Haiku 呼叫，月成本約數美分。
- Yahoo Finance / RSS：免費、免金鑰。

## 本機開發 / 驗證

```bash
npm run typecheck                      # tsc 型別檢查
npx wrangler deploy --dry-run --outdir dist   # 只打包不部署，驗證可建置
npx wrangler dev                       # 本機跑（miniflare），curl localhost:8787/health
```

## Phase 3（推播，待辦）

`scheduled()` 內已預留位置：產生速報後，向所有已註冊的 Expo push token 發送推播。
屆時會新增 `POST /register`（收匿名 token 存 KV）與 Expo Push 發送邏輯。
