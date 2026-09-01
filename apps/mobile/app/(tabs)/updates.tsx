import { ScrollView, View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from 'convex/react';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  FadeInUp, useSharedValue, useAnimatedStyle, withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { FontFamily, Spacing, Radius, Duration, HeavenGradient, ShadowE2 } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { Card } from '@/components/ui/card';
import { Cover } from '@/components/ui/cover';
import { Badge } from '@/components/ui/badge';
import { api, type Doc } from '@/lib/api';
import { formatFullDate } from '@/lib/content-format';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const PRIORITY_BADGE: Record<string, { label: string; variant: 'priority' | 'member' | 'pending' }> = {
  high: { label: 'Priority', variant: 'priority' },
  normal: { label: 'Update', variant: 'member' },
  low: { label: 'Notice', variant: 'pending' },
};

function AnnouncementCard({
  item,
  index,
  onPress,
}: {
  item: Doc<'announcements'>;
  index: number;
  onPress: () => void;
}) {
  const Colors = useThemeColors();
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  const badge = PRIORITY_BADGE[item.priority ?? 'normal'];

  return (
    // Wrapper carries the entering animation; press-scale stays on the pressable.
    <Animated.View entering={FadeInUp.duration(300).delay(400 + index * 50)}>
      <AnimatedPressable
        onPressIn={() => { scale.value = withTiming(0.98, { duration: Duration.fast }); }}
        onPressOut={() => { scale.value = withTiming(1, { duration: 150 }); }}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onPress();
        }}
        style={[styles.announcementCard, animatedStyle, { backgroundColor: Colors.surfaceLowest }]}
        accessibilityRole="button"
        accessibilityLabel={item.title}
      >
        <Cover uri={item.coverImageUrl} index={index} imageRadius={0} style={styles.announcementCover} />
        <View style={styles.announcementCardContent}>
          <View style={styles.announcementHeader}>
            <Text style={[styles.announcementTitle, { color: Colors.onSurface }]} numberOfLines={1}>
              {item.title}
            </Text>
            {badge && <Badge label={badge.label} variant={badge.variant} />}
          </View>
          <Text style={[styles.announcementBody, { color: Colors.onSurfaceVariant }]} numberOfLines={2}>
            {item.body}
          </Text>
          <Text style={[styles.dateText, { color: Colors.outline }]}>{formatFullDate(item.startDate)}</Text>
        </View>
        <View style={styles.announcementChevron}>
          <Ionicons name="chevron-forward" size={18} color={Colors.outline} />
        </View>
      </AnimatedPressable>
    </Animated.View>
  );
}

function UpdatesScreen() {
  const Colors = useThemeColors();
  const router = useRouter();
  const announcements = useQuery(api.announcements.listActiveAnnouncements);
  const isLoading = announcements === undefined;

  // "Pinned" isn't a stored flag — the highest-priority announcements read
  // as pinned, matching the priority badge shown everywhere else.
  const pinned = (announcements ?? []).filter((a) => a.priority === 'high');
  const regular = (announcements ?? []).filter((a) => a.priority !== 'high');

  return (
    <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
      {/* Hero Banner — heaven gradient */}
      <Animated.View entering={FadeInUp.duration(400).delay(80)} style={styles.heroSection}>
        <View style={[styles.heroContainer, ShadowE2]}>
          <LinearGradient
            colors={[...HeavenGradient.colors]}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.9, y: 1.2 }}
            style={styles.heroGrad}
          >
            <LinearGradient
              colors={['transparent', 'rgba(247,198,75,0.4)']}
              start={{ x: 0.4, y: 0.3 }}
              end={{ x: 1.15, y: 1.1 }}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            <Text style={styles.heroLabel}>WEEKLY</Text>
            <Text style={styles.heroTitle}>KLT Announcements</Text>
            <Text style={styles.heroDate}>Shalom, Saints!</Text>
          </LinearGradient>
        </View>
      </Animated.View>

      {isLoading && (
        <View style={styles.loading}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      )}

      {/* Pinned Announcements */}
      {pinned.length > 0 && (
        <Animated.View entering={FadeInUp.duration(400).delay(200)} style={styles.section}>
          <Text style={[styles.sectionLabel, { color: Colors.onSurface }]}>Pinned</Text>
          {pinned.map((item) => (
            <Pressable
              key={item._id}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push(`/announcement-detail?id=${item._id}`);
              }}
            >
              <Card variant="priority" style={styles.pinnedCard}>
                <View style={styles.pinnedHeader}>
                  <Text style={[styles.pinnedTitle, { color: Colors.onSurface }]}>{item.title}</Text>
                  <Badge label="Priority" variant="priority" />
                </View>
                <View style={styles.pinnedBodyRow}>
                  <Text style={[styles.pinnedBody, { color: Colors.onSurfaceVariant }, styles.pinnedBodyText]} numberOfLines={4}>
                    {item.body}
                  </Text>
                  {item.coverImageUrl && (
                    <Image source={{ uri: item.coverImageUrl }} style={styles.pinnedThumb} contentFit="cover" />
                  )}
                </View>
                <Text style={[styles.dateText, { color: Colors.outline }]}>{formatFullDate(item.startDate)}</Text>
              </Card>
            </Pressable>
          ))}
        </Animated.View>
      )}

      {/* All Announcements */}
      {!isLoading && (
        <>
          <Animated.View entering={FadeInUp.duration(400).delay(320)} style={[styles.section, { marginTop: Spacing[6] }]}>
            <Text style={[styles.sectionLabel, { color: Colors.onSurface }]}>All announcements</Text>
          </Animated.View>
          {regular.length > 0 ? (
            regular.map((item, index) => (
              <View key={item._id} style={styles.announcementPad}>
                <AnnouncementCard
                  item={item}
                  index={index}
                  onPress={() => router.push(`/announcement-detail?id=${item._id}`)}
                />
              </View>
            ))
          ) : pinned.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="megaphone-outline" size={40} color={Colors.outline} />
              <Text style={[styles.emptyTitle, { color: Colors.onSurfaceVariant }]}>No announcements right now</Text>
              <Text style={[styles.emptySubtitle, { color: Colors.outline }]}>New announcements from the church office will show up here.</Text>
            </View>
          ) : null}
        </>
      )}

      <View style={{ height: Spacing[6] }} />
    </ScrollView>
  );
}

