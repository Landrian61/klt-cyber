import {
  View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator, Linking,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQuery } from 'convex/react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInUp } from 'react-native-reanimated';

import { FontFamily, Spacing, Radius } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { Button } from '@/components/ui/button';
import { Cover } from '@/components/ui/cover';
import { Badge } from '@/components/ui/badge';
import { api, type Id } from '@/lib/api';
import { formatFullDate, formatClockTime } from '@/lib/content-format';
import { useAddToCalendar, type CalendarItem } from '@/lib/add-to-calendar';

// One detail screen for a church event AND a group activity (spec 0010, AC-7).
//
// Takes both `kind` and `id` because the two ids come from different tables, so
// the screen has to know which query to call. The previous `/event-detail?id=`
// route is kept as a redirect into here, so older notifications already sitting
// in people's trays still land correctly.

export default function ItemDetailScreen() {
  const Colors = useThemeColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { kind, id } = useLocalSearchParams<{ kind?: string; id?: string }>();
  const isActivity = kind === 'activity';

  // Only one of the two ever runs: "skip" keeps the other from subscribing at
  // all. Both return null for an id that no longer resolves or that this
  // account may not read, rather than throwing — a deep link gets forwarded,
  // and an error naming the item would leak it to someone outside the group.
  const event = useQuery(
    api.events.getEvent,
    !isActivity && id ? { eventId: id as Id<'events'> } : 'skip',
  );
  const activity = useQuery(
    api.groups.getActivity,
    isActivity && id ? { activityId: id as Id<'groupActivities'> } : 'skip',
  );

  const item = isActivity ? activity : event;
  // Without the `id` check this spins forever: both queries are skipped, so
  // neither ever resolves and `item` stays undefined. A truncated deep link or
  // a push carrying an empty id reaches exactly that state, and the member had
  // no way out but the back gesture. Treat a missing id as "not available".
  const isLoading = Boolean(id) && item === undefined;

  const calendarItem: CalendarItem | null = item
    ? {
        kind: isActivity ? 'activity' : 'event',
        id: item._id,
        title: item.title,
        startDateTime: item.startDateTime,
        endDateTime: item.endDateTime,
        location: item.location,
        description: item.description,
      }
    : null;
  const calendar = useAddToCalendar(calendarItem);

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: Colors.surface, paddingTop: insets.top }]}>
        <View style={styles.fallback}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      </View>
    );
  }

  // Gone, archived, or addressed to a group this account is not in. All three
  // read the same way on purpose: naming the difference would tell the reader
  // something about content they are not entitled to.
  if (!item) {
    return (
      <View style={[styles.container, { backgroundColor: Colors.surface, paddingTop: insets.top }]}>
        <View style={styles.fallback}>
          <Ionicons name="calendar-clear-outline" size={40} color={Colors.outline} />
          <Text style={[styles.fallbackText, { color: Colors.onSurfaceVariant }]}>
            This is no longer available
          </Text>
          <Button label="Go back" variant="ghost" onPress={() => router.back()} />
        </View>
      </View>
    );
  }

  const timeRange = `${formatClockTime(item.startDateTime)} – ${formatClockTime(item.endDateTime)}`;

  const calendarLabel = {
    checking: 'Add to calendar',
    idle: 'Add to calendar',
    working: 'Adding…',
    added: 'Added to your calendar',
    denied: 'Add to calendar',
    failed: 'Try adding again',
  }[calendar.state];

  return (
    <View style={[styles.container, { backgroundColor: Colors.surface }]}>
      <StatusBar style="light" />
      <Cover uri={item.coverImageUrl} index={0} imageRadius={0} style={styles.hero}>
        <View style={styles.heroScrim}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            style={[styles.backButton, { top: insets.top + Spacing[2] }]}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <View style={styles.backCircle}>
              <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
            </View>
          </Pressable>

          <View style={styles.heroContent}>
            <Text style={styles.heroName}>{item.title}</Text>
          </View>
        </View>
      </Cover>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing[6] }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Who it belongs to, and whether it is still on. The cancelled chip
            carries its own words, so the crimson is reinforcement rather than
            the only signal (AC-6). */}
        <Animated.View entering={FadeInUp.duration(300).delay(60)} style={styles.tagRow}>
          <Badge label={item.tag} variant="group" />
          {item.cancelled && <Badge label="Cancelled" variant="cancelled" />}
        </Animated.View>

        {item.cancelled && (
          <Animated.View
            entering={FadeInUp.duration(300).delay(90)}
            style={[styles.cancelledNotice, { backgroundColor: Colors.redTint }]}
            accessibilityRole="alert"
          >
            <Text style={[styles.cancelledTitle, { color: Colors.secondaryDark }]}>
              This has been cancelled
            </Text>
            {item.cancellationReason && (
              <Text style={[styles.cancelledReason, { color: Colors.onSurfaceVariant }]}>
                {item.cancellationReason}
              </Text>
            )}
          </Animated.View>
        )}

        <Animated.View entering={FadeInUp.duration(300).delay(100)} style={styles.detailRow}>
          <Ionicons name="calendar-outline" size={20} color={Colors.primary} />
          <Text style={[styles.detailText, { color: Colors.onSurface }]}>
            {formatFullDate(item.startDateTime)}
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInUp.duration(300).delay(160)} style={styles.detailRow}>
          <Ionicons name="time-outline" size={20} color={Colors.primary} />
          <Text style={[styles.detailText, { color: Colors.onSurface }]}>{timeRange}</Text>
        </Animated.View>

        {item.location && (
          <Animated.View entering={FadeInUp.duration(300).delay(220)} style={styles.detailRow}>
            <Ionicons name="location-outline" size={20} color={Colors.primary} />
            <Text style={[styles.detailText, { color: Colors.onSurface }]}>{item.location}</Text>
          </Animated.View>
        )}

        {/* Add to calendar (AC-9). Still offered on a cancelled item: the
            member may want it in their calendar precisely because they were
            planning around it, and the chip above says it is off. */}
        <Animated.View entering={FadeInUp.duration(300).delay(260)} style={styles.calendarSection}>
          <Button
            label={calendarLabel}
            variant={calendar.state === 'added' ? 'ghost' : 'primary'}
            onPress={calendar.add}
            disabled={calendar.state === 'added' || calendar.state === 'working'}
          />
          {calendar.state === 'denied' && (
            <View style={styles.calendarHint}>
              <Text style={[styles.calendarHintText, { color: Colors.onSurfaceVariant }]}>
                Your phone has not given KLT Cyber permission to use your calendar, so nothing was
                added. You can turn it on in Settings and tap again.
              </Text>
              <Pressable
                onPress={() => Linking.openSettings()}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Open the app settings on this phone"
              >
                <Text style={[styles.calendarHintLink, { color: Colors.primaryDeep }]}>
                  Open settings
                </Text>
              </Pressable>
            </View>
          )}
          {calendar.state === 'failed' && (
            <View style={styles.calendarHint}>
              <Text style={[styles.calendarHintText, { color: Colors.onSurfaceVariant }]}>
                That did not go through. Nothing was added to your calendar, so you can try again.
              </Text>
            </View>
          )}
        </Animated.View>

        {item.description && (
          <Animated.View entering={FadeInUp.duration(300).delay(320)} style={styles.descriptionSection}>
            <Text style={[styles.descriptionLabel, { color: Colors.outline }]}>ABOUT</Text>
            <Text style={[styles.descriptionText, { color: Colors.onSurface }]}>
              {item.description}
            </Text>
          </Animated.View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  fallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[4],
    paddingHorizontal: Spacing[8],
  },
  fallbackText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
  },
  hero: {
    width: '100%',
    height: 260,
  },
  heroScrim: {
    flex: 1,
    backgroundColor: 'rgba(28, 28, 24, 0.45)',
    justifyContent: 'flex-end',
  },
  backButton: {
    position: 'absolute',
    left: Spacing[5],
    zIndex: 10,
  },
  backCircle: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(28, 28, 24, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroContent: {
    paddingHorizontal: Spacing[5],
    paddingBottom: Spacing[5],
  },
  heroName: {
    fontFamily: FontFamily.display,
    fontSize: 26,
    lineHeight: 32,
    color: '#FFFFFF',
  },
  content: {
    paddingHorizontal: Spacing[5],
    paddingTop: Spacing[5],
    gap: Spacing[4],
  },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing[2],
  },
  // Tonal wash, no border: the crimson tint IS the structure here.
  cancelledNotice: {
    borderRadius: Radius.lg,
    padding: Spacing[4],
    gap: Spacing[1],
  },
  cancelledTitle: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 14,
    lineHeight: 22.4,
  },
  cancelledReason: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    lineHeight: 20,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
  },
  detailText: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 15,
    lineHeight: 22,
    flex: 1,
  },
  calendarSection: {
    gap: Spacing[2],
    marginTop: Spacing[1],
  },
  calendarHint: {
    gap: Spacing[1],
  },
  calendarHintText: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    lineHeight: 18,
  },
  calendarHintLink: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 12,
    lineHeight: 18,
  },
  descriptionSection: {
    marginTop: Spacing[2],
  },
  descriptionLabel: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 11,
    lineHeight: 15.4,
    letterSpacing: 0.6,
    marginBottom: Spacing[2],
  },
  descriptionText: {
    fontFamily: FontFamily.body,
    fontSize: 15,
    lineHeight: 24,
  },
});
