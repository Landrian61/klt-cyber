/**
 * The one email layer (spec 0007, SRS F1-10).
 *
 * **This is the only file allowed to call the Resend component's `sendEmail`.**
 * `convex/emails.test.ts` scans the backend and fails if any other file does,
 * because the "exactly five emails" rule is only enforceable if every send
 * passes through one helper that knows the closed registry and does the
 * logging.
 *
 * Three invariants live here:
 *
 * - **A send can never fail the action that triggered it.** Every sender is an
 *   internal action reached through the scheduler, and `deliver` swallows its
 *   own errors: it logs, reports to Sentry, and returns null. A signup never
 *   fails because the welcome email could not be queued (AC-15).
 * - **One email per event.** Each template has an idempotency key formula, so a
 *   retried trigger returns the existing queued email instead of sending twice.
 * - **No email address is ever written to `activityLogs`** (AC-15). The rows
 *   carry the template name, the affected user, and the component's email id.
 */

import { Resend, vEmailId, vOnEmailEventArgs } from "@convex-dev/resend";
import { v, type Infer } from "convex/values";
import { EMAIL_TEMPLATES, type EmailTemplate } from "@klt-cyber/shared";
import { components, internal } from "./_generated/api";
import {
  internalAction,
  internalMutation,
  internalQuery,
  type ActionCtx,
} from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { TEMPLATES } from "./lib/emails/templates";
import { reportError } from "./lib/sentry";

/**
 * The Resend client.
 *
 * `testMode` is configuration, not a code branch (AC-17): dev sets
 * `EMAIL_TEST_MODE=true` and only Resend's test addresses receive anything;
 * staging and production set it to `false`. The component's own default is
 * `true`, and an unset value keeps that default deliberately — a deployment
 * that forgot the variable delivers nothing rather than blasting real
 * addresses from a misconfigured environment. The flip side is that a missing
 * value on staging looks exactly like "everything is fine", which is why the
 * provisioning checklist in the spec calls it out.
 *
 * `apiKey` and `webhookSecret` are intentionally not passed: the component
 * reads `RESEND_API_KEY` and `RESEND_WEBHOOK_SECRET` from the deployment
 * itself, so there is one place per environment to set and revoke them.
 */
// The explicit `: Resend` annotation is load bearing, not decoration:
// `onEmailEvent` points at a function in this same module, so without it
// TypeScript chases its own tail through `_generated/api` and gives up
// (TS7022, "implicitly has type any ... referenced in its own initializer").
export const resend: Resend = new Resend(components.resend, {
  testMode: process.env.EMAIL_TEST_MODE !== "false",
  onEmailEvent: internal.emails.handleEmailEvent,
});

const vEmailTemplate = v.union(
  v.literal("welcome"),
  v.literal("password_reset"),
  v.literal("profile_verified"),
  v.literal("profile_sent_back"),
  v.literal("account_deleted")
);

/**
 * Ties the validator above to the shared registry in both directions, so
 * adding or removing a template name in `@klt-cyber/shared` without updating
 * this file is a compile error rather than a runtime surprise (AC-14).
 */
type ValidatorTemplate = Infer<typeof vEmailTemplate>;
const _registryMatchesValidator: [
  ValidatorTemplate extends EmailTemplate ? true : never,
  EmailTemplate extends ValidatorTemplate ? true : never,
] = [true, true];
void _registryMatchesValidator;
void EMAIL_TEMPLATES;

const vOutcome = v.union(v.literal("sent"), v.literal("failed"));

function fromAddress(): string {
  const from = process.env.EMAIL_FROM;
  if (!from) {
    throw new Error(
      "EMAIL_FROM is not set on this Convex deployment. See spec 0007's configuration checklist."
    );
  }
  return from;
}

function replyToAddresses(): string[] {
  const replyTo = process.env.EMAIL_REPLY_TO;
  return replyTo ? [replyTo] : [];
}

/* ------------------------------------------------------------------ *
 * Recipient lookups
 * ------------------------------------------------------------------ */

export const recipientByUserId = internalQuery({
  args: { userId: v.id("users") },
  returns: v.union(
    v.object({ email: v.string(), firstName: v.optional(v.string()) }),
    v.null()
  ),
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);
    if (!user) return null;
    // `users` is the one source of truth for name and email (F1-07), never
    // the `memberProfiles` copy.
    return {
      email: user.email,
      ...(user.firstName ? { firstName: user.firstName } : {}),
    };
  },
});

export const recipientByAuthId = internalQuery({
  args: { authId: v.string() },
  returns: v.union(
    v.object({
      userId: v.id("users"),
      email: v.string(),
      firstName: v.optional(v.string()),
    }),
    v.null()
  ),
  handler: async (ctx, { authId }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", authId))
      .unique();
    if (!user) return null;
    return {
      userId: user._id,
      email: user.email,
      ...(user.firstName ? { firstName: user.firstName } : {}),
    };
  },
});

