import type { ReactNode } from "react";
import { ActivityReporter } from "@/components/ActivityReporter";

// The portal-wide wrapper for every signed-in route group (spec 0011).
//
// It renders no chrome on purpose: each module below it — Administration,
// system-admin, departments, areas-of-service — owns its own shell, and this
// layout exists only so there is exactly one mount point for things that
// belong to the whole portal rather than to any one module.
//
// Today that is the activity reporter. It sits here rather than in each
// module's layout because "a portal user was active" is true wherever in the
// portal they are, and a per-module copy would be four copies to keep in step
// and one to forget. Middleware has already turned away anyone with no
// session cookie, so every render beneath this point is a signed-in one.
export default function PortalLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <ActivityReporter />
      {children}
    </>
  );
}
