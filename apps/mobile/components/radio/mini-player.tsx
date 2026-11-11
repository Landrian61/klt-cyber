import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  FadeOutDown,
  SlideInDown,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { AmbientShadow, FontFamily, GoldGlow, GoldGradient, Radius, Spacing } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { useRadioNow } from '@/hooks/use-radio-now';
import { isRadioPlayerActive, useRadioPlayer } from '@/lib/radio-player';
import { radioArtwork } from '@/lib/radio-artwork';

/** The bar's height, so a screen can leave room for it. */
export const MINI_PLAYER_HEIGHT = 64;

function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/** True while the mini player has something to show (spec 0020, AC-5). */
export function useMiniPlayerVisible(): boolean {
  const { state } = useRadioPlayer();
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardOpen(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardOpen(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return isRadioPlayerActive(state) && !keyboardOpen;
}

/**
 * The minimal player that stays with the member on every screen while
 * something plays (spec 0020, AC-5, AC-6): what is playing, a live marker or
 * the recording's position, play and pause, and a close that stops it.
 * Tapping the bar opens the Radio tab, where the full player lives.
 *
 * Placement is the caller's: the tabs layout sets it just above the bottom
 * navigation, the root layout floats it at the bottom of other screens. It
 * renders nothing when there is nothing to show.
 */
export function MiniPlayer({ bottom }: { bottom: number }) {
  const Colors = useThemeColors();
  const router = useRouter();
  const visible = useMiniPlayerVisible();
  const { state, source, position, duration, pause, resume, stop } = useRadioPlayer();
  const { current } = useRadioNow(15_000);
  const reduceMotion = useReducedMotion();

  const isLive = source.kind === 'live';
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (!visible || !isLive || state !== 'playing' || reduceMotion) return;
    pulse.value = withRepeat(withTiming(0.3, { duration: 900 }), -1, true);
    return () => {
      cancelAnimation(pulse);
      pulse.value = 1;
    };
  }, [visible, isLive, state, reduceMotion, pulse]);
  const dotStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  if (!visible) return null;

  const title = isLive ? (current?.title ?? 'Reign Radio') : source.title;
  const artwork = isLive ? radioArtwork(current) : radioArtwork(source);
  const total = duration || 0;
  const progress = !isLive && total > 0 ? Math.min(1, position / total) : 0;
  const playing = state === 'playing';
  const connecting = state === 'connecting';

  const subtitle = isLive
    ? current?.host ?? 'Reign Radio'
    : state === 'paused'
      ? `Paused · ${formatClock(position)}${total ? ` of ${formatClock(total)}` : ''}`
      : `${formatClock(position)}${total ? ` of ${formatClock(total)}` : ''}`;

  const openRadio = () => {
    Haptics.selectionAsync().catch(() => {});
    router.navigate('/(tabs)/radio');
  };

  const toggle = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    if (state === 'paused') resume();
    else pause();
  };

  const close = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    stop();
  };

  const toggleLabel =
    state === 'paused' ? `Resume ${title}` : isLive ? 'Stop Reign Radio' : `Pause ${title}`;

  return (
    <Animated.View
      entering={SlideInDown.springify().damping(18).stiffness(180)}
      exiting={FadeOutDown.duration(180)}
      style={[styles.wrap, { bottom }]}
      pointerEvents="box-none"
    >
      <View style={[styles.card, AmbientShadow, { backgroundColor: Colors.surfaceLowest }]}>
        <Pressable
          onPress={openRadio}
          style={styles.main}
          accessibilityRole="button"
          accessibilityLabel={`Now playing: ${title}. Open Radio`}
        >
          <Image source={artwork} style={styles.art} />
          <View style={styles.body}>
            <Text style={[styles.title, { color: Colors.onSurface }]} numberOfLines={1}>
              {title}
            </Text>
            <View style={styles.subRow}>
              {isLive && (
                <View style={[styles.livePill, { backgroundColor: Colors.secondary }]}>
                  <Animated.View style={[styles.liveDot, { backgroundColor: Colors.onSecondary }, dotStyle]} />
                  <Text style={[styles.liveText, { color: Colors.onSecondary }]}>LIVE</Text>
                </View>
              )}
              <Text
                style={[
                  styles.subtitle,
                  { color: Colors.onSurfaceVariant },
                  !isLive && styles.mono,
                ]}
                numberOfLines={1}
              >
                {subtitle}
              </Text>
            </View>
          </View>
        </Pressable>

        <Pressable
          onPress={toggle}
          disabled={connecting}
          accessibilityRole="button"
          accessibilityLabel={toggleLabel}
          hitSlop={6}
        >
          <LinearGradient
            colors={[...GoldGradient.colors]}
            start={GoldGradient.start}
            end={GoldGradient.end}
            style={[styles.toggle, GoldGlow]}
          >
            {connecting ? (
              <ActivityIndicator size="small" color={Colors.onPrimary} />
            ) : (
              <Ionicons
                name={playing ? 'pause' : 'play'}
                size={20}
                color={Colors.onPrimary}
                style={!playing ? { marginLeft: 2 } : undefined}
              />
            )}
          </LinearGradient>
        </Pressable>

        <Pressable
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel="Close the player"
          hitSlop={8}
          style={styles.close}
        >
          <Ionicons name="close" size={20} color={Colors.outline} />
        </Pressable>

        {!isLive && (
          <View style={[styles.track, { backgroundColor: Colors.surfaceHigh }]}>
            <View
              style={[styles.fill, { backgroundColor: Colors.primary, width: `${progress * 100}%` }]}
            />
          </View>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: Spacing[3], right: Spacing[3], zIndex: 20 },
  card: {
    height: MINI_PLAYER_HEIGHT,
    borderRadius: Radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: Spacing[2],
    paddingRight: Spacing[2],
    gap: Spacing[2],
    overflow: 'hidden',
  },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing[3] },
  art: { width: 48, height: 48, borderRadius: Radius.md },
  body: { flex: 1, gap: 3 },
  title: { fontFamily: FontFamily.bodySemiBold, fontSize: 14, lineHeight: 19 },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  subtitle: { flexShrink: 1, fontFamily: FontFamily.body, fontSize: 12, lineHeight: 16 },
  mono: { fontFamily: FontFamily.mono },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: Radius.full,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  liveDot: { width: 5, height: 5, borderRadius: 2.5 },
  liveText: { fontFamily: FontFamily.bodySemiBold, fontSize: 9, letterSpacing: 0.6 },
  toggle: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  close: { width: 32, height: 40, alignItems: 'center', justifyContent: 'center' },
  track: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 3 },
  fill: { height: 3 },
});
