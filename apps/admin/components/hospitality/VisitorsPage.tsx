"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Plus, UserRound } from "lucide-react";
import {
  AGE_BRACKETS,
  SEX,
  VISITOR_AGE_BRACKET_LABELS,
  VISITOR_KIND_LABELS,
  VISITOR_KINDS,
  VISITOR_SEX_LABELS,
  VISIT_COUNT_BUCKETS,
  VISIT_COUNT_BUCKET_LABELS,
  IN_APP_MESSAGE_MAX_RECIPIENTS,
  kampalaToday,
  type AgeBracket,
  type FollowUpStatus,
  type Sex,
  type VisitCountBucket,
  type VisitorKind,
} from "@klt-cyber/shared";

import { api, type Id } from "@/lib/api";
import { useAuthPaginatedQuery } from "@/lib/useAuthPaginatedQuery";
import { Badge } from "@/components/shadcn/badge";
import { Checkbox } from "@/components/shadcn/checkbox";
import { Label } from "@/components/shadcn/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/shadcn/select";
import { Button } from "@/components/ui/Button";
import { type Column } from "@/components/ui/DataTable";
import { DatePicker } from "@/components/ui/DatePicker";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterBar, SegmentedFilter } from "@/components/ui/FilterBar";
import { Heading } from "@/components/ui/Heading";
import { ResponsiveTable, RowCard } from "@/components/ui/ResponsiveTable";
import { SearchInput } from "@/components/ui/SearchInput";
import { AddWalkInDialog } from "./AddWalkInDialog";
import { NotYetMembersList } from "./NotYetMembersList";
import { SendAppLinkButton } from "./SendAppLink";
import { SendInAppMessageDialog } from "./SendInAppMessageDialog";
import { formatDateKey, keyToMs, msToKey } from "./hospitalityErrors";

type VisitorRow = {
  _id: Id<"visitors">;
  displayName: string;
  kind: VisitorKind;
  visitCount: number;
  firstVisitDate?: string;
  lastVisitDate?: string;
  isFirstTimer: boolean;
  isRegular: boolean;
  followUpStatus: FollowUpStatus | null;
  contactAllowed: boolean;
  canInvite: boolean;
  canMessage: boolean;
  firstName: string;
  invitePhone?: string;
};

type View = "visitors" | "not_yet_members";

const PAGE_SIZE = 25;
/** "Any", the resting value of every filter select. */
const ANY = "any";
const NOT_RECORDED = "none";

const FOLLOW_UP_LABEL: Record<FollowUpStatus, string> = {
  open: "Follow up open",
  done: "Followed up",
};

interface Filters {
  kind: string;
  visitBucket: string;
  sex: string;
  ageBracket: string;
  followUp: string;
  regular: string;
  firstFrom?: string;
  firstTo?: string;
}

const NO_FILTERS: Filters = {
  kind: ANY,
  visitBucket: ANY,
  sex: ANY,
  ageBracket: ANY,
  followUp: ANY,
  regular: ANY,
};

function isFiltered(filters: Filters): boolean {
  return (
    Object.entries(NO_FILTERS).some(
      ([key, value]) => filters[key as keyof Filters] !== value,
    ) ||
    filters.firstFrom !== undefined ||
    filters.firstTo !== undefined
  );
}

/** The filter state as `listVisitors` arguments: "any" means left out. */
function toArgs(filters: Filters) {
  const pick = <T extends string>(value: string) =>
    value === ANY ? undefined : (value as T);
  return {
    kind: pick<VisitorKind>(filters.kind),
    visitBucket: pick<VisitCountBucket>(filters.visitBucket),
    sex: pick<Sex | "none">(filters.sex),
    ageBracket: pick<AgeBracket | "none">(filters.ageBracket),
    followUp: pick<"open" | "done" | "none">(filters.followUp),
    regular: filters.regular === ANY ? undefined : filters.regular === "yes",
    firstFrom: filters.firstFrom,
    firstTo: filters.firstTo,
  };
}

/** First timer and regular, the two flags the team acts on (AC-9). */
function Flags({ row }: { row: VisitorRow }) {
  if (!row.isFirstTimer && !row.isRegular) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {row.isFirstTimer && <Badge variant="member">First timer</Badge>}
      {row.isRegular && <Badge variant="role">Regular</Badge>}
    </div>
  );
}

