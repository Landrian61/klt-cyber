import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { useEffect } from 'react';
import { View } from 'react-native';
import * as SystemUI from 'expo-system-ui';
import 'react-native-reanimated';

import { ThemeProvider, useTheme } from '@/contexts/theme-context';
import { LightColors } from '@/constants/colors';

SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
  initialRouteName: '(auth)',
};

function RootLayoutInner() {
  const { colors, isDark } = useTheme();

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(colors.surfaceLowest);
  }, [colors.surfaceLowest]);

  return (
    <>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface } }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
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
      <RootLayoutInner />
    </ThemeProvider>
  );
}
