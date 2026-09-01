import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

// Registered once at import time (module side effect, same pattern as
// `SplashScreen.preventAutoHideAsync()` in app/_layout.tsx) rather than
// inside a component, since it's global native configuration, not
// component-scoped state.
//
// Field names verified fresh against the installed expo-notifications
// (0.32.17, node_modules/expo-notifications/build/Notifications.types.d.ts)
// — `shouldShowAlert` is deprecated on this version in favor of the split
// `shouldShowBanner` (the transient foreground popup) / `shouldShowList`
// (whether it still lands in the notification center/shade). We suppress
// only the banner while foregrounded — the notification should still be
// there to pull down, it just shouldn't interrupt with a popup — and keep
// sound + badge behavior as asked.
//
// `shouldSetBadge: true` governs whether the OS is allowed to apply a badge
// count carried on the notification payload itself; it's basically moot
// here since convex/notifications.ts's `dispatch` never sets a `badge`
// field on the payload (badge count is instead driven independently by
// `ensureBadgeSync` below, from `getMyUnreadNotificationCount`) — kept
// `true` to match "keep badge behavior" literally.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: false,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

const DEFAULT_ANDROID_CHANNEL_ID = 'default';

/**
 * Registers a single default Android notification channel. Idempotent
 * ("creating it if need be", per the API's own doc comment) — safe to call
 * on every app start, not just first install.
 *
 * Android 8+ requires every notification to belong to a channel that
 * exists on-device; a push whose payload omits `channelId` (which is every
 * push this app sends — see convex/notifications.ts's `dispatch`, which
 * deliberately doesn't hardcode one) is delivered by Expo's push service
 * against the channel id `"default"`, so that's what's registered here. A
 * single default channel is fine for now — this app has no per-category
 * channel needs yet.
 */
export async function ensureDefaultAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(DEFAULT_ANDROID_CHANNEL_ID, {
    name: 'Default',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}
