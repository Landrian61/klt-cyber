import {
  createClient,
  type AuthFunctions,
  type GenericCtx,
} from "@convex-dev/better-auth";
import { convex, crossDomain } from "@convex-dev/better-auth/plugins";
import { expo } from "@better-auth/expo";
import { betterAuth } from "better-auth/minimal";
import { APIError } from "better-auth";
import {
  APP_URL_SCHEMES,
  CLIENT_PLATFORM_HEADER,
  MOBILE_CLIENT_PLATFORM,
  PASSWORD_RESET_EXPIRY_SECONDS,
} from "@klt-cyber/shared";
import { components, internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import authConfig from "./auth.config";

const siteUrl = process.env.SITE_URL!;

const authFunctions: AuthFunctions = {
  onCreate: internal.auth.onCreate,
  onUpdate: internal.auth.onUpdate,
  onDelete: internal.auth.onDelete,
};

export const authComponent = createClient<DataModel>(components.betterAuth, {
  authFunctions,
  triggers: {
    user: {
      onCreate: async (ctx, authUser) => {
        // Better Auth stores only a single full `name`; split it so visitors
        // arrive with first/last populated when the provider gave a name.
        const [firstName, ...rest] = (authUser.name ?? "")
          .trim()
          .split(/\s+/)
          .filter(Boolean);
        const lastName = rest.join(" ");

        const userId = await ctx.db.insert("users", {
          authId: authUser._id,
          email: authUser.email,
          ...(firstName ? { firstName } : {}),
          ...(lastName ? { lastName } : {}),
          ...(authUser.image ? { profilePictureUrl: authUser.image } : {}),
          role: "visitor",
          profileCompleted: false,
        });

        await ctx.db.insert("activityLogs", {
          actorUserId: userId,
          action: "user.signup",
        });

        // The welcome email (AC-12), for an email/password signup and a Google
        // one alike, since both land here. Scheduled rather than awaited: a
        // send that cannot be queued must never fail the signup, so the whole
        // email path sits behind the scheduler and swallows its own errors.
        await ctx.scheduler.runAfter(0, internal.emails.sendWelcome, {
          userId,
        });
      },
    },
  },
});

export const { onCreate, onUpdate, onDelete } = authComponent.triggersApi();

const googleConfigured =
  !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;

export const createAuth = (ctx: GenericCtx<DataModel>) =>
  betterAuth({
    baseURL: process.env.CONVEX_SITE_URL,
    trustedOrigins: [siteUrl, ...APP_URL_SCHEMES],
    database: authComponent.adapter(ctx),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      // Password reset (SRS F1-03, spec 0007). The whole flow already exists
      // upstream — enumeration safe responses, timing equalisation, single use
      // tokens — and was simply never switched on, because nothing could
      // deliver the email. Supplying this callback is what switches it on.
      resetPasswordTokenExpiresIn: PASSWORD_RESET_EXPIRY_SECONDS,
      // A reset deletes every session row for that user (AC-8). Note that an
      // already issued Convex access token keeps working until it expires on
      // its own, so revocation is not instant; the success copy on the portal
      // page is worded to promise only what this actually delivers.
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url, token }) => {
        // Hand off to the scheduler and return immediately. Awaiting a send
        // here would add our own latency to this endpoint, and the library
        // deliberately equalises the timing of "address exists" and "address
        // does not" so the response cannot be used to probe for accounts
        // (AC-4). Queueing is also what keeps a Resend outage from turning
        // into a failed request for the person locked out.
        if (!("scheduler" in ctx)) {
          // Unreachable in practice: this endpoint runs as an HTTP action,
          // which always has a scheduler. Logged rather than thrown, because
          // throwing here would leak timing information.
          console.error(
            "auth.sendResetPassword: no scheduler on this ctx, reset email not queued"
          );
          return;
        }
        await ctx.scheduler.runAfter(0, internal.emails.sendPasswordReset, {
          authId: user.id,
          email: user.email,
          url,
          token,
        });
      },
    },
    // Reset requests are the one unauthenticated endpoint that sends mail, so
    // it gets a tight rule of its own (AC-11).
    //
    // `enabled: true` is explicit because the library turns limiting off in
    // development, which would make this untestable on a dev deployment.
    //
    // `storage: "database"` because the default in memory counters are
    // worthless on Convex: each function instance is separate, so a cold start
    // would hand an attacker a fresh allowance. Database counters survive it.
    //
    // The global numbers stay deliberately generous. Turning the limiter on at
    // all affects every auth route, and the portal reaches Better Auth through
    // its own same origin proxy (`apps/admin/lib/auth-server.ts`), so if the
    // proxy's own address is what the limiter sees, a tight global rule would
    // throttle every portal user as if they were one caller.
    //
    // Worth knowing before trusting this: the library keys counters on the
    // client IP and SKIPS limiting entirely when it cannot read one (it logs a
    // warning once). Whether Convex forwards `x-forwarded-for` to an HTTP
    // action, on both the mobile path and the portal proxy path, is an
    // empirical question that spec 0007 task 4 says to confirm once against a
    // live deployment; it is in this feature's verify.md, still unconfirmed. If
    // the answer is no, the fallback is the per address throttle table weighed
    // in the spec's rationale.md.
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 100,
      customRules: {
        "/request-password-reset": { window: 15 * 60, max: 3 },
      },
    },
    // No self-service web sign up (SRS F1-02, spec 0004): a portal user signs
    // in with the account they already created on mobile. For Google, this
    // alone draws the line — mobile's sign in/sign up screens pass
    // `requestSignUp: true` explicitly, the web sign in page does not, so an
    // unmatched Google account is rejected instead of silently provisioned.
    //
    // Email/password sign up has no such flag to lean on, so the
    // databaseHooks check below covers it instead, scoped to that one
    // endpoint only. Gated on an explicit `X-Client-Platform: mobile` header
    // mobile sets, NOT on the request's Origin header: Convex's HTTP Actions
    // layer strips Origin before any function runs (confirmed empirically
    // during /check verify), so an Origin based check here would silently
    // never fire. See the spec's rationale.md for the full story.
    databaseHooks: {
      user: {
        create: {
          before: async (_user, context) => {
            // Fail open: this is a product rule for an honest client, not
            // the real security boundary (that's the role check on every
            // sensitive page/function). A request this hook can't inspect
            // should never be the reason a legitimate signup fails.
            if (!context) {
              console.warn(
                "auth.databaseHooks.user.create.before: no request context, allowing"
              );
              return;
            }
            if (context.path !== "/sign-up/email") return;
            const clientPlatform = context.getHeader(CLIENT_PLATFORM_HEADER);
            if (clientPlatform !== MOBILE_CLIENT_PLATFORM) {
              throw new APIError("FORBIDDEN", {
                message:
                  "Sign up from the web isn't available. Create your account in the KLT Cyber mobile app first.",
              });
            }
          },
        },
      },
    },
    socialProviders: googleConfigured
      ? {
          google: {
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
            disableImplicitSignUp: true,
          },
        }
      : undefined,
    // 30 days, refreshed daily on use; shared by the mobile app and the web
    // admin portal since both run through this one config. Spec 0003.
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
    },
    plugins: [expo(), crossDomain({ siteUrl }), convex({ authConfig })],
  });
