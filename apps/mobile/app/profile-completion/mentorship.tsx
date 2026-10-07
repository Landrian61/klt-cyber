import { useRouter } from 'expo-router';

import { SegmentedControl } from '@/components/ui/segmented-control';
import { StepScaffold, WizardField, FieldLabel } from '@/components/profile-wizard/step-scaffold';
import { useWizardDraft, type MentorshipStatus } from './_layout';

const MENTORSHIP_STATUSES: MentorshipStatus[] = ['not_enrolled', 'enrolled', 'completed'];
const MENTORSHIP_LABELS = ['Not Enrolled', 'Enrolled', 'Completed'];

export default function MentorshipStep() {
  const router = useRouter();
  const { draft, patch } = useWizardDraft();

  const statusIndex = draft.mentorshipStatus
    ? MENTORSHIP_STATUSES.indexOf(draft.mentorshipStatus)
    : -1;
  const hasChosen = statusIndex >= 0;

  return (
    <StepScaffold
      title="Mentorship"
      subtitle="Let us know where you are in the mentorship programme."
      onPrimary={() => router.push('/profile-completion/leadership')}
      primaryDisabled={!hasChosen}
    >
      <WizardField>
        <FieldLabel>Mentee status</FieldLabel>
        <SegmentedControl
          options={MENTORSHIP_LABELS}
          selectedIndex={statusIndex}
          onChange={(i) => patch({ mentorshipStatus: MENTORSHIP_STATUSES[i] })}
        />
      </WizardField>
    </StepScaffold>
  );
}
