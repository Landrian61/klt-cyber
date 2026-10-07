import { View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInUp, ZoomIn } from 'react-native-reanimated';

import { FontFamily, Spacing, GoldGradient, GoldGlow } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { Button } from '@/components/ui/button';

/**
 * Shown when the caller already has a `pending_verification` profile — on a
 * fresh app open (via the gate) and right after a successful submission. A
 * celebratory "welcome home" moment; the profile is with the elders for review.
 */
export default function PendingReviewScreen() {
  const Colors = useThemeColors();
  const router = useRouter();

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: Colors.surface }]}>
      <View style={styles.center}>
        <Animated.View entering={ZoomIn.duration(500).springify()}>
          <LinearGradient
            colors={[...GoldGradient.colors]}
            start={GoldGradient.start}
            end={GoldGradient.end}
            style={[styles.checkCircle, GoldGlow]}
          >
            <Ionicons name="checkmark" size={44} color={Colors.onPrimary} />
          </LinearGradient>
        </Animated.View>

        <Animated.Text entering={FadeInUp.duration(400).delay(250)} style={[styles.title, { color: Colors.onSurface }]}>
          You&apos;re in the family!
        </Animated.Text>
        <Animated.Text entering={FadeInUp.duration(400).delay(400)} style={[styles.body, { color: Colors.onSurfaceVariant }]}>
          Thank you, Saint — your profile is with the elders for review. You&apos;ll gain full
          member access once it&apos;s approved. Welcome home.
        </Animated.Text>
      </View>
      <Animated.View entering={FadeInUp.duration(400).delay(550)} style={styles.footer}>
        <Button
          label="Go to my home screen"
          variant="primary"
          fullWidth
          onPress={() => router.replace('/(tabs)')}
        />
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing[8],
  },
  checkCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing[6],
  },
  title: {
    fontFamily: FontFamily.display,
    fontSize: 26,
    lineHeight: 32,
    textAlign: 'center',
  },
  body: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    lineHeight: 22.4,
    textAlign: 'center',
    marginTop: Spacing[3],
    maxWidth: 300,
  },
  footer: {
    paddingHorizontal: Spacing[5],
    paddingBottom: Spacing[4],
  },
});
