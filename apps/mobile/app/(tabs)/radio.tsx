import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ImageBackground,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import {
  RADIO_DISPLAY_STATUS_LABELS,
  RADIO_NOTHING_ON_AIR_MESSAGE,
  formatKampalaTime,
  formatRadioCountdown,
  formatRadioDuration,
  type RadioDisplayStatus,
} from '@klt-cyber/shared';

import {
  AmbientShadow,
  FontFamily,
  GoldGlow,
  GoldGradient,
  Radius,
  Spacing,
} from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { useRadioNow, type RadioBroadcastView } from '@/hooks/use-radio-now';
import { useRadioPlayer } from '@/lib/radio-player';
import { radioArtwork } from '@/lib/radio-artwork';
import { ErrorState } from '@/components/ui/error-state';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { ScheduleList } from '@/components/radio/schedule-list';
import { RecordingsList } from '@/components/radio/recordings-list';
import { InboxSend } from '@/components/radio/inbox-send';

const SEGMENTS = ['Now', 'Schedule', 'Recordings'];

/**
 * The Radio tab (spec 0019). Real data only: the live status derived from the
 * stream probe and the phone's own clock, the broadcast on now and what is
 * next with a countdown that ticks, the in app listener figure, and the one
 * player behind the lock screen (AC-1 to AC-4, AC-7, AC-15).
 *
 * The Now, Schedule and Recordings segments sit under the player (AC-7,
 * AC-8, AC-27), so the player keeps playing whichever one is open. The Now
 * segment carries the prayer request and testimony forms (AC-28).
 */
