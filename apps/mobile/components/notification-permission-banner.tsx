import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, AppState, type AppStateStatus,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInUp } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { FontFamily, Spacing, Radius, ShadowE1 } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { usePushPermission } from '@/hooks/use-push-permission';
import {
  getPushBannerDismissedAt, setPushBannerDismissedNow, PUSH_BANNER_DISMISS_COOLDOWN_MS,
} from '@/lib/push-banner-storage';

export interface NotificationPermissionBannerProps {
  /** Extra top margin so it can be positioned relative to a sibling. */
  delay?: number;
}

/**
 * Home-screen invitation to turn on push notifications. Self-contained, like
 * `ProfileCompletionBanner`: reads its own permission + dismissal state so it
 * can be dropped onto any screen without the host branching on it.
 *
 * Visible only in the "never-asked" permission state, and only outside the
 * dismiss cooldown — re-evaluated on mount and on every foreground (a
 * dismissal made on a different day, or a permission grant made from the
 * Profile toggle while this was unmounted, must both be picked up).
 */
export function NotificationPermissionBanner({ delay = 200 }: NotificationPermissionBannerProps) {
  const Colors = useThemeColors();
  const { state, requestAndRegister } = usePushPermission();
  // undefined = dismissal state not loaded from storage yet; null = never dismissed.
  const [dismissedAt, setDismissedAt] = useState<number | null | undefined>(undefined);

  const refreshDismissal = useCallback(() => {
    getPushBannerDismissedAt().then(setDismissedAt);
  }, []);

  useEffect(() => {
    refreshDismissal();
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') refreshDismissal();
    });
    return () => sub.remove();
  }, [refreshDismissal]);

  const dismiss = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Storage + hide only — never touches permission state.
    setPushBannerDismissedNow();
    setDismissedAt(Date.now());
  };

  if (state !== 'never-asked' || dismissedAt === undefined) return null;
  const cooldownElapsed = dismissedAt === null
    || Date.now() - dismissedAt >= PUSH_BANNER_DISMISS_COOLDOWN_MS;
  if (!cooldownElapsed) return null;

  return (
    <Animated.View entering={FadeInUp.duration(400).delay(delay)} style={styles.section}>
      <View style={[styles.card, ShadowE1, { backgroundColor: Colors.surfaceLowest }]}>
        <Pressable
          onPress={requestAndRegister}
          style={styles.tapArea}
          accessibilityRole="button"
          accessibilityLabel="Turn on notifications"
        >
          <View style={[styles.icon, { backgroundColor: Colors.primaryLight }]}>
            <Ionicons name="notifications-outline" size={20} color={Colors.primary} />
          </View>
          <View style={styles.text}>
            <Text style={[styles.title, { color: Colors.onSurface }]}>Stay in the loop</Text>
            <Text style={[styles.copy, { color: Colors.onSurfaceVariant }]}>
              Turn on notifications for service reminders, events, and announcements.
            </Text>
          </View>
        </Pressable>
        <Pressable
          onPress={dismiss}
          style={styles.dismiss}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
        >
          <Ionicons name="close" size={18} color={Colors.outline} />
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  section: { paddingHorizontal: Spacing[5], marginTop: Spacing[5] },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: Radius.lg,
    padding: Spacing[4],
    gap: Spacing[2],
  },
  tapArea: { flex: 1, flexDirection: 'row', gap: Spacing[3] },
  icon: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1 },
  title: { fontFamily: FontFamily.bodySemiBold, fontSize: 15, lineHeight: 22 },
  copy: { fontFamily: FontFamily.body, fontSize: 13, lineHeight: 18, marginTop: 2 },
  dismiss: { padding: Spacing[1] },
});
