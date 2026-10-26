"use client";

import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import type { ReactNode } from "react";
import {
  BILLING_CYCLES,
  BILLING_CYCLE_LABELS,
  COST_CURRENCY_CODES,
  COST_HELD_BY_MAX,
  COST_NAME_MAX,
  COST_NOTES_MAX,
  COST_PLAN_MAX,
  COST_PURPOSE_MAX,
  convertUgxToUsdMinor,
  convertUsdMinorToUgx,
  costAmountToMajor,
  costAmountToMinor,
  cycleRequiresRenewalDate,
  formatCostAmount,
  isHttpsUrl,
  isValidDateKey,
  roundUgxForDisplay,
  type BillingCycle,
  type CostCurrency,
  type UsdToUgxRate,
} from "@klt-cyber/shared";
import { api } from "@/lib/api";
import type { Id } from "@/lib/api";
import { ServiceLogo } from "@/components/ui/ServiceLogo";
import { Field } from "@/components/shadcn/field";
import { Input } from "@/components/shadcn/input";
import { Textarea } from "@/components/shadcn/textarea";
import { Button } from "@/components/shadcn/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/shadcn/select";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/shadcn/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/shadcn/tabs";
import { AnimatedDialogContent } from "@/components/motion/AnimatedDialogContent";

/** The subset of a service row this dialog reads back. */
export interface EditableService {
  _id: Id<"costServices">;
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
  accountHeldBy?: string;
  notes?: string;
}

/** The sentinel the "not recorded yet" option carries, since a Radix Select
 *  item may not have an empty value. */
const NONE = "__none__";

/**
 * One service in the cost register: read it, then change it (spec 0011,
 * AC-11).
 *
 * A dialog rather than a side sheet, and tabbed, because this is the "open a
 * card, read it, close it" surface the Events and Announcements dialogs
 * already established — most visits are somebody checking what a service
 * costs, not editing it, so reading is the default tab and editing is a
 * deliberate second click. Adding a service has nothing to read, so it skips
 * straight to the form.
 *
 * The form checks exactly what the mutation checks, through the same shared
 * helpers, so it can never accept something the server is about to refuse. The
 * server is still the real guard — this is here so the refusal arrives before
 * a round trip rather than after one.
 */
