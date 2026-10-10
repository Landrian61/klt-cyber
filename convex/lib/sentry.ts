// Minimal Sentry envelope reporter for Convex actions. No SDK dependency —
// Convex's default runtime only allows `fetch` from actions/HTTP actions, so
// neither a real Sentry SDK nor a query/mutation can ever call this; see
// docs/specs/_root/0002-error-screens-sentry-update-channels/0002-sentry-observability.md.

import type { ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

interface ReportErrorContext {
  userId?: Id<"users">;
  fn: string;
  tags?: Record<string, string>;
}

function parseDsn(dsn: string): { envelopeUrl: string; publicKey: string } | null {
  try {
    const url = new URL(dsn);
    const publicKey = url.username;
    const projectId = url.pathname.replace(/^\//, "");
    if (!publicKey || !projectId) return null;
    return {
      envelopeUrl: `${url.protocol}//${url.host}/api/${projectId}/envelope/`,
      publicKey,
    };
  } catch {
    return null;
  }
}

/**
 * Reports `error` to Sentry from a Convex action, tagged with `context.fn`
 * and, when known, only the caller's `users._id` — never an email, name, or
 * raw user object (AC-4). `ctx` is typed `ActionCtx` specifically, not the
 * broader QueryCtx | MutationCtx | ActionCtx union, so a query or mutation
 * calling this fails to compile (AC-3). Never throws: an unset `SENTRY_DSN`
 * disables reporting entirely, and any failure to reach Sentry is caught and
 * discarded silently (AC-5) so observability can never itself become a
 * second point of failure.
 */
export async function reportError(
  _ctx: ActionCtx,
  error: unknown,
  context: ReportErrorContext
): Promise<void> {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  const parsed = parseDsn(dsn);
  if (!parsed) return;

  try {
    const environment = process.env.SENTRY_ENVIRONMENT ?? "unknown";
    const eventId = crypto.randomUUID().replace(/-/g, "");
    const timestamp = new Date().toISOString();
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;

    const event = {
      event_id: eventId,
      timestamp,
      platform: "other",
      environment,
      tags: { fn: context.fn, ...context.tags },
      user: context.userId ? { id: context.userId } : undefined,
      exception: {
        values: [
          {
            type: error instanceof Error ? error.name : "Error",
            value: message,
          },
        ],
      },
      extra: stack ? { stack } : undefined,
    };

    const envelopeHeader = JSON.stringify({ event_id: eventId, sent_at: timestamp });
    const itemHeader = JSON.stringify({ type: "event" });
    const body = `${envelopeHeader}\n${itemHeader}\n${JSON.stringify(event)}\n`;

    await fetch(parsed.envelopeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-sentry-envelope",
        "X-Sentry-Auth": `Sentry sentry_version=7, sentry_client=klt-cyber-backend/0.1.0, sentry_key=${parsed.publicKey}`,
      },
      body,
    });
  } catch {
    // Never let a Sentry send failure propagate into the caller (AC-5).
  }
}
