"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { KeyRound, Plus } from "lucide-react";
import {
  RE_SPACE_STATUSES,
  RE_SPACE_STATUS_LABELS,
  formatSpacePrice,
  formatSpaceSize,
  type RealEstateSpaceStatus,
} from "@klt-cyber/shared";

import { api, type Id } from "@/lib/api";
import { useAuthQuery } from "@/lib/useAuthQuery";
import { Badge } from "@/components/shadcn/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/shadcn/select";
import { ActionButton } from "@/components/ui/ActionButton";
import { Button } from "@/components/ui/Button";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { FilterBar, SegmentedFilter } from "@/components/ui/FilterBar";
import { Heading } from "@/components/ui/Heading";
import { SpaceDialog } from "./SpaceDialog";
import { realEstateError } from "./realEstateErrors";

type SpaceRow = {
  _id: Id<"realEstateSpaces">;
  title: string;
  floorId: Id<"realEstateFloors">;
  floorName?: string;
  floorHidden: boolean;
  sizeSqm?: number;
  priceUgxPerMonth?: number;
  status: RealEstateSpaceStatus;
  coverUrl?: string;
  photoCount: number;
  contactPhone?: string;
  contactWhatsapp?: string;
  createdAt: number;
};

/** The status badge tones, so "let" reads as retired rather than as an error. */
const STATUS_VARIANT: Record<
  RealEstateSpaceStatus,
  "verified" | "pending" | "neutral"
> = {
  available: "verified",
  reserved: "pending",
  let: "neutral",
};

/**
 * Spaces to let (spec 0018, AC-15, AC-16).
 *
 * A `let` space stays on this page rather than disappearing, marked "Let", so
 * it can be flipped back to available later without anyone retyping it. Only
 * the app hides it.
 *
 * The status control is a plain select rather than three buttons, because all
 * six transitions are legal and a select says that more honestly than a row of
 * buttons where two are always disabled.
 */
export function SpacesPage() {
  const spaces = useAuthQuery(api.realEstate.listSpacesForPortal, {});
  const setSpaceStatus = useMutation(api.realEstate.setSpaceStatus);
  const removeSpace = useMutation(api.realEstate.removeSpace);

  const [filter, setFilter] = useState<"all" | RealEstateSpaceStatus>("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<
    Id<"realEstateSpaces"> | undefined
  >();

  const loading = spaces === undefined;
  const failed = spaces === null;

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

  const rows = ((spaces ?? []) as SpaceRow[]).filter(
    (row) => filter === "all" || row.status === filter,
  );

  const columns: Column<SpaceRow>[] = [
    {
      key: "title",
      header: "Space",
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
              {row.title}
            </p>
            <p className="truncate font-body text-xs text-on-surface-variant">
              {row.floorName ?? "Floor missing"}
              {row.sizeSqm !== undefined && ` · ${formatSpaceSize(row.sizeSqm)}`}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: "price",
      header: "Rent",
      render: (row) => (
        // Mono, because this is a figure: INTERFACE_SPEC reserves Spline Sans
        // Mono for amounts, counts and references.
        <span className="font-mono text-sm text-on-surface">
          {formatSpacePrice(row.priceUgxPerMonth)}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <div className="flex flex-col gap-1">
          <Badge variant={STATUS_VARIANT[row.status]}>
            {RE_SPACE_STATUS_LABELS[row.status]}
          </Badge>
          {row.floorHidden && row.status !== "let" && (
            <span className="font-body text-xs text-on-surface-variant">
              Floor hidden, so out of the app
            </span>
          )}
        </div>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (row) => (
        <div className="flex items-center justify-end gap-2">
          <Select
            value={row.status}
            disabled={busy}
            onValueChange={(next) =>
              void run(() =>
                setSpaceStatus({ spaceId: row._id, status: next }),
              )
            }
          >
            <SelectTrigger
              className="h-8 w-32"
              aria-label={`Change the status of ${row.title}`}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RE_SPACE_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {RE_SPACE_STATUS_LABELS[status]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
            variant="danger"
            disabled={busy}
            onClick={() => {
              if (
                !window.confirm(
                  `Remove ${row.title}? Its photos are deleted and this cannot be undone.`,
                )
              ) {
                return;
              }
              void run(() => removeSpace({ spaceId: row._id }));
            }}
          >
            Remove
          </ActionButton>
        </div>
      ),
    },
  ];

  if (failed) {
    return (
      <div className="space-y-6">
        <Heading as="h1" size="xl">
          Spaces to let
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
            Spaces to let
          </Heading>
          <p className="font-body text-sm text-on-surface-variant">
            Available and reserved spaces appear in the app. A let one leaves it
            and stays here.
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
          List a space
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

      <FilterBar
        showClear={filter !== "all"}
        onClearAll={() => setFilter("all")}
      >
        <SegmentedFilter
          ariaLabel="Filter by status"
          value={filter}
          onChange={(next) => setFilter(next as "all" | RealEstateSpaceStatus)}
          options={[
            { value: "all", label: "All" },
            ...RE_SPACE_STATUSES.map((status) => ({
              value: status,
              label: RE_SPACE_STATUS_LABELS[status],
            })),
          ]}
        />
      </FilterBar>

      <DataTable
        columns={columns}
        rows={loading ? undefined : rows}
        rowKey={(row) => row._id}
        skeletonRows={4}
        empty={
          <EmptyState
            icon={<KeyRound className="h-5 w-5" aria-hidden />}
            title={
              filter === "all" ? "No spaces listed yet" : "None with that status"
            }
            message={
              filter === "all"
                ? "List a space with its floor, size and photos. It appears in the app straight away unless you mark it let."
                : "Try another status, or clear the filter."
            }
          />
        }
      />

      <SpaceDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        spaceId={editingId}
      />
    </div>
  );
}
