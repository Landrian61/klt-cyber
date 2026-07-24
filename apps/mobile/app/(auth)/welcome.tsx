import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';

import { FontFamily, Spacing, Radius, HeavenGradient, GoldGradient, GoldGlow } from '@/constants/theme';

export default function WelcomeScreen() {
  const router = useRouter();

  const go = (path: '/(auth)/sign-in' | '/(auth)/sign-up') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(path);
  };

  return (
    <LinearGradient
      colors={[...HeavenGradient.colors]}
      start={{ x: 0.2, y: 0 }}
      end={{ x: 0.8, y: 1 }}
      style={styles.fill}
    >
      {/* Gold dawn-glow rising from below */}
      <LinearGradient
        colors={['transparent', 'rgba(233,168,32,0.28)', 'rgba(247,198,75,0.6)']}
        start={{ x: 0.5, y: 0.55 }}
        end={{ x: 0.5, y: 1.05 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      {/* Concentric halo rings */}
      <View style={[styles.ring, styles.ring1]} pointerEvents="none" />
      <View style={[styles.ring, styles.ring2]} pointerEvents="none" />

      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <Animated.View entering={FadeInDown.duration(600).delay(80)} style={styles.top}>
          <View style={styles.logoWrap}>
            <Image
              source={require('@/assets/images/faviconV2.png')}
              style={styles.logo}
              contentFit="cover"
            />
          </View>
          <Text style={styles.eyebrow}>KLT CYBER CHURCH</Text>
          <Text style={styles.title}>Manifesting{'\n'}Kingdom Life.</Text>
          <Text style={styles.subtitle}>
            Shalom, Saint — you&apos;re welcome here. Tune in, belong, grow, and give, from anywhere.
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInUp.duration(500).delay(360)} style={styles.bottom}>
          <Pressable onPress={() => go('/(auth)/sign-in')} accessibilityRole="button" accessibilityLabel="Sign in">
            <LinearGradient
              colors={[...GoldGradient.colors]}
              start={GoldGradient.start}
              end={GoldGradient.end}
              style={[styles.primaryBtn, GoldGlow]}
            >
              <Text style={styles.primaryLabel}>Sign in</Text>
            </LinearGradient>
          </Pressable>

          <Pressable
            onPress={() => go('/(auth)/sign-up')}
            style={styles.ghostBtn}
            accessibilityRole="button"
            accessibilityLabel="Create account"
          >
            <Text style={styles.ghostLabel}>Create account</Text>
          </Pressable>

          <Text style={styles.guest}>
            Just visiting? <Text style={styles.guestLink}>Come in as a guest</Text>
          </Text>
        </Animated.View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
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
    color: '#F7C64B',
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
  subtitle: {
    fontFamily: FontFamily.body,
    fontSize: 15,
    lineHeight: 24,
    color: 'rgba(255,255,255,0.82)',
    textAlign: 'center',
    marginTop: Spacing[4],
    maxWidth: 320,
  },
  bottom: {
    paddingHorizontal: Spacing[6],
    paddingBottom: Spacing[6],
    gap: Spacing[3],
  },
  primaryBtn: {
    height: 56,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryLabel: {
    fontFamily: FontFamily.bodyExtraBold,
    fontSize: 16,
    color: '#3A2604',
  },
  ghostBtn: {
    height: 56,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  ghostLabel: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 16,
    color: '#FFFFFF',
  },
  guest: {
    textAlign: 'center',
    fontFamily: FontFamily.bodyMedium,
    fontSize: 13.5,
    color: 'rgba(255,255,255,0.75)',
    marginTop: Spacing[1],
  },
  guestLink: {
    fontFamily: FontFamily.bodyBold,
    color: '#F7C64B',
  },
});