export function ServiceDialog({
  open,
  service,
  initialTab = "overview",
  rate,
  onClose,
}: {
  open: boolean;
  /** The row being read or edited, or null to add a new one. */
  service: EditableService | null;
  initialTab?: "overview" | "edit";
  /** For the shilling figures in the overview. Null before the job has run. */
  rate: UsdToUgxRate | null;
  onClose: () => void;
}) {
  const createService = useMutation(api.costs.createService);
  const updateService = useMutation(api.costs.updateService);

  const [tab, setTab] = useState<"overview" | "edit">(initialTab);
  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [plan, setPlan] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<string>(NONE);
  const [billingCycle, setBillingCycle] = useState<string>(NONE);
  const [renewalDate, setRenewalDate] = useState("");
  const [allowanceLimit, setAllowanceLimit] = useState("");
  const [consoleUrl, setConsoleUrl] = useState("");
  const [accountHeldBy, setAccountHeldBy] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Reset from the row each time the dialog opens, so closing without saving
  // and reopening never shows a half-typed draft from a different service.
  useEffect(() => {
    if (!open) return;
    setTab(service ? initialTab : "edit");
    setName(service?.name ?? "");
    setPurpose(service?.purpose ?? "");
    setPlan(service?.plan ?? "");
    setCurrency(service?.currency ?? NONE);
    setBillingCycle(service?.billingCycle ?? NONE);
    setRenewalDate(service?.renewalDate ?? "");
    setAllowanceLimit(
      service?.allowanceLimit === undefined
        ? ""
        : String(service.allowanceLimit),
    );
    setConsoleUrl(service?.consoleUrl ?? "");
    setAccountHeldBy(service?.accountHeldBy ?? "");
    setNotes(service?.notes ?? "");
    // Shown in major units because that is what the invoice says; converted
    // back through the shared exponent on save, so the conversion rule lives
    // in one place rather than in every form that touches money.
    setAmount(
      service?.amountMinor !== undefined && service.currency
        ? String(costAmountToMajor(service.amountMinor, service.currency))
        : "",
    );
    setError(null);
  }, [open, service, initialTab]);

  const cycle =
    billingCycle === NONE ? undefined : (billingCycle as BillingCycle);
  // Whether this cycle *may* carry a renewal date, not whether it must. You
  // can know a service costs $99 a year long before you know the anniversary,
  // and the register would rather hold the cost with no date than neither.
  const cycleRenews = cycle !== undefined && cycleRequiresRenewalDate(cycle);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    if (!trimmedName) return setError("A service needs a name");

    if (!cycleRenews && renewalDate) {
      return setError(
        "Only a monthly or annual service has a renewal date. A one-time fee, free tier, prepaid credit or pay-as-you-go service does not renew.",
      );
    }
    if (renewalDate && !isValidDateKey(renewalDate)) {
      return setError("The renewal date must be a real date");
    }
    if (consoleUrl.trim() && !isHttpsUrl(consoleUrl.trim())) {
      return setError("The console link must be an https:// address");
    }

    const currencyCode =
      currency === NONE ? undefined : (currency as CostCurrency);

    let amountMinor: number | undefined;
    if (amount.trim()) {
      if (!currencyCode) {
        return setError("Pick a currency before entering an amount");
      }
      const parsed = Number(amount);
      if (!Number.isFinite(parsed) || parsed < 0) {
        return setError("The amount must be zero or more");
      }
      amountMinor = costAmountToMinor(parsed, currencyCode);
    }

    let allowance: number | undefined;
    if (allowanceLimit.trim()) {
      const parsed = Number(allowanceLimit);
      if (!Number.isInteger(parsed) || parsed < 0) {
        return setError("The allowance must be a whole number of zero or more");
      }
      allowance = parsed;
    }

    // Convex drops keys whose value is `undefined`, so an emptied number or
    // select has to be named rather than merely omitted. Only sent on an
    // edit: there is nothing to clear on a service that does not exist yet.
    const clear: string[] = [];
    if (service) {
      if (amountMinor === undefined) clear.push("amountMinor");
      if (currencyCode === undefined) clear.push("currency");
      if (cycle === undefined) clear.push("billingCycle");
      if (!renewalDate) clear.push("renewalDate");
      if (allowance === undefined) clear.push("allowanceLimit");
    }

    const payload = {
      name: trimmedName,
      purpose: purpose.trim(),
      plan: plan.trim(),
      amountMinor,
      currency: currencyCode,
      billingCycle: cycle,
      renewalDate: renewalDate || undefined,
      allowanceLimit: allowance,
      consoleUrl: consoleUrl.trim(),
      accountHeldBy: accountHeldBy.trim(),
      notes: notes.trim(),
    };

    setSaving(true);
    try {
      if (service) {
        await updateService({ serviceId: service._id, ...payload, clear });
      } else {
        await createService(payload);
      }
      onClose();
    } catch (caught) {
      // The server's own message, which names the rule that was broken,
      // rather than a generic "something went wrong".
      setError(
        caught instanceof Error
          ? caught.message.replace(/^.*Error:\s*/, "")
          : "That could not be saved",
      );
    } finally {
      setSaving(false);
    }
  }

  const form = (
    <form id="service-form" onSubmit={handleSubmit} className="space-y-5 px-1">
      <Field label="Name" htmlFor="cost-name">
        <Input
          id="cost-name"
          value={name}
          maxLength={COST_NAME_MAX}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </Field>

      <Field
        label="What the platform uses it for"
        htmlFor="cost-purpose"
        hint="Optional"
      >
        <Input
          id="cost-purpose"
          value={purpose}
          maxLength={COST_PURPOSE_MAX}
          onChange={(e) => setPurpose(e.target.value)}
        />
      </Field>

      <Field label="Plan" htmlFor="cost-plan" hint="As the invoice names it">
        <Input
          id="cost-plan"
          value={plan}
          maxLength={COST_PLAN_MAX}
          onChange={(e) => setPlan(e.target.value)}
        />
      </Field>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label="Currency" htmlFor="cost-currency">
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger id="cost-currency">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Not recorded</SelectItem>
              {COST_CURRENCY_CODES.map((code) => (
                <SelectItem key={code} value={code}>
                  {code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Amount" htmlFor="cost-amount">
          <Input
            id="cost-amount"
            value={amount}
            inputMode="decimal"
            onChange={(e) => setAmount(e.target.value)}
            disabled={currency === NONE}
          />
        </Field>
      </div>

      <Field label="Billing cycle" htmlFor="cost-cycle">
        <Select
          value={billingCycle}
          onValueChange={(next) => {
            setBillingCycle(next);
            // The date field unmounts for a cycle that does not renew, so a
            // date left behind in state would be unreachable: the save would
            // be refused for a field nobody can see to empty.
            const nextCycle = next === NONE ? undefined : (next as BillingCycle);
            if (!nextCycle || !cycleRequiresRenewalDate(nextCycle)) {
              setRenewalDate("");
            }
          }}
        >
          <SelectTrigger id="cost-cycle">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Not recorded</SelectItem>
            {BILLING_CYCLES.map((value) => (
              <SelectItem key={value} value={value}>
                {BILLING_CYCLE_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      {/* Shown only when the cycle is one that renews, which is also the rule
          the server enforces — so the field cannot be filled in for a service
          that has nothing to renew. */}
      {cycleRenews && (
        <Field
          label="Next renewal date"
          htmlFor="cost-renewal"
          hint="Optional. Fill it in and you will be reminded 14 days before, 3 days before, and on the day. Leave it blank and the cost is still recorded, with no reminder."
        >
          <Input
            id="cost-renewal"
            type="date"
            value={renewalDate}
            onChange={(e) => setRenewalDate(e.target.value)}
          />
        </Field>
      )}

      <Field
        label="Included allowance"
        htmlFor="cost-allowance"
        hint="Whatever the plan includes, as a whole number. Optional."
      >
        <Input
          id="cost-allowance"
          value={allowanceLimit}
          inputMode="numeric"
          onChange={(e) => setAllowanceLimit(e.target.value)}
        />
      </Field>

      <Field
        label="Console link"
        htmlFor="cost-console"
        hint="Where this service is managed. Must start with https://"
      >
        <Input
          id="cost-console"
          value={consoleUrl}
          onChange={(e) => setConsoleUrl(e.target.value)}
          placeholder="https://"
        />
      </Field>

      <Field label="Account held by" htmlFor="cost-held-by">
        <Input
          id="cost-held-by"
          value={accountHeldBy}
          maxLength={COST_HELD_BY_MAX}
          onChange={(e) => setAccountHeldBy(e.target.value)}
        />
      </Field>

      <Field label="Notes" htmlFor="cost-notes">
        <Textarea
          id="cost-notes"
          value={notes}
          maxLength={COST_NOTES_MAX}
          rows={3}
          onChange={(e) => setNotes(e.target.value)}
        />
      </Field>

      {error && (
        <p
          role="alert"
          className="rounded-md bg-crimson-light px-3 py-2 font-body text-sm text-crimson"
        >
          {error}
        </p>
      )}
    </form>
  );

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && !next && onClose()}>
      {/* Fixed height whichever tab is showing, so switching tabs never jumps
          the dialog — the middle row absorbs the difference by scrolling. */}
      <AnimatedDialogContent
        open={open}
        className="grid h-[620px] max-w-2xl grid-rows-[auto_1fr_auto] gap-4"
      >
        <DialogHeader>
          <div className="flex items-center gap-3">
            {/* The mark identifies the vendor faster than the name does, which
                is the same reason the cards carry one. */}
            <ServiceLogo
              service={{
                serviceKey: service?.serviceKey,
                name: service?.name ?? name ?? "New service",
              }}
            />
            <div className="min-w-0">
              <DialogTitle className="truncate">
                {service ? service.name : "Add a service"}
              </DialogTitle>
              <DialogDescription className="truncate">
                {service
                  ? (service.plan ?? "Plan not recorded")
                  : "Leave anything you have not read off the invoice blank."}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {service ? (
          <Tabs
            value={tab}
            onValueChange={(value) => setTab(value as "overview" | "edit")}
            className="flex min-h-0 flex-col gap-3"
          >
            <TabsList className="w-fit shrink-0">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="edit">Edit</TabsTrigger>
            </TabsList>
            <TabsContent
              value="overview"
              className="min-h-0 overflow-y-auto px-1"
            >
              <ServiceOverview service={service} rate={rate} />
            </TabsContent>
            <TabsContent value="edit" className="min-h-0 overflow-y-auto px-1">
              {form}
            </TabsContent>
          </Tabs>
        ) : (
          <div className="min-h-0 overflow-y-auto px-1">{form}</div>
        )}

        <DialogFooter>
          {service && tab === "overview" ? (
            <>
              <Button type="button" variant="outline" onClick={onClose}>
                Close
              </Button>
              <Button type="button" onClick={() => setTab("edit")}>
                Edit
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={service ? () => setTab("overview") : onClose}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button type="submit" form="service-form" disabled={saving}>
                {saving ? "Saving…" : service ? "Save changes" : "Add service"}
              </Button>
            </>
          )}
        </DialogFooter>
      </AnimatedDialogContent>
    </Dialog>
  );
}

/**
 * Everything the register holds about one service, read only.
 *
 * Every unfilled field says "not recorded" rather than being hidden, because
 * a missing line and an absent field look identical once the row is gone —
 * and the point of this page is to make the gaps visible enough that somebody
 * fills them.
 */
function ServiceOverview({
  service,
  rate,
}: {
  service: EditableService;
  rate: UsdToUgxRate | null;
}) {
  const { amountMinor, currency, billingCycle } = service;

  return (
    <div className="space-y-5">
      <div className="rounded-md bg-surface-low p-4">
        <p className="font-body text-xs uppercase tracking-wide text-outline">
          Cost
        </p>
        {amountMinor !== undefined && currency ? (
          <>
            <p className="mt-1 font-mono text-3xl font-bold leading-none text-on-surface">
              {formatCostAmount(amountMinor, currency)}
            </p>
            <p className="mt-1.5 font-body text-sm text-on-surface-variant">
              <Converted
                amountMinor={amountMinor}
                currency={currency}
                rate={rate}
              />
              {billingCycle && ` · ${BILLING_CYCLE_LABELS[billingCycle]}`}
            </p>
          </>
        ) : billingCycle === "free_tier" ? (
          <p className="mt-1 font-mono text-3xl font-bold leading-none text-on-surface">
            Free
          </p>
        ) : (
          <p className="mt-1 font-body text-sm italic text-outline">
            Not recorded
          </p>
        )}
      </div>

      <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
        <Detail label="Plan">{service.plan}</Detail>
        <Detail label="Billing cycle">
          {billingCycle && BILLING_CYCLE_LABELS[billingCycle]}
        </Detail>
        <Detail label="Next renewal">{service.renewalDate}</Detail>
        <Detail label="Included allowance">
          {service.allowanceLimit?.toLocaleString("en-US")}
        </Detail>
        <Detail label="Account held by">{service.accountHeldBy}</Detail>
        <Detail label="Console">
          {service.consoleUrl && (
            <a
              href={service.consoleUrl}
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-primary hover:underline"
            >
              Open console →
            </a>
          )}
        </Detail>
        <Detail label="What it is for" wide>
          {service.purpose}
        </Detail>
        <Detail label="Notes" wide>
          {service.notes}
        </Detail>
      </dl>
    </div>
  );
}

/** One labelled fact, or the sentence that says nobody has recorded it. */
function Detail({
  label,
  wide,
  children,
}: {
  label: string;
  wide?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="font-body text-xs uppercase tracking-wide text-outline">
        {label}
      </dt>
      <dd className="mt-1 font-body text-sm leading-relaxed text-on-surface">
        {children ?? <span className="italic text-outline">not recorded</span>}
      </dd>
    </div>
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
  return <>≈ {formatCostAmount(convertUgxToUsdMinor(amountMinor, rate.rate), "USD")}</>;
}
