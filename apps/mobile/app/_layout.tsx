import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import * as SystemUI from 'expo-system-ui';
import 'react-native-reanimated';

import { ConvexProvider } from 'convex/react';
import { ConvexBetterAuthProvider } from '@convex-dev/better-auth/react';

import { ThemeProvider, useTheme } from '@/contexts/theme-context';
import { LightColors } from '@/constants/colors';
import { convex } from '@/lib/convex';
import { authClient } from '@/lib/auth';

SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
  initialRouteName: '(auth)',
};

function RootLayoutInner() {
  const { colors, isDark } = useTheme();
  const { data: session, isPending } = authClient.useSession();

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(colors.surfaceLowest);
  }, [colors.surfaceLowest]);

  // While the session is read from secure storage, hold on a branded loader
  // (existing logo asset + parchment surface) — no new chrome.
  if (isPending) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.surface }]}>
        <Image
          source={require('@/assets/images/faviconV2.png')}
          style={styles.loadingLogo}
          contentFit="cover"
        />
        <ActivityIndicator size="small" color={colors.primary} />
        <StatusBar style={isDark ? 'light' : 'dark'} />
      </View>
    );
  }

  const isAuthenticated = !!session;

  return (
    <>
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
      <StatusBar style={isDark ? 'light' : 'dark'} />
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    'Merriweather-Bold': require('../assets/fonts/Merriweather-Bold.ttf'),
    'Inter-Regular': require('../assets/fonts/Inter-Regular.ttf'),
    'Inter-Medium': require('../assets/fonts/Inter-Medium.ttf'),
    'Inter-SemiBold': require('../assets/fonts/Inter-SemiBold.ttf'),
    'Inter-Bold': require('../assets/fonts/Inter-Bold.ttf'),
    'JetBrainsMono-Regular': require('../assets/fonts/JetBrainsMono-Regular.ttf'),
    'JetBrainsMono-Bold': require('../assets/fonts/JetBrainsMono-Bold.ttf'),
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

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

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
  },
  loadingLogo: {
    width: 96,
    height: 96,
    borderRadius: 48,
  },
});
