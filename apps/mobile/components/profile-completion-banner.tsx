import { View, Text, Pressable, ImageBackground, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { FontFamily, Spacing, Radius, AmbientShadow } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { useMyAccount } from '@/hooks/use-my-account';

export interface ProfileCompletionBannerProps {
  /** Extra top margin so it can sit flush under a greeting, etc. */
  delay?: number;
}

/**
 * Home / inline invitation to join the KLT Church family. Self-contained: reads
 * membership state itself and renders one of three things —
 *   - visitor (no profile) → a gold hero inviting them into the 7-step wizard
 *   - pending verification  → a soft "under review" status card
 *   - member / still loading → nothing
 * so it can be dropped onto any screen without the host needing to branch.
 */
export function ProfileCompletionBanner({ delay = 120 }: ProfileCompletionBannerProps) {
  const Colors = useThemeColors();
  const router = useRouter();
  const { isLoading, isMember, isPending } = useMyAccount();

  if (isLoading || isMember) return null;

  // Visitors enter the wizard; pending users go to their read-only profile
  // preview (not the post-submit "under review" dead-end).
  const go = () => router.push('/profile-completion');
  const viewProfile = () => router.push('/profile');

  if (isPending) {
    return (
      <Animated.View entering={FadeInUp.duration(400).delay(delay)} style={styles.section}>
        <Pressable
          onPress={viewProfile}
          style={[styles.pendingCard, { backgroundColor: Colors.surfaceLowest }]}
          accessibilityRole="button"
          accessibilityLabel="View your submitted profile"
        >
          <View style={[styles.pendingIcon, { backgroundColor: Colors.primaryLight }]}>
            <Ionicons name="hourglass-outline" size={20} color={Colors.primary} />
          </View>
          <View style={styles.pendingText}>
            <Text style={[styles.pendingTitle, { color: Colors.onSurface }]}>
              Your profile is under review
            </Text>
            <Text style={[styles.pendingBody, { color: Colors.onSurfaceVariant }]}>
              A church admin is verifying your details — you&apos;ll join the family once approved.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={Colors.outline} />
        </Pressable>
      </Animated.View>
    );
  }

  // Visitor — a warm invitation into the wizard over a church backdrop. The
  // outer view carries the shadow; the inner clips the image to rounded corners.
  return (
    <Animated.View entering={FadeInUp.duration(400).delay(delay)} style={styles.section}>
      <View style={[styles.heroShadow, { backgroundColor: Colors.primary }, AmbientShadow]}>
        <View style={styles.heroClip}>
          <ImageBackground
            source={require('@/assets/images/Church_Theme.jpg')}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
          {/* Heaven-blue scrim keeps white text legible; gold glow for warmth. */}
          <LinearGradient
            colors={['rgba(12,33,84,0.62)', 'rgba(12,33,84,0.9)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0.6, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient
            colors={['transparent', 'rgba(247,198,75,0.4)']}
            start={{ x: 0.4, y: 0.4 }}
            end={{ x: 1.15, y: 1.1 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <View style={styles.heroContent}>
            <View style={styles.heroHead}>
              <View style={styles.heroIcon}>
                <Ionicons name="sparkles" size={20} color="#EDB63C" />
              </View>
              <Text style={styles.heroLabel}>KLT CHURCH FAMILY</Text>
            </View>
            <Text style={styles.heroTitle}>There&apos;s room for you in the family</Text>
            <Text style={styles.heroBody}>
              Complete your member profile and belong — grow, connect, and serve with the church.
            </Text>
            <Pressable
              onPress={go}
              style={[styles.cta, { backgroundColor: Colors.surfaceLowest }]}
              accessibilityRole="button"
              accessibilityLabel="Complete your profile"
            >
              <Text style={[styles.ctaLabel, { color: Colors.primary }]}>Become a member</Text>
              <Ionicons name="arrow-forward" size={18} color={Colors.primary} />
            </Pressable>
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  section: {
    paddingHorizontal: Spacing[5],
    marginTop: Spacing[5],
  },
  // Visitor hero
  heroShadow: {
    borderRadius: Radius.xl,
  },
  heroClip: {
    borderRadius: Radius.xl,
    overflow: 'hidden',
  },
  heroContent: {
    padding: Spacing[5],
  },
  heroHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    marginBottom: Spacing[3],
  },
  heroIcon: {
    width: 32,
    height: 32,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroLabel: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 11,
    lineHeight: 15.4,
    letterSpacing: 0.6,
    color: 'rgba(255, 255, 255, 0.9)',
  },
  heroTitle: {
    fontFamily: FontFamily.display,
    fontSize: 22,
    lineHeight: 28,
    color: '#FFFFFF',
  },
  heroBody: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    lineHeight: 22.4,
    color: 'rgba(255, 255, 255, 0.92)',
    marginTop: Spacing[2],
    marginBottom: Spacing[4],
  },
  cta: {
    height: 48,
    borderRadius: Radius.full,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[2],
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing[5],
  },
  ctaLabel: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 15,
    lineHeight: 22,
  },
  // Pending card
  pendingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    borderRadius: Radius.lg,
    padding: Spacing[4],
  },
  pendingIcon: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingText: { flex: 1 },
  pendingTitle: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 15,
    lineHeight: 22,
  },
  pendingBody: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
});
