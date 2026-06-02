/**
 * 離線截圖產生器（無頭環境用）。
 * 直接重現 src/components/WealthTree.tsx 的繪圖邏輯（常數、path、配色完全相同），
 * 套上手機畫面外框後用 sharp 轉成 PNG，讓無法開瀏覽器的環境也能預覽真實視覺。
 */
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

// ── 主題（同 src/theme.ts） ───────────────────────────────
const C = {
  soil: '#6B4F3A', soilDark: '#4A3728', sand: '#F3EFE6', paper: '#FBF8F1', card: '#FFFFFF',
  leaf: '#3E7C4F', leafLight: '#6FAE6E', leafBright: '#8FD18A', leafDeep: '#2C5E3A',
  bark: '#7A5A3C', barkDark: '#5C432B', ring: '#C9A66B',
  sun: '#F4C95D', warn: '#D89B4A', wither: '#B5772F',
  ink: '#33291F', inkSoft: '#6E6256', inkFaint: '#9C9286',
};
const FONT = 'WenQuanYi Zen Hei, Noto Color Emoji, sans-serif';

// ── 財務邏輯（同 src/store/finance.ts 的精簡版） ──────────
const TARGET = 30_000_000, HOME = 5_000_000, MORT0 = 4_500_000;
function projectState(years, trend = 0.45) {
  let invest = 900_000, mortgage = MORT0;
  const mr = Math.pow(1.06, 1 / 12) - 1;
  for (let m = 0; m < years * 12; m++) { invest = invest * (1 + mr) + 20000; mortgage = Math.max(0, mortgage - 20000); }
  const equity = Math.max(0, HOME - mortgage);
  const total = invest + equity;
  return {
    invest, mortgage, equity, total,
    progress: Math.min(1, total / TARGET),
    growth: Math.sqrt(Math.min(1, total / TARGET)),
    root: Math.min(1, 1 - mortgage / MORT0),
    rings: years, trend,
  };
}
const fmtWan = (n) => { const w = n / 10000; return w >= 1000 ? (w / 1000).toFixed(2) + ' 千萬' : Math.round(w).toLocaleString('en-US') + ' 萬'; };

