import { Stack } from 'expo-router';

import { useThemeColors } from '@/hooks/use-theme-colors';

/** The Settings stack (spec 0023): index, notifications, change password, help. */
export default function SettingsLayout() {
  const Colors = useThemeColors();
  return (
    <Stack
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.surface } }}
    />
  );
}
