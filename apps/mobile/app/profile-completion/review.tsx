import { useEffect, useState } from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation } from 'convex/react';
import { Ionicons } from '@expo/vector-icons';
import { profileCompletionInputSchema } from '@klt-cyber/shared';

import { FontFamily, Spacing } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { useProfileDraft } from './_layout';

function SummaryRow({ label, value }: { label: string; value: string }) {
  const Colors = useThemeColors();
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: Colors.outline }]}>{label.toUpperCase()}</Text>
      <Text style={[styles.rowValue, { color: Colors.onSurface }]}>{value}</Text>
    </View>
  );
}

const SEX_LABEL: Record<string, string> = { male: 'Male', female: 'Female' };
const MARITAL_LABEL: Record<string, string> = {
  single: 'Single',
  married: 'Married',
  widowed: 'Widowed',
  divorced: 'Divorced',
};

export default function ReviewStep() {
  const Colors = useThemeColors();
  const router = useRouter();
  const { draft } = useProfileDraft();
  const clans = useQuery(api.clans.listClans);
  const completeProfile = useMutation(api.profile.completeProfile);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  // The completed profile makes getMyAccount reactive-update to "member"; give
  // the warm confirmation a beat, then hand the user back to the app.
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => router.replace('/(tabs)'), 1800);
    return () => clearTimeout(t);
  }, [done, router]);

  if (done) {
    return (
      <View style={[styles.success, { backgroundColor: Colors.surface }]}>
        <View style={[styles.successIcon, { backgroundColor: Colors.primaryLight }]}>
          <Ionicons name="checkmark-circle" size={56} color={Colors.primary} />
        </View>
        <Text style={[styles.successTitle, { color: Colors.onSurface }]}>
          Welcome to the community
        </Text>
        <Text style={[styles.successBody, { color: Colors.onSurfaceVariant }]}>
          Your member profile is complete. We&apos;re glad you&apos;re here.
        </Text>
      </View>
    );
  }

  const clanName = draft.clanId
    ? clans?.find((c) => c._id === draft.clanId)?.name ?? 'Selected clan'
    : 'None';

  const handleSubmit = async () => {
    setError('');

    if (!draft.sex || !draft.maritalStatus) {
      router.replace('/profile-completion/bio' as any);
      return;
    }

    const args = {
      sex: draft.sex,
      maritalStatus: draft.maritalStatus,
      ...(draft.dateOfBirth ? { dateOfBirth: draft.dateOfBirth } : {}),
      ...(draft.phone.trim() ? { phone: draft.phone.trim() } : {}),
      ...(draft.clanId ? { clanId: draft.clanId } : {}),
      ...(draft.firstName.trim() ? { firstName: draft.firstName.trim() } : {}),
      ...(draft.lastName.trim() ? { lastName: draft.lastName.trim() } : {}),
    };

    // Validate against the shared schema before the round-trip.
    const parsed = profileCompletionInputSchema.safeParse(args);
    if (!parsed.success) {
      setError('Please review your details — something looks off.');
      return;
    }

    setSubmitting(true);
    try {
      await completeProfile(args);
      setDone(true);
    } catch {
      setSubmitting(false);
      setError('We could not save your profile. Please try again.');
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.title, { color: Colors.onSurface }]}>Review & finish</Text>
        <Text style={[styles.subtitle, { color: Colors.onSurfaceVariant }]}>
          Completing your profile makes you a member. You can edit any of this later.
        </Text>

        <View style={styles.cardSection}>
          <Card variant="editorial">
            <Text style={[styles.cardLabel, { color: Colors.outline }]}>ABOUT YOU</Text>
            <SummaryRow
              label="Name"
              value={`${draft.firstName} ${draft.lastName}`.trim() || 'Not provided'}
            />
            <SummaryRow label="Sex" value={draft.sex ? SEX_LABEL[draft.sex] : '—'} />
            <SummaryRow
              label="Marital status"
              value={draft.maritalStatus ? MARITAL_LABEL[draft.maritalStatus] : '—'}
            />
            <SummaryRow label="Date of birth" value={draft.dateOfBirth ?? 'Not provided'} />
          </Card>
        </View>

        <View style={styles.cardSection}>
          <Card variant="editorial">
            <Text style={[styles.cardLabel, { color: Colors.outline }]}>CONTACT & CLAN</Text>
            <SummaryRow label="Phone" value={draft.phone.trim() || 'Not provided'} />
            <SummaryRow label="Clan" value={clanName} />
          </Card>
        </View>

        {error ? <Text style={[styles.error, { color: Colors.error }]}>{error}</Text> : null}
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: Colors.surface }]}>
        <Button
          label="Complete profile"
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
    paddingBottom: Spacing[8],
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
  cardSection: {
    marginBottom: Spacing[3],
  },
  cardLabel: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 11,
    lineHeight: 15.4,
    letterSpacing: 0.5,
    marginBottom: Spacing[3],
  },
  row: {
    marginBottom: Spacing[3],
  },
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
  emptyText: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    lineHeight: 18,
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
  // Success
  success: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing[8],
  },
  successIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing[5],
  },
  successTitle: {
    fontFamily: FontFamily.display,
    fontSize: 24,
    lineHeight: 28.8,
    textAlign: 'center',
  },
  successBody: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    lineHeight: 22.4,
    textAlign: 'center',
    marginTop: Spacing[3],
  },
});
