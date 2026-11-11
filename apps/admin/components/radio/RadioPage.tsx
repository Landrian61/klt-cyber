"use client";

import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { AlertTriangle, Headphones, Radio, RotateCcw, Signal } from "lucide-react";
import {
  RADIO_DISPLAY_STATUS_LABELS,
  deriveRadioStatus,
  formatKampalaTime,
  type RadioDisplayStatus,
  type RadioOverrideState,
} from "@klt-cyber/shared";

import { api } from "@/lib/api";
import { useAuthQuery } from "@/lib/useAuthQuery";
import { Reveal } from "@/components/motion/Reveal";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { Heading } from "@/components/ui/Heading";
import { Skeleton } from "@/components/shadcn/skeleton";
import { StatCard } from "@/components/ui/StatCard";
import { cn } from "@/lib/utils";
import { radioError } from "./radioErrors";
import { WeekSchedule } from "./WeekSchedule";

/** How often the derived status and "checked … ago" are recomputed. */
const TICK_MS = 5_000;

/**
 * A clock that ticks while the page is open, so the status is derived from
 * the reader's own time (AC-3): a probe that stops arriving turns Live into
 * Off air after three minutes here too, not only on the next server write.
 */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);
  return now;
}

function agoLabel(at: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return `${hours} h ago`;
}

const STATUS_STYLES: Record<RadioDisplayStatus, { pill: string; dot: string }> = {
  live: { pill: "bg-crimson text-white", dot: "bg-white animate-pulse" },
  interrupted: { pill: "bg-primary text-on-primary", dot: "bg-on-primary" },
  off_air: { pill: "bg-white/15 text-white", dot: "bg-white/60" },
};

/**
 * Media's Radio page (spec 0019): the live status, the override, and both
 * listener figures. The schedule, programs and recordings join it as their
 * build slices land.
 *
 * Everything here reads `radio.getMediaRadioStatus`, which returns null to
 * anyone without `manageRadio`; the override mutations re-check the same
 * capability, so this page is chrome and not the boundary (AC-33).
 */
