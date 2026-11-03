"use client";

import Link from "next/link";
import { FileText, HardDrive, Headphones, Sparkles } from "lucide-react";
import { useAuthQuery } from "@/lib/useAuthQuery";
import { api } from "@/lib/api";
import { StatCard } from "@/components/ui/StatCard";
import { ErrorState } from "@/components/ui/ErrorState";
import { StatGridSkeleton } from "@/components/ui/Skeletons";
import { CountUp } from "@/components/motion/CountUp";
import { Reveal } from "@/components/motion/Reveal";
import { churchDateTimeLabel } from "@/lib/churchTime";
import {
  Panel,
  PanelEmpty,
  PanelLines,
  formatBytes,
} from "./libraryDashboardParts";

/**
 * Free content: what the congregation can open in the app (spec 0017,
 * AC-18 to AC-20).
 *
 * No total listening time anywhere (AC-19): `audioDurationSeconds` is optional
 * and often unfilled, so a sum of it would be a confident number built out of
 * whichever recordings happened to have one typed in.
 *
 * Its query takes no argument: nothing here has a time window (AC-25).
 */
export function LibraryFreeContentTab({ basePath }: { basePath: string }) {
  const free = useAuthQuery(api.library.getLibraryFreeContent, {});

  if (free === null) return <ErrorState />;

  return (
    <div className="space-y-6">
      {free === undefined ? (
        <StatGridSkeleton count={3} />
      ) : (
        <Reveal
          as="section"
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
        >
          <StatCard
            label="PDFs"
            value={<CountUp value={free.pdfCount} />}
            hint={
              free.pdfCount === 0
                ? "No teaching PDFs uploaded yet"
                : "Readable in the app, free"
            }
          />
          <StatCard
            label="Recordings"
            value={<CountUp value={free.recordingCount} />}
            hint={
              free.recordingCount === 0
                ? "No recordings uploaded yet"
                : "Playable in the app, free"
            }
          />
          <StatCard
            label="Storage used"
            value={
              <span className="font-mono">{formatBytes(free.totalBytes)}</span>
            }
            // Same honesty rule as the shelf value hint: a total that is short
            // says so rather than quietly understating (AC-18).
            hint={
              free.missingSize === 0
                ? "Measured from the files themselves"
                : `${free.missingSize} ${free.missingSize === 1 ? "file has" : "files have"} no recorded size, so this total is short`
            }
          />
        </Reveal>
      )}

      <Panel
        title="Recently added"
        icon={<Sparkles className="size-4" />}
        action={
          <Link
            href={`${basePath}/free-content`}
            className="font-body text-xs font-semibold normal-case tracking-normal text-primary hover:underline"
          >
            Open
          </Link>
        }
      >
        {free === undefined ? (
          <PanelLines />
        ) : free.recentlyAdded.length === 0 ? (
          <PanelEmpty
            title="No free content yet"
            message="Upload a teaching PDF or a recording and it appears here, and in the app."
          />
        ) : (
          <ul className="space-y-3">
            {free.recentlyAdded.map((item) => (
              <li key={item._id} className="flex min-w-0 items-center gap-3">
                {item.coverImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.coverImageUrl}
                    alt=""
                    className="size-9 shrink-0 rounded-md object-cover"
                  />
                ) : (
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-surface-low text-outline">
                    {item.format === "audio" ? (
                      <Headphones className="size-4" aria-hidden="true" />
                    ) : (
                      <FileText className="size-4" aria-hidden="true" />
                    )}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-body text-sm font-semibold text-on-surface">
                    {item.title}
                  </span>
                  <span className="block font-body text-xs text-on-surface-variant">
                    <span className="uppercase tracking-[0.1em]">
                      {item.format}
                    </span>{" "}
                    ·{" "}
                    <span className="font-mono">
                      {churchDateTimeLabel(item.createdAt).split(",")[0]}
                    </span>
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {free !== undefined && free.recentlyAdded.length > 0 && (
        <p className="flex items-center gap-2 font-body text-xs text-outline">
          <HardDrive className="size-3.5" aria-hidden="true" />
          &quot;Recently added&quot; is what it says: the app has no separate
          notion of publishing, so an item is live from the moment it is not
          hidden.
        </p>
      )}
    </div>
  );
}
