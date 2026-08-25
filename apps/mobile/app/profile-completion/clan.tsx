import { useRouter } from 'expo-router';
import { useQuery } from 'convex/react';

import { SelectList } from '@/components/ui/select-list';
import { StepScaffold, WizardField } from '@/components/profile-wizard/step-scaffold';
import { api, type Id } from '@/lib/api';
import { useWizardDraft } from './_layout';

// Sentinel id for the explicit "None" row — some members don't yet belong to
// a clan. Never sent to the backend: it just maps to `clanId: undefined`.
const NONE_ID = '__none__';

export default function ClanStep() {
  const router = useRouter();
  const { draft, patch } = useWizardDraft();
  const clans = useQuery(api.clans.listClans);

  const options = [
    { id: NONE_ID, label: 'None' },
    ...(clans ?? []).map((c) => ({ id: c._id, label: c.name })),
  ];

  return (
    <StepScaffold
      title="Your clan"
      subtitle="Optional. Choose the clan you belong to."
      onPrimary={() => router.push('/profile-completion/departments')}
    >
      <WizardField>
        <SelectList
          options={options}
          selectedId={draft.clanId ?? NONE_ID}
          onSelect={(id) =>
            patch({ clanId: id && id !== NONE_ID ? (id as Id<'clans'>) : undefined })
          }
          emptyText="Clans aren't available right now."
        />
      </WizardField>
    </StepScaffold>
  );
}