// ── WealthTree 繪圖（逐字對照 WealthTree.tsx） ────────────
const VB_W = 300, GROUND_Y = 280, TRUNK_X = 150;
const COMPANIONS = ['🐿️', '🐦', '🦔', '🦉', '🐝', '🦋'];
const CANOPY_BLOBS = [
  { dx: 0, dy: -0.62, r: 0.62 }, { dx: -0.55, dy: -0.3, r: 0.5 }, { dx: 0.55, dy: -0.3, r: 0.5 },
  { dx: -0.32, dy: -0.75, r: 0.46 }, { dx: 0.32, dy: -0.75, r: 0.46 }, { dx: 0, dy: -0.95, r: 0.4 },
];
function palette(season, health) {
  const sick = health < 0.7;
  if (season === 'summer') return { skyTop: '#BFE3F2', skyBottom: '#EAF6E9', foliage: sick ? C.warn : C.leafDeep, foliageLight: sick ? '#E0B95F' : C.leafLight, bare: false };
  if (season === 'spring') return { skyTop: '#CFEAF6', skyBottom: '#F0F8E9', foliage: sick ? C.warn : C.leaf, foliageLight: sick ? '#E6C46B' : C.leafBright, bare: false };
  if (season === 'autumn') return { skyTop: '#E9DAC2', skyBottom: '#F3EAD6', foliage: C.wither, foliageLight: C.warn, bare: false };
  return { skyTop: '#D7DEE3', skyBottom: '#ECEFE9', foliage: C.barkDark, foliageLight: C.bark, bare: true };
}
function trunkPath(w, h) {
  const baseL = TRUNK_X - w / 2, baseR = TRUNK_X + w / 2, topL = TRUNK_X - w / 3.2, topR = TRUNK_X + w / 3.2, topY = GROUND_Y - h;
  return `M ${baseL - 6} ${GROUND_Y} Q ${baseL} ${GROUND_Y - h * 0.4} ${topL} ${topY} L ${topR} ${topY} Q ${baseR} ${GROUND_Y - h * 0.4} ${baseR + 6} ${GROUND_Y} Z`;
}
function makeRoots(root) {
  const depth = 18 + root * 130, spread = 40 + root * 60, tips = 5, paths = [];
  for (let i = 0; i < tips; i++) {
    const t = (i / (tips - 1)) * 2 - 1;
    const endX = TRUNK_X + t * spread, endY = GROUND_Y + depth * (1 - Math.abs(t) * 0.4);
    const midX = TRUNK_X + t * spread * 0.4, midY = GROUND_Y + depth * 0.5;
    paths.push(`M ${TRUNK_X} ${GROUND_Y} Q ${midX} ${midY} ${endX} ${endY}`);
  }
  return paths;
}
function makeFallingLeaves(health, season) {
  const count = season === 'autumn' || season === 'winter' ? 8 : Math.round((1 - health) * 10);
  const color = season === 'winter' || season === 'autumn' ? C.wither : C.warn;
  const out = [];
  for (let i = 0; i < count; i++) out.push({ x: 40 + ((i * 53) % (VB_W - 80)), y: 150 + ((i * 89) % (GROUND_Y - 140)), r: 3 + (i % 3), color });
  return out;
}
function tree({ growth, root, health = 1, season = 'summer', rings = 0, companions = [], lean = 0 }, idp) {
  const pal = palette(season, health);
  const trunkH = 50 + growth * 150, trunkW = 14 + growth * 24, canopyR = 34 + growth * 86;
  const canopyCY = GROUND_Y - trunkH - canopyR * 0.45, rootDepth = 18 + root * 130;
  const foliageOpacity = pal.bare ? 0 : 0.55 + health * 0.45;
  let s = '';
  s += `<defs>
    <linearGradient id="${idp}sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${pal.skyTop}"/><stop offset="1" stop-color="${pal.skyBottom}"/></linearGradient>
    <linearGradient id="${idp}soil" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.soil}"/><stop offset="1" stop-color="${C.soilDark}"/></linearGradient>
  </defs>`;
  s += `<rect x="0" y="0" width="${VB_W}" height="${GROUND_Y}" fill="url(#${idp}sky)"/>`;
  if (season === 'summer' || season === 'spring') s += `<circle cx="250" cy="56" r="26" fill="${C.sun}" opacity="0.9"/>`;
  s += `<rect x="0" y="${GROUND_Y}" width="${VB_W}" height="${440 - GROUND_Y}" fill="url(#${idp}soil)"/>`;
  s += `<line x1="0" y1="${GROUND_Y}" x2="${VB_W}" y2="${GROUND_Y}" stroke="${C.barkDark}" stroke-width="2" opacity="0.3"/>`;
  makeRoots(root).forEach((d, i) => { s += `<path d="${d}" stroke="${C.barkDark}" stroke-width="${3 - i * 0.15}" fill="none" stroke-linecap="round" opacity="0.9"/>`; });
  s += `<line x1="${TRUNK_X - 70}" y1="${GROUND_Y + rootDepth}" x2="${TRUNK_X + 70}" y2="${GROUND_Y + rootDepth}" stroke="${C.ring}" stroke-width="1.5" stroke-dasharray="4 5" opacity="0.6"/>`;

  let g = `<g transform="rotate(${lean} ${TRUNK_X} ${GROUND_Y})">`;
  g += `<path d="${trunkPath(trunkW, trunkH)}" fill="${C.bark}"/>`;
  for (let i = 0; i < Math.min(rings, 6); i++) g += `<ellipse cx="${TRUNK_X}" cy="${GROUND_Y - 18 - i * 14}" rx="${trunkW / 2 - 2}" ry="3" stroke="${C.ring}" stroke-width="1.5" fill="none" opacity="0.8"/>`;
  if (!pal.bare) {
    g += `<g opacity="${foliageOpacity}">`;
    CANOPY_BLOBS.forEach((b, i) => { g += `<circle cx="${TRUNK_X + b.dx * canopyR}" cy="${canopyCY + b.dy * canopyR * 0.6}" r="${b.r * canopyR}" fill="${i % 2 === 0 ? pal.foliage : pal.foliageLight}"/>`; });
    g += `</g>`;
  }
  companions.slice(0, 6).forEach((emoji, i) => {
    const angle = (i / Math.max(companions.length, 1)) * Math.PI - Math.PI / 2;
    g += `<text x="${TRUNK_X + Math.cos(angle) * canopyR * 0.7}" y="${canopyCY - Math.sin(angle) * canopyR * 0.5 + 6}" font-size="18" text-anchor="middle" font-family="${FONT}">${emoji}</text>`;
  });
  g += `</g>`;
  s += g;
  makeFallingLeaves(health, season).forEach((l) => { s += `<circle cx="${l.x}" cy="${l.y}" r="${l.r}" fill="${l.color}" opacity="0.8"/>`; });
  return s;
}

