import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import * as SystemUI from 'expo-system-ui';
import * as Notifications from 'expo-notifications';
import 'react-native-reanimated';

import { ConvexProvider, useMutation, useQuery } from 'convex/react';
import { ConvexBetterAuthProvider } from '@convex-dev/better-auth/react';

import { ThemeProvider, useTheme } from '@/contexts/theme-context';
import { LightColors } from '@/constants/colors';
import { convex } from '@/lib/convex';
import { authClient } from '@/lib/auth';
import { api, type Id } from '@/lib/api';
import { AnimatedSplash } from '@/components/animated-splash';
// Side-effect import — registers Notifications.setNotificationHandler at
// module load. ensureDefaultAndroidChannel is called explicitly below.
import { ensureDefaultAndroidChannel } from '@/lib/notification-setup';
import { resolveDeepLinkHref } from '@/lib/notification-links';

SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
  initialRouteName: '(auth)',
};

function RootLayoutInner() {
  const { colors, isDark } = useTheme();
  const { data: session, isPending } = authClient.useSession();
  const [splashDone, setSplashDone] = useState(false);
  const router = useRouter();
  // Hoisted above the auth-dependent effect below; also used by the
  // Stack.Protected guards further down.
  const isAuthenticated = !!session;

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(colors.surfaceLowest);
  }, [colors.surfaceLowest]);

  useEffect(() => {
    ensureDefaultAndroidChannel();
  }, []);

  // OS-notification-tap handling — the app was backgrounded, killed, or
  // cold-launched by the tap itself, and the user tapped the system tray
  // entry. Same two actions as an in-app row tap
  // (apps/mobile/app/notifications.tsx): mark read, then navigate, through
  // the same resolveDeepLinkHref used there so the two paths never diverge.
  // `notificationId` is only present on pushes sent after that field was
  // added to dispatch's payload (convex/notifications.ts) — absent on older
  // ones, so the mark-read call is skipped rather than guessing an id.
  //
  // Two things a live-listener-only implementation misses, both handled here:
  // 1. Cold start: if the tap is what launched the (fully killed) app, that
  //    response was delivered before this listener existed to catch it —
  //    `addNotificationResponseReceivedListener` never fires for it.
  //    `getLastNotificationResponseAsync()` recovers it — but it keeps
  //    returning the same cached response until the next full relaunch, so
  //    it's explicitly cleared below right after being handled. Without
  //    that, this effect re-running for an unrelated reason (e.g. a
  //    sign-out/sign-in within the same session, no app relaunch) would
  //    replay the same stale response and act on it under whichever user
  //    happens to be signed in at that later point, not the one it was for.
  // 2. Auth not ready yet: only `(auth)` is mounted under Stack.Protected
  //    until `isAuthenticated`, so a push to a protected deep-link route
  //    before then would target an unmounted screen. Skipping registration
  //    entirely while `isPending`/unauthenticated — rather than swallowing
  //    the tap — means this effect re-runs and actually handles the pending
  //    response once sign-in resolves.
  const markNotificationRead = useMutation(api.notifications.markNotificationRead);
  useEffect(() => {
    if (isPending || !isAuthenticated) return;

    // Local to this effect run — only guards against the same response
    // being delivered twice (once via getLastNotificationResponseAsync, once
    // via the live listener), a known overlap on some platforms/SDK versions.
    const handledIds = new Set<string>();
    const handleResponse = (response: Notifications.NotificationResponse) => {
      const requestId = response.notification.request.identifier;
      if (handledIds.has(requestId)) return;
      handledIds.add(requestId);

      const data = response.notification.request.content.data as
        | { type?: string; id?: string; notificationId?: string }
        | undefined;
      if (!data?.type || !data.id) return;
      if (data.notificationId) {
        markNotificationRead({ notificationId: data.notificationId as Id<'notifications'> }).catch(() => {});
      }
      router.push(resolveDeepLinkHref({ type: data.type, id: data.id }) ?? '/(tabs)');
    };

    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      handleResponse(response);
      // See note 1 above — consumes it so a later, unrelated effect re-run
      // never replays it under a different signed-in user.
      Notifications.clearLastNotificationResponseAsync().catch(() => {});
    });
    const subscription = Notifications.addNotificationResponseReceivedListener(handleResponse);
    return () => subscription.remove();
  }, [isPending, isAuthenticated, markNotificationRead, router]);

  // Independent subscription from the bell badge (top-bar.tsx) and the
  // in-app notification center (notifications.tsx) — same query, each
  // caller owns its own; Convex dedupes/caches this client-side, so a
  // shared subscription isn't needed. Resolves to 0 (not undefined) once
  // loaded, including when signed out, so this never fires with a stale
  // count.
  const unreadCount = useQuery(api.notifications.getMyUnreadNotificationCount);
  useEffect(() => {
    if (unreadCount === undefined) return;
    Notifications.setBadgeCountAsync(unreadCount).catch(() => {});
  }, [unreadCount]);

  // The router is always mounted so the destination (Home for a returning
  // Saint, Welcome otherwise) renders BENEATH the splash and is simply revealed
  // when the branded intro lifts away. Session-gating is unchanged — Better Auth
  // persists the session in secure storage, so returning users skip the auth flow.
  // (isAuthenticated itself is hoisted above, next to the effects that need it.)

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface } }}>
        {/* Authenticated area: tabs + all drill-down screens. */}
        <Stack.Protected guard={isAuthenticated}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="profile-completion" />
          <Stack.Screen name="notifications" />
          <Stack.Screen name="profile" />
          <Stack.Screen name="giving" />
          <Stack.Screen name="members" />
          <Stack.Screen name="programs" />
          <Stack.Screen name="program-detail" />
          <Stack.Screen name="events" />
          <Stack.Screen name="event-detail" />
          <Stack.Screen name="announcement-detail" />
          <Stack.Screen name="give" />
        </Stack.Protected>

        {/* Public area: the auth flow. */}
        <Stack.Protected guard={!isAuthenticated}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
      </Stack>

      {/* Branded cold-open. Fades out once the session is known, revealing the
          correct screen already mounted underneath. */}
      {!splashDone && (
        <AnimatedSplash sessionReady={!isPending} onFinish={() => setSplashDone(true)} />
      )}

      {/* Default bar for cream screens is dark; the blue splash needs light.
          Screens with dark tops (welcome, profile) override this themselves. */}
      <StatusBar style={!splashDone || isDark ? 'light' : 'dark'} />
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    // Kingdom Radiant — Bricolage Grotesque (display), Plus Jakarta Sans
    // (UI/body), Spline Sans Mono (amounts). All Google Fonts, OFL.
    'BricolageGrotesque-Bold': require('../assets/fonts/BricolageGrotesque-Bold.ttf'),
    'BricolageGrotesque-ExtraBold': require('../assets/fonts/BricolageGrotesque-ExtraBold.ttf'),
    'PlusJakartaSans-Regular': require('../assets/fonts/PlusJakartaSans-Regular.ttf'),
    'PlusJakartaSans-Medium': require('../assets/fonts/PlusJakartaSans-Medium.ttf'),
    'PlusJakartaSans-SemiBold': require('../assets/fonts/PlusJakartaSans-SemiBold.ttf'),
    'PlusJakartaSans-Bold': require('../assets/fonts/PlusJakartaSans-Bold.ttf'),
    'PlusJakartaSans-ExtraBold': require('../assets/fonts/PlusJakartaSans-ExtraBold.ttf'),
    'PlusJakartaSans-Italic': require('../assets/fonts/PlusJakartaSans-Italic.ttf'),
    'SplineSansMono-Medium': require('../assets/fonts/SplineSansMono-Medium.ttf'),
    'SplineSansMono-SemiBold': require('../assets/fonts/SplineSansMono-SemiBold.ttf'),
  });

  // Native splash stays up (cream + logo) until fonts are ready; the animated
  // splash then hides it on its own first frame for a seamless handoff.
  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: LightColors.surface }} />;
  }

  return (
    <ThemeProvider>
      <ConvexProvider client={convex}>
        <ConvexBetterAuthProvider client={convex} authClient={authClient}>
          <RootLayoutInner />
        </ConvexBetterAuthProvider>
      </ConvexProvider>
    </ThemeProvider>
  );
}
