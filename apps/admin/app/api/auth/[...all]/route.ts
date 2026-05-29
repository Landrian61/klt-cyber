import { handler } from "@/lib/auth-server";

// Same-origin proxy for all Better Auth requests. Forwards /api/auth/* to the
// Convex deployment so session cookies are set first-party on the admin domain.
export const { GET, POST } = handler;
