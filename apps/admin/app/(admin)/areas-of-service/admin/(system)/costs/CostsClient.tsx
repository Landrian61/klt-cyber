"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import {
  BILLING_CYCLE_LABELS,
  OVERDUE_NOTICE_MAX_DAYS,
  convertUgxToUsdMinor,
  convertUsdMinorToUgx,
  formatCostAmount,
  isFxRateStale,
  roundUgxForDisplay,
  type BillingCycle,
  type CostCurrency,
  type RenewalState,
  type UsdToUgxRate,
} from "@klt-cyber/shared";
import { useAuthQuery } from "@/lib/useAuthQuery";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Heading } from "@/components/ui/Heading";
import { StatCard } from "@/components/ui/StatCard";
import { ServiceLogo } from "@/components/ui/ServiceLogo";
import { ActionButton } from "@/components/ui/ActionButton";
import { Button } from "@/components/shadcn/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/shadcn/dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { OfflineBanner } from "@/components/ui/OfflineBanner";
import { ListPageSkeleton } from "@/components/ui/Skeletons";
import { useIsOffline } from "@/hooks/use-is-offline";
import { Reveal } from "@/components/motion/Reveal";
import { Stagger } from "@/components/motion/Stagger";
import { ServiceDialog, type EditableService } from "./ServiceDialog";

/**
 * The cost register (spec 0011, SRS A8-05).
 *
 * A grid of service cards rather than a table, because this is fourteen things
 * you scan and recognise, not a hundred you sort and filter. The vendor's own
 * logo does the recognising faster than its name in a cell ever did.
 *
 * Two rules this page keeps. Every figure is shown in the currency the service
 * actually bills in, with the other currency beneath it as a reading aid: what
 * the invoice said stays identifiable, and the conversion is always marked "≈"
 * and dated by the rate that produced it. And it never shows a zero for
 * something nobody has recorded — an unfilled field reads "not recorded", so it
 * is visibly waiting for somebody rather than quietly claiming to be free.
 */
