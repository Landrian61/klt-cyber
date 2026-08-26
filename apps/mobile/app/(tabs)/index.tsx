import {
  ScrollView, View, Text, Pressable, Image, StyleSheet, Linking,
} from 'react-native';
import { useMemo } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useQuery } from 'convex/react';
import Animated, { FadeInUp, useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { FontFamily, Spacing, Radius, Duration, ShadowE2 } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Cover } from '@/components/ui/cover';
import { ProfileCompletionBanner } from '@/components/profile-completion-banner';
import { useMyAccount } from '@/hooks/use-my-account';
import { getGreetingName } from '@/lib/user-display';
import { api, type Doc } from '@/lib/api';
import {
  formatEventDate, formatClockTime, formatFullDate, formatTime, dayName,
} from '@/lib/content-format';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function getFormattedDate(): string {
  return new Date().toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// ── Section 1: Theme banner (annual + monthly, scripture, cover) ──────────────

function ThemeBanner({ themes }: { themes: { annual: Doc<'themes'> | null; monthly: Doc<'themes'> | null } }) {
  const Colors = useThemeColors();
  const { annual, monthly } = themes;
  if (!annual && !monthly) return null;

  const annualYear = annual ? new Date(annual.periodStart).getFullYear() : null;

  return (
    <Animated.View entering={FadeInUp.duration(400).delay(160)} style={styles.section}>
      {annual && (
        <View style={[styles.themeCardContainer, ShadowE2]}>
          {/* Photo fills the whole card; content below defines its height. */}
          <Image
            source={require('@/assets/images/Church_Theme.jpg')}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
          {/* Heaven-blue scrim so the scripture stays legible over the photo */}
          <LinearGradient
            colors={['rgba(12,33,84,0.80)', 'rgba(12,33,84,0.62)']}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.9, y: 1.3 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          {/* Dawn gold-glow rising from the corner */}
          <LinearGradient
            colors={['transparent', 'rgba(247,198,75,0.4)']}
            start={{ x: 0.35, y: 0.4 }}
            end={{ x: 1.1, y: 1.15 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <View style={styles.themeCardContent}>
            <View style={styles.themePill}>
              <Text style={styles.themePillText}>{annualYear} CHURCH THEME</Text>
            </View>
            <Text style={styles.themeTitle}>{annual.title}</Text>
            <Text style={styles.themeScripture} numberOfLines={5}>
              “{annual.scriptureText}”
            </Text>
            <Text style={styles.themeScriptureRef}>
              {annual.scriptureReference?.toUpperCase()} · KJV
            </Text>
          </View>
        </View>
      )}

      {monthly && (
        <View style={[styles.monthlyCard, { backgroundColor: Colors.surfaceLowest }]}>
          <Text style={[styles.monthlyLabel, { color: Colors.primary }]}>THIS MONTH</Text>
          <Text style={[styles.monthlyTitle, { color: Colors.onSurface }]}>{monthly.title}</Text>
          <Text style={[styles.monthlyScripture, { color: Colors.onSurfaceVariant }]} numberOfLines={2}>
            “{monthly.scriptureText}”
          </Text>
          <Text style={[styles.monthlyRef, { color: Colors.outline }]}>{monthly.scriptureReference}</Text>
        </View>
      )}
    </Animated.View>
  );
}

// ── Section 2: Weekly programs ("This week") ──────────────────────────────────

/** One expanded occurrence from api.calendar.getCalendarRange, narrowed to
 * type "program" — a recurring/one-time program landing on a specific day
 * within the queried range. */
interface ProgramOccurrence {
  type: 'program';
  start: number;
  occurrenceKey: string;
  programId: string;
  title: string;
  description?: string;
  location?: string;
  coverImageUrl?: string;
  startTime: string;
  endTime?: string;
  dayOfWeek: number;
  date: string;
}

function ProgramCard({ program, index }: { program: ProgramOccurrence; index: number }) {
  const router = useRouter();
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const schedule = `${dayName(program.dayOfWeek)}, ${formatTime(program.startTime)}`;
  return (
    <Animated.View entering={FadeInUp.duration(300).delay(200 + index * 60)}>
      <AnimatedPressable
        onPressIn={() => { scale.value = withTiming(0.97, { duration: Duration.fast }); }}
        onPressOut={() => { scale.value = withTiming(1, { duration: 150 }); }}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push(`/program-detail?id=${program.programId}`);
        }}
        style={[styles.programCard, animatedStyle]}
        accessibilityRole="button"
        accessibilityLabel={`${program.title}, ${schedule}`}
      >
        <Cover uri={program.coverImageUrl} index={index} imageRadius={Radius.lg} style={styles.programCardImage}>
          <View style={styles.programCardScrim}>
            <Text style={styles.programCardName} numberOfLines={1}>{program.title}</Text>
            <Text style={styles.programCardTime} numberOfLines={1}>{schedule}</Text>
          </View>
        </Cover>
      </AnimatedPressable>
    </Animated.View>
  );
}

// ── Section 3 & 4: Events ─────────────────────────────────────────────────────

/** Convex-backed event card (remote cover, tonal-gradient fallback). Used for
 * both the "Upcoming events" row and the "Featured" slider — `size` only
 * changes the card's footprint. */
function EventCard({
  event, index, size = 'default',
}: { event: Doc<'events'>; index: number; size?: 'default' | 'featured' }) {
  const Colors = useThemeColors();
  const router = useRouter();
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const cardStyle = size === 'featured' ? styles.featuredCard : styles.eventCard;
  return (
    <Animated.View entering={FadeInUp.duration(300).delay(200 + index * 60)}>
      <AnimatedPressable
        onPressIn={() => { scale.value = withTiming(0.97, { duration: Duration.fast }); }}
        onPressOut={() => { scale.value = withTiming(1, { duration: 150 }); }}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push(`/event-detail?id=${event._id}`);
        }}
        style={[cardStyle, animatedStyle]}
        accessibilityRole="button"
        accessibilityLabel={`${event.title}, ${formatEventDate(event.startDateTime)}`}
      >
        <Cover uri={event.coverImageUrl} index={index + 1} imageRadius={Radius.lg} style={styles.eventCardImage}>
          <View style={styles.eventCardScrim}>
            <View style={[styles.eventDatePill, { backgroundColor: Colors.primaryLight }]}>
              <Text style={[styles.eventDateText, { color: Colors.primary }]} numberOfLines={1}>
                {formatEventDate(event.startDateTime)}
              </Text>
            </View>
            <View>
              <Text style={styles.eventCardName} numberOfLines={2}>{event.title}</Text>
              <Text style={styles.eventCardMeta} numberOfLines={1}>
                {formatClockTime(event.startDateTime)}{event.location ? ` · ${event.location}` : ''}
              </Text>
            </View>
          </View>
        </Cover>
      </AnimatedPressable>
    </Animated.View>
  );
}