export default function RadioScreen() {
  const Colors = useThemeColors();
  const { data, status, current, next, now } = useRadioNow(1000);
  const [segment, setSegment] = useState(0);

  if (data === null) {
    return (
      <View style={styles.centered}>
        <ErrorState />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Animated.View entering={FadeInUp.duration(400).delay(60)}>
        <PlayerHero
          loading={data === undefined}
          status={status}
          current={current}
          listeners={data?.inAppListeners ?? 0}
        />
      </Animated.View>

      <Animated.View entering={FadeInUp.duration(400).delay(120)} style={styles.section}>
        <SegmentedControl options={SEGMENTS} selectedIndex={segment} onChange={setSegment} />
      </Animated.View>

      {segment === 2 ? (
        <View style={styles.section}>
          <RecordingsList />
        </View>
      ) : segment === 1 ? (
        <View style={styles.section}>
          <ScheduleList now={now} />
        </View>
      ) : (
        <>
          <Animated.View entering={FadeInUp.duration(400).delay(160)} style={styles.section}>
            <Text style={[styles.sectionLabel, { color: Colors.outline }]}>UP NEXT</Text>
            {data === undefined ? (
              <View style={[styles.nextCard, { backgroundColor: Colors.surfaceLow }]}>
                <View style={[styles.skeletonLine, { backgroundColor: Colors.surfaceHigh, width: '60%' }]} />
                <View style={[styles.skeletonLine, { backgroundColor: Colors.surfaceHigh, width: '35%' }]} />
              </View>
            ) : next ? (
              <NextCard next={next} now={now} />
            ) : (
              <View style={[styles.nextCard, AmbientShadow, { backgroundColor: Colors.surfaceLowest }]}>
                <Ionicons name="calendar-outline" size={28} color={Colors.outline} />
                <Text style={[styles.emptyTitle, { color: Colors.onSurfaceVariant }]}>
                  Nothing scheduled yet
                </Text>
                <Text style={[styles.emptyBody, { color: Colors.outline }]}>
                  The Media team adds broadcasts here as they are planned.
                </Text>
              </View>
            )}
          </Animated.View>

          <Animated.View entering={FadeInUp.duration(400).delay(200)} style={styles.section}>
            <InboxSend status={status} />
          </Animated.View>

          <Animated.View entering={FadeInUp.duration(400).delay(240)} style={styles.section}>
            <View style={[styles.aboutCard, { backgroundColor: Colors.surfaceLow }]}>
              <Ionicons name="radio-outline" size={18} color={Colors.primary} />
              <Text style={[styles.aboutText, { color: Colors.onSurfaceVariant }]}>
                Reign Radio is Kingdom Life Tabernacle&apos;s station. It keeps playing when you
                lock your phone, and you can pause it from the lock screen.
              </Text>
            </View>
          </Animated.View>
        </>
      )}
    </ScrollView>
  );
}

const STATUS_PILL: Record<RadioDisplayStatus, { bg: string; dot: string }> = {
  live: { bg: 'rgba(171, 51, 50, 0.92)', dot: '#FFFFFF' },
  interrupted: { bg: 'rgba(196, 127, 8, 0.92)', dot: '#FFFFFF' },
  off_air: { bg: 'rgba(255, 255, 255, 0.16)', dot: 'rgba(255,255,255,0.7)' },
};

function PlayerHero({
  loading,
  status,
  current,
  listeners,
}: {
  loading: boolean;
  status: RadioDisplayStatus;
  current: RadioBroadcastView | null;
  listeners: number;
}) {
  const { state, source, play, stop } = useRadioPlayer();
  const isActive = state === 'playing' || state === 'connecting';
  // A recording playing through the one player: the hero's button stops it.
  const onRecording = source.kind === 'recording' && isActive;

  const scale = useSharedValue(1);
  const playStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  // A small pulse when audio actually arrives, so the change is felt.
  useEffect(() => {
    if (state === 'playing') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
  }, [state]);

  const onPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    scale.value = withSpring(1.12, { damping: 9, stiffness: 320 }, () => {
      scale.value = withSpring(1);
    });
    if (isActive) stop();
    else play();
  };

  const pill = STATUS_PILL[status];
  const title = current?.title ?? 'Reign Radio';
  const subtitle = current
    ? [current.host, `${formatKampalaTime(current.startsAt)} to ${formatKampalaTime(current.endsAt)}`]
        .filter(Boolean)
        .join(' · ')
    : status === 'live'
      ? 'On air now'
      : 'Kingdom Life Tabernacle';

  const accessibilityLabel = onRecording
    ? 'Stop the recording'
    : state === 'connecting'
      ? 'Connecting, tap to cancel'
      : isActive
        ? 'Pause Reign Radio'
        : 'Play Reign Radio';

  return (
    <View style={styles.heroSection}>
      <ImageBackground
        source={radioArtwork(current)}
        resizeMode="cover"
        style={styles.heroImage}
        imageStyle={{ borderRadius: Radius.xl }}
      >
        <LinearGradient
          colors={['rgba(12, 33, 84, 0.45)', 'rgba(12, 33, 84, 0.92)']}
          style={styles.heroScrim}
        >
          <View
            style={[styles.statusPill, { backgroundColor: pill.bg }]}
            accessible
            accessibilityLiveRegion="polite"
            accessibilityLabel={`Status: ${RADIO_DISPLAY_STATUS_LABELS[status]}`}
          >
            <View style={[styles.statusDot, { backgroundColor: pill.dot }]} />
            <Text style={styles.statusText}>
              {loading ? 'CHECKING' : RADIO_DISPLAY_STATUS_LABELS[status].toUpperCase()}
            </Text>
          </View>

          <View style={styles.heroContent}>
            <Text style={styles.heroTitle} numberOfLines={2} accessibilityRole="header">
              {title}
            </Text>
            <Text style={styles.heroSubtitle} numberOfLines={1}>
              {subtitle}
            </Text>
            {status === 'live' && (
              <View style={styles.listenerRow}>
                <Ionicons name="headset-outline" size={13} color="rgba(255,255,255,0.7)" />
                <Text style={styles.listenerText}>
                  <Text style={styles.listenerCount}>{listeners}</Text>{' '}
                  {listeners === 1 ? 'in app listener' : 'in app listeners'}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.controls}>
            <Animated.View style={playStyle}>
              <Pressable
                onPress={onPress}
                accessibilityRole="button"
                accessibilityLabel={accessibilityLabel}
                hitSlop={8}
              >
                <LinearGradient
                  colors={[...GoldGradient.colors]}
                  start={GoldGradient.start}
                  end={GoldGradient.end}
                  style={[styles.playButton, GoldGlow]}
                >
                  {state === 'connecting' ? (
                    <ActivityIndicator color="#3A2604" />
                  ) : (
                    <Ionicons
                      name={isActive ? 'pause' : 'play'}
                      size={30}
                      color="#3A2604"
                      style={!isActive ? { marginLeft: 3 } : undefined}
                    />
                  )}
                </LinearGradient>
              </Pressable>
            </Animated.View>
            <Text style={styles.controlHint} accessibilityLiveRegion="polite">
              {onRecording
                ? 'Playing a recording · tap to stop'
                : state === 'nothing_on_air' && source.kind === 'live'
                ? RADIO_NOTHING_ON_AIR_MESSAGE
                : state === 'connecting'
                  ? 'Connecting to the stream…'
                  : state === 'playing' && source.kind === 'live'
                    ? 'Playing live'
                    : status === 'live'
                      ? 'Tap to listen live'
                      : 'Tap to try the stream'}
            </Text>
          </View>
        </LinearGradient>
      </ImageBackground>
    </View>
  );
}

function NextCard({ next, now }: { next: RadioBroadcastView; now: number }) {
  const Colors = useThemeColors();
  const minutes = Math.round((next.endsAt - next.startsAt) / 60_000);
  const cancelled = next.status === 'cancelled';
  return (
    <View style={[styles.nextCard, styles.nextRow, AmbientShadow, { backgroundColor: Colors.surfaceLowest }]}>
      <ImageBackground
        source={radioArtwork(next)}
        resizeMode="cover"
        style={styles.nextImage}
        imageStyle={{ borderRadius: Radius.md }}
      />
      <View style={styles.nextBody}>
        <Text style={[styles.nextTitle, { color: Colors.onSurface }]} numberOfLines={1}>
          {next.title}
        </Text>
        <Text style={[styles.nextMeta, { color: Colors.onSurfaceVariant }]} numberOfLines={1}>
          {[next.host, `${formatKampalaTime(next.startsAt)} · ${formatRadioDuration(minutes)}`]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      </View>
      <View style={[styles.countdown, { backgroundColor: Colors.primaryLight }]}>
        <Text style={[styles.countdownLabel, { color: Colors.primary }]}>
          {cancelled ? 'CANCELLED' : 'STARTS IN'}
        </Text>
        {!cancelled && (
          <Text
            style={[styles.countdownValue, { color: Colors.primary }]}
            accessibilityLabel={`Starts in ${formatRadioCountdown(next.startsAt - now)}`}
          >
            {formatRadioCountdown(next.startsAt - now)}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingBottom: Spacing[6] },
  centered: { flex: 1, justifyContent: 'center', padding: Spacing[5] },
  section: { paddingHorizontal: Spacing[5], marginTop: Spacing[6] },
  sectionLabel: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 11,
    lineHeight: 15.4,
    letterSpacing: 0.6,
    marginBottom: Spacing[3],
  },
  // Hero
  heroSection: { paddingHorizontal: Spacing[5], marginTop: Spacing[5] },
  heroImage: { width: '100%', minHeight: 360 },
  heroScrim: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: Radius.xl,
    justifyContent: 'space-between',
    padding: Spacing[5],
  },
  statusPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing[3],
    paddingVertical: 4,
    gap: 6,
  },
  statusDot: { width: 7, height: 7, borderRadius: 3.5 },
  statusText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 11,
    lineHeight: 15,
    color: '#FFFFFF',
    letterSpacing: 0.8,
  },
  heroContent: { marginTop: 'auto', marginBottom: Spacing[5] },
  heroTitle: {
    fontFamily: FontFamily.display,
    fontSize: 28,
    lineHeight: 34,
    color: '#FFFFFF',
  },
  heroSubtitle: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    lineHeight: 19,
    color: 'rgba(255,255,255,0.75)',
    marginTop: Spacing[1],
  },
  listenerRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: Spacing[2] },
  listenerText: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 12,
    lineHeight: 16,
    color: 'rgba(255,255,255,0.75)',
  },
  listenerCount: { fontFamily: FontFamily.mono, color: '#FFFFFF' },
  controls: { alignItems: 'center', gap: Spacing[3] },
  playButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlHint: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 13,
    lineHeight: 18,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
  },
  // Up next
  nextCard: {
    borderRadius: Radius.lg,
    padding: Spacing[4],
    alignItems: 'center',
    gap: Spacing[2],
  },
  nextRow: { flexDirection: 'row', gap: Spacing[3], padding: Spacing[3] },
  nextImage: { width: 56, height: 56 },
  nextBody: { flex: 1, gap: 2 },
  nextTitle: { fontFamily: FontFamily.bodySemiBold, fontSize: 15, lineHeight: 21 },
  nextMeta: { fontFamily: FontFamily.body, fontSize: 12, lineHeight: 17 },
  countdown: {
    borderRadius: Radius.md,
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[2],
    alignItems: 'center',
    minWidth: 84,
  },
  countdownLabel: { fontFamily: FontFamily.bodySemiBold, fontSize: 9, letterSpacing: 0.6 },
  countdownValue: { fontFamily: FontFamily.mono, fontSize: 16, lineHeight: 22 },
  emptyTitle: { fontFamily: FontFamily.bodySemiBold, fontSize: 15, lineHeight: 21 },
  emptyBody: { fontFamily: FontFamily.body, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  skeletonLine: { height: 12, borderRadius: 6, alignSelf: 'flex-start' },
  aboutCard: {
    flexDirection: 'row',
    gap: Spacing[3],
    borderRadius: Radius.lg,
    padding: Spacing[4],
    alignItems: 'flex-start',
  },
  aboutText: { flex: 1, fontFamily: FontFamily.body, fontSize: 13, lineHeight: 20 },
});
