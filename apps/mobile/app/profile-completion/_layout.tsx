import { createContext, useContext, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Stack, useRouter, usePathname } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { MaritalStatus, Sex } from '@klt-cyber/shared';

import { FontFamily, Spacing } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { ProgressBar } from '@/components/ui/progress-bar';
import { Button } from '@/components/ui/button';
import type { Id } from '@/lib/api';

// ── Draft state shared across the steps ───────────────────────────────────────
// Children are intentionally NOT captured during setup — they are deferred and
// managed later from the profile page (see docs/DATA_MODEL.md).

export interface ProfileDraft {
  firstName: string;
  lastName: string;
  sex?: Sex;
  dateOfBirth?: string;
  maritalStatus?: MaritalStatus;
  phone: string;
  clanId?: Id<'clans'>;
}

interface DraftContextValue {
  draft: ProfileDraft;
  patch: (partial: Partial<ProfileDraft>) => void;
}

const DraftContext = createContext<DraftContextValue | null>(null);

export function useProfileDraft(): DraftContextValue {
  const ctx = useContext(DraftContext);
  if (!ctx) throw new Error('useProfileDraft must be used within the profile-completion layout');
  return ctx;
}

const EMPTY_DRAFT: ProfileDraft = {
  firstName: '',
  lastName: '',
  phone: '',
};

// ── Step ordering for the shared progress header ─────────────────────────────

const STEPS = ['bio', 'contact', 'review'] as const;

function stepIndexForPath(pathname: string): number {
  for (let i = STEPS.length - 1; i >= 0; i--) {
    if (pathname.includes(STEPS[i])) return i;
  }
  return 0;
}

export default function ProfileCompletionLayout() {
  const Colors = useThemeColors();
  const router = useRouter();
  const pathname = usePathname();

  const [draft, setDraft] = useState<ProfileDraft>(EMPTY_DRAFT);

  const value = useMemo<DraftContextValue>(
    () => ({
      draft,
      patch: (partial) => setDraft((d) => ({ ...d, ...partial })),
    }),
    [draft],
  );

  const stepIndex = stepIndexForPath(pathname);

  return (
    <DraftContext.Provider value={value}>
      <SafeAreaView style={[styles.safe, { backgroundColor: Colors.surface }]} edges={['top']}>
        {/* Shared header: dismiss + step progress */}
        <View style={styles.header}>
          <Button
            variant="icon"
            onPress={() => router.back()}
            accessibilityLabel="Go back"
            icon={<Ionicons name="arrow-back" size={24} color={Colors.onSurface} />}
          />
          <Text style={[styles.stepText, { color: Colors.outline }]}>
            Step {stepIndex + 1} of {STEPS.length}
          </Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.progress}>
          <ProgressBar totalSteps={STEPS.length} currentStep={stepIndex + 1} />
        </View>

        <Stack
          screenOptions={{
            headerShown: false,
            animation: 'slide_from_right',
            contentStyle: { backgroundColor: Colors.surface },
          }}
        >
          <Stack.Screen name="bio" />
          <Stack.Screen name="contact" />
          <Stack.Screen name="review" />
        </Stack>
      </SafeAreaView>
    </DraftContext.Provider>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[2],
  },
  stepText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 12,
    lineHeight: 18,
    letterSpacing: 0.5,
  },
  headerSpacer: {
    width: 44,
  },
  progress: {
    paddingHorizontal: Spacing[5],
    paddingTop: Spacing[1],
    paddingBottom: Spacing[4],
  },
});
