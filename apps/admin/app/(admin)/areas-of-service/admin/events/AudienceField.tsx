"use client";

import { useMemo } from "react";
import { useAuthQuery } from "@/lib/useAuthQuery";
import type { Id } from "@/lib/api";
import {
  EVENT_AUDIENCE_LABELS,
  EVENT_AUDIENCE_TYPES,
  PAUSED_DEPARTMENTS,
  type EventAudienceType,
} from "@klt-cyber/shared";
import { api } from "@/lib/api";
import { Checkbox } from "@/components/shadcn/checkbox";
import { SegmentedFilter } from "@/components/ui/FilterBar";
import { Badge } from "@/components/shadcn/badge";

// Who a church event is for (spec 0021, AC-11): the whole church, everyone
// serving in any department, or chosen departments. Paused departments are not
// offered for a new choice; the server refuses them. One already on an older
// event (paused after the event was made) still shows, ticked and marked, so
// it can be removed.

/** The `EventAudienceInput` contract from @klt-cyber/shared, with typed ids. */
export type AudienceValue =
  | { type: "church" }
  | { type: "serving" }
  | { type: "departments"; departmentIds: Id<"departments">[] };

const HINTS: Record<EventAudienceType, string> = {
  church: "Everyone with the app sees it and is notified.",
  serving: "Anyone on a department roster sees it. Verified members are notified.",
  departments:
    "Only people on these departments' rosters see it. Verified members are notified.",
};

const OPTIONS = EVENT_AUDIENCE_TYPES.map((type) => ({
  value: type,
  label: EVENT_AUDIENCE_LABELS[type],
}));

const PAUSED: readonly string[] = PAUSED_DEPARTMENTS;

export function AudienceField({
  value,
  onChange,
  disabled,
}: {
  value: AudienceValue;
  onChange: (value: AudienceValue) => void;
  disabled?: boolean;
}) {
  const departments = useAuthQuery(api.departments.listDepartments, {});
  const selected = value.type === "departments" ? value.departmentIds : [];
  const offered = useMemo(
    () =>
      (departments ?? []).filter(
        (d) => !PAUSED.includes(d.name) || selected.includes(d._id),
      ),
    [departments, selected],
  );

  function setType(type: EventAudienceType) {
    if (type === "departments") {
      onChange({ type, departmentIds: selected });
    } else {
      onChange({ type });
    }
  }

  function toggle(id: Id<"departments">, checked: boolean) {
    const next = checked
      ? [...selected.filter((d) => d !== id), id]
      : selected.filter((d) => d !== id);
    onChange({ type: "departments", departmentIds: next });
  }

  return (
    <fieldset className="space-y-3" disabled={disabled}>
      <legend className="sr-only">Audience</legend>
      <SegmentedFilter
        options={OPTIONS}
        value={value.type}
        onChange={(next) => setType(next as EventAudienceType)}
        ariaLabel="Who this event is for"
        size="sm"
      />
      <p className="font-body text-xs text-on-surface-variant">{HINTS[value.type]}</p>

      {value.type === "departments" && (
        <div className="rounded-md bg-surface-low p-3">
          {departments === undefined ? (
            <p className="font-body text-sm text-outline">Loading departments…</p>
          ) : (
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {offered.map((department) => {
                const id = `audience-${department._id}`;
                const checked = selected.includes(department._id);
                const paused = PAUSED.includes(department.name);
                return (
                  <li key={department._id} className="flex items-center gap-2">
                    <Checkbox
                      id={id}
                      checked={checked}
                      onCheckedChange={(next) => toggle(department._id, next === true)}
                    />
                    <label htmlFor={id} className="font-body text-sm text-on-surface">
                      {department.name}
                    </label>
                    {paused && <Badge variant="neutral">Paused</Badge>}
                  </li>
                );
              })}
            </ul>
          )}
          {selected.length === 0 && departments !== undefined && (
            <p className="mt-2 font-body text-xs text-error">
              Choose at least one department.
            </p>
          )}
        </div>
      )}
    </fieldset>
  );
}

/** Department names by id, for audience labels. Shares the picker's subscription. */
export function useDepartmentNames(): Map<string, string> {
  const departments = useAuthQuery(api.departments.listDepartments, {});
  return useMemo(
    () => new Map((departments ?? []).map((d) => [d._id as string, d.name])),
    [departments],
  );
}


/** A short audience label for a card or the overview, from the stored audience. */
export function AudienceBadge({ audience }: { audience: AudienceValue }) {
  const departmentNames = useDepartmentNames();
  if (audience.type !== "departments") {
    return <Badge variant="role">{EVENT_AUDIENCE_LABELS[audience.type]}</Badge>;
  }
  const names = audience.departmentIds
    .map((id) => departmentNames.get(id))
    .filter((name): name is string => Boolean(name));
  const label =
    names.length === 0
      ? EVENT_AUDIENCE_LABELS.departments
      : names.length <= 2
        ? names.join(", ")
        : `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
  return <Badge variant="role">{label}</Badge>;
}
