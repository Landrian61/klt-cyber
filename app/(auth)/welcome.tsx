import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  FadeInDown,
  FadeInUp,
} from 'react-native-reanimated';

import { Colors, FontFamily, Spacing, GoldGradient } from '@/constants/theme';
import { Button } from '@/components/ui/button';

const { width } = Dimensions.get('window');

export default function WelcomeScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.container}>
        {/* Top decorative area */}
        <Animated.View entering={FadeInDown.duration(600).delay(100)} style={styles.topSection}>
          {/* Subtle background orb */}
          <View style={styles.orbContainer}>
            <LinearGradient
              colors={['rgba(120,86,0,0.08)', 'rgba(184,134,11,0.04)', 'transparent']}
              style={styles.orb}
            />
          </View>

          {/* Logo */}
          <LinearGradient
            colors={[...GoldGradient.colors]}
            start={GoldGradient.start}
            end={GoldGradient.end}
            style={styles.logoCircle}
          >
            <Ionicons name="people" size={44} color={Colors.onPrimary} />
          </LinearGradient>

          {/* Church Name */}
          <Text style={styles.churchName}>KLT Cyber Church</Text>

          {/* Tagline */}
          <Text style={styles.tagline}>Manifesting Kingdom Life.</Text>

          {/* Decorative line */}
          <LinearGradient
            colors={['transparent', Colors.primaryBrand, 'transparent']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.decorLine}
          />

          {/* Welcome message */}
          <Text style={styles.welcomeMessage}>
            Your digital sanctuary for worship, community, and spiritual growth.
          </Text>
        </Animated.View>

        {/* Bottom CTA area */}
        <Animated.View entering={FadeInUp.duration(500).delay(400)} style={styles.bottomSection}>
          <Button
            label="Sign in"
            variant="primary"
            onPress={() => router.push('/(auth)/sign-in')}
          />

          <View style={styles.gap14} />

          <Button
            label="Create account"
            variant="ghost"
            onPress={() => router.push('/(auth)/register-step-1')}
          />

          <View style={styles.gap24} />

          <View style={styles.visitorRow}>
            <Text style={styles.visitorText}>Just browsing? </Text>
            <Button
              label="Continue as visitor"
              variant="textLink"
              onPress={() => router.replace('/(tabs)')}
            />
          </View>
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  container: {
    flex: 1,
    justifyContent: 'space-between',
  },
  topSection: {
    alignItems: 'center',
    paddingTop: '20%',
    paddingHorizontal: Spacing[8],
    position: 'relative',
  },
  orbContainer: {
    position: 'absolute',
    top: -40,
    alignItems: 'center',
  },
  orb: {
    width: width * 0.8,
    height: width * 0.8,
    borderRadius: width * 0.4,
    opacity: 0.7,
  },
  logoCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#785600',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 8,
  },
  churchName: {
    fontFamily: FontFamily.display,
    fontSize: 28,
    lineHeight: 34,
    color: Colors.primary,
    textAlign: 'center',
    marginTop: Spacing[5],
  },
  tagline: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 15,
    lineHeight: 22,
    color: Colors.onSurfaceVariant,
    textAlign: 'center',
    letterSpacing: 1.5,
    marginTop: Spacing[2],
  },
  decorLine: {
    width: 60,
    height: 2,
    borderRadius: 1,
    marginTop: Spacing[6],
  },
  welcomeMessage: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    lineHeight: 22,
    color: Colors.outline,
    textAlign: 'center',
    marginTop: Spacing[5],
    maxWidth: 260,
  },
  bottomSection: {
    paddingHorizontal: Spacing[6],
    paddingBottom: Spacing[6],
  },
  gap14: {
    height: 14,
  },
  gap24: {
    height: Spacing[6],
  },
  visitorRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  visitorText: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    lineHeight: 22,
    color: Colors.onSurfaceVariant,
  },
});
