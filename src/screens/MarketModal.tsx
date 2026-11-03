/**
 * 市場盤面（modal）。
 *
 * 看盤不是主分頁，是「今日財經」裡的一個入口：
 * 本 App 的定位是反焦慮，主畫面刻意不放會自己跳動的行情。
 * 想看的時候打開，看完關掉——由使用者發起，不由 App 提醒。
 */
import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { MarketScreen } from './MarketScreen';
import { colors, font, radius, space } from '../theme';

export function MarketModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} transparent>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.handleRow}>
            <Text style={styles.title}>市場盤面</Text>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="關閉市場盤面" style={styles.closeBtn}>
              <Text style={styles.close}>✕</Text>
            </Pressable>
          </View>
          <MarketScreen />
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
    paddingTop: space.md,
    height: '88%', // 固定高度：內層 MarketScreen 的 ScrollView 是 flex:1
    overflow: 'hidden',
  },
  handleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingLeft: space.md,
    paddingRight: space.sm,
  },
  title: { fontSize: font.title, fontWeight: '800', color: colors.leafDeep },
  // 44×44 觸控目標（無障礙最小尺寸）
  closeBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  close: { fontSize: 20, color: colors.inkSoft },
});
