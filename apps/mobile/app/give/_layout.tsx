import { Stack } from 'expo-router';

import { useThemeColors } from '@/hooks/use-theme-colors';
import { GivingFlowProvider } from '@/contexts/giving-flow-context';

export default function GiveLayout() {
  const Colors = useThemeColors();

  return (
    <GivingFlowProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: Colors.surface },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="amount" />
        <Stack.Screen name="payment" />
        <Stack.Screen name="confirm" />
        <Stack.Screen name="success" options={{ gestureEnabled: false }} />
      </Stack>
    </GivingFlowProvider>
  );
}
