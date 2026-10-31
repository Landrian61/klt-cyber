import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Stack, useRouter, usePathname } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from 'convex/react';
import type { MaritalStatus, Sex } from '@klt-cyber/shared';

import { api } from '@/lib/api';

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
// convention on `leadershipProgress` in convex/schema.ts).
export type LeadershipStatus = 'not_enrolled' | 'enrolled' | 'completed';
export const LEADERSHIP_LEVELS: LeadershipLevel[] = ['level_1', 'level_2', 'advanced'];

// ── Draft state shared across all seven wizard steps ─────────────────────────
// Nothing here is persisted to Convex until the final submit on the review
// screen — closing the app mid-wizard loses progress by design ("Explicitly
// out of scope").
//
// The draft is SEEDED from an existing profile when one exists (spec 0014,
// AC-6), so a person whose submission is waiting or has come back reopens the
// same seven steps pre-filled rather than typing it all again. There is no
// second copy of the form.

/**
 * A repeatable child row. Age derives from `dobISO` at display time.
 *
 * `_id` is present only on a row that came from the database. Sending it back
 * is what lets `resubmitProfile` PATCH that row instead of deleting and
 * recreating it, so the id survives an edit (AC-13).
 */
export interface ChildDraft {
  key: string; // local list key only
  _id?: Id<'children'>;
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
  /**
   * The stored row id per level, for a profile being resubmitted. Same purpose
   * as `ChildDraft._id`: it keeps the row rather than replacing it. Absent for
   * a level with no row yet, which is how "not enrolled" is stored (the
   * "don't store negative space" convention).
   */
  leadershipIds: Partial<Record<LeadershipLevel, Id<'leadershipProgress'>>>;

  // Step 5 — Clan
  clanId?: Id<'clans'>;

  // Step 6 — Areas of Service (up to MAX_ACTIVE_DEPARTMENTS departments)
  departmentIds: Id<'departments'>[];

  // Step 7 — Profession, plus the directory question
  occupation: string;
  industry: string;
  employer: string;
  skills: string[];
  /**
   * Whether this person agrees to appear in the member directory (F2-13).
   *
   * It rides on the LAST EXISTING STEP rather than getting one of its own,
   * because F2-01 fixes the wizard at seven steps. Defaults to false: nothing
   * is disclosed by somebody skipping past the question.
   */
  directorySharing: boolean;
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
  leadershipIds: {},
  departmentIds: [],
  occupation: '',
  industry: '',
  employer: '',
  skills: [],
  directorySharing: false,
};

interface DraftContextValue {
  draft: WizardDraft;
  patch: (partial: Partial<WizardDraft>) => void;
  /**
   * True once an existing profile has been read, whether or not there was one.
   * The steps and the review screen wait on this rather than rendering an
   * empty form over a profile that is about to arrive.
   */
  seeded: boolean;
  /**
   * True when the person already has a profile, so the review screen saves
   * through `resubmitProfile` rather than `submitProfile`.
   */
  isResubmission: boolean;
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
const CHROMELESS = ['pending', 'sent-back'];

/** Unix ms → `YYYY-MM-DD`, the form of date the draft's ISO fields hold. */
function msToIso(ms?: number): string | undefined {
  if (ms === undefined) return undefined;
  const date = new Date(ms);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

type StoredProfile = NonNullable<
  ReturnType<typeof useMyProfileForSeeding>
>;

/** The existing profile to seed from, or null when there is none. */
function useMyProfileForSeeding() {
  return useQuery(api.profile.getMyProfile);
}

/**
 * Turn a stored profile, with its children, leadership rows and live
 * department claims, back into a wizard draft (AC-6).
 *
 * Every field the wizard can write is restored, so nothing the person entered
 * is quietly dropped the moment they reopen the form. Row ids come along for
 * children and leadership, which is what keeps `resubmitProfile`'s reconcile
 * a patch rather than a replace.
 */
function draftFromProfile(profile: StoredProfile): WizardDraft {
  const leadership: Record<LeadershipLevel, LeadershipStatus> = {
    level_1: 'not_enrolled',
    level_2: 'not_enrolled',
    advanced: 'not_enrolled',
  };
  const leadershipIds: WizardDraft['leadershipIds'] = {};
  for (const row of profile.leadershipProgress) {
    const level = row.level as LeadershipLevel;
    if (!LEADERSHIP_LEVELS.includes(level)) continue;
    // The table still accepts a legacy "in_progress" on old rows; the wizard
    // only knows enrolled/completed, so anything else reads as enrolled.
    leadership[level] = row.status === 'completed' ? 'completed' : 'enrolled';
    leadershipIds[level] = row._id;
  }

  return {
    firstName: profile.firstName,
    middleName: profile.middleName ?? '',
    lastName: profile.lastName,
    sex: profile.sex,
    maritalStatus: profile.maritalStatus,
    phone: profile.phone ?? '',
    shortBio: profile.shortBio ?? '',
    dob: profile.dateOfBirth,
    photoValue: profile.photoUrl,
    // The stored value is whatever was saved: an R2 key for an upload, or an
    // account URL. Either way it is not a fresh account photo pick, so the
    // flag that drives "use my Google photo" starts false.
    photoFromAccount: false,
    joinDateISO: msToIso(profile.joinDate),
    addressLine1: profile.address?.line1 ?? '',
    addressCity: profile.address?.city ?? '',
    addressDistrict: profile.address?.district ?? '',
    addressCountry: profile.address?.country ?? 'Uganda',
    spouseUserId: profile.spouseUserId,
    spouseName: profile.spouseNameUnlinked ?? '',
    anniversaryISO: msToIso(profile.anniversaryDate),
    children: profile.children.map((child) => ({
      key: child._id,
      _id: child._id,
      name: child.name,
      sex: child.sex,
      dobISO: msToIso(child.dateOfBirth),
    })),
    nextOfKinName: profile.nextOfKin?.fullName ?? '',
    nextOfKinRelationship: profile.nextOfKin?.relationship ?? '',
    nextOfKinPhone: profile.nextOfKin?.phone ?? '',
    mentorshipStatus: profile.mentorshipStatus,
    leadership,
    leadershipIds,
    clanId: profile.clanId,
    departmentIds: profile.departmentMemberships.map((m) => m.departmentId),
    occupation: profile.occupation ?? '',
    industry: profile.industry ?? '',
    employer: profile.employer ?? '',
    skills: profile.skills ?? [],
    // Absent reads as private, the same way the stored field does.
    directorySharing: profile.directorySharing === true,
  };
}

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
  const existingProfile = useMyProfileForSeeding();
  const [seeded, setSeeded] = useState(false);
  // Seed exactly once per mount. The query is reactive, so without this a
  // write landing mid-wizard (the person's own save, a reviewer's correction)
  // would reset the form under their hands.
  const seedOnce = useRef(false);

  useEffect(() => {
    if (seedOnce.current || existingProfile === undefined) return;
    seedOnce.current = true;
    if (existingProfile) setDraft(draftFromProfile(existingProfile));
    setSeeded(true);
  }, [existingProfile]);

  // Stable identity so memoized step rows don't re-render on every keystroke:
  // `setDraft`'s functional form means `patch` never needs `draft` in its deps.
  const patch = useCallback((partial: Partial<WizardDraft>) => {
    setDraft((d) => ({ ...d, ...partial }));
  }, []);

  const isResubmission = !!existingProfile;

  const value = useMemo<DraftContextValue>(
    () => ({ draft, patch, seeded, isResubmission }),
    [draft, patch, seeded, isResubmission],
  );

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
          <Stack.Screen name="sent-back" />
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
