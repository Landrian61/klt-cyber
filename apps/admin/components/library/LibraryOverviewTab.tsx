"use client";

import Link from "next/link";
import { BookOpen, Download, EyeOff, Sparkles } from "lucide-react";
import {
  LIBRARY_ITEM_TYPE_LABELS,
  LIBRARY_LOW_STOCK_THRESHOLD,
} from "@klt-cyber/shared";
import { useAuthQuery } from "@/lib/useAuthQuery";
import { api } from "@/lib/api";
import { StatCard } from "@/components/ui/StatCard";
import { ErrorState } from "@/components/ui/ErrorState";
import { StatGridSkeleton } from "@/components/ui/Skeletons";
import { CountUp } from "@/components/motion/CountUp";
import { Reveal } from "@/components/motion/Reveal";
import { churchDateTimeLabel } from "@/lib/churchTime";
import { Panel, PanelEmpty, PanelLines } from "./libraryDashboardParts";

/**
 * Overview: the tab a fresh visit lands on (spec 0017, AC-2, AC-6, AC-7).
 *
 * The four cards SRS 4.13.3 names, plus how many live items are hidden from
 * members, so the difference between the catalogue total and what the
 * congregation can see is explainable rather than mysterious.
 *
 * Its query takes no argument and so stays cached across a minute tick: none
 * of these figures has a time window (AC-25).
 */
export function LibraryOverviewTab({ basePath }: { basePath: string }) {
  const overview = useAuthQuery(api.library.getLibraryOverview, {});

  if (overview === null) return <ErrorState />;

  return (
    <div className="space-y-6">
      {overview === undefined ? (
        <StatGridSkeleton count={3} />
      ) : (
        <Reveal
          as="section"
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
        >
          <StatCard
            label="Items in the catalogue"
            value={<CountUp value={overview.totalItems} />}
            hint="Hidden ones included — they are still on the shelf"
          />
          <StatCard
            label="Running low"
            value={<CountUp value={overview.lowStockCount} />}
            // The hint says in words that items at zero are counted here. The
            // Stock tab splits the same population into two disjoint figures,
            // and without this sentence the two tabs look like they
            // contradict each other (AC-6, AC-13).
            hint={
              overview.lowStockCount === 0
                ? "Nothing physical is low"
                : `Physical items at ${LIBRARY_LOW_STOCK_THRESHOLD} or fewer, including any at zero`
            }
            emphasized={overview.lowStockCount > 0}
          />
          <StatCard
            label="Hidden from members"
            value={<CountUp value={overview.hiddenCount} />}
            hint={
              overview.hiddenCount === 0
                ? "Everything you hold is visible in the app"
                : `${overview.totalItems - overview.hiddenCount} of ${overview.totalItems} are visible in the app`
            }
          />
        </Reveal>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel
          title="Recently added"
          icon={<BookOpen className="size-4" />}
          action={<PanelLink href={`${basePath}/catalogue`} />}
        >
          {overview === undefined ? (
            <PanelLines />
          ) : overview.recentAdditions.length === 0 ? (
            <PanelEmpty
              title="Nothing added yet"
              message="What you add to the catalogue shows up here."
            />
          ) : (
            <ul className="flex flex-col gap-3">
              {overview.recentAdditions.map((item) => (
                <li key={item._id} className="min-w-0">
                  <p className="truncate font-body text-sm font-semibold text-on-surface">
                    {item.title}
                  </p>
                  <p className="font-body text-xs text-on-surface-variant">
                    {LIBRARY_ITEM_TYPE_LABELS[item.itemType]} ·{" "}
                    <span className="font-mono">
                      {churchDateTimeLabel(item.createdAt).split(",")[0]}
                    </span>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title="Free to read and listen"
          icon={<Download className="size-4" />}
          action={<PanelLink href={`${basePath}/free-content`} />}
        >
          {overview === undefined ? (
            <PanelLines />
          ) : overview.freeHighlights.length === 0 ? (
            <PanelEmpty
              title="No free content yet"
              message="Upload a teaching PDF or a recording and it opens in the app."
            />
          ) : (
            <ul className="flex flex-col gap-3">
              {overview.freeHighlights.map((item) => (
                <li key={item._id} className="flex min-w-0 items-center gap-3">
                  {item.coverImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.coverImageUrl}
                      alt=""
                      className="size-9 shrink-0 rounded-md object-cover"
                    />
                  ) : (
                    <span className="size-9 shrink-0 rounded-md bg-surface-low" />
                  )}
                  <span className="min-w-0">
                    <span className="block truncate font-body text-sm font-semibold text-on-surface">
                      {item.title}
                    </span>
                    <span className="block font-body text-xs uppercase tracking-[0.1em] text-outline">
                      {item.format}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {overview !== undefined && overview.hiddenCount > 0 && (
        <p className="flex items-center gap-2 font-body text-xs text-outline">
          <EyeOff className="size-3.5" aria-hidden="true" />
          Hidden items stay in every count on this dashboard. They are off the
          member app, not off the shelf.
        </p>
      )}

      {overview !== undefined &&
        overview.totalItems === 0 &&
        overview.recentAdditions.length === 0 && (
          <p className="flex items-center gap-2 font-body text-xs text-outline">
            <Sparkles className="size-3.5" aria-hidden="true" />
            The other tabs fill in as the catalogue grows.
          </p>
        )}
    </div>
  );
}

function PanelLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="font-body text-xs font-semibold normal-case tracking-normal text-primary hover:underline"
    >
      Open
    </Link>
  );
}
