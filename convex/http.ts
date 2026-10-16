import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { authComponent, createAuth } from "./auth";
import { resend } from "./emails";

const http = httpRouter();

authComponent.registerRoutes(http, createAuth, { cors: true });

/**
 * Resend delivery outcomes (spec 0007, AC-19).
 *
 * A send that is accepted into the queue can still fail later, and Resend says
 * so here rather than at the moment of sending. Without this route a broken
 * sending domain looks exactly like everything working, until somebody
 * mentions weeks later that they never got the email.
 *
 * `handleResendEventWebhook` verifies the payload's signature against
 * `RESEND_WEBHOOK_SECRET` before trusting anything, so delivery status cannot
 * be forged, and then calls `internal.emails.handleEmailEvent`.
 *
 * This endpoint must be registered in the Resend dashboard per environment,
 * with the `email.*` events enabled, at
 * `https://<deployment>.convex.site/resend-webhook`.
 */
http.route({
  path: "/resend-webhook",
  method: "POST",
  handler: httpAction(async (ctx, req) => resend.handleResendEventWebhook(ctx, req)),
});

export default http;
