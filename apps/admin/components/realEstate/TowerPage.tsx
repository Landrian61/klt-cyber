"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { Building2, ChevronDown, ChevronUp, Plus } from "lucide-react";
import {
  RE_FLOOR_NAME_MAX_LENGTH,
  RE_HIDDEN_REASON_HINTS,
  RE_HIDDEN_REASON_LABELS,
  normalizeFloorName,
  type RealEstateHiddenReason,
} from "@klt-cyber/shared";

import { api, type Id } from "@/lib/api";
import { useAuthQuery } from "@/lib/useAuthQuery";
import { Badge } from "@/components/shadcn/badge";
import { Input } from "@/components/shadcn/input";
import { Reveal } from "@/components/motion/Reveal";
import { ActionButton } from "@/components/ui/ActionButton";
import { Button } from "@/components/ui/Button";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Heading } from "@/components/ui/Heading";
import { FacilityDialog } from "./FacilityDialog";
import { realEstateError } from "./realEstateErrors";

type FacilityRow = {
  _id: Id<"facilities">;
  name: string;
  tagline?: string;
  floorId?: Id<"realEstateFloors">;
  floorName?: string;
  order?: number;
  active: boolean;
  coverUrl?: string;
  photoCount: number;
  hasOpeningHours: boolean;
  contactPhone?: string;
  contactWhatsapp?: string;
  hiddenReason: RealEstateHiddenReason | null;
};

/**
 * The Tower of Faith: the building's floors and what sits on each (spec 0018).
 *
 * The organising idea is that NOTHING is invisible to the team. The member app
 * shows only what is finished; this page shows everything, each row carrying
 * the one reason it is not in the app yet, so finishing the Tower is a visible
 * list of jobs rather than a hunt.
 *
 * Reordering is up and down buttons rather than drag and drop, because this
 * portal has no drag library and adding one for a handful of rows per floor
 * would be a dependency doing very little work. The buttons also keep the
 * whole thing usable from a keyboard, which a bare drag surface would not.
 */
