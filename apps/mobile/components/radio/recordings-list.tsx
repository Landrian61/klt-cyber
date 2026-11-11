import { memo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useConvex, usePaginatedQuery, useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInUp } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import {
  RADIO_RECORDINGS_PAGE_SIZE,
  formatKampalaDayHeading,
  kampalaDateKeyAt,
} from '@klt-cyber/shared';

import { AmbientShadow, FontFamily, Radius, Spacing } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { api, type Id } from '@/lib/api';
import { useRadioPlayer } from '@/lib/radio-player';

type RecordingRow = FunctionReturnType<typeof api.radio.listRecordings>['page'][number];

function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

function formatLength(seconds: number | null): string | null {
  if (!seconds) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m} min`;
}

/**
 * The Recordings segment (spec 0019, AC-27): every uploaded recording, newest
 * upload first, twenty at a time, filterable by program. Each row shows the
 * program, the broadcast's date and the length read at upload time. Tapping
 * one plays it through the same player as the live stream, so the lock screen
 * controls carry over.
 */
export function RecordingsList() {
  const Colors = useThemeColors();
  const programs = useQuery(api.radioFollows.listMine, {});
  const [programId, setProgramId] = useState<Id<'radioPrograms'> | null>(null);
  const { results, status, loadMore } = usePaginatedQuery(
    api.radio.listRecordings,
    programId ? { programId } : {},
    { initialNumItems: RADIO_RECORDINGS_PAGE_SIZE },
  );

  const choose = (id: Id<'radioPrograms'> | null) => {
    Haptics.selectionAsync().catch(() => {});
    setProgramId(id);
  };

  return (
    <View style={styles.wrap}>
      {programs && programs.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
          accessibilityRole="tablist"
        >
          <Chip label="All programs" selected={programId === null} onPress={() => choose(null)} />
          {programs.map((p) => (
            <Chip
              key={p._id}
              label={p.name}
              selected={programId === p._id}
              onPress={() => choose(p._id)}
            />
          ))}
        </ScrollView>
      )}

      {status === 'LoadingFirstPage' ? (
        <View accessibilityLabel="Loading recordings" style={styles.list}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={[styles.row, { backgroundColor: Colors.surfaceLow }]}>
              <View style={[styles.skeleton, { backgroundColor: Colors.surfaceHigh, width: 44, height: 44 }]} />
              <View style={[styles.skeleton, { backgroundColor: Colors.surfaceHigh, flex: 1 }]} />
            </View>
          ))}
        </View>
      ) : results.length === 0 ? (
        <View style={[styles.empty, AmbientShadow, { backgroundColor: Colors.surfaceLowest }]}>
          <Ionicons name="disc-outline" size={28} color={Colors.outline} />
          <Text style={[styles.emptyTitle, { color: Colors.onSurfaceVariant }]}>
            No recordings yet
          </Text>
          <Text style={[styles.emptyBody, { color: Colors.outline }]}>
            {programId
              ? 'This program has no recordings yet. Try all programs.'
              : 'The Media team uploads recordings here after a broadcast ends.'}
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {results.map((row, i) => (
            <Animated.View key={row._id} entering={FadeInUp.duration(300).delay(Math.min(i, 5) * 40)}>
              <RecordingItem row={row} />
            </Animated.View>
          ))}
          {status === 'CanLoadMore' && (
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                loadMore(RADIO_RECORDINGS_PAGE_SIZE);
              }}
              accessibilityRole="button"
              style={[styles.more, { backgroundColor: Colors.primaryLight }]}
            >
              <Text style={[styles.moreText, { color: Colors.primary }]}>Show more</Text>
            </Pressable>
          )}
          {status === 'LoadingMore' && <ActivityIndicator color={Colors.primary} />}
        </View>
      )}
    </View>
  );
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const Colors = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      style={[
        styles.chip,
        { backgroundColor: selected ? Colors.primary : Colors.surfaceLow },
      ]}
    >
      <Text
        style={[styles.chipText, { color: selected ? Colors.onPrimary : Colors.onSurfaceVariant }]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const RecordingItem = memo(function RecordingItem({ row }: { row: RecordingRow }) {
  const Colors = useThemeColors();
  const convex = useConvex();
  const { state, source, position, duration, playRecording, pause, resume } = useRadioPlayer();
  const [fetching, setFetching] = useState(false);
  const [linkFailed, setLinkFailed] = useState(false);
  const isThis = source.kind === 'recording' && source.broadcastId === row._id;
  const active = isThis && (state === 'playing' || state === 'connecting');
  const held = isThis && state === 'paused';
  const failed = linkFailed || (isThis && state === 'unavailable');

  const date = formatKampalaDayHeading(kampalaDateKeyAt(row.startsAt));
  const length = formatLength(row.durationSeconds);

  const onPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    // Pause and resume in place, as a music app does (spec 0020, AC-6).
    if (active) {
      pause();
      return;
    }
    if (held) {
      resume();
      return;
    }
    // A fresh link, signed now, so a screen left open for hours still plays.
    if (fetching) return;
    setFetching(true);
    setLinkFailed(false);
    convex
      .query(api.radio.getRecordingUrl, { broadcastId: row._id })
      .then((url) => {
        if (!url) {
          setLinkFailed(true);
          return;
        }
        playRecording({
          broadcastId: row._id,
          title: row.title,
          subtitle: [row.host, date].filter(Boolean).join(' · ') || null,
          url,
          imageUrl: row.imageUrl,
          seedKey: row.seedKey,
        });
      })
      .catch(() => setLinkFailed(true))
      .finally(() => setFetching(false));
  };

  const meta =
    (active && state === 'playing') || held
      ? `${held ? 'Paused · ' : ''}${formatClock(position)} of ${formatClock(duration || row.durationSeconds || 0)}`
      : [date, length].filter(Boolean).join(' · ');

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${active ? 'Pause' : held ? 'Resume' : 'Play'} the recording of ${row.title}, ${date}`}
      style={[
        styles.row,
        AmbientShadow,
        { backgroundColor: isThis ? Colors.primaryLight : Colors.surfaceLowest },
      ]}
    >
      <View style={[styles.playDot, { backgroundColor: active ? Colors.primary : Colors.surfaceLow }]}>
        {fetching || (isThis && state === 'connecting') ? (
          <ActivityIndicator size="small" color={Colors.onPrimary} />
        ) : (
          <Ionicons
            name={active ? 'pause' : 'play'}
            size={18}
            color={active ? Colors.onPrimary : Colors.primary}
            style={!active ? { marginLeft: 2 } : undefined}
          />
        )}
      </View>
      <View style={styles.body}>
        <Text style={[styles.title, { color: Colors.onSurface }]} numberOfLines={1}>
          {row.title}
        </Text>
        <Text
          style={[styles.meta, { color: failed ? Colors.error : Colors.onSurfaceVariant }]}
          numberOfLines={1}
        >
          {failed ? 'This recording would not load. Tap to try again.' : meta}
        </Text>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: Spacing[4] },
  chips: { gap: Spacing[2], paddingRight: Spacing[5] },
  chip: {
    borderRadius: Radius.full,
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[2],
    maxWidth: 220,
  },
  chipText: { fontFamily: FontFamily.bodySemiBold, fontSize: 13, lineHeight: 18 },
  list: { gap: Spacing[2] },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    borderRadius: Radius.lg,
    padding: Spacing[3],
    minHeight: 64,
  },
  playDot: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: 2 },
  title: { fontFamily: FontFamily.bodySemiBold, fontSize: 15, lineHeight: 21 },
  meta: { fontFamily: FontFamily.body, fontSize: 12, lineHeight: 17 },
  skeleton: { height: 12, borderRadius: 6 },
  more: {
    borderRadius: Radius.full,
    paddingVertical: Spacing[3],
    alignItems: 'center',
    marginTop: Spacing[2],
  },
  moreText: { fontFamily: FontFamily.bodySemiBold, fontSize: 14, lineHeight: 20 },
  empty: {
    borderRadius: Radius.lg,
    padding: Spacing[4],
    alignItems: 'center',
    gap: Spacing[2],
  },
  emptyTitle: { fontFamily: FontFamily.bodySemiBold, fontSize: 15, lineHeight: 21 },
  emptyBody: { fontFamily: FontFamily.body, fontSize: 13, lineHeight: 19, textAlign: 'center' },
});
