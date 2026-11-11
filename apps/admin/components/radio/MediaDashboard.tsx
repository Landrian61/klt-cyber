"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { FunctionReturnType } from "convex/server";
import { BookOpen, Headphones, Radio } from "lucide-react";
import {
  RADIO_DISPLAY_STATUS_LABELS,
  deriveRadioStatus,
  formatKampalaDayHeading,
  formatKampalaTime,
  kampalaDateKeyAt,
  type RadioDisplayStatus,
} from "@klt-cyber/shared";

import { api } from "@/lib/api";
import { useAuthQuery } from "@/lib/useAuthQuery";
import { cn } from "@/lib/utils";
import { Reveal } from "@/components/motion/Reveal";
import { CountUp } from "@/components/motion/CountUp";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Heading } from "@/components/ui/Heading";

/** The status is derived again on this clock, so a stalled probe reads Off air (AC-39). */
const TICK_MS = 15_000;

function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);
  return now;
}

const STATUS_STYLES: Record<RadioDisplayStatus, { pill: string; dot: string }> = {
  live: { pill: "bg-crimson text-white", dot: "bg-white animate-pulse" },
  interrupted: { pill: "bg-primary text-on-primary", dot: "bg-on-primary" },
  off_air: { pill: "bg-white/15 text-white", dot: "bg-white/60" },
};

/**
 * Media's dashboard (spec 0019, AC-34): live status with the override banner
 * when one is set, the last finished broadcast that had listeners, and a
 * warning when tomorrow has no devotional. A card with nothing to report shows
 * an empty state rather than zeros.
 */
