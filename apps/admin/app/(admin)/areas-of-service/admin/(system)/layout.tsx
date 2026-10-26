import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { fetchAuthQuery } from "@/lib/auth-server";
import { api } from "@/lib/api";
import { ErrorState } from "@/components/ui/ErrorState";

// The System Admin only corner of Administration (spec 0011 AC-20, and spec
// 0004's AC-2, which specifies the same guard — whichever feature lands first
// owns this file and the other reuses it).
//
// A route group, so the URL stays `/areas-of-service/admin/<page>` and these
// pages sit beside the rest of Administration rather than in a second portal.
// The parenthesised segment contributes nothing to the path; what it buys is
// one place to put the authority check for every page beneath it, instead of
// repeating it per page and eventually forgetting one.
//
// This is a UX gate, not the security boundary: it renders the outer
// Administration shell's chrome for someone who should not see these pages
// one moment sooner than the redirect. The real guard is in Convex, where
// `getPlatformAnalytics` and `listServices` resolve the caller themselves and
// every cost mutation calls `requireSystemAdmin` (convex/AGENTS.md).
export default async function SystemAdminAreaLayout({
  children,
}: {
  children: ReactNode;
}) {
  // The same reasoning as the twin check in the parent Administration layout:
  // `fetchAuthQuery` is a real network round trip, and if it fails we must
  // neither redirect to sign-in (the caller may be authenticated and merely
  // offline) nor render the page past an authority check that never actually
  // ran. Render the offline state, granting nothing.
  let account;
  try {
    account = await fetchAuthQuery(api.profile.getMyAccount);
  } catch {
    return <ErrorState cause="offline" />;
  }
  if (!account) redirect("/sign-in");

  const isSystemAdmin = account.activeRoles.some(
    (role) => role.roleType === "system_admin",
  );

  // Back to Administration's own landing page rather than to /unauthorized:
  // whoever reached here already holds Administration authority (the parent
  // layout proved it), so they are not unauthorized, just not a System Admin.
  if (!isSystemAdmin) redirect("/areas-of-service/admin");

  return <>{children}</>;
}
