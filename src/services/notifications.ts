/**
 * 低干擾通知（全部為本機通知，不需推播伺服器，符合離線優先 / 伺服器不留存）。
 *
 * 規格：
 *  - 平時不打擾。只有「預算即將超支 / 已超支」才發出可見提醒。
 *  - 每月扣款成功僅以「靜默通知」呈現（不發聲、低重要性）。
 */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { formatTWD } from '../store/finance';
import { NEWS_BACKEND_URL } from './news';

const CH_ALERT = 'budget-alerts'; // 超支提醒
const CH_SILENT = 'silent-updates'; // 靜默扣款通知
const CH_NEWS = 'news-daily'; // 每日財經推播（遠端，與後端 PUSH_CHANNEL 一致）

let handlerSet = false;
let channelsReady = false;

/** 前景時的呈現策略：只顯示橫幅、不發聲（低干擾）。 */
function ensureHandler() {
  if (handlerSet) return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
  handlerSet = true;
}

async function ensureChannels() {
  if (channelsReady || Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CH_ALERT, {
    name: '預算提醒',
    importance: Notifications.AndroidImportance.HIGH,
    sound: null,
    vibrationPattern: [0, 120],
  });
  await Notifications.setNotificationChannelAsync(CH_SILENT, {
    name: '扣款通知',
    importance: Notifications.AndroidImportance.LOW, // 不彈出、不發聲
    sound: null,
  });
  await Notifications.setNotificationChannelAsync(CH_NEWS, {
    name: '每日財經速報',
    importance: Notifications.AndroidImportance.DEFAULT, // 顯示於通知列、不發聲
    sound: null,
  });
  channelsReady = true;
}

/** 請求通知權限（首次使用或使用者主動於設定啟用時）。web 不支援則回傳 false。 */
export async function ensurePermissions(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  ensureHandler();
  await ensureChannels();
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const req = await Notifications.requestPermissionsAsync();
  return req.granted;
}

async function present(channelId: string, title: string, body: string): Promise<boolean> {
  if (!(await ensurePermissions())) return false;
  await Notifications.scheduleNotificationAsync({
    content: { title, body, sound: false },
    // Android 用 1 秒間隔以套用指定頻道；iOS 立即顯示。
    trigger: (Platform.OS === 'android' ? { type: 'timeInterval', seconds: 1, channelId } : null) as any,
  });
  return true;
}

/**
 * 超支提醒：只在「剛跨過警戒線」時發一次，避免每筆都吵。
 * @returns 是否真的發了通知
 */
export async function maybeWarnOverspend(prevRemaining: number, newRemaining: number, budget: number): Promise<boolean> {
  const warnLine = budget * 0.1; // 剩不到 10% 視為即將超支
  const crossedWarn = prevRemaining > warnLine && newRemaining <= warnLine && newRemaining >= 0;
  const crossedOver = prevRemaining >= 0 && newRemaining < 0;
  if (!crossedWarn && !crossedOver) return false;

  if (crossedOver) {
    return present(CH_ALERT, '🍂 本月生活費已超支', `已超出預算 ${formatTWD(-newRemaining)}，部分葉片會轉黃。下個月回到預算內即可恢復翠綠。`);
  }
  return present(CH_ALERT, '🌿 生活費即將見底', `本月僅剩 ${formatTWD(newRemaining)} 可用，留意一下節奏。`);
}

/** 每月扣款成功的靜默通知。 */
export async function notifyMonthlyDeduction(invest: number, mortgage: number): Promise<boolean> {
  return present(
    CH_SILENT,
    '✅ 本月灌溉完成',
    `陽光水分（投資）${formatTWD(invest)}、土壤養分（房貸本金）${formatTWD(mortgage)} 已扣款。`,
  );
}

// ── 每日財經推播（Phase 3）─────────────────────────────────────────
//
// 本機只向後端上傳「匿名 Expo push token」；個人理財資料一律不外傳。
// 需求：EAS projectId（執行 `eas init` 後寫入 app.json 的 extra.eas.projectId）
// 與已部署的後端網址（src/services/news.ts 的 NEWS_BACKEND_URL）。

const NEWS_PREF_KEY = '@wealthtree3000/newsPush/v1';

export type NewsPushResult = { ok: true } | { ok: false; reason: string };

export async function getNewsPushEnabled(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(NEWS_PREF_KEY)) === '1';
  } catch {
    return false;
  }
}

async function setNewsPushPref(v: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(NEWS_PREF_KEY, v ? '1' : '0');
  } catch {
    // 偏好寫入失敗不影響推播本身
  }
}

function resolveProjectId(): string | undefined {
  const c: any = Constants;
  return c?.expoConfig?.extra?.eas?.projectId || c?.easConfig?.projectId || undefined;
}

async function getPushToken(): Promise<string | null> {
  const projectId = resolveProjectId();
  if (!projectId) return null;
  try {
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    return data;
  } catch {
    return null;
  }
}

/** 啟用每日財經推播：取得 Expo token 並向後端註冊。 */
export async function enableNewsPush(): Promise<NewsPushResult> {
  if (Platform.OS === 'web') return { ok: false, reason: 'web' };
  if (!(await ensurePermissions())) return { ok: false, reason: 'no-permission' };
  if (!NEWS_BACKEND_URL) return { ok: false, reason: 'no-backend' };
  if (!resolveProjectId()) return { ok: false, reason: 'no-project-id' };
  const token = await getPushToken();
  if (!token) return { ok: false, reason: 'no-token' };
  try {
    const res = await fetch(`${NEWS_BACKEND_URL}/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, platform: Platform.OS }),
    });
    if (!res.ok) return { ok: false, reason: `backend ${res.status}` };
    await setNewsPushPref(true);
    return { ok: true };
  } catch (e: any) {
    return { ok: false, reason: e?.message ?? 'network' };
  }
}

/** 關閉每日財經推播：向後端取消註冊。 */
export async function disableNewsPush(): Promise<void> {
  await setNewsPushPref(false);
  if (Platform.OS === 'web' || !NEWS_BACKEND_URL) return;
  const token = await getPushToken();
  if (!token) return;
  try {
    await fetch(`${NEWS_BACKEND_URL}/unregister`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token }),
    });
  } catch {
    // 取消註冊失敗：後端在下次推播失效時也會自動清理
  }
}
