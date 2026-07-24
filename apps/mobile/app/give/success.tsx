import { useEffect, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInUp, ZoomIn } from 'react-native-reanimated';

import { FontFamily, Spacing, GoldGradient } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { Button } from '@/components/ui/button';
import { useGivingFlow } from '@/contexts/giving-flow-context';

function formatAmount(value: number): string {
  return `UGX ${value.toLocaleString('en-UG')}`;
}

export default function GivingSuccessScreen() {
  const Colors = useThemeColors();
  const router = useRouter();
  const { data, reset } = useGivingFlow();

  const handleReturn = useCallback(() => {
    reset();
    router.replace('/(tabs)/giving');
  }, [reset, router]);

  // Auto-return after 5 seconds
  useEffect(() => {
    const timer = setTimeout(handleReturn, 5000);
    return () => clearTimeout(timer);
  }, [handleReturn]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: Colors.surface }]} edges={['top', 'bottom']}>
      <View style={styles.container}>
        <View style={styles.content}>
          {/* Decorative dots */}
          <View style={styles.decorContainer}>
            <Animated.View
              entering={ZoomIn.duration(400).delay(200)}
              style={[styles.decorDot, styles.decorDot1, { backgroundColor: Colors.primaryLight }]}
            />
            <Animated.View
              entering={ZoomIn.duration(400).delay(300)}
              style={[styles.decorDot, styles.decorDot2, { backgroundColor: Colors.primaryBrand, opacity: 0.3 }]}
            />
            <Animated.View
              entering={ZoomIn.duration(400).delay(400)}
              style={[styles.decorDot, styles.decorDot3, { backgroundColor: Colors.primaryFixedDim }]}
            />
          </View>

          {/* Gold checkmark */}
          <Animated.View entering={ZoomIn.duration(500).springify()}>
            <LinearGradient
              colors={[...GoldGradient.colors]}
              start={GoldGradient.start}
              end={GoldGradient.end}
              style={styles.checkCircle}
            >
              <Ionicons name="checkmark" size={48} color={Colors.onPrimary} />
            </LinearGradient>
          </Animated.View>

          <Animated.Text entering={FadeInUp.duration(400).delay(300)} style={[styles.title, { color: Colors.onSurface }]}>
            Thank you for your faithfulness
          </Animated.Text>

          <Animated.Text entering={FadeInUp.duration(400).delay(450)} style={[styles.body, { color: Colors.onSurfaceVariant }]}>
            Your gift of {formatAmount(data.amount)} has been received. God bless you abundantly.
          </Animated.Text>
        </View>

        <Animated.View entering={FadeInUp.duration(400).delay(600)} style={styles.footer}>
          <Button
            label="Return to giving"
            variant="primary"
            onPress={handleReturn}
          />
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  container: {
    flex: 1,
    justifyContent: 'space-between',
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: Spacing[6],
    marginTop: '28%',
    position: 'relative',
  },
  // Decorative dots
  decorContainer: {
    position: 'absolute',
    top: -20,
    width: '100%',
    height: 140,
  },
  decorDot: {
    position: 'absolute',
    borderRadius: 50,
  },
  decorDot1: {
    width: 12,
    height: 12,
    top: 10,
    left: '15%',
  },
  decorDot2: {
    width: 8,
    height: 8,
    top: 0,
    right: '20%',
  },
  decorDot3: {
    width: 16,
    height: 16,
    top: 40,
    right: '10%',
  },
  checkCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#D98E0B',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 8,
  },
  title: {
    fontFamily: FontFamily.display,
    fontSize: 26,
    lineHeight: 32,
    textAlign: 'center',
    marginTop: Spacing[6],
  },
  body: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
    maxWidth: 280,
    marginTop: Spacing[3],
  },
  footer: {
    paddingHorizontal: Spacing[6],
    marginBottom: Spacing[8],
  },
});