export function TowerPage() {
  const floors = useAuthQuery(api.realEstate.listFloors, {});
  const groups = useAuthQuery(api.facilities.listForPortal, {});

  const createFloor = useMutation(api.realEstate.createFloor);
  const renameFloor = useMutation(api.realEstate.renameFloor);
  const reorderFloors = useMutation(api.realEstate.reorderFloors);
  const setFloorHidden = useMutation(api.realEstate.setFloorHidden);
  const deleteFloor = useMutation(api.realEstate.deleteFloor);
  const reorderFacilities = useMutation(api.facilities.reorderFacilities);
  const setFacilityHidden = useMutation(api.facilities.setFacilityHidden);
  const removeFacility = useMutation(api.facilities.removeFacility);

  const [newFloorName, setNewFloorName] = useState("");
  const [renamingId, setRenamingId] = useState<Id<"realEstateFloors"> | null>(
    null,
  );
  const [renameValue, setRenameValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<Id<"facilities"> | undefined>();

  const loading = floors === undefined || groups === undefined;
  const failed = floors === null || groups === null;

  /** Run one mutation, surfacing its refusal as a sentence. */
  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(realEstateError(caught));
    } finally {
      setBusy(false);
    }
  }

  const duplicateName =
    newFloorName.trim().length > 0 &&
    (floors ?? []).some(
      (floor) => normalizeFloorName(floor.name) === normalizeFloorName(newFloorName),
    );

  function moveFloor(index: number, delta: number) {
    const current = floors ?? [];
    const target = index + delta;
    if (target < 0 || target >= current.length) return;
    const ids = current.map((floor) => floor._id);
    const [moved] = ids.splice(index, 1);
    ids.splice(target, 0, moved);
    void run(() => reorderFloors({ orderedIds: ids }));
  }

  function moveFacility(
    floorId: Id<"realEstateFloors">,
    rows: FacilityRow[],
    index: number,
    delta: number,
  ) {
    const target = index + delta;
    if (target < 0 || target >= rows.length) return;
    const ids = rows.map((row) => row._id);
    const [moved] = ids.splice(index, 1);
    ids.splice(target, 0, moved);
    void run(() => reorderFacilities({ floorId, orderedIds: ids }));
  }

  const columns = (
    floorId: Id<"realEstateFloors"> | null,
    rows: FacilityRow[],
  ): Column<FacilityRow>[] => [
    {
      key: "name",
      header: "Facility",
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md bg-surface-low">
            {row.coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={row.coverUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : null}
          </div>
          <div className="min-w-0">
            <p className="truncate font-body text-sm font-medium text-on-surface">
              {row.name}
            </p>
            {row.tagline && (
              <p className="truncate font-body text-xs text-on-surface-variant">
                {row.tagline}
              </p>
            )}
          </div>
        </div>
      ),
    },
    {
      key: "state",
      header: "In the app",
      render: (row) =>
        row.hiddenReason ? (
          <span
            className="inline-flex flex-col gap-0.5"
            title={RE_HIDDEN_REASON_HINTS[row.hiddenReason]}
          >
            <Badge variant="pending">
              {RE_HIDDEN_REASON_LABELS[row.hiddenReason]}
            </Badge>
          </span>
        ) : (
          <Badge variant="verified">Live</Badge>
        ),
    },
    {
      key: "detail",
      header: "Filled in",
      render: (row) => (
        <span className="font-body text-xs text-on-surface-variant">
          {row.photoCount > 0
            ? `${row.photoCount} ${row.photoCount === 1 ? "photo" : "photos"}`
            : "No photos"}
          {" · "}
          {row.hasOpeningHours ? "Hours set" : "No hours"}
          {" · "}
          {row.contactPhone || row.contactWhatsapp ? "Contact set" : "No contact"}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (row) => {
        const index = rows.findIndex((candidate) => candidate._id === row._id);
        return (
          <div className="flex items-center justify-end gap-1">
            {floorId && rows.length > 1 && (
              <>
                <ActionButton
                  variant="neutral"
                  disabled={busy || index === 0}
                  aria-label={`Move ${row.name} up`}
                  onClick={() => moveFacility(floorId, rows, index, -1)}
                >
                  <ChevronUp className="h-3.5 w-3.5" aria-hidden />
                </ActionButton>
                <ActionButton
                  variant="neutral"
                  disabled={busy || index === rows.length - 1}
                  aria-label={`Move ${row.name} down`}
                  onClick={() => moveFacility(floorId, rows, index, 1)}
                >
                  <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                </ActionButton>
              </>
            )}
            <ActionButton
              variant="gold"
              disabled={busy}
              onClick={() => {
                setEditingId(row._id);
                setDialogOpen(true);
              }}
            >
              Edit
            </ActionButton>
            <ActionButton
              variant="neutral"
              disabled={busy}
              onClick={() =>
                void run(() =>
                  setFacilityHidden({
                    facilityId: row._id,
                    hidden: row.active,
                  }),
                )
              }
            >
              {row.active ? "Hide" : "Unhide"}
            </ActionButton>
            <ActionButton
              variant="danger"
              disabled={busy}
              onClick={() => {
                if (
                  !window.confirm(
                    `Remove ${row.name}? Its photos are deleted and this cannot be undone.`,
                  )
                ) {
                  return;
                }
                void run(() => removeFacility({ facilityId: row._id }));
              }}
            >
              Remove
            </ActionButton>
          </div>
        );
      },
    },
  ];

  if (failed) {
    return (
      <div className="space-y-6">
        <Heading as="h1" size="xl">
          Tower of Faith
        </Heading>
        <ErrorState retry={() => window.location.reload()} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Heading as="h1" size="xl">
            Tower of Faith
          </Heading>
          <p className="font-body text-sm text-on-surface-variant">
            Organise the building into floors, then put each facility on one.
          </p>
        </div>
        <Button
          variant="primary"
          disabled={busy}
          onClick={() => {
            setEditingId(undefined);
            setDialogOpen(true);
          }}
        >
          <Plus className="h-4 w-4" aria-hidden />
          Add facility
        </Button>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-lg bg-error-light px-3 py-2 font-body text-sm text-error"
        >
          {error}
        </p>
      )}

      {/* Floors */}
      <Reveal as="section" className="space-y-3">
        <Heading as="h2" size="lg">
          Floors
        </Heading>

        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-56 flex-1">
            <Input
              aria-label="New floor name"
              value={newFloorName}
              maxLength={RE_FLOOR_NAME_MAX_LENGTH}
              placeholder="Ground Floor"
              onChange={(event) => setNewFloorName(event.target.value)}
            />
          </div>
          <Button
            variant="secondary"
            disabled={busy || newFloorName.trim().length === 0 || duplicateName}
            onClick={() =>
              void run(async () => {
                await createFloor({ name: newFloorName });
                setNewFloorName("");
              })
            }
          >
            Add floor
          </Button>
        </div>
        {duplicateName && (
          <p className="font-body text-xs text-error">
            A floor with that name already exists.
          </p>
        )}

        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((key) => (
              <div
                key={key}
                className="h-11 animate-pulse rounded-lg bg-surface-low"
              />
            ))}
          </div>
        ) : (floors ?? []).length === 0 ? (
          <EmptyState
            icon={<Building2 className="h-5 w-5" aria-hidden />}
            title="No floors yet"
            message="Add the Tower's floors in the order someone walks them, from the ground up. Facilities and spaces are then placed on a floor."
          />
        ) : (
          <ul className="space-y-2">
            {(floors ?? []).map((floor, index) => (
              <li
                key={floor._id}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-surface-lowest px-3 py-2 shadow-e1"
              >
                {renamingId === floor._id ? (
                  <>
                    <Input
                      aria-label={`Rename ${floor.name}`}
                      className="max-w-56"
                      value={renameValue}
                      maxLength={RE_FLOOR_NAME_MAX_LENGTH}
                      onChange={(event) => setRenameValue(event.target.value)}
                    />
                    <ActionButton
                      variant="gold"
                      disabled={busy || renameValue.trim().length === 0}
                      onClick={() =>
                        void run(async () => {
                          await renameFloor({
                            floorId: floor._id,
                            name: renameValue,
                          });
                          setRenamingId(null);
                        })
                      }
                    >
                      Save
                    </ActionButton>
                    <ActionButton
                      variant="neutral"
                      disabled={busy}
                      onClick={() => setRenamingId(null)}
                    >
                      Cancel
                    </ActionButton>
                  </>
                ) : (
                  <>
                    <span className="font-body text-sm font-medium text-on-surface">
                      {floor.name}
                    </span>
                    {floor.hidden && <Badge variant="pending">Hidden</Badge>}
                    <span className="font-body text-xs text-on-surface-variant">
                      {floor.facilityCount}{" "}
                      {floor.facilityCount === 1 ? "facility" : "facilities"}
                      {" · "}
                      {floor.spaceCount}{" "}
                      {floor.spaceCount === 1 ? "space" : "spaces"}
                    </span>

                    <div className="ml-auto flex items-center gap-1">
                      <ActionButton
                        variant="neutral"
                        disabled={busy || index === 0}
                        aria-label={`Move ${floor.name} up`}
                        onClick={() => moveFloor(index, -1)}
                      >
                        <ChevronUp className="h-3.5 w-3.5" aria-hidden />
                      </ActionButton>
                      <ActionButton
                        variant="neutral"
                        disabled={busy || index === (floors ?? []).length - 1}
                        aria-label={`Move ${floor.name} down`}
                        onClick={() => moveFloor(index, 1)}
                      >
                        <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                      </ActionButton>
                      <ActionButton
                        variant="neutral"
                        disabled={busy}
                        onClick={() => {
                          setRenamingId(floor._id);
                          setRenameValue(floor.name);
                        }}
                      >
                        Rename
                      </ActionButton>
                      <ActionButton
                        variant="neutral"
                        disabled={busy}
                        onClick={() =>
                          void run(() =>
                            setFloorHidden({
                              floorId: floor._id,
                              hidden: !floor.hidden,
                            }),
                          )
                        }
                      >
                        {floor.hidden ? "Unhide" : "Hide"}
                      </ActionButton>
                      <ActionButton
                        variant="danger"
                        disabled={busy}
                        onClick={() => {
                          if (
                            !window.confirm(
                              `Delete ${floor.name}? Only an empty floor can be deleted.`,
                            )
                          ) {
                            return;
                          }
                          void run(() => deleteFloor({ floorId: floor._id }));
                        }}
                      >
                        Delete
                      </ActionButton>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </Reveal>

      {/* Facilities, grouped by floor */}
      <section className="space-y-5">
        <Heading as="h2" size="lg">
          Facilities
        </Heading>

        {loading ? (
          <DataTable
            columns={columns(null, [])}
            rows={undefined}
            rowKey={(row) => row._id}
            skeletonRows={4}
          />
        ) : (groups ?? []).length === 0 ? (
          <EmptyState
            icon={<Building2 className="h-5 w-5" aria-hidden />}
            title="No facilities yet"
            message="Add a facility and place it on a floor. It reaches the app once it has a floor and at least one contact number."
          />
        ) : (
          (groups ?? []).map((group) => {
            const rows = group.facilities as FacilityRow[];
            return (
              <div key={group.floorId ?? "unplaced"} className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Heading as="h3" size="lg">
                    {group.floorName}
                  </Heading>
                  {group.floorHidden && <Badge variant="pending">Hidden</Badge>}
                  {group.floorId === null && (
                    <span className="font-body text-xs text-on-surface-variant">
                      Put these on a floor and they can appear in the app.
                    </span>
                  )}
                </div>
                <DataTable
                  columns={columns(group.floorId, rows)}
                  rows={rows}
                  rowKey={(row) => row._id}
                  empty={
                    <EmptyState
                      title="Nothing on this floor yet"
                      message="Add a facility and choose this floor."
                    />
                  }
                />
              </div>
            );
          })
        )}
      </section>

      <FacilityDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        facilityId={editingId}
      />
    </div>
  );
}
