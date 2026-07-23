import { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation } from 'convex/react';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, {
  FadeInDown,
  FadeInUp,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  useReducedMotion,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FontFamily, Spacing, Radius, Duration, AmbientShadowUp } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { useWizardDraft, type WizardDraft } from './_layout';
import type { DobValue } from '@/components/ui/dob-field';

// Each editable section jumps to its wizard step in edit mode (`returnTo=1`);
// StepScaffold turns that step's primary action into "Save changes" → back here.
type StepRoutePath =
  | '/profile-completion/personal'
  | '/profile-completion/family'
  | '/profile-completion/mentorship'
  | '/profile-completion/leadership'
  | '/profile-completion/department'
  | '/profile-completion/clan'
  | '/profile-completion/profession';

const SEX_LABEL: Record<string, string> = { male: 'Male', female: 'Female' };
const MARITAL_LABEL: Record<string, string> = {
  single: 'Single', married: 'Married', widowed: 'Widowed', divorced: 'Divorced',
};
const LEVEL_LABEL: Record<string, string> = {
  level_1: 'Level 1', level_2: 'Level 2', advanced: 'Advanced',
};
const LEADERSHIP_STATUS_LABEL: Record<string, string> = {
  in_progress: 'In Progress', completed: 'Completed',
};
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** `YYYY-MM-DD` → unix ms (church-local midnight). Undefined passes through. */
function isoToMs(iso?: string): number | undefined {
  if (!iso) return undefined;
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d).getTime();
}

function formatDob(v: DobValue): string {
  const month = MONTHS[v.month - 1] ?? '';
  return v.year ? `${v.day} ${month} ${v.year}` : `${v.day} ${month}`;
}

/** One-line address from the draft's flat fields, or empty when line 1 is blank. */
function formatAddressFromDraft(draft: WizardDraft): string {
  if (!draft.addressLine1.trim()) return '';
  return [draft.addressLine1, draft.addressCity, draft.addressDistrict, draft.addressCountry]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(', ');
}

/**
 * Collapse the wizard draft into the exact `submitProfile` argument shape:
 * required fields flat, blank optionals omitted, ISO dates converted to ms, and
 * the `children` / `leadershipEntries` arrays built from their draft rows.
 */
