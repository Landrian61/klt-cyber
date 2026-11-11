import { memo, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInUp } from 'react-native-reanimated';
import {
  formatKampalaDayHeading,
  formatKampalaTime,
  formatRadioDuration,
  groupBroadcastsByKampalaDay,
  resolveCurrentBroadcast,
} from '@klt-cyber/shared';

import { AmbientShadow, FontFamily, Radius, Spacing } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { ErrorState } from '@/components/ui/error-state';
import { api } from '@/lib/api';
import { FollowToggle } from './follow-toggle';

type ScheduleRow = NonNullable<FunctionReturnType<typeof api.radio.listSchedule>>[number];

/**
 * The Schedule segment (spec 0019, AC-8, AC-7): the next seven days from now,
 * grouped under Kampala day headings, each row with its start time, program,
 * length and host. A broadcast crossing midnight sits under the day it starts,
 * and one still running from yesterday is included. Which row is on now is
 * decided here from the phone's own clock, so the marker moves at the start
 * time without waiting for a server write.
 *
 * Each program row carries a follow bell, which flips this list and the
 * Followed radio programs screen together (AC-9).
 */
export function ScheduleList({ now }: { now: number }) {
  const Colors = useThemeColors();
  const rows = useQuery(api.radio.listSchedule, {});

  const { groups, currentId } = useMemo(() => {
    const live = (rows ?? []).filter((r) => r.endsAt > now);
    return {
      groups: groupBroadcastsByKampalaDay(live),
      currentId: resolveCurrentBroadcast(live, now)?._id ?? null,
    };
  }, [rows, now]);

  if (rows === null) return <ErrorState />;

  if (rows === undefined) {
    return (
      <View style={styles.wrap} accessibilityLabel="Loading the schedule">
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={[styles.row, { backgroundColor: Colors.surfaceLow }]}>
            <View style={[styles.skeleton, { backgroundColor: Colors.surfaceHigh, width: 56 }]} />
            <View style={[styles.skeleton, { backgroundColor: Colors.surfaceHigh, flex: 1 }]} />
          </View>
        ))}
      </View>
    );
  }

  if (groups.length === 0) {
    return (
      <View style={[styles.empty, AmbientShadow, { backgroundColor: Colors.surfaceLowest }]}>
        <Ionicons name="calendar-outline" size={28} color={Colors.outline} />
        <Text style={[styles.emptyTitle, { color: Colors.onSurfaceVariant }]}>
          Nothing on the schedule this week
        </Text>
        <Text style={[styles.emptyBody, { color: Colors.outline }]}>
          The Media team adds broadcasts here as they are planned.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      {groups.map((group, gi) => (
        <Animated.View
          key={group.dateKey}
          entering={FadeInUp.duration(300).delay(Math.min(gi, 4) * 50)}
          style={styles.group}
        >
          <Text
            style={[styles.dayHeading, { color: Colors.outline }]}
            accessibilityRole="header"
          >
            {formatKampalaDayHeading(group.dateKey, now).toUpperCase()}
          </Text>
          {group.items.map((row) => (
            <ScheduleItem key={row._id} row={row} onNow={row._id === currentId} />
          ))}
        </Animated.View>
      ))}
    </View>
  );
}

const ScheduleItem = memo(function ScheduleItem({
  row,
  onNow,
}: {
  row: ScheduleRow;
  onNow: boolean;
}) {
  const Colors = useThemeColors();
  const cancelled = row.status === 'cancelled';
  const time = formatKampalaTime(row.startsAt);
  const length = formatRadioDuration(row.durationMinutes);
  const label = [
    `${time}, ${row.title}`,
    length,
    row.host ? `hosted by ${row.host}` : null,
    cancelled ? 'cancelled' : onNow ? 'on now' : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <View
      style={[
        styles.row,
        AmbientShadow,
        { backgroundColor: onNow ? Colors.primaryLight : Colors.surfaceLowest },
        cancelled && styles.cancelled,
      ]}
    >
      <View style={styles.main} accessible accessibilityLabel={label}>
        <Text style={[styles.time, { color: onNow ? Colors.primary : Colors.onSurface }]}>
          {time}
        </Text>
        <View style={styles.body}>
          <Text
            style={[
              styles.title,
              { color: Colors.onSurface },
              cancelled && styles.struck,
            ]}
            numberOfLines={1}
          >
            {row.title}
          </Text>
          <Text style={[styles.meta, { color: Colors.onSurfaceVariant }]} numberOfLines={1}>
            <Text style={styles.mono}>{length}</Text>
            {row.host ? ` · ${row.host}` : ''}
          </Text>
        </View>
      </View>
      {cancelled ? (
        <View style={[styles.tag, { backgroundColor: Colors.errorLight }]}>
          <Text style={[styles.tagText, { color: Colors.error }]}>CANCELLED</Text>
        </View>
      ) : onNow ? (
        <View style={[styles.tag, { backgroundColor: Colors.secondary }]}>
          <Text style={[styles.tagText, { color: Colors.onSecondary }]}>ON NOW</Text>
        </View>
      ) : null}
      {row.programId && row.isFollowed !== null && (
        <FollowToggle
          programId={row.programId}
          following={row.isFollowed}
          programName={row.title}
        />
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: Spacing[5] },
  group: { gap: Spacing[2] },
  dayHeading: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 11,
    lineHeight: 15.4,
    letterSpacing: 0.6,
    marginBottom: Spacing[1],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[3],
    minHeight: 56,
  },
  cancelled: { opacity: 0.65 },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing[3] },
  time: { fontFamily: FontFamily.mono, fontSize: 13, lineHeight: 18, width: 68 },
  body: { flex: 1, gap: 2 },
  title: { fontFamily: FontFamily.bodySemiBold, fontSize: 15, lineHeight: 21 },
  struck: { textDecorationLine: 'line-through' },
  meta: { fontFamily: FontFamily.body, fontSize: 12, lineHeight: 17 },
  mono: { fontFamily: FontFamily.mono },
  tag: { borderRadius: Radius.full, paddingHorizontal: Spacing[2], paddingVertical: 3 },
  tagText: { fontFamily: FontFamily.bodySemiBold, fontSize: 9, letterSpacing: 0.6 },
  skeleton: { height: 12, borderRadius: 6 },
  empty: {
    borderRadius: Radius.lg,
    padding: Spacing[4],
    alignItems: 'center',
    gap: Spacing[2],
  },
  emptyTitle: { fontFamily: FontFamily.bodySemiBold, fontSize: 15, lineHeight: 21 },
  emptyBody: { fontFamily: FontFamily.body, fontSize: 13, lineHeight: 19, textAlign: 'center' },
});
