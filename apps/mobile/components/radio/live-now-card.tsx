import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  FadeInUp,
  FadeOut,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { FontFamily, Radius, Spacing, ShadowE2 } from '@/constants/theme';
import { useRadioNow } from '@/hooks/use-radio-now';
import { useThemeColors } from '@/hooks/use-theme-colors';

/**
 * Home's Live now card (spec 0019, AC-35). Shown only while the status the
 * phone derives is Live; Off air and Stream interrupted both hide it, and so
 * does a signed out or failed read, so it never renders a blank or an error.
 * Tapping it opens the Radio tab, where the one player lives.
 */
export function LiveNowCard() {
  const router = useRouter();
  const Colors = useThemeColors();
  const { status, current, data } = useRadioNow(15_000);
  const reduceMotion = useReducedMotion();

  const pulse = useSharedValue(1);
  useEffect(() => {
    if (status !== 'live' || reduceMotion) return;
    pulse.value = withRepeat(withTiming(0.35, { duration: 900 }), -1, true);
    return () => cancelAnimation(pulse);
  }, [status, reduceMotion, pulse]);
  const dotStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  if (!data || status !== 'live') return null;

  const title = current?.title ?? 'Reign Radio';
  const host = current?.host;

  return (
    <Animated.View entering={FadeInUp.duration(400).delay(120)} exiting={FadeOut.duration(200)} style={styles.wrap}>
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          router.navigate('/(tabs)/radio');
        }}
        accessibilityRole="button"
        accessibilityLabel={`Live now: ${title}${host ? ` with ${host}` : ''}. Open Radio`}
      >
        <LinearGradient
          colors={[Colors.secondary, Colors.secondaryDark]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.card, ShadowE2]}
        >
          <View style={styles.pill}>
            <Animated.View style={[styles.dot, { backgroundColor: Colors.onSecondary }, dotStyle]} />
            <Text style={[styles.pillText, { color: Colors.onSecondary }]}>LIVE NOW</Text>
          </View>
          <View style={styles.body}>
            <Text style={[styles.title, { color: Colors.onSecondary }]} numberOfLines={1}>
              {title}
            </Text>
            <Text style={styles.meta} numberOfLines={1}>
              {host ? `${host} · Reign Radio` : 'Reign Radio'}
            </Text>
          </View>
          <View style={[styles.play, { backgroundColor: Colors.onSecondary }]}>
            <Ionicons name="play" size={20} color={Colors.secondary} style={{ marginLeft: 2 }} />
          </View>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: Spacing[5], marginTop: Spacing[4] },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    borderRadius: Radius.lg,
    padding: Spacing[4],
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing[2],
    paddingVertical: 4,
  },
  dot: { width: 7, height: 7, borderRadius: 3.5 },
  pillText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 10,
    letterSpacing: 0.8,
  },
  body: { flex: 1, gap: 2 },
  title: { fontFamily: FontFamily.bodySemiBold, fontSize: 16, lineHeight: 22 },
  meta: { fontFamily: FontFamily.body, fontSize: 12, lineHeight: 17, color: 'rgba(255,255,255,0.8)' },
  play: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