function buildSubmitArgs(draft: WizardDraft) {
  const nokComplete =
    !!draft.nextOfKinName.trim() &&
    !!draft.nextOfKinRelationship.trim() &&
    !!draft.nextOfKinPhone.trim();

  return {
    // Required
    firstName: draft.firstName.trim(),
    lastName: draft.lastName.trim(),
    sex: draft.sex!,
    maritalStatus: draft.maritalStatus!,
    mentorshipStatus: 'completed' as const,

    // Optional — Step 1
    ...(draft.middleName.trim() ? { middleName: draft.middleName.trim() } : {}),
    ...(draft.phone.trim() ? { phone: draft.phone.trim() } : {}),
    ...(draft.shortBio.trim() ? { shortBio: draft.shortBio.trim() } : {}),
    ...(draft.dob ? { dateOfBirth: draft.dob } : {}),
    ...(draft.photoValue ? { photoUrl: draft.photoValue } : {}),
    ...(isoToMs(draft.joinDateISO) !== undefined ? { joinDate: isoToMs(draft.joinDateISO) } : {}),
    ...(draft.addressLine1.trim()
      ? {
          address: {
            line1: draft.addressLine1.trim(),
            ...(draft.addressCity.trim() ? { city: draft.addressCity.trim() } : {}),
            ...(draft.addressDistrict.trim() ? { district: draft.addressDistrict.trim() } : {}),
            ...(draft.addressCountry.trim() ? { country: draft.addressCountry.trim() } : {}),
          },
        }
      : {}),

    // Optional — Step 2 (spouse only meaningful when married)
    ...(draft.maritalStatus === 'married'
      ? draft.spouseUserId
        ? { spouseUserId: draft.spouseUserId }
        : draft.spouseName.trim()
          ? { spouseNameUnlinked: draft.spouseName.trim() }
          : {}
      : {}),
    ...(isoToMs(draft.anniversaryISO) !== undefined
      ? { anniversaryDate: isoToMs(draft.anniversaryISO) }
      : {}),
    ...(nokComplete
      ? {
          nextOfKin: {
            fullName: draft.nextOfKinName.trim(),
            relationship: draft.nextOfKinRelationship.trim(),
            phone: draft.nextOfKinPhone.trim(),
          },
        }
      : {}),

    // Optional — Step 3 proof
    ...(draft.mentorshipProofKey ? { mentorshipProofUrl: draft.mentorshipProofKey } : {}),

    // Optional — Steps 5–6
    ...(draft.departmentId ? { departmentId: draft.departmentId } : {}),
    ...(draft.clanId ? { clanId: draft.clanId } : {}),

    // Optional — Step 7
    ...(draft.occupation.trim() ? { occupation: draft.occupation.trim() } : {}),
    ...(draft.industry.trim() ? { industry: draft.industry.trim() } : {}),
    ...(draft.employer.trim() ? { employer: draft.employer.trim() } : {}),
    ...(draft.skills.length ? { skills: draft.skills } : {}),

    // Arrays — only complete rows
    children: draft.children
      .filter((c) => c.name.trim() && c.sex)
      .map((c) => ({
        name: c.name.trim(),
        sex: c.sex!,
        ...(isoToMs(c.dobISO) !== undefined ? { dateOfBirth: isoToMs(c.dobISO) } : {}),
      })),
    leadershipEntries: draft.leadership
      .filter((e) => e.level && e.status)
      .map((e) => ({
        level: e.level!,
        status: e.status!,
        ...(e.proofKey ? { proofUrl: e.proofKey } : {}),
      })),
  };
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Tactile "Edit" affordance in a section header. */
function EditPill({ onPress }: { onPress: () => void }) {
  const Colors = useThemeColors();
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <AnimatedPressable
      onPressIn={() => {
        scale.value = withTiming(0.92, { duration: Duration.fast });
      }}
      onPressOut={() => {
        scale.value = withTiming(1, { duration: 150 });
      }}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      hitSlop={10}
      style={[animatedStyle, styles.editPill, { backgroundColor: Colors.primaryFixedDim }]}
      accessibilityRole="button"
      accessibilityLabel="Edit this section"
    >
      <Ionicons name="create-outline" size={14} color={Colors.primary} />
      <Text style={[styles.editPillText, { color: Colors.primary }]}>Edit</Text>
    </AnimatedPressable>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  const Colors = useThemeColors();
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: Colors.outline }]}>{label.toUpperCase()}</Text>
      <Text style={[styles.rowValue, { color: muted ? Colors.outline : Colors.onSurface }]}>
        {value}
      </Text>
    </View>
  );
}

function Section({
  title,
  editPath,
  delay,
  children,
}: {
  title: string;
  editPath: StepRoutePath;
  delay: number;
  children: React.ReactNode;
}) {
  const Colors = useThemeColors();
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeInUp.duration(320).delay(delay)}
      style={styles.section}
    >
      <Card variant="editorial">
        <View style={styles.sectionHead}>
          <Text style={[styles.sectionLabel, { color: Colors.outline }]}>{title}</Text>
          <EditPill onPress={() => router.push({ pathname: editPath, params: { returnTo: '1' } })} />
        </View>
        {children}
      </Card>
    </Animated.View>
  );
}

