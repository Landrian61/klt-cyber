import { useRouter } from 'expo-router';
import { useQuery } from 'convex/react';

import { SelectList } from '@/components/ui/select-list';
import { StepScaffold, WizardField } from '@/components/profile-wizard/step-scaffold';
import { api, type Id } from '@/lib/api';
import { useWizardDraft } from './_layout';

export default function ClanStep() {
  const router = useRouter();
  const { draft, patch } = useWizardDraft();
  const clans = useQuery(api.clans.listClans);

  const options = (clans ?? []).map((c) => ({ id: c._id, label: c.name }));

  return (
    <StepScaffold
      title="Your clan"
      subtitle="Optional. Choose the clan you belong to."
      onPrimary={() => router.push('/profile-completion/profession')}
    >
      <WizardField>
        <SelectList
          options={options}
          selectedId={draft.clanId}
          onSelect={(id) => patch({ clanId: id as Id<'clans'> | undefined })}
          emptyText="Clans aren't available right now."
        />
      </WizardField>
    </StepScaffold>
  );
}
