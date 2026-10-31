import { View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInUp, ZoomIn, useReducedMotion } from 'react-native-reanimated';
import { PROFILE_LIFECYCLE_COPY } from '@klt-cyber/shared';

import { FontFamily, Spacing, Radius } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { Button } from '@/components/ui/button';

/**
 * Shown when the caller already has a `pending_verification` profile — on a
 * fresh app open (via the gate) and right after a successful submission.
 *
 * Deliberately NOT a celebration any more (F2-02, spec 0014 AC-27). It used to
 * greet somebody with a gold check mark, "You're in the family!" and "Welcome
 * home" the moment they pressed submit, which promised them a membership
 * nobody had yet agreed to — and then left them stuck, because the screen had
 * no way back into the submission they had just made.
 *
 * What it says now: where the profile is, who has it, and that they can still
 * change anything while they wait (F2-03).
 */
export default function PendingReviewScreen() {
  const Colors = useThemeColors();
  const router = useRouter();
  const reduceMotion = useReducedMotion();

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: Colors.surface }]}>
      <View style={styles.center}>
        <Animated.View entering={reduceMotion ? undefined : ZoomIn.duration(400)}>
          <View style={[styles.iconCircle, { backgroundColor: Colors.primaryLight }]}>
            <Ionicons name="hourglass-outline" size={40} color={Colors.primary} />
          </View>
        </Animated.View>

        <Animated.Text
          entering={reduceMotion ? undefined : FadeInUp.duration(400).delay(200)}
          style={[styles.title, { color: Colors.onSurface }]}
        >
          {PROFILE_LIFECYCLE_COPY.pending.title}
        </Animated.Text>
        <Animated.Text
          entering={reduceMotion ? undefined : FadeInUp.duration(400).delay(320)}
          style={[styles.body, { color: Colors.onSurfaceVariant }]}
        >
          {PROFILE_LIFECYCLE_COPY.pending.body}
        </Animated.Text>
      </View>
      <Animated.View
        entering={reduceMotion ? undefined : FadeInUp.duration(400).delay(440)}
        style={styles.footer}
      >
        {/* The way back in (F2-03). Reopens the same seven-step wizard,
            pre-filled, and saves through `resubmitProfile` — there is no
            second copy of the form. */}
        <Button
          label={PROFILE_LIFECYCLE_COPY.pending.editAction}
          variant="primary"
          fullWidth
          onPress={() => router.push('/profile-completion/personal')}
        />
        <Button
          label="Go to my home screen"
          variant="ghost"
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
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing[6],
  },
  title: {
    fontFamily: FontFamily.display,
    fontSize: 24,
    lineHeight: 30,
    textAlign: 'center',
  },
  body: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    lineHeight: 22.4,
    textAlign: 'center',
    marginTop: Spacing[3],
    maxWidth: 320,
  },
  footer: {
    gap: Spacing[2],
    paddingHorizontal: Spacing[5],
    paddingBottom: Spacing[4],
  },
});