// Open to everyone, including visitors pre-verification — only the Community
// (member directory) surface stays gated behind MemberGate.
export default function UpdatesTab() {
  return <UpdatesScreen />;
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  loading: {
    paddingVertical: Spacing[8],
    alignItems: 'center',
  },
  section: {
    paddingHorizontal: Spacing[5],
    marginTop: Spacing[5],
  },
  sectionLabel: {
    fontFamily: FontFamily.displaySemi,
    fontSize: 18,
    lineHeight: 24,
    marginBottom: Spacing[3],
  },
  // Hero banner — heaven gradient
  heroSection: {
    paddingHorizontal: Spacing[5],
    marginTop: Spacing[3],
  },
  heroContainer: {
    borderRadius: Radius.xl,
    overflow: 'hidden',
  },
  heroGrad: {
    width: '100%',
    minHeight: 150,
    padding: Spacing[5],
    justifyContent: 'flex-end',
  },
  heroLabel: {
    fontFamily: FontFamily.bodyExtraBold,
    fontSize: 10.5,
    lineHeight: 15,
    color: '#EDB63C',
    letterSpacing: 1.6,
  },
  heroTitle: {
    fontFamily: FontFamily.display,
    fontSize: 24,
    lineHeight: 30,
    color: '#FFFFFF',
    marginTop: 6,
  },
  heroDate: {
    fontFamily: FontFamily.body,
    fontSize: 12.5,
    lineHeight: 18,
    color: 'rgba(255,255,255,0.8)',
    marginTop: Spacing[1],
  },
  // Pinned
  pinnedCard: {
    marginBottom: Spacing[3],
  },
  pinnedHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  pinnedTitle: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 16,
    lineHeight: 24,
    flex: 1,
    marginRight: Spacing[2],
  },
  pinnedBodyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: Spacing[2],
  },
  pinnedBody: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    lineHeight: 22.4,
  },
  pinnedBodyText: {
    flex: 1,
  },
  // Small accent thumbnail only — the priority wash along the left edge is
  // the card's real visual signal, not the image, so this stays compact.
  pinnedThumb: {
    width: 56,
    height: 56,
    borderRadius: Radius.md,
    marginLeft: Spacing[3],
  },
  // Announcements — compact row, same shape as programs.tsx's ProgramRow:
  // a thumbnail on the left, truncated text on the right, tap for detail.
  announcementPad: {
    paddingHorizontal: Spacing[5],
  },
  announcementCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.lg,
    overflow: 'hidden',
    marginBottom: Spacing[3],
  },
  announcementCover: {
    width: 80,
    alignSelf: 'stretch',
  },
  announcementCardContent: {
    flex: 1,
    paddingVertical: Spacing[3],
    paddingLeft: Spacing[3],
    paddingRight: Spacing[2],
    gap: 2,
  },
  announcementChevron: {
    paddingRight: Spacing[3],
  },
  announcementHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  announcementTitle: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 14,
    lineHeight: 22.4,
    flex: 1,
    marginRight: Spacing[2],
  },
  announcementBody: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 2,
  },
  dateText: {
    fontFamily: FontFamily.body,
    fontSize: 11,
    lineHeight: 15.4,
    marginTop: Spacing[2],
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: Spacing[10],
    paddingHorizontal: Spacing[8],
  },
  emptyTitle: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 16,
    lineHeight: 24,
    marginTop: Spacing[3],
  },
  emptySubtitle: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    lineHeight: 18,
    marginTop: Spacing[1],
    textAlign: 'center',
  },
});
