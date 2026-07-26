import { ScrollView, View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  FadeInUp, useSharedValue, useAnimatedStyle, withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { FontFamily, Spacing, Radius, Duration, HeavenGradient, ShadowE2 } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MemberGate } from '@/components/member-gate';
import {
  getPinnedAnnouncements,
  getRegularAnnouncements,
  type Announcement,
} from '@/data/announcements';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const CATEGORY_BADGE: Record<string, { label: string; variant: 'member' | 'priority' | 'pastoral' | 'hod' | 'visitor' }> = {
  general: { label: 'General', variant: 'member' },
  program: { label: 'Program', variant: 'pastoral' },
  event: { label: 'Event', variant: 'hod' },
  admin: { label: 'Admin', variant: 'visitor' },
  youth: { label: 'Youth', variant: 'member' },
};

function AnnouncementCard({
  item,
  index,
  onPress,
}: {
  item: Announcement;
  index: number;
  onPress: () => void;
}) {
  const Colors = useThemeColors();
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  const badge = CATEGORY_BADGE[item.category];
  const hasLink = !!item.linkedProgramId || !!item.linkedEventId;

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
        <View style={styles.announcementHeader}>
          <Text style={[styles.announcementTitle, { color: Colors.onSurface }]} numberOfLines={2}>
            {item.title}
          </Text>
          {badge && <Badge label={badge.label} variant={badge.variant} />}
        </View>
        <Text style={[styles.announcementBody, { color: Colors.onSurfaceVariant }]} numberOfLines={2}>
          {item.body}
        </Text>
        <View style={styles.announcementFooter}>
          <Text style={[styles.dateText, { color: Colors.outline }]}>{item.date}</Text>
          {hasLink && (
            <Ionicons name="chevron-forward" size={16} color={Colors.outline} />
          )}
        </View>
      </AnimatedPressable>
    </Animated.View>
  );
}

function UpdatesScreen() {
  const Colors = useThemeColors();
  const router = useRouter();
  const pinned = getPinnedAnnouncements();
  const regular = getRegularAnnouncements();

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
            <Text style={styles.heroDate}>Week of 29 March 2026 · Shalom, Saints!</Text>
          </LinearGradient>
        </View>
      </Animated.View>

      {/* Pinned Announcements */}
      {pinned.length > 0 && (
        <Animated.View entering={FadeInUp.duration(400).delay(200)} style={styles.section}>
          <Text style={[styles.sectionLabel, { color: Colors.onSurface }]}>Pinned</Text>
          {pinned.map((item) => (
            <Pressable
              key={item.id}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push(`/announcement-detail?id=${item.id}`);
              }}
            >
              <Card variant="priority" style={styles.pinnedCard}>
                <View style={styles.pinnedHeader}>
                  <Text style={[styles.pinnedTitle, { color: Colors.onSurface }]}>{item.title}</Text>
                  <Badge label="Priority" variant="priority" />
                </View>
                <Text style={[styles.pinnedBody, { color: Colors.onSurfaceVariant }]} numberOfLines={4}>
                  {item.body}
                </Text>
                <Text style={[styles.dateText, { color: Colors.outline }]}>{item.date}</Text>
              </Card>
            </Pressable>
          ))}
        </Animated.View>
      )}

      {/* All Announcements */}
      <Animated.View entering={FadeInUp.duration(400).delay(320)} style={[styles.section, { marginTop: Spacing[6] }]}>
        <Text style={[styles.sectionLabel, { color: Colors.onSurface }]}>All announcements</Text>
      </Animated.View>
      {regular.map((item, index) => (
        <View key={item.id} style={styles.announcementPad}>
          <AnnouncementCard
            item={item}
            index={index}
            onPress={() => router.push(`/announcement-detail?id=${item.id}`)}
          />
        </View>
      ))}

      <View style={{ height: Spacing[6] }} />
    </ScrollView>
  );
}

// Member-only: visitors see the "Complete your profile" nudge instead of the feed.
export default function UpdatesTab() {
  return (
    <MemberGate featureLabel="the weekly announcements">
      <UpdatesScreen />
    </MemberGate>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
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
  pinnedBody: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    lineHeight: 22.4,
    marginTop: Spacing[2],
  },
  // Announcements
  announcementPad: {
    paddingHorizontal: Spacing[5],
  },
  announcementCard: {
    borderRadius: Radius.lg,
    padding: Spacing[4],
    marginBottom: Spacing[3],
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
    marginTop: Spacing[2],
  },
  announcementFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing[2],
  },
  dateText: {
    fontFamily: FontFamily.body,
    fontSize: 11,
    lineHeight: 15.4,
    marginTop: Spacing[2],
  },
});
