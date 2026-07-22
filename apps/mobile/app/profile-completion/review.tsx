import { useMemo, useState } from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation } from 'convex/react';

import { FontFamily, Spacing } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { useWizardDraft, type WizardDraft } from './_layout';
import type { DobValue } from '@/components/ui/dob-field';

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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const Colors = useThemeColors();
  return (
    <View style={styles.section}>
      <Card variant="editorial">
        <Text style={[styles.sectionLabel, { color: Colors.outline }]}>{title}</Text>
        {children}
      </Card>
    </View>
  );
}

export default function ReviewStep() {
  const Colors = useThemeColors();
  const router = useRouter();
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

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.title, { color: Colors.onSurface }]}>Review &amp; submit</Text>
        <Text style={[styles.subtitle, { color: Colors.onSurfaceVariant }]}>
          Check your details. After submitting, your profile goes to a church admin for
          verification.
        </Text>

        <Section title="PERSONAL">
          <Row label="Name" value={fullName} />
          <Row label="Sex" value={draft.sex ? SEX_LABEL[draft.sex] : '—'} />
          <Row label="Marital status" value={draft.maritalStatus ? MARITAL_LABEL[draft.maritalStatus] : '—'} />
          <Row label="Date of birth" value={draft.dob ? formatDob(draft.dob) : 'Not provided'} muted={!draft.dob} />
          <Row label="Phone" value={draft.phone.trim() || 'Not provided'} muted={!draft.phone.trim()} />
          <Row
            label="Address"
            value={formatAddressFromDraft(draft) || 'Not provided'}
            muted={!formatAddressFromDraft(draft)}
          />
          <Row label="Photo" value={draft.photoValue ? 'Added' : 'Not added'} muted={!draft.photoValue} />
        </Section>

        {draft.maritalStatus === 'married' && (
          <Section title="FAMILY">
            <Row
              label="Spouse"
              value={draft.spouseName.trim() ? `${draft.spouseName}${draft.spouseUserId ? ' (linked)' : ''}` : 'Not provided'}
              muted={!draft.spouseName.trim()}
            />
          </Section>
        )}

        {draft.children.filter((c) => c.name.trim() && c.sex).length > 0 && (
          <Section title="CHILDREN">
            {draft.children
              .filter((c) => c.name.trim() && c.sex)
              .map((c) => (
                <Row key={c.key} label={c.name} value={c.sex ? SEX_LABEL[c.sex] : ''} />
              ))}
          </Section>
        )}

        <Section title="MENTORSHIP">
          <Row label="Status" value="Completed" />
          <Row label="Certificate" value={draft.mentorshipProofKey ? 'Uploaded' : 'Not uploaded'} muted={!draft.mentorshipProofKey} />
        </Section>

        {draft.leadership.filter((e) => e.level && e.status).length > 0 && (
          <Section title="LEADERSHIP">
            {draft.leadership
              .filter((e) => e.level && e.status)
              .map((e) => (
                <Row
                  key={e.key}
                  label={e.level ? LEVEL_LABEL[e.level] : ''}
                  value={e.status ? LEADERSHIP_STATUS_LABEL[e.status] : ''}
                />
              ))}
          </Section>
        )}

        {(departmentName || clanName) && (
          <Section title="SERVICE & CLAN">
            {departmentName ? <Row label="Department" value={departmentName} /> : null}
            {clanName ? <Row label="Clan" value={clanName} /> : null}
          </Section>
        )}

        {(draft.occupation.trim() || draft.industry.trim() || draft.employer.trim() || draft.skills.length > 0) && (
          <Section title="PROFESSION">
            {draft.occupation.trim() ? <Row label="Occupation" value={draft.occupation.trim()} /> : null}
            {draft.industry.trim() ? <Row label="Industry" value={draft.industry.trim()} /> : null}
            {draft.employer.trim() ? <Row label="Employer" value={draft.employer.trim()} /> : null}
            {draft.skills.length > 0 ? <Row label="Skills" value={draft.skills.join(', ')} /> : null}
          </Section>
        )}

        {error ? <Text style={[styles.error, { color: Colors.error }]}>{error}</Text> : null}
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: Colors.surface }]}>
        <Button
          label="Submit for verification"
          variant="primary"
          fullWidth
          loading={submitting}
          onPress={handleSubmit}
        />
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
  sectionLabel: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 11,
    lineHeight: 15.4,
    letterSpacing: 0.5,
    marginBottom: Spacing[3],
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
    paddingBottom: Spacing[4],
  },
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
