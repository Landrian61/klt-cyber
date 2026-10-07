import { query } from "./_generated/server";
import { isContentManager } from "./lib/authz";

// Content-module capability probe for the admin portal. Never throws — the web
// UI reads this to decide whether to show the content-management screens.
// Writes are still enforced server-side by `canManageContent` in every mutation.
export const getMyContentAccess = query({
  args: {},
  handler: async (ctx) => {
    return { canManage: await isContentManager(ctx) };
  },
});
