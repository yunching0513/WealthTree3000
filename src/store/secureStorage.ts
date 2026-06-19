/**
 * 本機「靜置加密」(encryption at rest)。
 *
 * 平常存在裝置上的財務資料一律以 AES 加密後才寫入 AsyncStorage；
 * 加密金鑰放在硬體安全區（iOS Keychain / Android Keystore，經 expo-secure-store），
 * 不與資料放在一起。即使有人取得手機檔案或備份，沒有金鑰也讀不到內容。
 *
 * SecureStore 有容量上限，因此「只把金鑰」放進去；體積會成長的資料（含記帳）
 * 仍存在 AsyncStorage，但是密文。web 無安全區，退而以 localStorage 保存金鑰（僅供預覽）。
 */
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import CryptoJS from 'crypto-js';

const KEY_NAME = 'wealthtree3000_enc_key_v1';

let cachedKey: string | null = null;

async function randomHexKey(): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(32); // 256-bit
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** 取得（或首次產生並保存）本機加密金鑰。 */
async function getOrCreateKey(): Promise<string> {
  if (cachedKey) return cachedKey;

  if (Platform.OS === 'web') {
    const ls = (globalThis as any).localStorage;
    const existing = ls?.getItem(KEY_NAME);
    if (existing) return (cachedKey = existing);
    const fresh = await randomHexKey();
    ls?.setItem(KEY_NAME, fresh);
    return (cachedKey = fresh);
  }

  const existing = await SecureStore.getItemAsync(KEY_NAME);
  if (existing) return (cachedKey = existing);

  const fresh = await randomHexKey();
  await SecureStore.setItemAsync(KEY_NAME, fresh, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED, // 僅在裝置解鎖時可讀
  });
  return (cachedKey = fresh);
}

/** 以本機金鑰加密後寫入。 */
export async function setEncrypted(storageKey: string, plaintext: string): Promise<void> {
  const key = await getOrCreateKey();
  const cipher = CryptoJS.AES.encrypt(plaintext, key).toString();
  await AsyncStorage.setItem(storageKey, cipher);
}

/** 讀出並用本機金鑰解密；無資料或解密失敗回傳 null。 */
export async function getDecrypted(storageKey: string): Promise<string | null> {
  const raw = await AsyncStorage.getItem(storageKey);
  if (raw == null) return null;
  const key = await getOrCreateKey();
  try {
    const text = CryptoJS.AES.decrypt(raw, key).toString(CryptoJS.enc.Utf8);
    return text || null;
  } catch {
    return null;
  }
}

/** 金鑰是否存放於硬體安全區（非 web 即視為是）。 */
export function isHardwareBacked(): boolean {
  return Platform.OS !== 'web';
}
