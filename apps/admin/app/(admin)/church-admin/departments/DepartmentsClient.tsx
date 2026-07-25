"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { Plus, Pencil, Archive } from "lucide-react";
import { useAuthQuery } from "@/lib/useAuthQuery";
import { api } from "@/lib/api";
import type { Id } from "@/lib/api";
import { Card, Button, Input, Dialog } from "../ui";
import { errorMessage } from "../verification/shared";

type Department = {
  _id: Id<"departments">;
  name: string;
  description?: string;
};

export function DepartmentsClient() {
  const router = useRouter();
  const departments = useAuthQuery(api.departments.listActiveDepartments);
  const createDepartment = useMutation(api.departments.createDepartment);
  const updateDepartment = useMutation(api.departments.updateDepartment);
  const toggleDepartmentActive = useMutation(
    api.departments.toggleDepartmentActive,
  );

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Department | null>(null);
  const [deactivating, setDeactivating] = useState<Department | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openCreate() {
    setName("");
    setDescription("");
    setError(null);
    setCreateOpen(true);
  }

  function openEdit(dept: Department) {
    setEditing(dept);
    setName(dept.name);
    setDescription(dept.description ?? "");
    setError(null);
  }

  async function handleCreate() {
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createDepartment({
        name: name.trim(),
        description: description.trim() || undefined,
      });
      setCreateOpen(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdate() {
    if (!editing) return;
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await updateDepartment({
        departmentId: editing._id,
        name: name.trim(),
        description: description.trim() || undefined,
      });
      setEditing(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleDeactivate() {
    if (!deactivating) return;
    setBusy(true);
    setError(null);
    try {
      await toggleDepartmentActive({
        departmentId: deactivating._id,
        active: false,
      });
      setDeactivating(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-2xl font-semibold">Departments</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage active departments members can belong to.
          </p>
        </div>
        <Button onClick={openCreate} className="gap-1.5">
          <Plus className="h-4 w-4" />
          New Department
        </Button>
      </div>

      <Card className="overflow-hidden p-0">
        {departments === undefined && (
          <div className="flex flex-col gap-px">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse bg-muted" />
            ))}
          </div>
        )}

        {departments?.length === 0 && (
          <p className="p-8 text-center text-sm text-muted-foreground">
            No active departments yet. Create the first one.
          </p>
        )}

        {departments?.map((dept, i) => (
          <div
            key={dept._id}
            role="button"
            tabIndex={0}
            onClick={() => router.push(`/church-admin/departments/${dept._id}`)}
            className={`flex cursor-pointer items-center justify-between p-4 transition-colors hover:bg-muted/40 ${
              i > 0 ? "border-t border-border" : ""
            }`}
          >
            <div>
              <p className="text-sm font-medium">{dept.name}</p>
              {dept.description && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {dept.description}
                </p>
              )}
            </div>
            <div
              className="flex items-center gap-2"
              onClick={(e) => e.stopPropagation()}
            >
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => openEdit(dept)}
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="gap-1.5"
                onClick={() => setDeactivating(dept)}
              >
                <Archive className="h-3.5 w-3.5" />
                Deactivate
              </Button>
            </div>
          </div>
        ))}
      </Card>

      {/* Create */}
      <Dialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="New Department"
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => setCreateOpen(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={busy}>
              {busy ? "Creating…" : "Create"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Input
            placeholder="Department name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
      </Dialog>

      {/* Edit */}
      <Dialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        title="Edit Department"
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => setEditing(null)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button onClick={handleUpdate} disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Input
            placeholder="Department name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
      </Dialog>

      {/* Deactivate confirm */}
      <Dialog
        open={deactivating !== null}
        onOpenChange={(open) => !open && setDeactivating(null)}
        title="Deactivate this department?"
        description={
          <>
            {deactivating?.name} will be hidden from the active list.
            There&apos;s currently no way to view or reactivate deactivated
            departments from this screen — this action can only be undone
            directly in the Convex dashboard.
          </>
        }
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => setDeactivating(null)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeactivate}
              disabled={busy}
            >
              {busy ? "Deactivating…" : "Deactivate"}
            </Button>
          </>
        }
      />
    </div>
  );
}