function FollowUpBadge({ status }: { status: FollowUpStatus | null }) {
  if (!status) {
    return (
      <span className="font-body text-xs text-on-surface-variant">None</span>
    );
  }
  return (
    <Badge variant={status === "open" ? "pending" : "verified"}>
      {FOLLOW_UP_LABEL[status]}
    </Badge>
  );
}

/** One labelled filter select, with "Any" first. */
function FilterSelect({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="min-w-0 space-y-1">
      <Label htmlFor={id} className="font-body text-xs text-on-surface-variant">
        {label}
      </Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>Any</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/**
 * Visitors (spec 0024, AC-9 to AC-11).
 *
 * Every active visitor, walk in and app alike, in one list, newest visit
 * first, searchable and filterable. Most filters run after the server reads a
 * page, so a page can come back short; this keeps asking for the next page
 * until it has a page's worth or the list runs out (AC-11). Each row opens
 * the visitor's record.
 */
export function VisitorsPage() {
  const router = useRouter();
  const { slug } = useParams<{ slug: string }>();
  const base = `/areas-of-service/${slug}/visitors`;

  // The browser's Kampala day: it only decides the regular flag, and keeping
  // the clock out of the server query keeps the subscription deterministic.
  const today = kampalaToday();
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [adding, setAdding] = useState(false);
  const [view, setView] = useState<View>("visitors");
  // App visitors chosen for an in app message (AC-21), kept across pages.
  const [selected, setSelected] = useState<Map<Id<"visitors">, string>>(
    new Map(),
  );
  const [messaging, setMessaging] = useState(false);
  const full = selected.size >= IN_APP_MESSAGE_MAX_RECIPIENTS;
  const toggle = (row: VisitorRow) =>
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(row._id)) next.delete(row._id);
      else if (next.size < IN_APP_MESSAGE_MAX_RECIPIENTS)
        next.set(row._id, row.displayName);
      return next;
    });

  /** The choose box, only on rows with an app account. */
  const selectBox = (row: VisitorRow) =>
    row.canMessage ? (
      <span
        onClick={(event) => event.stopPropagation()}
        className="inline-flex"
      >
        <Checkbox
          checked={selected.has(row._id)}
          disabled={!selected.has(row._id) && full}
          onCheckedChange={() => toggle(row)}
          aria-label={`Choose ${row.displayName} for an in app message`}
        />
      </span>
    ) : null;

  const args = useMemo(
    () => ({ today, search: search.trim() || undefined, ...toArgs(filters) }),
    [today, search, filters],
  );
  const { results, status, loadMore } = useAuthPaginatedQuery(
    api.hospitality.listVisitors,
    args,
    { initialNumItems: PAGE_SIZE },
  );

  // How many rows the reader has asked to see. A short page (filters ran
  // after the read) keeps loading until this many arrive or nothing is left.
  const [target, setTarget] = useState(PAGE_SIZE);
  const argsKey = JSON.stringify(args);
  useEffect(() => setTarget(PAGE_SIZE), [argsKey]);
  useEffect(() => {
    if (status === "CanLoadMore" && results.length < target)
      loadMore(PAGE_SIZE);
  }, [status, results.length, target, loadMore]);

  const loading = status === "LoadingFirstPage";
  const rows = loading ? undefined : (results as VisitorRow[]);
  const filtered = isFiltered(filters) || search.trim() !== "";
  const update = (patch: Partial<Filters>) =>
    setFilters((prev) => ({ ...prev, ...patch }));

  /** "Send app link", for a walk in with no account and a phone (AC-29). */
  const inviteButton = (row: VisitorRow) =>
    row.invitePhone ? (
      <SendAppLinkButton
        visitorId={row._id}
        firstName={row.firstName}
        phone={row.invitePhone}
      />
    ) : null;

  const columns: Column<VisitorRow>[] = [
    { key: "select", header: "", render: selectBox },
    {
      key: "name",
      header: "Visitor",
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-body text-sm font-medium text-on-surface">
            {row.displayName}
          </p>
          <p className="font-body text-xs text-on-surface-variant">
            {VISITOR_KIND_LABELS[row.kind]}
          </p>
        </div>
      ),
    },
    {
      key: "visits",
      header: "Visits",
      align: "right",
      // Mono: a count (INTERFACE_SPEC numerals rule).
      render: (row) => (
        <span className="font-mono text-sm text-on-surface">
          {row.visitCount}
        </span>
      ),
    },
    {
      key: "first",
      header: "First visit",
      render: (row) => (
        <span className="font-mono text-sm text-on-surface-variant">
          {formatDateKey(row.firstVisitDate)}
        </span>
      ),
    },
    {
      key: "last",
      header: "Last visit",
      render: (row) => (
        <span className="font-mono text-sm text-on-surface-variant">
          {formatDateKey(row.lastVisitDate)}
        </span>
      ),
    },
    { key: "flags", header: "", render: (row) => <Flags row={row} /> },
    {
      key: "followUp",
      header: "Follow up",
      render: (row) => <FollowUpBadge status={row.followUpStatus} />,
    },
    { key: "invite", header: "", render: (row) => inviteButton(row) },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <Heading as="h1" size="xl">
            Visitors
          </Heading>
          <p className="font-body text-sm text-on-surface-variant">
            Everyone who has visited, from the welcome desk or the app.
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4" aria-hidden />
          Add a walk in
        </Button>
      </div>

      <SegmentedFilter
        ariaLabel="Which list"
        value={view}
        onChange={(value) => {
          // The search box remounts empty, so the term it fed goes too.
          setSearch("");
          setView(value as View);
        }}
        options={[
          { value: "visitors", label: "All visitors" },
          { value: "not_yet_members", label: "Not yet a member" },
        ]}
      />

      {view === "not_yet_members" ? (
        <NotYetMembersList base={base} />
      ) : (
      <>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <SearchInput
            className="min-w-0 flex-1 basis-60"
            placeholder="Search by name or email"
            onDebouncedChange={setSearch}
          />
          <FilterBar
            showClear={isFiltered(filters)}
            onClearAll={() => setFilters(NO_FILTERS)}
          >
            <Button
              variant="secondary"
              size="sm"
              aria-expanded={showFilters}
              aria-controls="visitor-filters"
              onClick={() => setShowFilters((open) => !open)}
            >
              {showFilters ? "Hide filters" : "Filters"}
            </Button>
          </FilterBar>
        </div>

        {showFilters && (
          <div
            id="visitor-filters"
            className="grid grid-cols-1 gap-3 rounded-md bg-surface-low p-4 sm:grid-cols-2 lg:grid-cols-4"
          >
            <FilterSelect
              id="filter-kind"
              label="Came from"
              value={filters.kind}
              onChange={(kind) => update({ kind })}
              options={VISITOR_KINDS.map((kind) => ({
                value: kind,
                label: VISITOR_KIND_LABELS[kind],
              }))}
            />
            <FilterSelect
              id="filter-visits"
              label="Visits"
              value={filters.visitBucket}
              onChange={(visitBucket) => update({ visitBucket })}
              options={VISIT_COUNT_BUCKETS.map((bucket) => ({
                value: bucket,
                label: VISIT_COUNT_BUCKET_LABELS[bucket],
              }))}
            />
            <FilterSelect
              id="filter-regular"
              label="Regular"
              value={filters.regular}
              onChange={(regular) => update({ regular })}
              options={[
                { value: "yes", label: "Regulars only" },
                { value: "no", label: "Not regular" },
              ]}
            />
            <FilterSelect
              id="filter-follow-up"
              label="Follow up"
              value={filters.followUp}
              onChange={(followUp) => update({ followUp })}
              options={[
                { value: "open", label: "Open" },
                { value: "done", label: "Done" },
                { value: "none", label: "None" },
              ]}
            />
            <FilterSelect
              id="filter-sex"
              label="Sex"
              value={filters.sex}
              onChange={(sex) => update({ sex })}
              options={[
                ...SEX.map((sex) => ({
                  value: sex,
                  label: VISITOR_SEX_LABELS[sex],
                })),
                { value: NOT_RECORDED, label: "Not recorded" },
              ]}
            />
            <FilterSelect
              id="filter-age"
              label="Age group"
              value={filters.ageBracket}
              onChange={(ageBracket) => update({ ageBracket })}
              options={[
                ...AGE_BRACKETS.map((bracket) => ({
                  value: bracket,
                  label: VISITOR_AGE_BRACKET_LABELS[bracket],
                })),
                { value: NOT_RECORDED, label: "Not recorded" },
              ]}
            />
            <div className="min-w-0 space-y-1">
              <Label
                htmlFor="filter-first-from"
                className="font-body text-xs text-on-surface-variant"
              >
                First visit from
              </Label>
              <DatePicker
                id="filter-first-from"
                value={
                  filters.firstFrom ? keyToMs(filters.firstFrom) : undefined
                }
                onChange={(ms) =>
                  update({
                    firstFrom: ms === undefined ? undefined : msToKey(ms),
                  })
                }
                placeholder="Any date"
              />
            </div>
            <div className="min-w-0 space-y-1">
              <Label
                htmlFor="filter-first-to"
                className="font-body text-xs text-on-surface-variant"
              >
                First visit to
              </Label>
              <DatePicker
                id="filter-first-to"
                value={filters.firstTo ? keyToMs(filters.firstTo) : undefined}
                onChange={(ms) =>
                  update({
                    firstTo: ms === undefined ? undefined : msToKey(ms),
                  })
                }
                placeholder="Any date"
              />
            </div>
          </div>
        )}
      </div>

      {selected.size > 0 && (
        <div
          role="region"
          aria-label="Chosen app visitors"
          className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-primary-light px-4 py-3"
        >
          <p className="font-body text-sm text-on-surface">
            <span className="font-mono">{selected.size}</span> app{" "}
            {selected.size === 1 ? "visitor" : "visitors"} chosen
            {full && ` (the most one message can reach)`}
          </p>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelected(new Map())}
            >
              Clear
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setMessaging(true)}
            >
              Send in app message
            </Button>
          </div>
        </div>
      )}

      <ResponsiveTable<VisitorRow>
        columns={columns}
        rows={rows}
        rowKey={(row) => row._id}
        skeletonRows={6}
        onRowClick={(row) => router.push(`${base}/${row._id}`)}
        card={(row) => (
          <div className="flex items-start gap-3">
            {row.canMessage && <div className="pt-4">{selectBox(row)}</div>}
            <Link
              href={`${base}/${row._id}`}
              className="block min-w-0 flex-1 rounded-md"
            >
              <RowCard>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-body text-sm font-medium text-on-surface">
                      {row.displayName}
                    </p>
                    <p className="font-body text-xs text-on-surface-variant">
                      {VISITOR_KIND_LABELS[row.kind]} ·{" "}
                      <span className="font-mono">{row.visitCount}</span>{" "}
                      {row.visitCount === 1 ? "visit" : "visits"}
                    </p>
                  </div>
                  <FollowUpBadge status={row.followUpStatus} />
                </div>
                <p className="mt-2 font-body text-xs text-on-surface-variant">
                  Last visit{" "}
                  <span className="font-mono">
                    {formatDateKey(row.lastVisitDate)}
                  </span>
                </p>
                <div className="mt-2">
                  <Flags row={row} />
                </div>
              </RowCard>
            </Link>
            {row.invitePhone && (
              <div className="pt-3">{inviteButton(row)}</div>
            )}
          </div>
        )}
        empty={
          filtered ? (
            <EmptyState
              icon={<UserRound className="h-5 w-5" aria-hidden />}
              title="No visitors match"
              message="Try a different name, or clear some filters."
              action={
                isFiltered(filters) ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setFilters(NO_FILTERS)}
                  >
                    Clear filters
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <EmptyState
              icon={<UserRound className="h-5 w-5" aria-hidden />}
              title="No visitors yet"
              message="Add a walk in at the welcome desk. App sign ups appear here too."
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setAdding(true)}
                >
                  Add a walk in
                </Button>
              }
            />
          )
        }
      />

      {status === "CanLoadMore" && results.length >= target && (
        <div className="flex justify-center">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setTarget(results.length + PAGE_SIZE)}
          >
            Show more
          </Button>
        </div>
      )}
      {(status === "LoadingMore" ||
        (status === "CanLoadMore" && results.length < target)) && (
        <p
          className="text-center font-body text-sm text-on-surface-variant"
          aria-live="polite"
        >
          Loading more…
        </p>
      )}
      </>
      )}

      <SendInAppMessageDialog
        open={messaging}
        onOpenChange={setMessaging}
        visitorIds={[...selected.keys()]}
        onSent={() => setSelected(new Map())}
      />

      <AddWalkInDialog
        open={adding}
        onOpenChange={setAdding}
        onAdded={(visitorId) => router.push(`${base}/${visitorId}`)}
      />
    </div>
  );
}