export function CostsClient() {
  const [includeArchived, setIncludeArchived] = useState(false);
  const [editing, setEditing] = useState<EditableService | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  // Which tab the dialog lands on: reading a card opens the overview, the
  // Edit action goes straight to the form.
  const [dialogTab, setDialogTab] = useState<"overview" | "edit">("overview");
  const [busyId, setBusyId] = useState<string | null>(null);
  // The server's own refusal, shown where the action was taken. A write that
  // fails silently is worse than one that fails loudly: the admin sees the
  // card unchanged and assumes they misclicked.
  const [actionError, setActionError] = useState<string | null>(null);
  // The row being confirmed for archiving, held whole rather than by id so the
  // dialog can name it without looking it back up.
  const [archiving, setArchiving] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const data = useAuthQuery(api.costs.listServices, { includeArchived });
  const markRenewed = useMutation(api.costs.markRenewed);
  const archiveService = useMutation(api.costs.archiveService);
  const isOffline = useIsOffline();

  if (data === undefined && isOffline) return <ErrorState cause="offline" />;
  if (data === undefined) return <ListPageSkeleton />;
  // The subscription outlived the session; the redirect is already in flight.
  if (data === null) return null;

  const { services, monthlyTotalsByCurrency, usdToUgx } = data;
  const currencies = Object.keys(monthlyTotalsByCurrency).sort();

  // Every monthly contribution expressed in shillings, which is the one figure
  // a church treasurer can actually act on. Summed from exact conversions and
  // blunted once at the end, so it agrees with the cards above it.
  // Null, not zero, when no service carries a monthly cost: reducing an empty
  // list gives 0, and "≈ USh 0" is a confident claim about money nobody has
  // recorded — exactly what the rest of this page refuses to do.
  const combinedUgx =
    usdToUgx && currencies.length > 0
    ? currencies.reduce((total, code) => {
        const amount = monthlyTotalsByCurrency[code];
        return (
          total +
          (code === "UGX" ? amount : convertUsdMinorToUgx(amount, usdToUgx.rate))
        );
      }, 0)
    : null;

  async function handleRenewed(serviceId: string) {
    setBusyId(serviceId);
    setActionError(null);
    try {
      await markRenewed({ serviceId: serviceId as never });
    } catch (caught) {
      setActionError(messageFrom(caught, "That renewal could not be recorded"));
    } finally {
      setBusyId(null);
    }
  }

  async function confirmArchive() {
    if (!archiving) return;
    setBusyId(archiving.id);
    setActionError(null);
    try {
      await archiveService({ serviceId: archiving.id as never });
      setArchiving(null);
    } catch (caught) {
      // Deliberately leaves the dialog open, with the reason in it: closing
      // on a failure would look exactly like success.
      setActionError(messageFrom(caught, "That service could not be archived"));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-8">
      {isOffline && <OfflineBanner />}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Heading size="xl">Cost register</Heading>
          <p className="mt-1 max-w-2xl font-body text-sm text-on-surface-variant">
            Every service this platform runs on, what it costs, and when it
            renews. Nothing here is ever deleted: archiving keeps the record
            and stops the reminders.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setDialogTab("edit");
            setDialogOpen(true);
          }}
        >
          Add a service
        </Button>
      </div>

      {/* One total per currency the register holds, plus the combined figure in
          shillings. Each card's own monthly figure is rounded before it is
          summed, so the cards add up to exactly what is shown here. */}
      {(currencies.length > 0 || combinedUgx !== null) && (
        <Reveal className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {currencies.map((code) => (
            <StatCard
              key={code}
              label={`Monthly total, ${code}`}
              value={formatCostAmount(
                monthlyTotalsByCurrency[code],
                code as CostCurrency,
              )}
              hint="Annual costs counted as one twelfth"
            />
          ))}
          {combinedUgx !== null && (
            <StatCard
              label="Monthly total, all services"
              value={`≈ ${formatCostAmount(roundUgxForDisplay(combinedUgx), "UGX")}`}
              hint={`Converted at ${usdToUgx!.rate.toFixed(2)} per dollar`}
              emphasized
            />
          )}
        </Reveal>
      )}

      {actionError && archiving === null && (
        <p
          role="alert"
          className="rounded-md bg-crimson-light px-4 py-3 font-body text-sm text-crimson"
        >
          {actionError}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <ActionButton
          variant={includeArchived ? "gold" : "neutral"}
          onClick={() => setIncludeArchived((v) => !v)}
        >
          {includeArchived ? "Hide archived" : "Show archived"}
        </ActionButton>
        <RateNote rate={usdToUgx} />
      </div>

      {services.length === 0 ? (
        <EmptyState
          title="No services recorded yet"
          message="Run the reference seed to list every service this platform uses, or add one by hand."
        />
      ) : (
        <Stagger className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {services.map((service) => (
            <ServiceCard
              key={service._id}
              service={service}
              rate={usdToUgx}
              busy={busyId === service._id}
              onRenewed={() => handleRenewed(service._id)}
              onOpen={() => {
                setEditing(service as EditableService);
                setDialogTab("overview");
                setDialogOpen(true);
              }}
              onEdit={() => {
                setEditing(service as EditableService);
                setDialogTab("edit");
                setDialogOpen(true);
              }}
              onArchive={() =>
                setArchiving({ id: service._id, name: service.name })
              }
            />
          ))}
        </Stagger>
      )}

      {/* A plain DialogContent rather than the animated one: this is a
          one-shot confirm, which is the distinction AnimatedDialogContent's
          own note draws, and the same shape the Events dialog already uses. */}
      <Dialog
        open={archiving !== null}
        onOpenChange={(next) => {
          if (!next && busyId === null) setArchiving(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Archive {archiving?.name}?</DialogTitle>
            <DialogDescription>
              Nothing is deleted. It stays readable under &ldquo;Show
              archived&rdquo;, and stops counting towards the monthly totals
              and the renewal reminders.
            </DialogDescription>
          </DialogHeader>
          {actionError && (
            <p
              role="alert"
              className="rounded-md bg-crimson-light px-3 py-2 font-body text-sm text-crimson"
            >
              {actionError}
            </p>
          )}
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setArchiving(null);
                setActionError(null);
              }}
              disabled={busyId !== null}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              loading={busyId !== null}
              onClick={confirmArchive}
            >
              Archive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ServiceDialog
        open={dialogOpen}
        service={editing}
        initialTab={dialogTab}
        rate={usdToUgx}
        onClose={() => {
          setDialogOpen(false);
          setEditing(null);
        }}
      />
    </div>
  );
}

/** The shape one card needs, which is the list query's row. */
type ServiceRow = {
  _id: string;
  name: string;
  serviceKey?: string;
  purpose?: string;
  plan?: string;
  amountMinor?: number;
  currency?: CostCurrency;
  billingCycle?: BillingCycle;
  renewalDate?: string;
  allowanceLimit?: number;
  consoleUrl?: string;
  notes?: string;
  archivedAt?: number;
  renewalState: RenewalState | null;
  daysUntilRenewal: number | null;
  monthlyMinor: number;
  costRecorded: boolean;
};

function ServiceCard({
  service,
  rate,
  busy,
  onOpen,
  onRenewed,
  onEdit,
  onArchive,
}: {
  service: ServiceRow;
  rate: UsdToUgxRate | null;
  busy: boolean;
  onOpen: () => void;
  onRenewed: () => void;
  onEdit: () => void;
  onArchive: () => void;
}) {
  const archived = service.archivedAt !== undefined;
  const overdue = service.renewalState === "overdue" && !archived;
  const overdueDays =
    service.daysUntilRenewal !== null && service.daysUntilRenewal < 0
      ? -service.daysUntilRenewal
      : 0;

  return (
    <div
      className={cn(
        "flex flex-col rounded-md border border-border bg-surface-lowest p-5 shadow-e1",
        // Crimson is reserved for priority and destructive states, and an
        // overdue renewal is the only thing on either of these two pages that
        // earns it.
        overdue && "border-crimson/40 bg-crimson-light/50",
        archived && "opacity-60",
      )}
    >
      <div className="flex items-start gap-3">
        <ServiceLogo service={service} />
        <div className="min-w-0 flex-1">
          {/* The name opens the details, rather than the whole card being
              clickable: a card with buttons inside it cannot also be a button,
              and a real one here keeps the keyboard order honest. */}
          <h3 className="truncate font-body text-sm font-semibold text-on-surface">
            <button
              type="button"
              onClick={onOpen}
              className="rounded-sm text-left hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              {service.name}
            </button>
          </h3>
          <p className="mt-0.5 font-body text-xs text-on-surface-variant">
            {service.plan ?? <NotRecorded />}
          </p>
        </div>
        {service.billingCycle && (
          <span className="shrink-0 rounded-full bg-surface-low px-2.5 py-1 font-body text-[0.6875rem] font-semibold uppercase tracking-wide text-on-surface-variant">
            {BILLING_CYCLE_LABELS[service.billingCycle]}
          </span>
        )}
      </div>

      <div className="mt-4">
        <Headline service={service} rate={rate} />
      </div>

      {service.purpose && (
        <p className="mt-3 font-body text-xs leading-relaxed text-on-surface-variant">
          {service.purpose}
        </p>
      )}

      {service.renewalDate && (
        <div className="mt-3">
          <RenewalBadge
            state={service.renewalState}
            days={service.daysUntilRenewal}
          />
          {overdue && overdueDays > OVERDUE_NOTICE_MAX_DAYS && (
            <p className="mt-1 font-body text-xs text-on-surface-variant">
              Reminders stopped after {OVERDUE_NOTICE_MAX_DAYS} days. Still
              overdue.
            </p>
          )}
        </div>
      )}

      {archived && (
        <p className="mt-3 font-body text-xs font-semibold text-outline">
          Archived
        </p>
      )}

      {/* Pushed to the bottom so cards of different heights still line their
          actions up across a row. */}
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
        {service.consoleUrl && (
          <a
            href={service.consoleUrl}
            target="_blank"
            rel="noreferrer"
            className="font-body text-xs font-semibold text-primary hover:underline"
          >
            Open console
          </a>
        )}
        {!archived && (
          <div className="ml-auto flex flex-wrap justify-end gap-2">
            {service.renewalDate && (
              <ActionButton onClick={onRenewed} loading={busy}>
                Record renewal
              </ActionButton>
            )}
            <ActionButton variant="neutral" onClick={onEdit}>
              Edit
            </ActionButton>
            <ActionButton variant="danger" onClick={onArchive} loading={busy}>
              Archive
            </ActionButton>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The card's headline figure: what this service costs, as its own invoice
 * would put it, with the other currency beneath.
 *
 * Each cycle reads differently on purpose. An annual fee leads with the annual
 * figure, because that is the number on the invoice, and mentions the monthly
 * twelfth underneath rather than the other way round. A free tier says "Free"
 * rather than showing a zero amount, because the two mean different things:
 * one is a plan, the other is an unfilled field.
 */
function Headline({
  service,
  rate,
}: {
  service: ServiceRow;
  rate: UsdToUgxRate | null;
}) {
  const { amountMinor, currency, billingCycle, allowanceLimit } = service;

  if (billingCycle === "free_tier") {
    return (
      <>
        <p className="font-mono text-3xl font-bold text-on-surface">Free</p>
        <p className="mt-1 font-body text-xs text-on-surface-variant">
          {allowanceLimit !== undefined
            ? `Included allowance: ${allowanceLimit.toLocaleString("en-US")}`
            : "No charge on the current plan"}
        </p>
      </>
    );
  }

  if (amountMinor === undefined || currency === undefined) {
    return (
      <>
        <p className="font-mono text-3xl font-bold text-outline">—</p>
        <p className="mt-1 font-body text-xs italic text-outline">
          {billingCycle === "pay_as_you_go"
            ? "Metered, amount not recorded"
            : "Cost not recorded"}
        </p>
      </>
    );
  }

  return (
    <>
      <p className="font-mono text-3xl font-bold text-on-surface">
        {formatCostAmount(amountMinor, currency)}
      </p>
      <p className="mt-1 font-body text-xs text-on-surface-variant">
        <Converted amountMinor={amountMinor} currency={currency} rate={rate} />
        {billingCycle === "annual" && (
          <>
            {" · "}
            {formatCostAmount(service.monthlyMinor, currency)} a month
          </>
        )}
        {billingCycle === "one_time" && " · paid once"}
        {billingCycle === "prepaid_credit" && " · credit remaining"}
      </p>
    </>
  );
}

/** The same amount in the other currency, always marked as an estimate. */
function Converted({
  amountMinor,
  currency,
  rate,
}: {
  amountMinor: number;
  currency: CostCurrency;
  rate: UsdToUgxRate | null;
}) {
  if (!rate) return <>Rate not available yet</>;

  if (currency === "USD") {
    const ugx = roundUgxForDisplay(convertUsdMinorToUgx(amountMinor, rate.rate));
    return <>≈ {formatCostAmount(ugx, "UGX")}</>;
  }

  const usd = convertUgxToUsdMinor(amountMinor, rate.rate);
  return <>≈ {formatCostAmount(usd, "USD")}</>;
}

/**
 * Where the rate came from and when, shown once rather than on every card.
 *
 * A rate that has stopped arriving says so. Three days of silence is the point
 * at which a reader should stop quoting the shilling figures in a meeting, and
 * saying nothing would leave them quoting a number that merely looks current.
 */
function RateNote({ rate }: { rate: UsdToUgxRate | null }) {
  if (!rate) {
    return (
      <p className="font-body text-xs italic text-outline">
        Shilling figures appear once the daily rate has been fetched.
      </p>
    );
  }

  const stale = isFxRateStale(rate.fetchedAt, Date.now());
  const when = new Date(rate.fetchedAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "Africa/Kampala",
  });

  return (
    <p
      className={cn(
        "font-body text-xs",
        stale ? "font-semibold text-crimson" : "text-outline",
      )}
    >
      {stale ? "Rate last updated " : "Rate "}
      {rate.rate.toFixed(2)} shillings per dollar, {when}, from {rate.source}
      {stale && " — it has stopped refreshing"}
    </p>
  );
}

/** The server's own sentence where there is one, stripped of Convex's
 *  "[Request ID ...] Server Error: " prefix, the way the dialog does it. */
function messageFrom(caught: unknown, fallback: string): string {
  if (!(caught instanceof Error)) return fallback;
  const message = caught.message.replace(/^.*Error:\s*/, "").trim();
  return message.length > 0 ? message : fallback;
}

/** What an unfilled field says instead of a zero. */
function NotRecorded() {
  return <span className="italic text-outline">not recorded</span>;
}

const STATE_TONES: Record<RenewalState, string> = {
  scheduled: "text-on-surface-variant",
  due_soon: "text-on-surface-variant",
  imminent: "text-primary",
  due: "text-primary",
  overdue: "text-crimson",
};

/** The renewal state in words, derived on the server from the date alone. */
function RenewalBadge({
  state,
  days,
}: {
  state: RenewalState | null;
  days: number | null;
}) {
  if (!state || days === null) return null;

  const text =
    state === "overdue"
      ? `${-days} day${days === -1 ? "" : "s"} overdue`
      : state === "due"
        ? "Renews today"
        : `Renews in ${days} day${days === 1 ? "" : "s"}`;

  return (
    <p className={cn("font-body text-xs font-semibold", STATE_TONES[state])}>
      {text}
    </p>
  );
}