export function RadioPage() {
  const data = useAuthQuery(api.radio.getMediaRadioStatus, {});
  const setOverride = useMutation(api.radio.setOverride);
  const clearOverride = useMutation(api.radio.clearOverride);
  const now = useNow();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(radioError(caught));
    } finally {
      setBusy(false);
    }
  }

  if (data === null) {
    return (
      <div className="space-y-6">
        <Heading as="h1" size="xl">
          Radio
        </Heading>
        <ErrorState retry={() => window.location.reload()} />
      </div>
    );
  }

  if (data === undefined) {
    return (
      <div className="space-y-6" aria-busy="true">
        <Skeleton className="h-8 w-40 rounded-full" />
        <Skeleton className="h-56 w-full rounded-2xl" />
        <div className="grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-32 rounded-md" />
          <Skeleton className="h-32 rounded-md" />
          <Skeleton className="h-32 rounded-md" />
        </div>
      </div>
    );
  }

  const status = deriveRadioStatus(data.reading, now);
  const style = STATUS_STYLES[status];
  const override = data.override;

  function force(state: RadioOverrideState) {
    void run(() => setOverride({ state }));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Heading as="h1" size="xl">
            Radio
          </Heading>
          <p className="font-body text-sm text-on-surface-variant">
            Reign Radio&rsquo;s live status, worked out from the stream itself every
            minute, and every twenty seconds while a broadcast is on.
          </p>
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-lg bg-error-light px-3 py-2 font-body text-sm text-error"
        >
          {error}
        </p>
      )}

      {!data.configured && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-lg bg-primary-light px-4 py-3"
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
          <p className="font-body text-sm text-on-surface">
            The stream is not connected yet. Ask a System Admin to set{" "}
            <code className="font-mono text-xs">RADIO_STREAM_URL</code> and{" "}
            <code className="font-mono text-xs">RADIO_STATUS_URL</code> on this
            deployment. Until then the status reads Off air.
          </p>
        </div>
      )}

      <Reveal className="space-y-6">
        {/* Live status hero */}
        <section
          aria-labelledby="radio-status-heading"
          className="relative overflow-hidden rounded-2xl bg-heaven-deep p-6 text-white shadow-e2 sm:p-8"
        >
          <div className="absolute inset-0 bg-[linear-gradient(158deg,var(--color-heaven-deep)_0%,var(--color-heaven)_55%,var(--color-heaven-bright)_120%)]" />
          <div className="relative space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
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
              <span className="font-body text-xs text-white/70">
                {data.lastProbeAt && data.lastProbeAt > 0
                  ? `Stream checked ${agoLabel(data.lastProbeAt, now)}${
                      data.lastProbeOk ? "" : ", could not reach it"
                    }`
                  : "The stream has not been checked yet"}
              </span>
            </div>

            <div>
              <h2
                id="radio-status-heading"
                className="font-display text-2xl font-bold tracking-tight sm:text-3xl"
              >
                {data.current?.title ?? "Nothing scheduled right now"}
              </h2>
              <p className="mt-1 font-body text-sm text-white/75">
                {data.current
                  ? [
                      data.current.host,
                      `${formatKampalaTime(data.current.startsAt)} to ${formatKampalaTime(
                        data.current.endsAt,
                      )}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")
                  : status === "live"
                    ? "The stream is on air outside the schedule."
                    : "Reign Radio is quiet."}
              </p>
              {data.streamTitle && (
                <p className="mt-2 font-body text-xs text-white/60">
                  Stream title: {data.streamTitle}
                </p>
              )}
            </div>

            {/* Override (AC-6) */}
            <div className="space-y-3 rounded-xl bg-white/10 p-4">
              {override ? (
                <p className="font-body text-sm" role="status">
                  <span className="font-semibold">
                    Forced {override.state === "live" ? "Live" : "Off air"}
                  </span>{" "}
                  by {override.byName} at {formatKampalaTime(override.setAt)}. It stays
                  until somebody returns the status to automatic, whatever the stream
                  does.
                </p>
              ) : (
                <p className="font-body text-sm text-white/80">
                  Automatic. Force the status only when you know better than the
                  stream, for example when the source is up but nobody is on air.
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  className="border-white/25 text-white hover:bg-white/15"
                  disabled={busy || override?.state === "live"}
                  onClick={() => force("live")}
                >
                  <Signal className="h-4 w-4" aria-hidden />
                  Force Live
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  className="border-white/25 text-white hover:bg-white/15"
                  disabled={busy || override?.state === "off_air"}
                  onClick={() => force("off_air")}
                >
                  <Radio className="h-4 w-4" aria-hidden />
                  Force Off air
                </Button>
                {override && (
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={busy}
                    onClick={() => void run(() => clearOverride({}))}
                  >
                    <RotateCcw className="h-4 w-4" aria-hidden />
                    Return to automatic
                  </Button>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Listener figures (AC-15) */}
        <section aria-label="Listeners" className="grid gap-4 sm:grid-cols-3">
          <StatCard
            label="In app listeners"
            value={data.inAppListeners}
            hint="Signed in members listening in the app in the last minute."
          />
          <StatCard
            label="Whole stream"
            value={data.streamListeners ?? "Not reported"}
            hint="Caster FM's own count, every listener on any player."
          />
          <div className="rounded-md border border-border bg-surface-lowest p-6 shadow-e1">
            <p className="flex items-center gap-2 font-body text-sm text-on-surface-variant">
              <Headphones className="h-4 w-4" aria-hidden />
              Stream check
            </p>
            <p className="mt-2 font-body text-md font-semibold text-on-surface">
              {data.lastProbeOk === null
                ? "Not checked yet"
                : data.lastProbeOk
                  ? "Reaching the stream"
                  : "Cannot reach the stream"}
            </p>
            {data.probeError && !data.lastProbeOk && (
              <p className="mt-1 break-words font-mono text-xs text-outline">
                {data.probeError}
              </p>
            )}
          </div>
        </section>
      </Reveal>

      <WeekSchedule now={now} />
    </div>
  );
}