export function MediaDashboard() {
  const data = useAuthQuery(api.radio.getMediaDashboard, {});
  const now = useNow();

  if (data === null) {
    return (
      <div className="space-y-6">
        <Heading as="h1" size="xl">
          Media
        </Heading>
        <ErrorState retry={() => window.location.reload()} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Heading as="h1" size="xl">
          Media
        </Heading>
        <p className="font-body text-sm text-on-surface-variant">
          Reign Radio at a glance, and anything that needs you today.
        </p>
      </div>

      {data === undefined ? (
        <div className="grid gap-4 lg:grid-cols-3" aria-label="Loading the dashboard">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={cn("h-48 animate-pulse rounded-2xl bg-surface-low", i === 0 && "lg:col-span-2")}
            />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <Reveal className="lg:col-span-2">
            <LiveStatusCard live={data.live} now={now} />
          </Reveal>
          <Reveal>
            <DevotionalCard devotional={data.devotional} />
          </Reveal>
          <Reveal className="lg:col-span-3">
            <LastBroadcastCard last={data.lastBroadcast} />
          </Reveal>
        </div>
      )}
    </div>
  );
}

type Dashboard = NonNullable<FunctionReturnType<typeof api.radio.getMediaDashboard>>;

function LiveStatusCard({ live, now }: { live: Dashboard["live"]; now: number }) {
  const status = deriveRadioStatus(live.reading, now);
  const style = STATUS_STYLES[status];
  const override = live.override;
  return (
    <section
      aria-labelledby="dashboard-live-heading"
      className="relative h-full overflow-hidden rounded-2xl bg-heaven-deep p-6 text-white shadow-e2"
    >
      <div className="absolute inset-0 bg-[linear-gradient(158deg,var(--color-heaven-deep)_0%,var(--color-heaven)_55%,var(--color-heaven-bright)_120%)]" />
      <div className="relative space-y-4">
        <span
          className={cn(
            "inline-flex items-center gap-2 rounded-full px-3 py-1 font-body text-xs font-semibold uppercase tracking-wider",
            style.pill,
          )}
          aria-live="polite"
        >
          <span className={cn("h-2 w-2 rounded-full", style.dot)} aria-hidden />
          {RADIO_DISPLAY_STATUS_LABELS[status]}
          {override && <span className="font-medium normal-case">(forced)</span>}
        </span>
        <div>
          <h2 id="dashboard-live-heading" className="font-display text-2xl font-bold tracking-tight">
            {live.current?.title ?? (status === "live" ? "On air outside the schedule" : "Nothing on air")}
          </h2>
          <p className="mt-1 font-body text-sm text-white/75">
            {live.current
              ? `${formatKampalaTime(live.current.startsAt)} to ${formatKampalaTime(live.current.endsAt)}`
              : "Reign Radio is quiet right now."}
            {status === "live" && (
              <>
                {" · "}
                <span className="font-mono">{live.inAppListeners}</span>{" "}
                {live.inAppListeners === 1 ? "in app listener" : "in app listeners"}
              </>
            )}
          </p>
        </div>
        {override && (
          <p role="status" className="rounded-xl bg-white/10 p-3 font-body text-sm">
            <span className="font-semibold">
              Forced {override.state === "live" ? "Live" : "Off air"}
            </span>{" "}
            by {override.byName} at {formatKampalaTime(override.setAt)}. It stays until somebody
            returns the status to automatic.
          </p>
        )}
        <Link
          href="/areas-of-service/media/radio"
          className="inline-flex font-body text-sm font-semibold text-white underline-offset-4 hover:underline"
        >
          Open the Radio page
        </Link>
      </div>
    </section>
  );
}

function DevotionalCard({ devotional }: { devotional: Dashboard["devotional"] }) {
  return (
    <section className="h-full rounded-2xl bg-surface-lowest p-6 shadow-e1">
      <h2 className="font-body text-sm font-semibold text-on-surface-variant">
        Tomorrow&rsquo;s devotional
      </h2>
      {devotional ? (
        <div className="mt-3 space-y-3" role="alert">
          <p className="font-body text-md font-semibold text-crimson">
            Nothing is set for {formatKampalaDayHeading(devotional.missingDate)}.
          </p>
          <p className="font-body text-sm text-on-surface-variant">
            Members open the app to a devotional each morning. Add one before midnight.
          </p>
          {devotional.canManageDevotionals ? (
            <Link
              href="/areas-of-service/media/devotionals"
              className="inline-flex h-9 items-center rounded-md bg-primary-light px-4 font-body text-sm font-semibold text-primary hover:brightness-95"
            >
              Add the devotional
            </Link>
          ) : (
            <p className="font-body text-xs text-outline">
              Let the Media HOD or a delegate know.
            </p>
          )}
        </div>
      ) : (
        <EmptyState
          className="py-6"
          icon={<BookOpen className="h-8 w-8" aria-hidden />}
          title="All set"
          message="Tomorrow's devotional is ready."
        />
      )}
    </section>
  );
}

function LastBroadcastCard({ last }: { last: Dashboard["lastBroadcast"] }) {
  return (
    <section className="rounded-2xl bg-surface-lowest p-6 shadow-e1">
      <h2 className="font-body text-sm font-semibold text-on-surface-variant">Last broadcast</h2>
      {last ? (
        <div className="mt-3 flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="font-display text-xl font-bold text-on-surface">{last.broadcast.title}</p>
            <p className="font-body text-sm text-on-surface-variant">
              {formatKampalaDayHeading(kampalaDateKeyAt(last.broadcast.startsAt))} ·{" "}
              <span className="font-mono">{formatKampalaTime(last.broadcast.startsAt)}</span>
            </p>
          </div>
          <dl className="flex gap-8">
            <div>
              <dt className="flex items-center gap-1 font-body text-xs text-on-surface-variant">
                <Headphones className="h-3.5 w-3.5" aria-hidden /> Unique listeners
              </dt>
              <dd className="font-mono text-2xl text-on-surface">
                <CountUp value={last.uniqueListeners} />
              </dd>
            </div>
            <div>
              <dt className="font-body text-xs text-on-surface-variant">Hours listened</dt>
              <dd className="font-mono text-2xl text-on-surface">{last.hours.toFixed(1)}</dd>
            </div>
          </dl>
        </div>
      ) : (
        <EmptyState
          className="py-6"
          icon={<Radio className="h-8 w-8" aria-hidden />}
          title="No listening recorded yet"
          message="Once a broadcast ends with people listening in the app, its figures show here."
        />
      )}
    </section>
  );
}
