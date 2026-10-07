import { useCallback } from 'react';
import { useRouter } from 'expo-router';
import { useQuery } from 'convex/react';
import { MAX_ACTIVE_DEPARTMENTS } from '@klt-cyber/shared';

import { MultiSelectList } from '@/components/ui/multi-select-list';
import { StepScaffold, WizardField, Hint } from '@/components/profile-wizard/step-scaffold';
import { api, type Id } from '@/lib/api';
import { useWizardDraft } from './_layout';

// Sentinel id for the explicit "None" row — some members don't yet serve
// anywhere. Selecting it clears any real selections and vice versa; it's
// never sent to the backend, since an empty `departmentIds` already means
// "none" to `submitProfile`.
const NONE_ID = '__none__';

export default function DepartmentsStep() {
  const router = useRouter();
  const { draft, patch } = useWizardDraft();
  const departments = useQuery(api.departments.listDepartments);

  const options = [
    { id: NONE_ID, label: 'None' },
    ...(departments ?? []).map((d) => ({ id: d._id, label: d.name })),
  ];

  const selectedIds = draft.departmentIds.length === 0 ? [NONE_ID] : draft.departmentIds;

  const handleToggle = useCallback(
    (id: string) => {
      if (id === NONE_ID) {
        patch({ departmentIds: [] });
        return;
      }
      const deptId = id as Id<'departments'>;
      const already = draft.departmentIds.includes(deptId);
      if (already) {
        patch({ departmentIds: draft.departmentIds.filter((d) => d !== deptId) });
      } else if (draft.departmentIds.length < MAX_ACTIVE_DEPARTMENTS) {
        patch({ departmentIds: [...draft.departmentIds, deptId] });
      }
    },
    [draft.departmentIds, patch],
  );

  return (
    <StepScaffold
      title="Areas of service"
      subtitle={`Optional. Choose up to ${MAX_ACTIVE_DEPARTMENTS} areas of ministry you belong to.`}
      onPrimary={() => router.push('/profile-completion/profession')}
    >
      <WizardField>
        <MultiSelectList
          options={options}
          selectedIds={selectedIds}
          onToggle={handleToggle}
          max={MAX_ACTIVE_DEPARTMENTS}
          emptyText="Areas of service aren't available right now."
        />
        <Hint>An admin may follow up if anything here needs confirming.</Hint>
      </WizardField>
    </StepScaffold>
  );
}
