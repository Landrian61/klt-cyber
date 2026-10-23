import {
  View, Text, Pressable, StyleSheet, FlatList, ScrollView, ActivityIndicator, Linking,
} from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { youtubeThumbnailUrl, youtubeWatchUrl } from '@klt-cyber/shared';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import Animated, {
  FadeInUp, useSharedValue, useAnimatedStyle, withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { FontFamily, Spacing, Radius, AmbientShadow, Duration, ShadowE2 } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { Cover } from '@/components/ui/cover';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import {
  formatEventDate, formatClockTime, formatProgramSchedule,
} from '@/lib/content-format';
import { formatDateKey } from '@/lib/format-date-key';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** One row of api.upcoming.listUpcomingForMember — a church event or one of the
 * caller's group activities, already tagged, ordered and cancellation-stamped
 * by the backend (spec 0010). Derived from the query rather than hand-declared
 * so the shape cannot drift from it. */
type UpcomingItem = NonNullable<
  FunctionReturnType<typeof api.upcoming.listUpcomingForMember>
>[number];

function UpcomingRow({
  item, index, onPress,
}: { item: UpcomingItem; index: number; onPress: () => void }) {
  const Colors = useThemeColors();
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  const dateLine = `${formatEventDate(item.startDateTime)} · ${formatClockTime(item.startDateTime)}`;
  // The cancellation goes into the spoken label too, not just the crimson
  // chip: colour alone would leave a screen reader user travelling to
  // something that is not happening (AC-6).
  const spokenLabel = [
    item.title,
    item.tag,
    dateLine,
    item.cancelled ? `Cancelled${item.cancellationReason ? `. ${item.cancellationReason}` : ''}` : '',
  ].filter(Boolean).join(', ');

  return (
    // Entering animation on the wrapper; press-scale stays on the inner pressable.
    <Animated.View entering={FadeInUp.duration(300).delay(index * 60)}>
      <AnimatedPressable
        onPressIn={() => { scale.value = withTiming(0.98, { duration: Duration.fast }); }}
        onPressOut={() => { scale.value = withTiming(1, { duration: 150 }); }}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onPress();
        }}
        style={[styles.row, animatedStyle, AmbientShadow, { backgroundColor: Colors.surfaceLowest }]}
        accessibilityRole="button"
        accessibilityLabel={spokenLabel}
      >
        <Cover uri={item.coverImageUrl} index={index} imageRadius={0} style={styles.rowImage} />
        <View style={styles.rowContent}>
          <Text style={[styles.rowName, { color: Colors.onSurface }]} numberOfLines={2}>
            {item.title}
          </Text>
          <Text style={[styles.rowDate, { color: Colors.onSurfaceVariant }]} numberOfLines={1}>
            {dateLine}
          </Text>
          {item.location && (
            <View style={styles.rowLocationRow}>
              <Ionicons name="location-outline" size={13} color={Colors.outline} />
              <Text style={[styles.rowLocation, { color: Colors.outline }]} numberOfLines={1}>
                {item.location}
              </Text>
            </View>
          )}
          {/* Who it belongs to, resolved server side: `Church` for an event,
              the department's or clan's own name for an activity. */}
          <View style={styles.rowTags}>
            <Badge label={item.tag} variant="group" />
            {item.cancelled && <Badge label="Cancelled" variant="cancelled" />}
          </View>
          {item.cancelled && item.cancellationReason && (
            <Text style={[styles.rowReason, { color: Colors.secondary }]} numberOfLines={2}>
              {item.cancellationReason}
            </Text>
          )}
        </View>
        <View style={styles.rowChevron}>
          <Ionicons name="chevron-forward" size={18} color={Colors.outline} />
        </View>
      </AnimatedPressable>
    </Animated.View>
  );
}

/** How far ahead the programs strip looks, in days. Deliberately local and
 * small: this is "this week", not the 8 week horizon the list above uses. */
const PROGRAM_STRIP_DAYS = 7;

/**
 * A compact strip of the programs running in the next week (AC-8).
 *
 * A pointer rather than a second list: weekly programs keep their own screen,
 * and this screen links to it rather than absorbing it. Nothing about programs
 * is re-decided here — the data is spec 0009's `listActivePrograms`, untouched.
 */
