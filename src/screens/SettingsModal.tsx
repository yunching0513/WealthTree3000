/** 設定・資料備份與還原 */
import React, { useEffect, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useApp } from '../store/AppContext';
import { exportBackup, importBackup } from '../store/backup';
import { isHardwareBacked } from '../store/secureStorage';
import { disableNewsPush, enableNewsPush, ensurePermissions, getNewsPushEnabled } from '../services/notifications';
import { Card, Caption, Pill, PrimaryButton, SectionTitle } from '../components/ui';
import { colors, font, radius, space } from '../theme';

export function SettingsModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { state, restore } = useApp();
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);
  const [newsOn, setNewsOn] = useState(false);
  const [newsBusy, setNewsBusy] = useState(false);

  useEffect(() => {
    getNewsPushEnabled().then(setNewsOn);
  }, []);

  const toggleNews = async () => {
    if (newsBusy) return;
    setNewsBusy(true);
    try {
      if (newsOn) {
        await disableNewsPush();
        setNewsOn(false);
        Alert.alert('已關閉', '不再接收每日財經推播。');
      } else {
        const r = await enableNewsPush();
        if (r.ok) {
          setNewsOn(true);
          Alert.alert('已啟用', '每天早上 07:30 起會收到《今日財經速報》。');
        } else {
          const map: Record<string, string> = {
            web: '網頁版不支援推播，請用手機 App 啟用。',
            'no-permission': '尚未取得通知權限，請到系統設定開啟。',
            'no-backend': '尚未設定後端網址（NEWS_BACKEND_URL）。',
            'no-project-id': '尚未設定 EAS projectId，請先執行 eas init。',
            'no-token': '無法取得推播 token，請改用實機或開發版 App。',
          };
          Alert.alert('尚未啟用', map[r.reason] ?? `啟用失敗：${r.reason}`);
        }
      }
    } finally {
      setNewsBusy(false);
    }
  };

  const onExport = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await exportBackup(state, pass || undefined);
      Alert.alert(
        '備份已建立',
        r.shared
          ? `已開啟分享面板，請選擇 iCloud Drive / Google Drive / 檔案 儲存「${r.filename}」。`
          : `已產生「${r.filename}」。`,
      );
    } catch (e: any) {
      Alert.alert('備份失敗', e?.message ?? '發生未知錯誤。');
    } finally {
      setBusy(false);
    }
  };

  const doImport = async () => {
    setBusy(true);
    try {
      const restored = await importBackup(pass || undefined);
      if (!restored) return; // 使用者取消
      restore(restored);
      Alert.alert('還原完成', '已從備份檔載入你的財富樹資料。');
      onClose();
    } catch (e: any) {
      Alert.alert('還原失敗', e?.message ?? '發生未知錯誤。');
    } finally {
      setBusy(false);
    }
  };

  const onImport = () => {
    if (busy) return;
    Alert.alert('從備份還原', '這會以備份檔內容覆蓋目前裝置上的資料，確定要繼續嗎？', [
      { text: '取消', style: 'cancel' },
      { text: '還原', style: 'destructive', onPress: doImport },
    ]);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} transparent>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.handleRow}>
            <Text style={styles.title}>設定</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Text style={styles.close}>✕</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ paddingBottom: space.lg }} keyboardShouldPersistTaps="handled">
            <Card>
              <View style={styles.statusRow}>
                <Text style={styles.statusText}>🔐 本機資料已靜置加密</Text>
                <Pill tone="good">{isHardwareBacked() ? '金鑰存於安全區' : 'web 預覽'}</Pill>
              </View>
              <Caption>
                存在手機裡的財務資料以 AES 加密，金鑰放在 iOS Keychain / Android Keystore，
                只在裝置解鎖時可讀。即使手機檔案被取得，沒有金鑰也無法解讀。
              </Caption>
            </Card>

            <Card>
              <SectionTitle>資料備份與還原</SectionTitle>
              <Caption>
                你的財務資料只存在這支手機。建議定期匯出備份到個人雲端硬碟（iCloud / Google Drive），
                換手機或重裝時即可還原 30 年的財富樹。開發方伺服器全程不接觸你的資料。
              </Caption>

              <Text style={styles.label}>加密密碼（選填，建議設定）</Text>
              <TextInput
                style={styles.input}
                placeholder="留空則匯出明碼 JSON"
                placeholderTextColor={colors.inkFaint}
                secureTextEntry
                value={pass}
                onChangeText={setPass}
              />
              <Caption>設了密碼，備份檔會以 AES 加密；還原時需輸入相同密碼。請自行記住，遺失將無法解密。</Caption>

              <View style={{ height: space.md }} />
              <PrimaryButton label={busy ? '處理中…' : '匯出備份'} onPress={onExport} disabled={busy} />
              <View style={{ height: space.sm }} />
              <PrimaryButton label="從備份還原" tone={colors.bark} onPress={onImport} disabled={busy} />
            </Card>

            <Card>
              <SectionTitle>低干擾提醒</SectionTitle>
              <Caption>
                平時不打擾。只有「生活費即將見底 / 已超支」才提醒；每月扣款成功僅以靜默通知呈現。
              </Caption>
              <View style={{ height: space.md }} />
              <PrimaryButton
                label="啟用提醒"
                tone={colors.leafLight}
                onPress={async () => {
                  const ok = await ensurePermissions();
                  Alert.alert(ok ? '已啟用低干擾提醒' : '尚未取得通知權限', ok ? '超支與扣款通知將以低干擾方式送達。' : '請到系統設定開啟此 App 的通知權限。');
                }}
              />
            </Card>

            <Card>
              <View style={styles.statusRow}>
                <Text style={styles.statusText}>📰 每日財經推播</Text>
                <Pill tone={newsOn ? 'good' : 'neutral'}>{newsOn ? '已啟用' : '未啟用'}</Pill>
              </View>
              <Caption>
                每天早上 07:30 推送一則繁中《今日財經速報》（貴金屬／期貨／美股／臺股／歐盟／東亞）。
                只上傳匿名推播識別碼，個人理財資料不外傳。
              </Caption>
              <View style={{ height: space.md }} />
              <PrimaryButton
                label={newsBusy ? '處理中…' : newsOn ? '關閉每日推播' : '啟用每日推播'}
                tone={newsOn ? colors.bark : colors.leaf}
                disabled={newsBusy}
                onPress={toggleNews}
              />
            </Card>

            <Card>
              <SectionTitle>關於</SectionTitle>
              <Caption>植富 3000・反焦慮、自動化的長期記帳與目標管理。離線優先、本機儲存。</Caption>
            </Card>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(51,41,31,0.35)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.sand,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: space.md,
    paddingTop: space.md,
    maxHeight: '88%',
  },
  handleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.md },
  title: { fontSize: font.title, fontWeight: '800', color: colors.leafDeep },
  close: { fontSize: 20, color: colors.inkSoft, paddingHorizontal: space.sm },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.sm },
  statusText: { fontSize: font.section, fontWeight: '700', color: colors.leafDeep },
  label: { fontSize: font.small, color: colors.inkSoft, fontWeight: '700', marginTop: space.md, marginBottom: space.xs },
  input: {
    backgroundColor: '#F4F0E6',
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    paddingVertical: 12,
    fontSize: font.body,
    color: colors.ink,
  },
});
