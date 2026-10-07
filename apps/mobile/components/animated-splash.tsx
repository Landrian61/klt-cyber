import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import * as SplashScreen from 'expo-splash-screen';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSpring,
  interpolate,
  Easing,
  runOnJS,
} from 'react-native-reanimated';

import { FontFamily, Spacing, HeavenGradient } from '@/constants/theme';

/**
 * Kingdom Radiant — animated cold-open splash.
 *
 * Shares the Welcome screen's exact backdrop (heaven-blue gradient + gold
 * dawn-glow + halo rings) and logo/wordmark geometry, so:
 *   • a returning Saint sees the splash fade out to reveal Home, and
 *   • a first-time / expired / logged-out visitor sees it crossfade seamlessly
 *     into the sign-in / create-account screen (same background, same elements
 *     already in place — Welcome simply adds its buttons).
 *
 * The logo zooms in from slightly larger and springs to rest; the wordmark then
 * fades up below it. Once the session has resolved AND a minimum on-screen time
 * has elapsed, the whole page fades away. No spinner — the router has already
 * mounted the destination underneath.
 */

const LOGO = require('@/assets/images/logo-circle.png');

/** The intro is never cut short of this, so it always reads as intentional. */
const MIN_ON_SCREEN = 2300;

type Props = {
  /** True once the auth session has been read from secure storage. */
  sessionReady: boolean;
  /** Called after the fade-out completes and the overlay can unmount. */
  onFinish: () => void;
};

export function AnimatedSplash({ sessionReady, onFinish }: Props) {
  // ── Animation clocks (all driven on the UI thread) ──────────────
  const logoScale = useSharedValue(1.15); // starts slightly larger → springs to 1
  const eyebrow = useSharedValue(0); // "KLT CYBER CHURCH" reveal
  const title = useSharedValue(0); // "Manifesting Kingdom Life" reveal
  const fade = useSharedValue(1); // whole-page opacity (1 → 0 on exit)

  const [minElapsed, setMinElapsed] = useState(false);
  const exitStarted = useRef(false);

  // Hide the native splash on our first frame. (setOptions is unavailable in
  // Expo Go, so we don't call it — plain hideAsync works everywhere.)
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  // ── Intro timeline ──────────────────────────────────────────────
  useEffect(() => {
    // Gentle, slow settle — lower stiffness + more mass make the zoom-out linger.
    logoScale.value = withSpring(1, { damping: 15, stiffness: 42, mass: 1.3 });
    eyebrow.value = withDelay(620, withTiming(1, { duration: 620, easing: Easing.out(Easing.cubic) }));
    title.value = withDelay(820, withTiming(1, { duration: 680, easing: Easing.out(Easing.cubic) }));

    const t = setTimeout(() => setMinElapsed(true), MIN_ON_SCREEN);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Exit: fade the page away once the session is known and the intro is done ──
  useEffect(() => {
    if (!minElapsed || !sessionReady || exitStarted.current) return;
    exitStarted.current = true;
    fade.value = withTiming(0, { duration: 520, easing: Easing.inOut(Easing.quad) }, (finished) => {
      if (finished) runOnJS(onFinish)();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minElapsed, sessionReady]);

  // ── Derived styles ──────────────────────────────────────────────
  const pageStyle = useAnimatedStyle(() => ({ opacity: fade.value }));

  const logoStyle = useAnimatedStyle(() => ({
    transform: [{ scale: logoScale.value }],
  }));

  const eyebrowStyle = useAnimatedStyle(() => ({
    opacity: eyebrow.value,
    transform: [{ translateY: interpolate(eyebrow.value, [0, 1], [16, 0]) }],
  }));

  const titleStyle = useAnimatedStyle(() => ({
    opacity: title.value,
    transform: [{ translateY: interpolate(title.value, [0, 1], [18, 0]) }],
  }));

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.overlay, pageStyle]} pointerEvents="none">
      <LinearGradient
        colors={[...HeavenGradient.colors]}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={styles.fill}
      >
        {/* Gold dawn-glow rising from below (identical to Welcome). */}
        <LinearGradient
          colors={['transparent', 'rgba(233,168,32,0.28)', 'rgba(247,198,75,0.6)']}
          start={{ x: 0.5, y: 0.55 }}
          end={{ x: 0.5, y: 1.05 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        {/* Concentric halo rings (identical to Welcome). */}
        <View style={[styles.ring, styles.ring1]} pointerEvents="none" />
        <View style={[styles.ring, styles.ring2]} pointerEvents="none" />

        <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
          <View style={styles.top}>
            <Animated.View style={[styles.logoWrap, logoStyle]}>
              <Image source={LOGO} style={styles.logo} contentFit="contain" />
            </Animated.View>
            <Animated.Text style={[styles.eyebrow, eyebrowStyle]}>KLT CYBER CHURCH</Animated.Text>
            <Animated.Text style={[styles.title, titleStyle]}>Manifesting{'\n'}Kingdom Life.</Animated.Text>
            {/* Invisible placeholder — keeps the logo/wordmark at the exact same
                vertical position as Welcome, so the crossfade doesn't shift. */}
            <Text style={styles.subtitleGhost}>
              Shalom, Saint — you&apos;re welcome here. Tune in, belong, grow, and give, from anywhere.
            </Text>
          </View>

          {/* Reserves Welcome's button area so vertical centring matches exactly. */}
          <View style={styles.bottom}>
            <View style={styles.btnGhost} />
            <View style={styles.btnGhost} />
            <View style={styles.guestGhost} />
          </View>
        </SafeAreaView>
      </LinearGradient>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: { zIndex: 100 },
  fill: { flex: 1 },
  safe: { flex: 1, justifyContent: 'space-between' },
  ring: {
    position: 'absolute',
    left: '50%',
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: 'rgba(247,198,75,0.16)',
  },
  ring1: { top: -80, width: 520, height: 520, marginLeft: -260 },
  ring2: { top: -140, width: 660, height: 660, marginLeft: -330, borderColor: 'rgba(247,198,75,0.1)' },
  top: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing[8],
  },
  logoWrap: {
    borderRadius: 56,
    marginBottom: Spacing[6],
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.35,
    shadowRadius: 34,
    elevation: 12,
  },
  logo: { width: 112, height: 112, borderRadius: 56 },
  eyebrow: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 11.5,
    letterSpacing: 3,
    color: '#EDB63C',
    marginBottom: Spacing[3],
  },
  title: {
    fontFamily: FontFamily.display,
    fontSize: 40,
    lineHeight: 44,
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  // Same box as Welcome's subtitle, but invisible — layout spacer only.
  subtitleGhost: {
    fontFamily: FontFamily.body,
    fontSize: 15,
    lineHeight: 24,
    textAlign: 'center',
    marginTop: Spacing[4],
    maxWidth: 320,
    opacity: 0,
  },
  bottom: {
    paddingHorizontal: Spacing[6],
    paddingBottom: Spacing[6],
    gap: Spacing[3],
  },
  btnGhost: { height: 56 },
  guestGhost: { height: 19, marginTop: Spacing[1] },
});
