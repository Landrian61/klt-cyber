import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { authComponent, createAuth } from "./auth";
import { resend } from "./emails";
import * as websiteApi from "./websiteApi";

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

/**
 * The website API (spec 0026), for the church website's backend. Each
 * deployment serves it at `https://<deployment>.convex.site/api/v1/...` with
 * its own keys, so every environment is separate. Guide: docs/api/website-api.md.
 *
 * Exact paths win over the `/api/v1/` prefix, so the prefix routes only answer
 * a path or method nothing else claims, with a JSON 404.
 */
http.route({ path: "/api/v1/ping", method: "GET", handler: websiteApi.ping });
http.route({ path: "/api/v1/departments", method: "GET", handler: websiteApi.departments });
http.route({ path: "/api/v1/figures", method: "GET", handler: websiteApi.figures });
http.route({ path: "/api/v1/announcements", method: "POST", handler: websiteApi.announcements });
for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"] as const) {
  http.route({ pathPrefix: "/api/v1/", method, handler: websiteApi.notFound });
}

export default http;
