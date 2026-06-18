/** 模組五：今日財經（每日財經速報） */
import React from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  DigestSource,
  NewsDigest,
  NewsItem,
  NewsQuote,
  NewsSection,
  fetchLatestDigest,
} from '../services/news';
import { Card, Caption, Pill, SectionTitle } from '../components/ui';
import { QuoteChartModal } from '../components/QuoteChartModal';
import { colors, font, radius, space } from '../theme';

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

/** 'YYYY-MM-DD' → '6/18（週四）'。解析失敗則原樣回傳。 */
function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getMonth() + 1}/${d.getDate()}（週${WEEKDAYS[d.getDay()]}）`;
}

function fmtPrice(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

const SOURCE_NOTE: Record<DigestSource, string> = {
  network: '線上更新',
  cache: '離線・顯示上次快取',
  sample: '範例資料（後端尚未設定）',
};

export function NewsScreen() {
  const [digest, setDigest] = React.useState<NewsDigest | null>(null);
  const [source, setSource] = React.useState<DigestSource>('sample');
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [activeQuote, setActiveQuote] = React.useState<NewsQuote | null>(null);

  const load = React.useCallback(async (isRefresh: boolean) => {
    if (isRefresh) setRefreshing(true);
    try {
      const result = await fetchLatestDigest();
      setDigest(result.digest);
      setSource(result.source);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    load(false);
  }, [load]);

  if (loading && !digest) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.leaf} />
        <Text style={styles.centerText}>正在整理今日財經速報…</Text>
      </View>
    );
  }

  if (!digest) {
    return (
      <View style={styles.center}>
        <Text style={styles.centerText}>暫時沒有可顯示的速報，下拉重試。</Text>
      </View>
    );
  }

  return (
    <>
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.leaf} />
      }
    >
      {/* 速報導言 */}
      <Card style={styles.heroCard}>
        <View style={styles.rowBetween}>
          <View style={styles.heroDateRow}>
            <Text style={styles.heroEmoji}>🌅</Text>
            <Text style={styles.heroDate}>{formatDate(digest.date)} 財經速報</Text>
          </View>
          <Pill tone={source === 'sample' ? 'warn' : 'good'}>{SOURCE_NOTE[source]}</Pill>
        </View>
        <Text style={styles.headline}>{digest.headline}</Text>
        <Caption>{digest.brief}</Caption>
        <Text style={styles.hint}>📈 輕觸任一報價可查看價格走勢圖（可選時間長度）</Text>
      </Card>

      {digest.sections.map((section) => (
        <SectionCard key={section.category} section={section} onQuotePress={setActiveQuote} />
      ))}

      <Text style={styles.footer}>
        產生於 {digest.generatedAt.slice(0, 16).replace('T', ' ')}
        {digest.model ? `・${digest.model}` : ''}
      </Text>
      <Text style={styles.footerHint}>點擊任一則新聞可開啟原文。資料僅供參考，非投資建議。</Text>
    </ScrollView>
    <QuoteChartModal quote={activeQuote} onClose={() => setActiveQuote(null)} />
    </>
  );
}

function SectionCard({ section, onQuotePress }: { section: NewsSection; onQuotePress: (q: NewsQuote) => void }) {
  return (
    <Card>
      <View style={styles.rowBetween}>
        <View style={styles.sectionHead}>
          <Text style={styles.sectionEmoji}>{section.emoji}</Text>
          <SectionTitle>{section.label}</SectionTitle>
        </View>
        <Caption>{section.items.length} 則</Caption>
      </View>

      {section.quotes && section.quotes.length > 0 && (
        <View style={styles.quoteRow}>
          {section.quotes.map((q) => (
            <QuoteChip key={q.symbol} quote={q} onPress={() => onQuotePress(q)} />
          ))}
        </View>
      )}

      <View style={styles.itemList}>
        {section.items.map((item, i) => (
          <ArticleRow key={`${section.category}-${i}`} item={item} last={i === section.items.length - 1} />
        ))}
      </View>
    </Card>
  );
}

/** 報價小卡（可點 → 走勢圖）。台股慣例：紅漲綠跌（上漲 danger 紅、下跌 leafDeep 綠）。 */
function QuoteChip({ quote, onPress }: { quote: NewsQuote; onPress: () => void }) {
  const up = quote.changePct >= 0;
  const tint = up ? colors.danger : colors.leafDeep;
  const arrow = up ? '▲' : '▼';
  const sign = up ? '+' : '';
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.quoteChip, pressed && styles.quoteChipPressed]}>
      <View style={styles.quoteLabelRow}>
        <Text style={styles.quoteLabel}>{quote.label}</Text>
        <Text style={styles.quoteSpark}>📈</Text>
      </View>
      <Text style={styles.quotePrice}>{fmtPrice(quote.price)}</Text>
      <Text style={[styles.quoteChange, { color: tint }]}>
        {arrow} {sign}
        {quote.changePct.toFixed(2)}%
      </Text>
    </Pressable>
  );
}

function ArticleRow({ item, last }: { item: NewsItem; last: boolean }) {
  return (
    <Pressable
      onPress={() => Linking.openURL(item.url).catch(() => {})}
      style={({ pressed }) => [styles.article, !last && styles.articleDivider, pressed && styles.articlePressed]}
    >
      <Text style={styles.articleTitle}>{item.title}</Text>
      {item.summary ? <Text style={styles.articleSummary}>{item.summary}</Text> : null}
      <Text style={styles.articleSource}>{item.source} ›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.sand },
  content: { padding: space.md, paddingBottom: space.xl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.sand, gap: space.sm, padding: space.lg },
  centerText: { color: colors.inkSoft, fontSize: font.small, textAlign: 'center' },

  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },

  heroCard: { backgroundColor: '#FBF3E2' },
  heroDateRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  heroEmoji: { fontSize: 20 },
  heroDate: { fontSize: font.section, fontWeight: '800', color: colors.leafDeep },
  headline: { fontSize: font.title, fontWeight: '800', color: colors.ink, lineHeight: 30, marginTop: space.sm, marginBottom: space.xs },
  hint: { fontSize: font.tiny, color: colors.wither, marginTop: space.sm, fontWeight: '700' },

  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  sectionEmoji: { fontSize: 18 },

  quoteRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm },
  quoteChip: {
    backgroundColor: colors.paper,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm + 2,
    paddingVertical: space.sm,
    minWidth: 100,
  },
  quoteChipPressed: { opacity: 0.6 },
  quoteLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.xs, marginBottom: 2 },
  quoteSpark: { fontSize: 10, opacity: 0.5 },
  quoteLabel: { fontSize: font.tiny, color: colors.inkSoft },
  quotePrice: { fontSize: font.body, fontWeight: '800', color: colors.ink },
  quoteChange: { fontSize: font.tiny, fontWeight: '700', marginTop: 1 },

  itemList: { marginTop: space.sm },
  article: { paddingVertical: space.sm },
  articleDivider: { borderBottomWidth: 1, borderBottomColor: 'rgba(51,41,31,0.07)' },
  articlePressed: { opacity: 0.6 },
  articleTitle: { fontSize: font.body, fontWeight: '700', color: colors.ink, lineHeight: 21 },
  articleSummary: { fontSize: font.small, color: colors.inkSoft, lineHeight: 19, marginTop: 2 },
  articleSource: { fontSize: font.tiny, color: colors.leaf, fontWeight: '700', marginTop: 4 },

  footer: { fontSize: font.tiny, color: colors.inkFaint, textAlign: 'center', marginTop: space.sm },
  footerHint: { fontSize: font.tiny, color: colors.inkFaint, textAlign: 'center', marginTop: 2 },
});