// ── 畫面外框小工具 ────────────────────────────────────────
const W = 390, H = 844;
const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const txt = (x, y, t, { size = 15, color = C.ink, weight = 'normal', anchor = 'start' } = {}) =>
  `<text x="${x}" y="${y}" font-size="${size}" fill="${color}" font-weight="${weight}" text-anchor="${anchor}" font-family="${FONT}">${esc(t)}</text>`;
const card = (x, y, w, h, fill = C.card) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="16" fill="${fill}"/>`;
const bar = (x, y, w, h, v, color = C.leaf) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="#E3DECF"/><rect x="${x}" y="${y}" width="${Math.max(h, w * Math.min(1, v))}" height="${h}" rx="${h / 2}" fill="${color}"/>`;

function header() {
  return `<rect x="0" y="0" width="${W}" height="72" fill="${C.paper}"/>` +
    txt(20, 40, '植富 3000', { size: 22, weight: 'bold', color: C.leafDeep }) +
    txt(20, 60, 'WealthTree 3000・反焦慮・自動化', { size: 11, color: C.inkFaint });
}
function tabbar(active) {
  const tabs = [['🌳', '溫室總覽'], ['💧', '水源分配'], ['🎁', '時光溫室'], ['🌪️', '暴風雨']];
  let s = `<rect x="0" y="${H - 70}" width="${W}" height="70" fill="${C.paper}"/><line x1="0" y1="${H - 70}" x2="${W}" y2="${H - 70}" stroke="#E7E0D0" stroke-width="1"/>`;
  tabs.forEach(([e, l], i) => {
    const cx = W / (tabs.length * 2) * (2 * i + 1);
    const on = i === active;
    s += `<text x="${cx}" y="${H - 42}" font-size="20" text-anchor="middle" font-family="${FONT}" opacity="${on ? 1 : 0.45}">${e}</text>`;
    s += txt(cx, H - 22, l, { size: 11, anchor: 'middle', color: on ? C.leafDeep : C.inkFaint, weight: on ? 'bold' : 'normal' });
  });
  return s;
}
const nested = (x, y, w, inner) => `<svg x="${x}" y="${y}" width="${w}" height="${w * 440 / 300}" viewBox="0 0 300 440">${inner}</svg>`;

