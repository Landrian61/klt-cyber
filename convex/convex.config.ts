import { defineApp } from "convex/server";
import betterAuth from "@convex-dev/better-auth/convex.config";
import r2 from "@convex-dev/r2/convex.config";
import pushNotifications from "@convex-dev/expo-push-notifications/convex.config";
import resend from "@convex-dev/resend/convex.config";

const app = defineApp();
app.use(betterAuth);
app.use(r2);
app.use(pushNotifications);
// Transactional email (spec 0007). Pinned to an exact version in the root
// package.json: it is a 0.2.x component, so an unplanned minor upgrade can
// change its API, same as @convex-dev/better-auth.
app.use(resend);

export default app;
