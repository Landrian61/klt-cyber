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
