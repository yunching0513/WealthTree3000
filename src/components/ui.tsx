/** 共用 UI 元件：卡片、區段標題、進度條、藥丸標籤、主要按鈕。 */
import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
  StyleProp,
} from 'react-native';
import { colors, font, radius, space } from '../theme';
import { clamp } from '../store/finance';

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

export function Caption({ children }: { children: React.ReactNode }) {
  return <Text style={styles.caption}>{children}</Text>;
}

export function ProgressBar({
  value,
  color = colors.leaf,
  track = '#E3DECF',
  height = 14,
}: {
  value: number;
  color?: string;
  track?: string;
  height?: number;
}) {
  return (
    <View style={[styles.track, { height, borderRadius: height / 2, backgroundColor: track }]}>
      <View
        style={{
          width: `${clamp(value, 0, 1) * 100}%`,
          height: '100%',
          borderRadius: height / 2,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

export function Pill({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'good' | 'warn' }) {
  const bg = tone === 'good' ? '#E3F1E2' : tone === 'warn' ? '#F6E7CE' : '#ECE7DA';
  const fg = tone === 'good' ? colors.leafDeep : tone === 'warn' ? colors.wither : colors.inkSoft;
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text style={[styles.pillText, { color: fg }]}>{children}</Text>
    </View>
  );
}

export function PrimaryButton({
  label,
  onPress,
  tone = colors.leaf,
  disabled,
}: {
  label: string;
  onPress: () => void;
  tone?: string;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: disabled ? '#C7C0B2' : tone, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: space.md,
    marginBottom: space.md,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  sectionTitle: {
    fontSize: font.section,
    fontWeight: '700',
    color: colors.ink,
    marginBottom: space.sm,
  },
  caption: {
    fontSize: font.small,
    color: colors.inkSoft,
    lineHeight: 20,
  },
  track: {
    width: '100%',
    overflow: 'hidden',
  },
  pill: {
    paddingHorizontal: space.sm + 2,
    paddingVertical: 4,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  pillText: {
    fontSize: font.tiny,
    fontWeight: '700',
  },
  button: {
    paddingVertical: 14,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: font.body,
    fontWeight: '700',
  },
});
