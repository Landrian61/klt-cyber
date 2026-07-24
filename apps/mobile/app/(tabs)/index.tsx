import {
  ScrollView, View, Text, Pressable, ImageBackground, StyleSheet, Linking, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery } from 'convex/react';
import Animated, { FadeInUp, useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { FontFamily, Spacing, Radius, Duration, HeavenGradient, ShadowE2 } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { Badge } from '@/components/ui/badge';
import { ProfileCompletionBanner } from '@/components/profile-completion-banner';
import { useMyAccount } from '@/hooks/use-my-account';
import { getGreetingName } from '@/lib/user-display';
import { api, type Doc } from '@/lib/api';
import {
  dayName, formatTime, formatEventDate, formatClockTime, formatFullDate,
} from '@/lib/content-format';

// Warm gold/crimson/blue gradients — the tonal fallback behind any content
// card that has no cover image (keeps the parchment page from showing a bare
// dark scrim). Picked deterministically per card index so a list reads varied.
const COVER_GRADIENTS: [string, string][] = [
  ['#785600', '#B8860B'],
  ['#AB3332', '#785600'],
  ['#145DA3', '#2E7EC7'],
  ['#785600', '#145DA3'],
  ['#AB3332', '#D4605F'],
];

function gradientFor(index: number): [string, string] {
  return COVER_GRADIENTS[index % COVER_GRADIENTS.length];
}

function getFormattedDate(): string {
  return new Date().toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** A cover surface: the remote image when present, else a tonal gradient. */
function Cover({
  uri, index, style, imageRadius, children,
}: {
  uri?: string;
  index: number;
  style: object;
  imageRadius: number;
  children: React.ReactNode;
}) {
  if (uri) {
    return (
      <ImageBackground
        source={{ uri }}
        resizeMode="cover"
        style={style}
        imageStyle={{ borderRadius: imageRadius, backgroundColor: '#2B2A25' }}
      >
        {children}
      </ImageBackground>
    );
  }
  const [from, to] = gradientFor(index);
  return (
    <LinearGradient colors={[from, to]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[style, { borderRadius: imageRadius }]}>
      {children}
    </LinearGradient>
  );
}

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
          <LinearGradient
            colors={[...HeavenGradient.colors]}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.9, y: 1.3 }}
            style={styles.themeCardGradient}
          >
            {/* Dawn gold-glow rising from the corner */}
            <LinearGradient
              colors={['transparent', 'rgba(247,198,75,0.4)']}
              start={{ x: 0.35, y: 0.4 }}
              end={{ x: 1.1, y: 1.15 }}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
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
          </LinearGradient>
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

// ── Section 2: Weekly programs ────────────────────────────────────────────────

function ProgramCard({ program, index }: { program: Doc<'weeklyPrograms'>; index: number }) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View entering={FadeInUp.duration(300).delay(200 + index * 60)}>
      <AnimatedPressable
        onPressIn={() => { scale.value = withTiming(0.97, { duration: Duration.fast }); }}
        onPressOut={() => { scale.value = withTiming(1, { duration: 150 }); }}
        style={[styles.programCard, animatedStyle]}
        accessibilityRole="text"
        accessibilityLabel={`${program.title}, ${dayName(program.dayOfWeek)} ${formatTime(program.time)}`}
      >
        <Cover uri={program.coverImageUrl} index={index} imageRadius={Radius.lg} style={styles.programCardImage}>
          <View style={styles.programCardScrim}>
            <Text style={styles.programCardName} numberOfLines={1}>{program.title}</Text>
            <Text style={styles.programCardTime} numberOfLines={1}>
              {dayName(program.dayOfWeek)}, {formatTime(program.time)}
            </Text>
          </View>
        </Cover>
      </AnimatedPressable>
    </Animated.View>
  );
}

// ── Section 3 & 4: Events ─────────────────────────────────────────────────────

