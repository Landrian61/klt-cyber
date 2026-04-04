import { Stack } from 'expo-router';

import { useThemeColors } from '@/hooks/use-theme-colors';
import { RegistrationProvider } from '@/contexts/registration-context';

export default function AuthLayout() {
  const Colors = useThemeColors();

  return (
    <RegistrationProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: Colors.surface },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="welcome" />
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="forgot-password" />
        <Stack.Screen name="register-step-1" />
        <Stack.Screen name="register-step-2" />
        <Stack.Screen name="register-step-3" />
        <Stack.Screen name="register-success" options={{ gestureEnabled: false }} />
      </Stack>
    </RegistrationProvider>
  );
}
