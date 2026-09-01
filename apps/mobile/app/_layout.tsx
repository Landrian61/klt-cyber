import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import * as SystemUI from 'expo-system-ui';
import * as Notifications from 'expo-notifications';
import 'react-native-reanimated';

import { ConvexProvider, useQuery } from 'convex/react';
import { ConvexBetterAuthProvider } from '@convex-dev/better-auth/react';

import { ThemeProvider, useTheme } from '@/contexts/theme-context';
import { LightColors } from '@/constants/colors';
import { convex } from '@/lib/convex';
import { authClient } from '@/lib/auth';
import { api } from '@/lib/api';
import { AnimatedSplash } from '@/components/animated-splash';
// Side-effect import — registers Notifications.setNotificationHandler at
// module load. ensureDefaultAndroidChannel is called explicitly below.
import { ensureDefaultAndroidChannel } from '@/lib/notification-setup';

SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
  initialRouteName: '(auth)',
};

function RootLayoutInner() {
  const { colors, isDark } = useTheme();
  const { data: session, isPending } = authClient.useSession();
  const [splashDone, setSplashDone] = useState(false);

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(colors.surfaceLowest);
  }, [colors.surfaceLowest]);

  useEffect(() => {
    ensureDefaultAndroidChannel();
  }, []);

  // Reusable by the future in-app notification center, not just this badge —
  // see convex/notifications.ts. Resolves to 0 (not undefined) once loaded,
  // including when signed out, so this never fires with a stale count.
  const unreadCount = useQuery(api.notifications.getMyUnreadNotificationCount);
  useEffect(() => {
    if (unreadCount === undefined) return;
    Notifications.setBadgeCountAsync(unreadCount).catch(() => {});
  }, [unreadCount]);

  // The router is always mounted so the destination (Home for a returning
  // Saint, Welcome otherwise) renders BENEATH the splash and is simply revealed
  // when the branded intro lifts away. Session-gating is unchanged — Better Auth
  // persists the session in secure storage, so returning users skip the auth flow.
  const isAuthenticated = !!session;

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