/* ------------------------------------------------------------------ *
 * The send helper
 * ------------------------------------------------------------------ */

interface DeliverArgs {
  template: EmailTemplate;
  to: string;
  userId: Id<"users"> | null;
  idempotencyKey: string;
  data: unknown;
}

/**
 * Renders one template and queues it, then logs the queue acceptance.
 *
 * Never throws. An email is always a side effect of something the person was
 * actually doing, so a failure here is reported and dropped rather than
 * surfaced to them (AC-15).
 *
 * Note that `email.sent` means "accepted into the send queue", not
 * "delivered" — the component sends in durable batches, and the real delivery
 * outcome arrives later through `handleEmailEvent` (AC-19).
 */
async function deliver(
  ctx: ActionCtx,
  { template, to, userId, idempotencyKey, data }: DeliverArgs
): Promise<string | null> {
  try {
    const rendered = TEMPLATES[template](data);

    const emailId = await resend.sendEmail(ctx, {
      from: fromAddress(),
      to,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      replyTo: replyToAddresses(),
      idempotencyKey,
    });

    await ctx.runMutation(internal.emails.logSend, {
      userId,
      template,
      outcome: "sent",
      emailId,
    });

    return emailId;
  } catch (error) {
    console.error(`emails.deliver: ${template} could not be queued`, error);
    await reportError(ctx, error, {
      fn: "emails.deliver",
      ...(userId ? { userId } : {}),
      tags: { template },
    });
    return null;
  }
}

/**
 * The generic sender named in the spec's API surface. The typed per template
 * senders below are what callers should reach for; this exists so a caller
 * with an address but no user row (account deletion) still has one door.
 */
export const send = internalAction({
  args: {
    template: vEmailTemplate,
    to: v.string(),
    userId: v.union(v.id("users"), v.null()),
    idempotencyKey: v.string(),
    data: v.any(),
  },
  returns: v.union(vEmailId, v.null()),
  handler: async (ctx, args) =>
    (await deliver(ctx, {
      template: args.template,
      to: args.to,
      userId: args.userId,
      idempotencyKey: args.idempotencyKey,
      data: args.data,
    })) as Infer<typeof vEmailId> | null,
});

/* ------------------------------------------------------------------ *
 * Logging
 * ------------------------------------------------------------------ */

export const logSend = internalMutation({
  args: {
    userId: v.union(v.id("users"), v.null()),
    template: vEmailTemplate,
    outcome: vOutcome,
    emailId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // `activityLogs.actorUserId` is required, so an email to somebody with no
    // `users` row simply goes unlogged. That is the deliberate trade in spec
    // 0007 (RECOMMEND 6): the email matters more than the audit row, and the
    // caller has already reported the miss to Sentry.
    if (!args.userId) return null;

    await ctx.db.insert("activityLogs", {
      actorUserId: args.userId,
      action: args.outcome === "sent" ? "email.sent" : "email.failed",
      targetType: "email",
      ...(args.emailId ? { targetId: args.emailId } : {}),
      // Template name only. Never the recipient address (AC-15).
      metadata: { template: args.template },
    });
    return null;
  },
});

/* ------------------------------------------------------------------ *
 * Delivery outcomes (the Resend webhook, AC-19)
 * ------------------------------------------------------------------ */

export const handleEmailEvent = internalMutation({
  args: vOnEmailEventArgs,
  returns: v.null(),
  handler: async (ctx, { id, event }) => {
    // Only hard failures matter here. Delivered, opened, clicked and delayed
    // events are the component's business, not the audit trail's.
    if (event.type !== "email.bounced" && event.type !== "email.failed") {
      return null;
    }

    // Which template and user this email belonged to is carried on the row
    // written at queue time, keyed by the component's email id. Scanning the
    // `email.sent` rows is affordable because failures are rare; if send
    // volume ever makes this hurt, the fix is an index on `targetId`.
    const queued = await ctx.db
      .query("activityLogs")
      .withIndex("by_action", (q) => q.eq("action", "email.sent"))
      .filter((q) => q.eq(q.field("targetId"), id))
      .first();

    // An email id we never logged (a send from before this feature, or one
    // whose user had no `users` row) is ignored rather than guessed at.
    if (!queued) {
      console.warn(`emails.handleEmailEvent: unknown email id ${id}, ignoring`);
      return null;
    }

    const template = (queued.metadata as { template?: EmailTemplate } | undefined)
      ?.template;

    await ctx.db.insert("activityLogs", {
      actorUserId: queued.actorUserId,
      action: "email.failed",
      targetType: "email",
      targetId: id,
      metadata: { ...(template ? { template } : {}), eventType: event.type },
    });

    // `reportError` only accepts an ActionCtx by design (it needs `fetch`), so
    // the Sentry report hops through the scheduler rather than running here.
    await ctx.scheduler.runAfter(0, internal.emails.reportDeliveryFailure, {
      emailId: id,
      eventType: event.type,
      userId: queued.actorUserId,
      ...(template ? { template } : {}),
    });

    return null;
  },
});

