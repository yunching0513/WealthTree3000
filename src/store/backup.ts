/**
 * 資料備份與還原（無伺服器）。
 *
 * 把本機財務資料序列化成一個備份檔，透過系統「分享」面板讓使用者自行
 * 存到 iCloud Drive / Google Drive / 檔案 App；還原時用文件選擇器讀回。
 * 可選用密碼做 AES 加密，開發方伺服器全程不接觸任何資料。
 *
 * 備份檔格式（Envelope）：
 *   { app:'wealthtree3000', v:1, exportedAt, encrypted, data }
 *   - encrypted=false → data 為明碼 JSON 字串
 *   - encrypted=true  → data 為 AES 密文（需相同密碼才能還原）
 */
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import CryptoJS from 'crypto-js';
import { DEFAULT_STATE, FinanceState } from './finance';

const APP_TAG = 'wealthtree3000';
const BACKUP_VERSION = 1;

interface Envelope {
  app: string;
  v: number;
  exportedAt: string;
  encrypted: boolean;
  data: string;
}

/** 序列化成備份檔內容（可加密）。 */
export function serializeBackup(state: FinanceState, passphrase?: string): string {
  const json = JSON.stringify(state);
  const encrypted = !!passphrase;
  const data = encrypted ? CryptoJS.AES.encrypt(json, passphrase!).toString() : json;
  const env: Envelope = {
    app: APP_TAG,
    v: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    encrypted,
    data,
  };
  return JSON.stringify(env, null, 2);
}

/** 解析備份檔內容，回傳可還原的狀態（會與預設值合併以容錯舊版）。 */
export function parseBackup(raw: string, passphrase?: string): FinanceState {
  let env: Envelope;
  try {
    env = JSON.parse(raw);
  } catch {
    throw new Error('檔案格式無法解析，可能不是備份檔。');
  }
  if (env?.app !== APP_TAG) throw new Error('這不是「植富 3000」的備份檔。');

  let json: string;
  if (env.encrypted) {
    if (!passphrase) throw new Error('此備份已加密，請先輸入密碼再還原。');
    const bytes = CryptoJS.AES.decrypt(env.data, passphrase);
    json = bytes.toString(CryptoJS.enc.Utf8);
    if (!json) throw new Error('密碼錯誤，無法解密備份。');
  } else {
    json = env.data;
  }

  let parsed: Partial<FinanceState>;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('備份內容毀損，無法還原。');
  }
  return { ...DEFAULT_STATE, ...parsed };
}

function backupFilename(encrypted: boolean): string {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `wealthtree-backup-${stamp}.${encrypted ? 'wt3' : 'json'}`;
}

export interface ExportResult {
  filename: string;
  shared: boolean;
}

/** 匯出備份：寫入檔案後叫出系統分享面板（iOS/Android），或瀏覽器下載（web）。 */
export async function exportBackup(state: FinanceState, passphrase?: string): Promise<ExportResult> {
  const content = serializeBackup(state, passphrase);
  const filename = backupFilename(!!passphrase);

  if (Platform.OS === 'web') {
    const doc = (globalThis as any).document;
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = doc.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    return { filename, shared: false };
  }

  const dir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
  const uri = `${dir}${filename}`;
  await FileSystem.writeAsStringAsync(uri, content, { encoding: FileSystem.EncodingType.UTF8 });

  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/json',
      dialogTitle: '儲存植富 3000 備份到 iCloud / Google Drive',
      UTI: 'public.json',
    });
  }
  return { filename, shared: canShare };
}

/** 匯入備份：開啟文件選擇器讀回備份檔並解析；使用者取消則回傳 null。 */
export async function importBackup(passphrase?: string): Promise<FinanceState | null> {
  const res = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'application/octet-stream', '*/*'],
    copyToCacheDirectory: true,
  });
  if (res.canceled || !res.assets?.length) return null;

  const asset = res.assets[0];
  let raw: string;
  if (Platform.OS === 'web' && (asset as any).file) {
    raw = await (asset as any).file.text();
  } else {
    raw = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.UTF8 });
  }
  return parseBackup(raw, passphrase);
}