function EventCard({ event, index, featured }: { event: Doc<'events'>; index: number; featured?: boolean }) {
  const Colors = useThemeColors();
  return (
    <Animated.View
      entering={FadeInUp.duration(300).delay(200 + index * 60)}
      style={featured ? styles.featuredCard : styles.eventCard}
      accessibilityRole="text"
      accessibilityLabel={`${event.title}, ${formatEventDate(event.startDateTime)}`}
    >
      <Cover uri={event.coverImageUrl} index={index + 1} imageRadius={Radius.lg} style={styles.eventCardImage}>
        <View style={styles.eventCardScrim}>
          <View style={[styles.eventDatePill, { backgroundColor: Colors.primaryLight }]}>
            <Text style={[styles.eventDateText, { color: Colors.primary }]}>
              {formatEventDate(event.startDateTime)}
            </Text>
          </View>
          <View>
            <Text style={styles.eventCardName} numberOfLines={2}>{event.title}</Text>
            {event.location ? (
              <Text style={styles.eventCardMeta} numberOfLines={1}>
                {formatClockTime(event.startDateTime)} · {event.location}
              </Text>
            ) : (
              <Text style={styles.eventCardMeta} numberOfLines={1}>{formatClockTime(event.startDateTime)}</Text>
            )}
          </View>
        </View>
      </Cover>
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
  const { user } = useMyAccount();
  const greetingName = getGreetingName(user);

  // Each section subscribes to Convex directly — no mocked data.
  const themes = useQuery(api.themes.getCurrentThemes);
  const programs = useQuery(api.weeklyPrograms.listActivePrograms);
  const upcoming = useQuery(api.events.listUpcomingEvents, { limit: 6 });
  const featured = useQuery(api.events.listFeaturedEvents);
  const announcements = useQuery(api.announcements.listActiveAnnouncements);

  const contentLoading =
    themes === undefined &&
    programs === undefined &&
    upcoming === undefined &&
    announcements === undefined;

  return (
    <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
      {/* Greeting */}
      <Animated.View entering={FadeInUp.duration(400).delay(80)} style={styles.greeting}>
        <Text style={[styles.name, { color: Colors.onSurface }]}>
          {greetingName ? `Shalom ${greetingName}` : 'Shalom'}
        </Text>
        <Text style={[styles.date, { color: Colors.outline }]}>{getFormattedDate()}</Text>
      </Animated.View>

      {contentLoading && (
        <View style={styles.loading}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      )}

      {/* Section 1 — Theme banner (annual + monthly, scripture, cover) */}
      {themes && <ThemeBanner themes={themes} />}

      {/* Join-the-family invitation — sits just below the monthly theme. Shown
          to visitors (and a review-status card to pending users); renders
          nothing once verified. */}
      <ProfileCompletionBanner />

      {/* Section 2 — Weekly programs */}
      {programs && programs.length > 0 && (
        <>
          <Animated.View entering={FadeInUp.duration(400).delay(240)} style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, { color: Colors.onSurface }]}>This week</Text>
          </Animated.View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cardsRow}>
            {programs.map((program, index) => (
              <ProgramCard key={program._id} program={program} index={index} />
            ))}
          </ScrollView>
        </>
      )}

      {/* Section 3 — Upcoming events */}
      {upcoming && upcoming.length > 0 && (
        <>
          <Animated.View entering={FadeInUp.duration(400).delay(320)} style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, { color: Colors.onSurface }]}>Upcoming events</Text>
          </Animated.View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cardsRow}>
            {upcoming.map((event, index) => (
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
              <EventCard key={event._id} event={event} index={index} featured />
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
  loading: { paddingVertical: Spacing[12], alignItems: 'center' },
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
  themeCardGradient: { width: '100%', padding: Spacing[5], paddingVertical: Spacing[6] },
  themePill: {
    alignSelf: 'flex-start',
    backgroundColor: '#F7C64B',
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
    color: '#F7C64B',
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
  // Ministry
});
