import { View, Text, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from 'convex/react';
import Animated, { FadeInUp, useReducedMotion } from 'react-native-reanimated';
import { PROFILE_LIFECYCLE_COPY } from '@klt-cyber/shared';

import { FontFamily, Spacing, Radius } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';

/**
 * Shown when a reviewer has handed this person's profile back (F2-05, A2-02).
 *
 * The tone is load bearing here, which is why it is worth a note. This is a
 * REQUEST, phrased as one. It must not read as a rejection — nothing has been
 * refused and nothing has been lost — and it must not read as the old pending
 * screen's celebration either. One thing is being asked for, in the reviewer's
 * own words, and there is one way to act on it.
 *
 * The reason is rendered AS GIVEN. It is the reviewer's sentence, not ours, so
 * nothing here rephrases, truncates or decorates it.
 */
export default function SentBackScreen() {
  const Colors = useThemeColors();
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const status = useQuery(api.profile.getMyProfileStatus);

  if (status === undefined) {
    return (
      <View style={[styles.center, { backgroundColor: Colors.surface }]}>
        <ActivityIndicator size="small" color={Colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: Colors.surface }]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Animated.View entering={reduceMotion ? undefined : FadeInUp.duration(360)}>
          <View style={[styles.iconCircle, { backgroundColor: Colors.primaryLight }]}>
            <Ionicons name="create-outline" size={36} color={Colors.primary} />
          </View>
        </Animated.View>

        <Animated.Text
          entering={reduceMotion ? undefined : FadeInUp.duration(360).delay(120)}
          style={[styles.title, { color: Colors.onSurface }]}
        >
          {PROFILE_LIFECYCLE_COPY.sentBack.title}
        </Animated.Text>

        <Animated.Text
          entering={reduceMotion ? undefined : FadeInUp.duration(360).delay(220)}
          style={[styles.body, { color: Colors.onSurfaceVariant }]}
        >
          {PROFILE_LIFECYCLE_COPY.sentBack.body}
        </Animated.Text>

        {status?.sentBackReason ? (
          <Animated.View
            entering={reduceMotion ? undefined : FadeInUp.duration(360).delay(320)}
            style={[styles.reasonCard, { backgroundColor: Colors.surfaceLowest }]}
          >
            <Text style={[styles.reason, { color: Colors.onSurface }]}>
              {status.sentBackReason}
            </Text>
          </Animated.View>
        ) : null}

        <Animated.Text
          entering={reduceMotion ? undefined : FadeInUp.duration(360).delay(420)}
          style={[styles.footerNote, { color: Colors.onSurfaceVariant }]}
        >
          {PROFILE_LIFECYCLE_COPY.sentBack.footer}
        </Animated.Text>
      </ScrollView>

      <Animated.View
        entering={reduceMotion ? undefined : FadeInUp.duration(360).delay(520)}
        style={styles.footer}
      >
        {/* The same seven-step wizard, pre-filled, saving through
            `resubmitProfile`. There is no second copy of the form. */}
        <Button
          label={PROFILE_LIFECYCLE_COPY.sentBack.editAction}
          variant="primary"
          fullWidth
          onPress={() => router.push('/profile-completion/personal')}
        />
        <Button
          label="Not now"
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing[6],
    paddingVertical: Spacing[8],
  },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing[5],
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
  reasonCard: {
    alignSelf: 'stretch',
    borderRadius: Radius.lg,
    padding: Spacing[5],
    marginTop: Spacing[5],
  },
  reason: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 16,
    lineHeight: 25.6,
  },
  footerNote: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: Spacing[5],
    maxWidth: 320,
  },
  footer: {
    gap: Spacing[2],
    paddingHorizontal: Spacing[5],
    paddingBottom: Spacing[4],
  },
});