function ThisWeekPrograms() {
  const Colors = useThemeColors();
  const router = useRouter();
  const programs = useQuery(api.weeklyPrograms.listActivePrograms);

  const horizon = Date.now() + PROGRAM_STRIP_DAYS * 24 * 60 * 60 * 1000;
  const thisWeek = (programs ?? []).filter(
    (program) => program.nextOccurrence && program.nextOccurrence.startsAt <= horizon,
  );

  if (thisWeek.length === 0) return null;

  return (
    <Animated.View entering={FadeInUp.duration(400).delay(140)} style={styles.stripSection}>
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push('/programs');
        }}
        style={styles.stripHeader}
        accessibilityRole="button"
        accessibilityLabel="See all weekly programs"
      >
        <Text style={[styles.stripTitle, { color: Colors.onSurface }]}>This week&apos;s programs</Text>
        <Ionicons name="chevron-forward" size={18} color={Colors.outline} />
      </Pressable>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.stripScroll}
      >
        {thisWeek.map((program) => {
          const occurrence = program.nextOccurrence;
          return (
            <Pressable
              key={program._id}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push(`/program-detail?id=${program._id}`);
              }}
              style={[styles.stripCard, { backgroundColor: Colors.surfaceLowest }, AmbientShadow]}
              accessibilityRole="button"
              accessibilityLabel={`${program.title}, ${formatProgramSchedule(program)}${
                occurrence?.cancelled ? ', cancelled' : ''
              }`}
            >
              <Text style={[styles.stripCardTitle, { color: Colors.onSurface }]} numberOfLines={2}>
                {program.title}
              </Text>
              <Text style={[styles.stripCardMeta, { color: Colors.onSurfaceVariant }]} numberOfLines={1}>
                {occurrence ? formatClockTime(occurrence.startsAt) : formatProgramSchedule(program)}
              </Text>
              {occurrence?.cancelled && <Badge label="Cancelled" variant="cancelled" />}
            </Pressable>
          );
        })}
      </ScrollView>
    </Animated.View>
  );
}

const PAST_EVENTS_PREVIEW = 6;

