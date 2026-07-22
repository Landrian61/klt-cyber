import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { FontFamily, Spacing, Radius } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { ImageUploadField } from '@/components/ui/image-upload-field';
import { StepScaffold, WizardField, FieldLabel } from '@/components/profile-wizard/step-scaffold';
import { useWizardDraft, type MentorshipStatus } from './_layout';

const MENTORSHIP_STATUSES: MentorshipStatus[] = ['not_enrolled', 'enrolled', 'completed'];
const MENTORSHIP_LABELS = ['Not Enrolled', 'Enrolled', 'Completed'];

export default function MentorshipStep() {
  const Colors = useThemeColors();
  const router = useRouter();
  const { draft, patch } = useWizardDraft();

  const statusIndex = draft.mentorshipStatus
    ? MENTORSHIP_STATUSES.indexOf(draft.mentorshipStatus)
    : -1;
  const isCompleted = draft.mentorshipStatus === 'completed';
  const hasChosen = statusIndex >= 0;

  return (
    <StepScaffold
      title="Mentorship"
      subtitle="Completing the mentorship programme is required to finish your member profile."
      onPrimary={() => router.push('/profile-completion/leadership')}
      primaryDisabled={!isCompleted}
      footerNote={
        isCompleted
          ? 'A certificate is optional — skip it and an admin will follow up.'
          : undefined
      }
    >
      <WizardField>
        <FieldLabel>Mentee status</FieldLabel>
        <SegmentedControl
          options={MENTORSHIP_LABELS}
          selectedIndex={statusIndex < 0 ? 0 : statusIndex}
          onChange={(i) => patch({ mentorshipStatus: MENTORSHIP_STATUSES[i] })}
        />
      </WizardField>

      {hasChosen && !isCompleted && (
        <View style={[styles.gate, { backgroundColor: Colors.warningLight }]}>
          <Ionicons name="lock-closed-outline" size={20} color={Colors.warning} />
          <Text style={[styles.gateText, { color: Colors.onSurface }]}>
            You&apos;ll need to complete mentorship before finishing your profile. You can save
            this page and return once you&apos;ve completed the programme.
          </Text>
        </View>
      )}

      {isCompleted && (
        <WizardField>
          <ImageUploadField
            label="Mentorship certificate (optional)"
            emptyLabel="Add certificate"
            value={draft.mentorshipProofKey}
            onChange={(key) => patch({ mentorshipProofKey: key })}
            helperText="A photo of your certificate lets an admin approve you straight away."
          />
        </WizardField>
      )}
    </StepScaffold>
  );
}

const styles = StyleSheet.create({
  gate: {
    flexDirection: 'row',
    gap: Spacing[3],
    borderRadius: Radius.lg,
    padding: Spacing[4],
    marginBottom: Spacing[5],
  },
  gateText: {
    flex: 1,
    fontFamily: FontFamily.body,
    fontSize: 14,
    lineHeight: 22.4,
  },
});
