"use client";

import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { api, type Id } from "@/lib/api";
import { useAuthQuery } from "@/lib/useAuthQuery";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/shadcn/dialog";
import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";
import { Textarea } from "@/components/shadcn/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/shadcn/select";
import { FilterChip } from "@/components/ui/FilterBar";
import {
  ACTIVITY_STATUS_OPTIONS,
  Field,
  errorMessage,
  fromDateInput,
  toDateInput,
} from "../_lib/adminContent";

type Status = "planned" | "in_progress" | "done";

/** What we know about an activity being edited, straight from the merged
 * planner item (convex/plannedActivities.ts propagates `description` through
 * onto activity rows specifically so this can prefill it). */
export interface EditingActivity {
  activityId: Id<"plannedActivities">;
  title: string;
  description: string;
  status: Status;
  departmentIds: Id<"departments">[];
  targetDate: number;
}

interface FormState {
  title: string;
  description: string;
  targetDate: string;
  departmentIds: Id<"departments">[];
  status: Status;
}

function emptyForm(defaultDate: Date): FormState {
  return {
    title: "",
    description: "",
    targetDate: toDateInput(defaultDate.getTime()),
    departmentIds: [],
    status: "planned",
  };
}

// Shared create/edit form, opened from the page header's "Add activity"
// button or from a DayPopup row/empty-day click.
export function ActivityDialog({
  open,
  onOpenChange,
  activity,
  defaultDate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activity: EditingActivity | null;
  defaultDate: Date;
}) {
  const departments = useAuthQuery(api.departments.listDepartments, {});
  const createActivity = useMutation(api.plannedActivities.createActivity);
  const updateActivity = useMutation(api.plannedActivities.updateActivity);

  const [form, setForm] = useState<FormState>(() => emptyForm(defaultDate));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The Dialog stays mounted between opens — re-seed the form each time it
  // opens for a (possibly different) edit target or pre-filled day.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setForm(
      activity
        ? {
            title: activity.title,
            description: activity.description,
            targetDate: toDateInput(activity.targetDate),
            departmentIds: activity.departmentIds,
            status: activity.status,
          }
        : emptyForm(defaultDate),
    );
  }, [open, activity, defaultDate]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function toggleDepartment(id: Id<"departments">) {
    setForm((prev) => ({
      ...prev,
      departmentIds: prev.departmentIds.includes(id)
        ? prev.departmentIds.filter((d) => d !== id)
        : [...prev.departmentIds, id],
    }));
  }

  async function submit() {
    setError(null);
    if (!form.title.trim()) {
      setError("Title is required.");
      return;
    }
    if (!form.targetDate) {
      setError("Target date is required.");
      return;
    }
    if (form.departmentIds.length === 0) {
      setError("Pick at least one responsible area of service.");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        targetDate: fromDateInput(form.targetDate),
        departmentIds: form.departmentIds,
        status: form.status,
      };
      if (activity) {
        await updateActivity({ activityId: activity.activityId, ...payload });
      } else {
        await createActivity(payload);
      }
      onOpenChange(false);
    } catch (mutationError) {
      setError(errorMessage(mutationError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{activity ? "Edit activity" : "Add activity"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-5">
          <Field label="Title" htmlFor="activity-title">
            <Input
              id="activity-title"
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="Building fund drive"
            />
          </Field>
          <Field label="Description" htmlFor="activity-desc">
            <Textarea
              id="activity-desc"
              rows={3}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="What this activity involves (optional)"
            />
          </Field>
          <Field label="Target date" htmlFor="activity-date">
            <Input
              id="activity-date"
              type="date"
              value={form.targetDate}
              onChange={(e) => set("targetDate", e.target.value)}
            />
          </Field>
          <Field label="Responsible area(s) of service">
            <div className="flex flex-wrap gap-2">
              {departments === undefined ? (
                <span className="font-body text-sm text-outline">Loading…</span>
              ) : (
                departments.map((dept) => (
                  <FilterChip
                    key={dept._id}
                    selected={form.departmentIds.includes(dept._id)}
                    onClick={() => toggleDepartment(dept._id)}
                  >
                    {dept.name}
                  </FilterChip>
                ))
              )}
            </div>
          </Field>
          <Field label="Status" htmlFor="activity-status">
            <Select
              value={form.status}
              onValueChange={(value) => set("status", value as Status)}
            >
              <SelectTrigger id="activity-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACTIVITY_STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {error && <p className="font-body text-sm text-error">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => !busy && onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" loading={busy} onClick={submit}>
            {activity ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