function PastEventsSection() {
  const Colors = useThemeColors();
  const pastEvents = useQuery(api.pastEvents.listPastEventsPublic, { limit: PAST_EVENTS_PREVIEW });

  if (pastEvents === undefined || pastEvents === null || pastEvents.length === 0) return null;

  return (
    <Animated.View entering={FadeInUp.duration(400).delay(200)} style={styles.pastSection}>
      <View style={styles.pastHeader}>
        <Text style={[styles.pastTitle, { color: Colors.onSurface }]}>Past events</Text>
      </View>
      <View style={styles.pastGrid}>
        {pastEvents.map((event) => {
          const videoId = event.youtubeVideoId;
          return (
            <Pressable
              key={event._id}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                if (videoId) Linking.openURL(youtubeWatchUrl(videoId));
              }}
              style={[styles.pastCard, { backgroundColor: Colors.surfaceLowest }, ShadowE2]}
              accessibilityRole="button"
              accessibilityLabel={`Watch ${event.title} on YouTube`}
            >
              {videoId ? (
                <Image
                  source={{ uri: youtubeThumbnailUrl(videoId) }}
                  style={styles.pastThumb}
                  contentFit="cover"
                />
              ) : (
                <View style={[styles.pastThumb, { backgroundColor: Colors.surfaceLow }]}>
                  <Ionicons name="play-circle-outline" size={28} color={Colors.outline} />
                </View>
              )}
              <View style={styles.pastCardContent}>
                <Text style={[styles.pastCardTitle, { color: Colors.onSurface }]} numberOfLines={2}>
                  {event.title}
                </Text>
                <Text style={[styles.pastCardDate, { color: Colors.outline }]}>
                  {formatDateKey(event.date)}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </Animated.View>
  );
}

export default function EventsScreen() {
  const Colors = useThemeColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // One merged list: church events and the caller's own group activities, in
  // date order with their tags already resolved. A visitor simply receives the
  // events, since the backend filters activities per caller (AC-3).
  const upcoming = useQuery(api.upcoming.listUpcomingForMember, {});
  const isLoading = upcoming === undefined;

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: Colors.surface }]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color={Colors.onSurface} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: Colors.onSurface }]}>Events & Programs</Text>
        <View style={styles.backButton} />
      </View>

      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={upcoming ?? []}
          keyExtractor={(item) => `${item.kind}-${item.id}`}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + Spacing[6] }]}
          showsVerticalScrollIndicator={false}
          renderItem={({ item, index }) => (
            <UpcomingRow
              item={item}
              index={index}
              // Cast for the same reason lib/notification-links.ts casts: the
              // typed-routes map is regenerated by the dev server, so a route
              // added in this change is not in it until Expo next runs.
              onPress={() => router.push(`/item-detail?kind=${item.kind}&id=${item.id}` as Href)}
            />
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="calendar-outline" size={40} color={Colors.outline} />
              {/* Wording stays away from "your groups have nothing on", which
                  would imply a visitor is missing group content they are not
                  entitled to in the first place. */}
              <Text style={[styles.emptyTitle, { color: Colors.onSurfaceVariant }]}>Nothing coming up yet</Text>
              <Text style={[styles.emptySubtitle, { color: Colors.outline }]}>Events and activities show up here as soon as they&apos;re published.</Text>
            </View>
          }
          ListFooterComponent={
            <>
              <ThisWeekPrograms />
              <PastEventsSection />
            </>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[5],
    paddingVertical: Spacing[3],
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: FontFamily.display,
    fontSize: 20,
    lineHeight: 26,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    paddingHorizontal: Spacing[5],
    gap: Spacing[3],
    flexGrow: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  rowImage: {
    width: 88,
    alignSelf: 'stretch',
    overflow: 'hidden',
  },
  rowContent: {
    flex: 1,
    paddingVertical: Spacing[3],
    paddingLeft: Spacing[3],
    gap: 2,
  },
  rowChevron: {
    paddingRight: Spacing[3],
  },
  rowName: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 15,
    lineHeight: 20,
  },
  rowDate: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 2,
  },
  rowLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  rowLocation: {
    fontFamily: FontFamily.body,
    fontSize: 11,
    lineHeight: 15.4,
  },
  rowTags: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing[2],
    marginTop: Spacing[2],
  },
  rowReason: {
    fontFamily: FontFamily.body,
    fontSize: 11,
    lineHeight: 15.4,
    marginTop: 2,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: Spacing[10],
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
    paddingHorizontal: Spacing[8],
  },
  // This week's programs strip
  stripSection: {
    marginTop: Spacing[6],
  },
  stripHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing[3],
    minHeight: 44,
  },
  stripTitle: {
    fontFamily: FontFamily.displaySemi,
    fontSize: 18,
    lineHeight: 24,
  },
  stripScroll: {
    gap: Spacing[3],
    paddingRight: Spacing[5],
  },
  stripCard: {
    width: 150,
    borderRadius: Radius.lg,
    padding: Spacing[3],
    gap: Spacing[1],
    alignItems: 'flex-start',
  },
  stripCardTitle: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 13,
    lineHeight: 18,
  },
  stripCardMeta: {
    fontFamily: FontFamily.mono,
    fontSize: 11,
    lineHeight: 15.4,
  },
  // Past events section
  pastSection: {
    marginTop: Spacing[6],
  },
  pastHeader: {
    marginBottom: Spacing[3],
  },
  pastTitle: {
    fontFamily: FontFamily.displaySemi,
    fontSize: 18,
    lineHeight: 24,
  },
  pastGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing[3],
  },
  pastCard: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '46%',
  },
  pastThumb: {
    aspectRatio: 16 / 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pastCardContent: {
    padding: Spacing[3],
    gap: 2,
  },
  pastCardTitle: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 13,
    lineHeight: 18,
  },
  pastCardDate: {
    fontFamily: FontFamily.body,
    fontSize: 11,
    lineHeight: 15.4,
  },
});