export default function ReviewStep() {
  const Colors = useThemeColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const { draft } = useWizardDraft();

  const submitProfile = useMutation(api.memberProfiles.submitProfile);
  const departments = useQuery(api.departments.listActiveDepartments);
  const clans = useQuery(api.clans.listClans);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Required fields are enforced step-by-step, but guard here too in case the
  // screen is reached out of order.
  const ready =
    !!draft.firstName.trim() &&
    !!draft.lastName.trim() &&
    !!draft.sex &&
    !!draft.maritalStatus &&
    draft.mentorshipStatus === 'completed';

  const args = useMemo(() => (ready ? buildSubmitArgs(draft) : null), [draft, ready]);

  const departmentName = departments?.find((d) => d._id === draft.departmentId)?.name;
  const clanName = clans?.find((c) => c._id === draft.clanId)?.name;

  const handleSubmit = async () => {
    if (!args) return;
    setError('');
    setSubmitting(true);
    try {
      await submitProfile(args);
      // The pending screen reads getMyProfileStatus, now pending_verification.
      router.replace('/profile-completion/pending');
    } catch {
      setSubmitting(false);
      setError('We could not submit your profile. Please try again.');
    }
  };

  if (!ready) {
    return (
      <View style={[styles.guard, { backgroundColor: Colors.surface }]}>
        <Text style={[styles.guardTitle, { color: Colors.onSurface }]}>A few details are missing</Text>
        <Text style={[styles.guardBody, { color: Colors.onSurfaceVariant }]}>
          Please complete the required fields — name, sex, marital status, and mentorship — before
          submitting.
        </Text>
        <View style={styles.guardBtn}>
          <Button label="Back to start" variant="primary" onPress={() => router.replace('/profile-completion/personal')} />
        </View>
      </View>
    );
  }

  const fullName = [draft.firstName, draft.middleName, draft.lastName]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(' ');

  const completeChildren = draft.children.filter((c) => c.name.trim() && c.sex);
  const completeLeadership = draft.leadership.filter((e) => e.level && e.status);
  const nokComplete =
    !!draft.nextOfKinName.trim() && !!draft.nextOfKinRelationship.trim() && !!draft.nextOfKinPhone.trim();
  const address = formatAddressFromDraft(draft);
  const hasProfession =
    !!draft.occupation.trim() || !!draft.industry.trim() || !!draft.employer.trim() || draft.skills.length > 0;

  return (
    <View style={styles.container}>
      <Animated.ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={reduceMotion ? undefined : FadeInDown.duration(360)}>
          <Text style={[styles.title, { color: Colors.onSurface }]}>Your profile</Text>
          <Text style={[styles.subtitle, { color: Colors.onSurfaceVariant }]}>
            A preview of what the church family will see. Tap Edit on any section to change it, then
            submit for verification.
          </Text>
        </Animated.View>

        <Section title="PERSONAL" editPath="/profile-completion/personal" delay={40}>
          <Row label="Name" value={fullName} />
          <Row label="Sex" value={draft.sex ? SEX_LABEL[draft.sex] : '—'} />
          <Row label="Marital status" value={draft.maritalStatus ? MARITAL_LABEL[draft.maritalStatus] : '—'} />
          <Row label="Date of birth" value={draft.dob ? formatDob(draft.dob) : 'Not provided'} muted={!draft.dob} />
          <Row label="Phone" value={draft.phone.trim() || 'Not provided'} muted={!draft.phone.trim()} />
          <Row label="Address" value={address || 'Not provided'} muted={!address} />
          <Row label="Photo" value={draft.photoValue ? 'Added' : 'Not added'} muted={!draft.photoValue} />
        </Section>

        <Section title="FAMILY" editPath="/profile-completion/family" delay={80}>
          {draft.maritalStatus === 'married' && (
            <Row
              label="Spouse"
              value={draft.spouseName.trim() ? `${draft.spouseName}${draft.spouseUserId ? ' (linked)' : ''}` : 'Not provided'}
              muted={!draft.spouseName.trim()}
            />
          )}
          {completeChildren.length > 0 ? (
            completeChildren.map((c) => (
              <Row key={c.key} label={`Child — ${c.name}`} value={c.sex ? SEX_LABEL[c.sex] : ''} />
            ))
          ) : (
            <Row label="Children" value="None added" muted />
          )}
          <Row
            label="Next of kin"
            value={nokComplete ? `${draft.nextOfKinName} · ${draft.nextOfKinRelationship}` : 'Not added'}
            muted={!nokComplete}
          />
        </Section>

        <Section title="MENTORSHIP" editPath="/profile-completion/mentorship" delay={120}>
          <Row label="Status" value="Completed" />
          <Row label="Certificate" value={draft.mentorshipProofKey ? 'Uploaded' : 'Not uploaded'} muted={!draft.mentorshipProofKey} />
        </Section>

        <Section title="LEADERSHIP" editPath="/profile-completion/leadership" delay={160}>
          {completeLeadership.length > 0 ? (
            completeLeadership.map((e) => (
              <Row
                key={e.key}
                label={e.level ? LEVEL_LABEL[e.level] : ''}
                value={e.status ? LEADERSHIP_STATUS_LABEL[e.status] : ''}
              />
            ))
          ) : (
            <Row label="Levels" value="None added" muted />
          )}
        </Section>

        <Section title="AREA OF SERVICE" editPath="/profile-completion/department" delay={200}>
          <Row label="Department" value={departmentName || 'None selected'} muted={!departmentName} />
        </Section>

        <Section title="CLAN" editPath="/profile-completion/clan" delay={240}>
          <Row label="Clan" value={clanName || 'None selected'} muted={!clanName} />
        </Section>

        <Section title="PROFESSION" editPath="/profile-completion/profession" delay={280}>
          {hasProfession ? (
            <>
              {draft.occupation.trim() ? <Row label="Occupation" value={draft.occupation.trim()} /> : null}
              {draft.industry.trim() ? <Row label="Industry" value={draft.industry.trim()} /> : null}
              {draft.employer.trim() ? <Row label="Employer" value={draft.employer.trim()} /> : null}
              {draft.skills.length > 0 ? <Row label="Skills" value={draft.skills.join(', ')} /> : null}
            </>
          ) : (
            <Row label="Work" value="Not added" muted />
          )}
        </Section>

        {error ? <Text style={[styles.error, { color: Colors.error }]}>{error}</Text> : null}
      </Animated.ScrollView>

      <View
        style={[
          styles.footer,
          { backgroundColor: Colors.surface, paddingBottom: insets.bottom + Spacing[4] },
          AmbientShadowUp,
        ]}
      >
        <View style={styles.footerRow}>
          {router.canGoBack() ? (
            <View style={styles.backWrap}>
              <Button label="Back" variant="ghost" fullWidth onPress={() => router.back()} />
            </View>
          ) : null}
          <View style={styles.primaryWrap}>
            <Button
              label="Submit for verification"
              variant="primary"
              fullWidth
              loading={submitting}
              onPress={handleSubmit}
            />
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: Spacing[5],
    paddingBottom: Spacing[10],
  },
  title: {
    fontFamily: FontFamily.display,
    fontSize: 24,
    lineHeight: 28.8,
  },
  subtitle: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    lineHeight: 22.4,
    marginTop: Spacing[2],
    marginBottom: Spacing[5],
  },
  section: { marginBottom: Spacing[3] },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing[3],
  },
  sectionLabel: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 11,
    lineHeight: 15.4,
    letterSpacing: 0.5,
  },
  editPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing[3],
    paddingVertical: 6,
  },
  editPillText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 12,
    lineHeight: 16,
  },
  row: { marginBottom: Spacing[3] },
  rowLabel: {
    fontFamily: FontFamily.body,
    fontSize: 11,
    lineHeight: 15.4,
    letterSpacing: 0.5,
  },
  rowValue: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 14,
    lineHeight: 22.4,
    marginTop: 2,
  },
  error: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: Spacing[2],
  },
  footer: {
    paddingHorizontal: Spacing[5],
    paddingTop: Spacing[3],
  },
  footerRow: {
    flexDirection: 'row',
    gap: Spacing[3],
  },
  backWrap: { flex: 1 },
  primaryWrap: { flex: 1.8 },
  guard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing[8],
  },
  guardTitle: {
    fontFamily: FontFamily.display,
    fontSize: 20,
    lineHeight: 26,
    textAlign: 'center',
  },
  guardBody: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    lineHeight: 22.4,
    textAlign: 'center',
    marginTop: Spacing[3],
  },
  guardBtn: { marginTop: Spacing[6] },
});
