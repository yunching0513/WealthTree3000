/** 底部分頁列（自製，無第三方導航依賴，跨平台一致）。 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, font, space } from '../theme';

export interface TabDef {
  key: string;
  label: string;
  emoji: string;
}

export function TabBar({
  tabs,
  active,
  onChange,
}: {
  tabs: TabDef[];
  active: string;
  onChange: (key: string) => void;
}) {
  return (
    <View style={styles.bar}>
      {tabs.map((tab) => {
        const focused = tab.key === active;
        return (
          <Pressable key={tab.key} style={styles.tab} onPress={() => onChange(tab.key)}>
            <Text style={[styles.emoji, focused && styles.emojiActive]}>{tab.emoji}</Text>
            <Text style={[styles.label, focused && styles.labelActive]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.paper,
    borderTopWidth: 1,
    borderTopColor: '#E7E0D0',
    paddingBottom: space.md,
    paddingTop: space.sm,
  },
  tab: { flex: 1, alignItems: 'center', gap: 2 },
  emoji: { fontSize: 20, opacity: 0.45 },
  emojiActive: { opacity: 1 },
  label: { fontSize: font.tiny, color: colors.inkFaint },
  labelActive: { color: colors.leafDeep, fontWeight: '700' },
});
