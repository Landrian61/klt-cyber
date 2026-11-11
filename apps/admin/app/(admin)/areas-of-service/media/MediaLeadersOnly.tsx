import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { fetchAuthQuery } from "@/lib/auth-server";
import { api } from "@/lib/api";
import { ErrorState } from "@/components/ui/ErrorState";

/**
 * The second door inside Media's portal (spec 0019, AC-32).
 *
 * The Media layout admits two groups: Media's leaders (`hasMediaAccess`:
 * System Admin, HOD, delegates) and every `manageRadio` holder, which adds the
 * verified roster. Devotionals and Past events publish to the whole church,
 * which is authority the roster was never given, so these pages check
 * `hasMediaAccess` again and send anyone else to the Media dashboard instead of
 * bouncing them out of the portal. The Convex functions behind both pages
 * re-check `requireMediaAuthority`; this is chrome, not the boundary.
 */
export async function MediaLeadersOnly({ children }: { children: ReactNode }) {
  let account;
  try {
    account = await fetchAuthQuery(api.profile.getMyAccount);
  } catch {
    return <ErrorState cause="offline" />;
  }
  if (!account) redirect("/sign-in");
  if (!account.hasMediaAccess) redirect("/areas-of-service/media");
  return <>{children}</>;
}
