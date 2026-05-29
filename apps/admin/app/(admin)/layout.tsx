import type { ReactNode } from "react";
import { AdminHeader } from "@/components/AdminHeader";

// Protected admin shell. The route group keeps "/" clean in the URL while
// giving the signed-in area its own chrome. A left rail is reserved (empty for
// now) for the navigation modules that arrive in later PRs.
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-parchment">
      <AdminHeader />
      <div className="mx-auto flex max-w-6xl gap-8 px-6 py-8">
        {/* Reserved space for the future module rail (built in a later PR). */}
        <aside
          aria-hidden="true"
          className="hidden w-56 shrink-0 lg:block"
        />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
