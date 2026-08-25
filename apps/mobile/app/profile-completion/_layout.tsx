import { createContext, useContext, useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Stack, useRouter, usePathname } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { MaritalStatus, Sex } from '@klt-cyber/shared';

import { FontFamily, Spacing } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { ProgressBar } from '@/components/ui/progress-bar';
import { Button } from '@/components/ui/button';
import type { DobValue } from '@/components/ui/dob-field';
import type { Id } from '@/lib/api';

// ── Domain literals not in the shared enums package ──────────────────────────

export type MentorshipStatus = 'not_enrolled' | 'enrolled' | 'completed';
export type LeadershipLevel = 'level_1' | 'level_2' | 'advanced';
// Same three-way vocabulary as mentorship. "not_enrolled" is UI-only — it's
// never sent to `submitProfile`; a level stays that way by simply having no
// `leadershipEntries` row for it (see the "don't store negative space"
// convention on `leadershipProgress` in docs/DATA_MODEL.md).
export type LeadershipStatus = 'not_enrolled' | 'enrolled' | 'completed';
export const LEADERSHIP_LEVELS: LeadershipLevel[] = ['level_1', 'level_2', 'advanced'];

// ── Draft state shared across all seven wizard steps ─────────────────────────
// Nothing here is persisted to Convex until the final `submitProfile` on the
// review screen — closing the app mid-wizard loses progress by design
// (docs/Profile-completion-mobile.md, "Explicitly out of scope").

/** A repeatable child row. Age derives from `dobISO` at display time. */
export interface ChildDraft {
  key: string; // local list key only
  name: string;
  sex?: Sex;
  dobISO?: string; // YYYY-MM-DD
}

export interface WizardDraft {
  // Step 1 — Personal
  firstName: string;
  middleName: string;
  lastName: string;
  sex?: Sex;
  maritalStatus?: MaritalStatus;
  phone: string;
  shortBio: string;
  dob?: DobValue;
  /** R2 object key for a fresh upload, or an account (Google) photo URL. */
  photoValue?: string;
  /** True when `photoValue` is the account photo URL rather than an R2 key. */
  photoFromAccount: boolean;
  joinDateISO?: string;
  // Address — flat here, assembled into an object at submit. Only sent when
  // `addressLine1` is filled (line1 is the one essential locator).
  addressLine1: string;
  addressCity: string;
  addressDistrict: string;
  addressCountry: string;

  // Step 2 — Family
  spouseUserId?: Id<'users'>;
  /** Display name of the linked spouse, or a free-typed unlinked name. */
  spouseName: string;
  anniversaryISO?: string;
  children: ChildDraft[];
  nextOfKinName: string;
  nextOfKinRelationship: string;
  nextOfKinPhone: string;

  // Step 3 — Mentorship
  mentorshipStatus?: MentorshipStatus;

  // Step 4 — Leadership (KLLII). One fixed status per level, no add/remove.
  leadership: Record<LeadershipLevel, LeadershipStatus>;

  // Step 5 — Clan
  clanId?: Id<'clans'>;

  // Step 6 — Areas of Service (up to MAX_ACTIVE_DEPARTMENTS departments)
  departmentIds: Id<'departments'>[];

  // Step 7 — Profession
  occupation: string;
  industry: string;
  employer: string;
  skills: string[];
}

const EMPTY_DRAFT: WizardDraft = {
  firstName: '',
  middleName: '',
  lastName: '',
  phone: '',
  shortBio: '',
  photoFromAccount: false,
  addressLine1: '',
  addressCity: '',
  addressDistrict: '',
  addressCountry: 'Uganda',
  spouseName: '',
  children: [],
  nextOfKinName: '',
  nextOfKinRelationship: '',
  nextOfKinPhone: '',
  leadership: { level_1: 'not_enrolled', level_2: 'not_enrolled', advanced: 'not_enrolled' },
  departmentIds: [],
  occupation: '',
  industry: '',
  employer: '',
  skills: [],
};

interface DraftContextValue {
  draft: WizardDraft;
  patch: (partial: Partial<WizardDraft>) => void;
}

const DraftContext = createContext<DraftContextValue | null>(null);

export function useWizardDraft(): DraftContextValue {
  const ctx = useContext(DraftContext);
  if (!ctx) throw new Error('useWizardDraft must be used within the profile-completion layout');
  return ctx;
}

// ── Step ordering for the shared progress header ─────────────────────────────

export const STEPS = [
  'personal',
  'family',
  'mentorship',
  'leadership',
  'clan',
  'departments',
  'profession',
] as const;

/** Routes that render outside the numbered step chrome. */
const CHROMELESS = ['pending'];

function currentSegment(pathname: string): string {
  const parts = pathname.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? '';
}

function stepIndexForPath(pathname: string): number {
  const seg = currentSegment(pathname);
  const idx = STEPS.indexOf(seg as (typeof STEPS)[number]);
  return idx < 0 ? 0 : idx;
}

export default function ProfileCompletionLayout() {
  const Colors = useThemeColors();
  const router = useRouter();
  const pathname = usePathname();

  const [draft, setDraft] = useState<WizardDraft>(EMPTY_DRAFT);

  // Stable identity so memoized step rows don't re-render on every keystroke:
  // `setDraft`'s functional form means `patch` never needs `draft` in its deps.
  const patch = useCallback((partial: Partial<WizardDraft>) => {
    setDraft((d) => ({ ...d, ...partial }));
  }, []);

  const value = useMemo<DraftContextValue>(() => ({ draft, patch }), [draft, patch]);

  const seg = currentSegment(pathname);
  const isStep = (STEPS as readonly string[]).includes(seg);
  const isReview = seg === 'review';
  const showChrome = (isStep || isReview) && !CHROMELESS.includes(seg);
  const stepIndex = stepIndexForPath(pathname);

  return (
    <DraftContext.Provider value={value}>
      <SafeAreaView style={[styles.safe, { backgroundColor: Colors.surface }]} edges={['top']}>
        {showChrome && (
          <>
            <View style={styles.header}>
              <Button
                variant="icon"
                onPress={() => router.back()}
                accessibilityLabel="Go back"
                icon={<Ionicons name="arrow-back" size={24} color={Colors.onSurface} />}
              />
              <Text style={[styles.stepText, { color: Colors.outline }]}>
                {isReview ? 'Review' : `Step ${stepIndex + 1} of ${STEPS.length}`}
              </Text>
              <View style={styles.headerSpacer} />
            </View>
            <View style={styles.progress}>
              <ProgressBar
                totalSteps={STEPS.length}
                currentStep={isReview ? STEPS.length : stepIndex + 1}
              />
            </View>
          </>
        )}

        <Stack
          screenOptions={{
            headerShown: false,
            animation: 'slide_from_right',
            contentStyle: { backgroundColor: Colors.surface },
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="personal" />
          <Stack.Screen name="family" />
          <Stack.Screen name="mentorship" />
          <Stack.Screen name="leadership" />
          <Stack.Screen name="clan" />
          <Stack.Screen name="departments" />
          <Stack.Screen name="profession" />
          <Stack.Screen name="review" />
          <Stack.Screen name="pending" />
        </Stack>
      </SafeAreaView>
    </DraftContext.Provider>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
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
  headerSpacer: { width: 44 },
  progress: {
    paddingHorizontal: Spacing[5],
    paddingTop: Spacing[1],
    paddingBottom: Spacing[4],
  },
});