export const reportDeliveryFailure = internalAction({
  args: {
    emailId: v.string(),
    eventType: v.string(),
    userId: v.id("users"),
    template: v.optional(vEmailTemplate),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await reportError(
      ctx,
      new Error(
        `Email delivery failed (${args.eventType}) for template ${
          args.template ?? "unknown"
        }`
      ),
      {
        fn: "emails.handleEmailEvent",
        userId: args.userId,
        tags: {
          eventType: args.eventType,
          emailId: args.emailId,
          ...(args.template ? { template: args.template } : {}),
        },
      }
    );
    return null;
  },
});

/* ------------------------------------------------------------------ *
 * The five senders
 * ------------------------------------------------------------------ */

export const sendWelcome = internalAction({
  args: { userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, { userId }) => {
    const recipient = await ctx.runQuery(internal.emails.recipientByUserId, {
      userId,
    });
    if (!recipient) return null;

    await deliver(ctx, {
      template: "welcome",
      to: recipient.email,
      userId,
      idempotencyKey: `welcome:${userId}`,
      data: { firstName: recipient.firstName },
    });
    return null;
  },
});

/**
 * The password reset email. Reached only from Better Auth's `sendResetPassword`
 * callback, which in turn is reached only through the rate limited public
 * endpoint — never from our own server code (spec 0007, key invariants).
 */
export const sendPasswordReset = internalAction({
  args: {
    authId: v.string(),
    email: v.string(),
    url: v.string(),
    token: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { authId, email, url, token }) => {
    const recipient = await ctx.runQuery(internal.emails.recipientByAuthId, {
      authId,
    });

    // A Better Auth user with no `users` row of ours still gets the email: the
    // person is locked out either way, and a bookkeeping gap is no reason to
    // keep them that way (RECOMMEND 6). The row is skipped and Sentry is told.
    if (!recipient) {
      await reportError(
        ctx,
        new Error(
          `No users row for authId ${authId}; password reset email sent without an activity log row`
        ),
        { fn: "emails.sendPasswordReset", tags: { template: "password_reset" } }
      );
    }

    await deliver(ctx, {
      template: "password_reset",
      // Better Auth hands us the address it resolved; prefer our own row only
      // for the name.
      to: email,
      userId: recipient?.userId ?? null,
      idempotencyKey: `password_reset:${token}`,
      data: { firstName: recipient?.firstName, url },
    });
    return null;
  },
});

export const sendProfileVerified = internalAction({
  args: {
    userId: v.id("users"),
    profileId: v.id("memberProfiles"),
    verifiedAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, { userId, profileId, verifiedAt }) => {
    const recipient = await ctx.runQuery(internal.emails.recipientByUserId, {
      userId,
    });
    if (!recipient) return null;

    await deliver(ctx, {
      template: "profile_verified",
      to: recipient.email,
      userId,
      idempotencyKey: `profile_verified:${profileId}:${verifiedAt}`,
      data: { firstName: recipient.firstName },
    });
    return null;
  },
});

/**
 * Not triggered by this feature (AC-16). Feature 9's send back mutation wires
 * it with one `ctx.scheduler.runAfter` call.
 */
export const sendProfileSentBack = internalAction({
  args: {
    userId: v.id("users"),
    profileId: v.id("memberProfiles"),
    sentBackAt: v.number(),
    reason: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { userId, profileId, sentBackAt, reason }) => {
    const recipient = await ctx.runQuery(internal.emails.recipientByUserId, {
      userId,
    });
    if (!recipient) return null;

    await deliver(ctx, {
      template: "profile_sent_back",
      to: recipient.email,
      userId,
      idempotencyKey: `profile_sent_back:${profileId}:${sentBackAt}`,
      data: { firstName: recipient.firstName, reason },
    });
    return null;
  },
});

/**
 * Not triggered by this feature (AC-16). Feature 8's deletion mutation passes
 * the address explicitly, because by the time this runs the `users` row has
 * already been anonymized.
 */
export const sendAccountDeleted = internalAction({
  args: {
    userId: v.id("users"),
    email: v.string(),
    firstName: v.optional(v.string()),
    deletedAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, { userId, email, firstName, deletedAt }) => {
    await deliver(ctx, {
      template: "account_deleted",
      to: email,
      userId,
      idempotencyKey: `account_deleted:${userId}:${deletedAt}`,
      data: { firstName },
    });
    return null;
  },
});
