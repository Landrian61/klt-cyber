import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInUp, ZoomIn } from 'react-native-reanimated';

import { FontFamily, Spacing, Radius, GoldGradient } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { Button } from '@/components/ui/button';
import { useRegistration } from '@/contexts/registration-context';

export default function RegisterSuccessScreen() {
  const Colors = useThemeColors();
  const router = useRouter();
  const { data, reset } = useRegistration();

  const hasPendingApprovals = data.clan.length > 0 || data.departments.length > 0;

  const handleGoHome = () => {
    reset();
    router.replace('/(tabs)');
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: Colors.surface }]} edges={['top', 'bottom']}>
      <View style={styles.container}>
        <View style={styles.content}>
          {/* Confetti-like decorative circles */}
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

          {/* Gold checkmark circle */}
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
            {"You\u2019re in the family!"}
          </Animated.Text>

          <Animated.Text entering={FadeInUp.duration(400).delay(450)} style={[styles.body, { color: Colors.onSurfaceVariant }]}>
            Welcome to KLT Cyber Church, {data.firstName || 'friend'}. Your account is ready.
            {hasPendingApprovals
              ? ' Clan and department memberships will appear once approved by leadership.'
              : ''}
          </Animated.Text>

          {/* Pending notice card */}
          {hasPendingApprovals && (
            <Animated.View entering={FadeIn.duration(400).delay(600)} style={[styles.pendingCard, { backgroundColor: Colors.warningLight }]}>
              <View style={styles.pendingIconBox}>
                <Ionicons name="time-outline" size={18} color={Colors.warning} />
              </View>
              <Text style={[styles.pendingText, { color: Colors.onSurface }]}>
                {"Your selections are pending approval. You\u2019ll be notified when confirmed."}
              </Text>
            </Animated.View>
          )}
        </View>

        {/* CTA at bottom */}
        <Animated.View entering={FadeInUp.duration(400).delay(700)} style={styles.footer}>
          <Button
            label="Go to my home screen"
            variant="primary"
            onPress={handleGoHome}
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
    shadowColor: '#785600',
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
  pendingCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: Radius.lg,
    padding: Spacing[4],
    marginTop: Spacing[6],
    gap: Spacing[3],
  },
  pendingIconBox: {
    width: 32,
    height: 32,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(184, 134, 11, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingText: {
    flex: 1,
    fontFamily: FontFamily.body,
    fontSize: 13,
    lineHeight: 20,
  },
  footer: {
    paddingHorizontal: Spacing[6],
    marginBottom: Spacing[8],
  },
});
