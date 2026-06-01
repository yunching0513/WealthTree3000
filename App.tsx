/**
 * 植富 3000 (WealthTree 3000)
 * 為長期投資者打造的反焦慮記帳與目標管理 App。
 */
import React, { useState } from 'react';
import { ActivityIndicator, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { AppProvider, useApp } from './src/store/AppContext';
import { TabBar, TabDef } from './src/components/TabBar';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { BudgetScreen } from './src/screens/BudgetScreen';
import { GreenhouseScreen } from './src/screens/GreenhouseScreen';
import { StormScreen } from './src/screens/StormScreen';
import { colors, font, space } from './src/theme';

const TABS: TabDef[] = [
  { key: 'dashboard', label: '溫室總覽', emoji: '🌳' },
  { key: 'budget', label: '水源分配', emoji: '💧' },
  { key: 'greenhouse', label: '時光溫室', emoji: '🎁' },
  { key: 'storm', label: '暴風雨', emoji: '🌪️' },
];

function Shell() {
  const { ready } = useApp();
  const [active, setActive] = useState('dashboard');

  if (!ready) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.leaf} />
        <Text style={styles.loadingText}>載入財富樹…</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.brand}>植富 3000</Text>
        <Text style={styles.tagline}>WealthTree 3000・反焦慮・自動化</Text>
      </View>
      <View style={styles.body}>
        {active === 'dashboard' && <DashboardScreen />}
        {active === 'budget' && <BudgetScreen />}
        {active === 'greenhouse' && <GreenhouseScreen />}
        {active === 'storm' && <StormScreen />}
      </View>
      <TabBar tabs={TABS} active={active} onChange={setActive} />
      <StatusBar style="dark" />
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.sand },
  header: {
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    paddingBottom: space.sm,
    backgroundColor: colors.paper,
  },
  brand: { fontSize: font.title, fontWeight: '800', color: colors.leafDeep },
  tagline: { fontSize: font.tiny, color: colors.inkFaint, marginTop: 2 },
  body: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.sand, gap: space.sm },
  loadingText: { color: colors.inkSoft, fontSize: font.small },
});
