import {
  createClient,
  type AuthFunctions,
  type GenericCtx,
} from "@convex-dev/better-auth";
import { convex, crossDomain } from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth/minimal";
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
          status: "active",
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
    trustedOrigins: [siteUrl],
    database: authComponent.adapter(ctx),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
    },
    socialProviders: googleConfigured
      ? {
          google: {
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          },
        }
      : undefined,
    plugins: [crossDomain({ siteUrl }), convex({ authConfig })],
  });
