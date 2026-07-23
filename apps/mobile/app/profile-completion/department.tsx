import { useRouter } from 'expo-router';
import { useQuery } from 'convex/react';

import { SelectList } from '@/components/ui/select-list';
import { StepScaffold, WizardField } from '@/components/profile-wizard/step-scaffold';
import { api, type Id } from '@/lib/api';
import { useWizardDraft } from './_layout';

export default function DepartmentStep() {
  const router = useRouter();
  const { draft, patch } = useWizardDraft();
  const departments = useQuery(api.departments.listActiveDepartments);

  const options = (departments ?? []).map((d) => ({
    id: d._id,
    label: d.name,
    sublabel: d.description,
  }));

  return (
    <StepScaffold
      title="Area of service"
      subtitle="Optional. Pick the department you serve in, if any."
      onPrimary={() => router.push('/profile-completion/clan')}
    >
      <WizardField>
        <SelectList
          options={options}
          selectedId={draft.departmentId}
          onSelect={(id) => patch({ departmentId: id as Id<'departments'> | undefined })}
          emptyText="No departments are available yet."
        />
      </WizardField>
    </StepScaffold>
  );
}