async function render(name, body, activeTab) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<rect width="${W}" height="${H}" fill="${C.sand}"/>` + header() + body + tabbar(activeTab) + `</svg>`;
  writeFileSync(`shots/${name}.svg`, svg);
  await sharp(Buffer.from(svg), { density: 144 }).png().toFile(`shots/${name}.png`);
  console.log('rendered', name);
}

// ── 三個畫面 ──────────────────────────────────────────────
const init = projectState(0);
const grown = projectState(15);

const dashboard = (st, { season = 'summer', rings = 0, companions = [], phase, stage }) =>
  card(16, 84, 358, 132) +
  txt(32, 116, '30 年生長進度', { size: 17, weight: 'bold' }) +
  txt(358, 113, phase, { size: 11, anchor: 'end', color: C.inkSoft }) +
  txt(32, 165, (st.progress * 100).toFixed(1) + '%', { size: 38, weight: 'bold', color: C.leafDeep }) +
  txt(150, 150, '目標 3,000 萬・64 歲', { size: 12, color: C.inkSoft }) +
  txt(150, 168, '總資產 ' + fmtWan(st.total), { size: 12, color: C.inkSoft }) +
  bar(32, 180, 326, 14, st.progress) +
  txt(32, 210, stage, { size: 14, weight: 'bold' }) +
  card(16, 228, 358, 472) +
  nested(45, 236, 300, tree({ growth: st.growth, root: st.root, health: 1, season, rings, companions }, 'd')) +
  txt(195, 690, '地底是根系（房貸），天空是枝葉（投資）', { size: 11, anchor: 'middle', color: C.inkFaint });

const budget = () =>
  `<rect x="16" y="84" width="358" height="120" rx="24" fill="${C.leafDeep}"/>` +
  txt(195, 118, '本月剩餘可用', { size: 13, anchor: 'middle', color: '#D7E8D2', weight: 'bold' }) +
  txt(195, 168, '$6,200', { size: 44, anchor: 'middle', color: '#FFFFFF', weight: 'bold' }) +
  txt(195, 192, '桌面小工具預覽・不顯示花費細項', { size: 11, anchor: 'middle', color: '#C9DCC3' }) +
  card(16, 216, 358, 188) +
  txt(32, 248, '每月淨流分配', { size: 17, weight: 'bold' }) +
  txt(32, 280, '每月淨收入', { size: 14, color: C.inkSoft }) + txt(358, 280, '$50,000', { size: 14, anchor: 'end', weight: 'bold' }) +
  txt(32, 312, '☀️ 陽光水分・投資 🔒', { size: 14, color: C.inkSoft }) + txt(358, 312, '$20,000', { size: 14, anchor: 'end', weight: 'bold' }) +
  txt(32, 340, '🪵 土壤養分・房貸本金 🔒', { size: 14, color: C.inkSoft }) + txt(358, 340, '$20,000', { size: 14, anchor: 'end', weight: 'bold' }) +
  txt(32, 368, '🌿 葉片健康・生活費預算', { size: 14, color: C.leafDeep, weight: 'bold' }) + txt(358, 368, '$10,000', { size: 14, anchor: 'end', weight: 'bold', color: C.leafDeep }) +
  txt(32, 392, '投資與房貸為防呆鎖定 🔒，需密碼才能調整。', { size: 11, color: C.inkSoft }) +
  card(16, 416, 358, 150) +
  txt(32, 448, '本月生活費', { size: 17, weight: 'bold' }) +
  txt(358, 446, '預算內', { size: 11, anchor: 'end', color: C.leafDeep, weight: 'bold' }) +
  bar(32, 462, 326, 14, 0.38) +
  txt(32, 498, '已花 $3,800 / 預算 $10,000', { size: 13, color: C.inkSoft }) +
  txt(32, 532, '日常記帳：午餐 -$120　咖啡 -$85　通勤 -$45', { size: 13, color: C.ink });

const storm = () =>
  card(16, 84, 358, 472) +
  nested(45, 92, 300, tree({ growth: grown.growth * 0.72, root: grown.root, health: 1, season: 'autumn', rings: 15, companions: COMPANIONS, lean: -8 }, 's')) +
  txt(195, 548, '模擬 2008 金融海嘯：樹冠狂搖落葉…', { size: 13, anchor: 'middle', color: C.inkSoft }) +
  card(16, 568, 358, 86) +
  txt(32, 600, '⏩ 時光快轉', { size: 17, weight: 'bold' }) +
  `<rect x="32" y="616" width="96" height="34" rx="17" fill="${C.leaf}"/>` + txt(80, 638, '快轉 10 年', { size: 12, anchor: 'middle', color: '#fff', weight: 'bold' }) +
  `<rect x="140" y="616" width="96" height="34" rx="17" fill="${C.leaf}"/>` + txt(188, 638, '快轉 20 年', { size: 12, anchor: 'middle', color: '#fff', weight: 'bold' }) +
  `<rect x="248" y="616" width="110" height="34" rx="17" fill="${C.leaf}"/>` + txt(303, 638, '到 64 歲', { size: 12, anchor: 'middle', color: '#fff', weight: 'bold' }) +
  card(16, 666, 358, 78) +
  txt(32, 698, '🌪️ 歷史風暴展示', { size: 17, weight: 'bold' }) +
  `<rect x="32" y="712" width="155" height="20" rx="6" fill="${C.wither}"/>` + txt(110, 727, '2008 金融海嘯', { size: 11, anchor: 'middle', color: '#fff', weight: 'bold' }) +
  `<rect x="203" y="712" width="155" height="20" rx="6" fill="${C.wither}"/>` + txt(280, 727, '2020 疫情大跌', { size: 11, anchor: 'middle', color: '#fff', weight: 'bold' });

await render('01-dashboard-initial', dashboard(init, { season: 'summer', rings: 0, companions: [], phase: '階段一・博士班醞釀期', stage: '🌱 目前階段：發芽樹苗' }), 0);
await render('02-dashboard-grown', dashboard(grown, { season: 'summer', rings: 15, companions: COMPANIONS, phase: '階段二・穩健扎根期', stage: '🌳 目前階段：大樹' }), 0);
await render('03-budget', budget(), 1);
await render('04-storm', storm(), 3);

// 設定・備份(底部 sheet 蓋在溫室總覽上)
async function renderRaw(name, fullBody) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${fullBody}</svg>`;
  writeFileSync(`shots/${name}.svg`, svg);
  await sharp(Buffer.from(svg), { density: 144 }).png().toFile(`shots/${name}.png`);
  console.log('rendered', name);
}
function settings() {
  const bg = `<rect width="${W}" height="${H}" fill="${C.sand}"/>` + header() +
    dashboard(init, { season: 'summer', rings: 0, companions: [], phase: '階段一・博士班醞釀期', stage: '🌱 目前階段：發芽樹苗' }) + tabbar(0);
  const dim = `<rect width="${W}" height="${H}" fill="#33291F" opacity="0.4"/>`;
  const top = 210;
  let s = `<rect x="0" y="${top}" width="${W}" height="${H - top}" rx="24" fill="${C.sand}"/>`;
  s += txt(20, top + 38, '設定', { size: 22, weight: 'bold', color: C.leafDeep });
  s += txt(W - 24, top + 38, '✕', { size: 20, anchor: 'end', color: C.inkSoft });
  s += card(16, top + 56, 358, 366);
  s += txt(32, top + 90, '資料備份與還原', { size: 17, weight: 'bold' });
  s += txt(32, top + 116, '你的財務資料只存在這支手機。建議定期匯出備份到', { size: 12, color: C.inkSoft });
  s += txt(32, top + 134, 'iCloud / Google Drive，換手機時即可還原 30 年的財富樹。', { size: 12, color: C.inkSoft });
  s += txt(32, top + 152, '開發方伺服器全程不接觸你的資料。', { size: 12, color: C.inkSoft });
  s += txt(32, top + 184, '加密密碼（選填，建議設定）', { size: 13, weight: 'bold', color: C.inkSoft });
  s += `<rect x="32" y="${top + 196}" width="326" height="44" rx="10" fill="#F4F0E6"/>` + txt(46, top + 223, '留空則匯出明碼 JSON', { size: 14, color: C.inkFaint });
  s += txt(32, top + 262, '設了密碼，備份檔會以 AES 加密；還原時需相同密碼。', { size: 11, color: C.inkSoft });
  s += `<rect x="32" y="${top + 280}" width="326" height="46" rx="23" fill="${C.leaf}"/>` + txt(195, top + 309, '匯出備份', { size: 15, anchor: 'middle', color: '#fff', weight: 'bold' });
  s += `<rect x="32" y="${top + 334}" width="326" height="46" rx="23" fill="${C.bark}"/>` + txt(195, top + 363, '從備份還原', { size: 15, anchor: 'middle', color: '#fff', weight: 'bold' });
  // 低干擾提醒卡
  const ny = top + 56 + 366 + 12;
  s += card(16, ny, 358, 116);
  s += txt(32, ny + 30, '低干擾提醒', { size: 17, weight: 'bold' });
  s += txt(32, ny + 54, '平時不打擾。只有生活費即將見底 / 已超支才提醒；', { size: 12, color: C.inkSoft });
  s += txt(32, ny + 72, '每月扣款成功僅以靜默通知呈現。', { size: 12, color: C.inkSoft });
  s += `<rect x="32" y="${ny + 84}" width="326" height="20" rx="6" fill="${C.leafLight}"/>` + txt(195, ny + 99, '啟用提醒', { size: 12, anchor: 'middle', color: '#fff', weight: 'bold' });
  return bg + dim + s;
}
await renderRaw('05-settings-backup', settings());

console.log('done; grown:', JSON.stringify({ total: Math.round(grown.total), progress: +(grown.progress * 100).toFixed(1), root: +grown.root.toFixed(2) }));