// ── Section 5: Announcements ──────────────────────────────────────────────────

const PRIORITY_BADGE: Record<string, { label: string; variant: 'priority' | 'member' | 'pending' }> = {
  high: { label: 'Priority', variant: 'priority' },
  normal: { label: 'Update', variant: 'member' },
  low: { label: 'Notice', variant: 'pending' },
};

function AnnouncementCard({ item, index }: { item: Doc<'announcements'>; index: number }) {
  const Colors = useThemeColors();
  const badge = PRIORITY_BADGE[item.priority ?? 'normal'];
  return (
    <Animated.View
      entering={FadeInUp.duration(300).delay(200 + index * 50)}
      style={[styles.announcementCard, { backgroundColor: Colors.surfaceLowest }]}
    >
      <View style={styles.announcementHeader}>
        <Text style={[styles.announcementTitle, { color: Colors.onSurface }]} numberOfLines={2}>
          {item.title}
        </Text>
        {badge && <Badge label={badge.label} variant={badge.variant} />}
      </View>
      <Text style={[styles.announcementBody, { color: Colors.onSurfaceVariant }]} numberOfLines={3}>
        {item.body}
      </Text>
      {item.links && item.links.length > 0 && (
        <View style={styles.announcementLinks}>
          {item.links.map((link) => (
            <Pressable
              key={`${link.label}-${link.url}`}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                Linking.openURL(link.url).catch(() => {});
              }}
              style={styles.linkChip}
              accessibilityRole="link"
              accessibilityLabel={link.label}
            >
              <Text style={[styles.linkChipText, { color: Colors.primary }]}>{link.label}</Text>
              <Ionicons name="open-outline" size={13} color={Colors.primary} />
            </Pressable>
          ))}
        </View>
      )}
      <Text style={[styles.announcementDate, { color: Colors.outline }]}>
        {formatFullDate(item.startDate)}
      </Text>
    </Animated.View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const Colors = useThemeColors();
  const router = useRouter();
  const { user } = useMyAccount();
  const greetingName = getGreetingName(user);

  const themes = useQuery(api.themes.getCurrentThemes);
  const featured = useQuery(api.events.listFeaturedEvents);
  const announcements = useQuery(api.announcements.listActiveAnnouncements);

  // "This week" — weekly-program occurrences (each recurring program expanded
  // per its own pattern) over the next 7 days. The range is memoized so the
  // query args stay referentially stable across re-renders — otherwise a new
  // Date.now() on every render would resubscribe the query each time.
  const weekRange = useMemo(() => ({ startDate: Date.now(), endDate: Date.now() + WEEK_MS }), []);
  const calendar = useQuery(api.calendar.getCalendarRange, weekRange);
  const weekPrograms = (
    calendar?.filter((item): item is ProgramOccurrence => item.type === 'program') ?? []
  ).slice(0, 8);

  const upcomingEvents = useQuery(api.events.listUpcomingEvents, { limit: 8 });

  return (
    <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
      {/* Greeting */}
      <Animated.View entering={FadeInUp.duration(400).delay(80)} style={styles.greeting}>
        <Text style={[styles.name, { color: Colors.onSurface }]}>
          {greetingName ? `Shalom ${greetingName}` : 'Shalom'}
        </Text>
        <Text style={[styles.date, { color: Colors.outline }]}>{getFormattedDate()}</Text>
      </Animated.View>

      {/* Section 1 — Theme banner (annual + monthly, scripture, cover) */}
      {themes && <ThemeBanner themes={themes} />}

      {/* Join-the-family invitation — sits just below the monthly theme. Shown
          to visitors (and a review-status card to pending users); renders
          nothing once verified. */}
      <ProfileCompletionBanner />

      {/* Section 2 — This week's programs (Convex: calendar.getCalendarRange) */}
      {weekPrograms.length > 0 && (
        <>
          <Animated.View entering={FadeInUp.duration(400).delay(240)} style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, { color: Colors.onSurface }]}>This week</Text>
            <Button label="See all" variant="textLink" onPress={() => router.push('/programs')} />
          </Animated.View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cardsRow}>
            {weekPrograms.map((program, index) => (
              <ProgramCard key={program.occurrenceKey} program={program} index={index} />
            ))}
          </ScrollView>
        </>
      )}

      {/* Section 3 — Upcoming events (Convex: events.listUpcomingEvents) */}
      {upcomingEvents && upcomingEvents.length > 0 && (
        <>
          <Animated.View entering={FadeInUp.duration(400).delay(320)} style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, { color: Colors.onSurface }]}>Upcoming events</Text>
            <Button label="See all" variant="textLink" onPress={() => router.push('/events')} />
          </Animated.View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cardsRow}>
            {upcomingEvents.map((event, index) => (
              <EventCard key={event._id} event={event} index={index} />
            ))}
          </ScrollView>
        </>
      )}

      {/* Section 4 — Featured events slider */}
      {featured && featured.length > 0 && (
        <>
          <Animated.View entering={FadeInUp.duration(400).delay(360)} style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, { color: Colors.onSurface }]}>Featured</Text>
          </Animated.View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cardsRow}>
            {featured.map((event, index) => (
              <EventCard key={event._id} event={event} index={index} size="featured" />
            ))}
          </ScrollView>
        </>
      )}

      {/* Section 5 — Announcements */}
      {announcements && announcements.length > 0 && (
        <>
          <Animated.View entering={FadeInUp.duration(400).delay(400)} style={[styles.sectionHeaderRow, { marginTop: Spacing[8] }]}>
            <Text style={[styles.sectionTitle, { color: Colors.onSurface }]}>Announcements</Text>
          </Animated.View>
          <View style={styles.section}>
            {announcements.map((item, index) => (
              <AnnouncementCard key={item._id} item={item} index={index} />
            ))}
          </View>
        </>
      )}

      <View style={{ height: Spacing[8] }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  greeting: {
    paddingTop: Spacing[5],
    paddingLeft: Spacing[8],
    paddingRight: Spacing[12],
  },
  name: { fontFamily: FontFamily.display, fontSize: 24, lineHeight: 28.8 },
  date: { fontFamily: FontFamily.body, fontSize: 12, lineHeight: 18, marginTop: Spacing[1] },
  section: { paddingHorizontal: Spacing[5], marginTop: Spacing[5] },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[5],
    marginTop: Spacing[6],
  },
  sectionTitle: { fontFamily: FontFamily.displaySemi, fontSize: 18, lineHeight: 24 },
  sectionLabel: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 11,
    lineHeight: 15.4,
    letterSpacing: 0.6,
    marginBottom: Spacing[3],
  },
  cardsRow: {
    paddingLeft: Spacing[5],
    paddingRight: Spacing[3],
    gap: Spacing[3],
    marginTop: Spacing[3],
  },
  // Theme card — heaven gradient (dawn over a worship night)
  themeCardContainer: { borderRadius: Radius.xl, overflow: 'hidden' },
  themeCardContent: { padding: Spacing[5], paddingVertical: Spacing[6] },
  themePill: {
    alignSelf: 'flex-start',
    backgroundColor: '#EDB63C',
    borderRadius: Radius.full,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  themePillText: {
    fontFamily: FontFamily.bodyExtraBold,
    fontSize: 10.5,
    lineHeight: 14,
    letterSpacing: 1.6,
    color: '#0C2154',
  },
  themeTitle: { fontFamily: FontFamily.display, fontSize: 24, lineHeight: 29, color: '#FFFFFF', marginTop: Spacing[3] },
  themeScripture: {
    fontFamily: FontFamily.italic,
    fontSize: 13.5,
    lineHeight: 22,
    color: 'rgba(255,255,255,0.9)',
    marginTop: Spacing[3],
  },
  themeScriptureRef: {
    fontFamily: FontFamily.mono,
    fontSize: 11,
    lineHeight: 15,
    letterSpacing: 1.2,
    color: '#EDB63C',
    marginTop: Spacing[2],
  },
  monthlyCard: { borderRadius: Radius.lg, padding: Spacing[4], marginTop: Spacing[3], ...ShadowE2 },
  monthlyLabel: { fontFamily: FontFamily.bodyExtraBold, fontSize: 10.5, letterSpacing: 1.6, lineHeight: 14 },
  monthlyTitle: { fontFamily: FontFamily.displaySemi, fontSize: 18, lineHeight: 24, marginTop: 6 },
  monthlyScripture: { fontFamily: FontFamily.italic, fontSize: 13, lineHeight: 21, marginTop: Spacing[2] },
  monthlyRef: { fontFamily: FontFamily.body, fontSize: 11, lineHeight: 15.4, marginTop: Spacing[1] },
  // Program cards
  programCard: { width: 200, height: 160, borderRadius: Radius.lg, overflow: 'hidden' },
  programCardImage: { flex: 1, justifyContent: 'flex-end' },
  programCardScrim: {
    backgroundColor: 'rgba(28, 28, 24, 0.7)',
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[2],
    borderBottomLeftRadius: Radius.lg,
    borderBottomRightRadius: Radius.lg,
  },
  programCardName: { fontFamily: FontFamily.bodySemiBold, fontSize: 14, lineHeight: 20, color: '#FFFFFF' },
  programCardTime: { fontFamily: FontFamily.body, fontSize: 11, lineHeight: 15.4, color: 'rgba(255,255,255,0.80)', marginTop: 2 },
  // Event cards
  eventCard: { width: 260, height: 155, borderRadius: Radius.lg, overflow: 'hidden' },
  featuredCard: { width: 300, height: 180, borderRadius: Radius.lg, overflow: 'hidden' },
  eventCardImage: { flex: 1, justifyContent: 'flex-end' },
  eventCardScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(28, 28, 24, 0.55)',
    borderRadius: Radius.lg,
    padding: Spacing[3],
    justifyContent: 'space-between',
  },
  eventDatePill: { alignSelf: 'flex-start', borderRadius: Radius.full, paddingHorizontal: Spacing[2], paddingVertical: 3 },
  eventDateText: { fontFamily: FontFamily.bodySemiBold, fontSize: 10, lineHeight: 14 },
  eventCardName: { fontFamily: FontFamily.bodySemiBold, fontSize: 15, lineHeight: 20, color: '#FFFFFF' },
  eventCardMeta: { fontFamily: FontFamily.body, fontSize: 11, lineHeight: 16, color: 'rgba(255,255,255,0.80)', marginTop: 2 },
  // Announcements
  announcementCard: { borderRadius: Radius.lg, padding: Spacing[4], marginBottom: Spacing[3] },
  announcementHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: Spacing[2] },
  announcementTitle: { fontFamily: FontFamily.bodySemiBold, fontSize: 15, lineHeight: 22, flex: 1 },
  announcementBody: { fontFamily: FontFamily.body, fontSize: 13, lineHeight: 20, marginTop: Spacing[2] },
  announcementLinks: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[2], marginTop: Spacing[3] },
  linkChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  linkChipText: { fontFamily: FontFamily.bodySemiBold, fontSize: 13, lineHeight: 18 },
  announcementDate: { fontFamily: FontFamily.body, fontSize: 11, lineHeight: 15.4, marginTop: Spacing[3] },
});
