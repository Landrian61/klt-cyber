import type { ReactNode } from "react";
import { AdminHeader } from "@/components/AdminHeader";

// Chrome for the pre-role "hub" pages ("/" redirect, /select-role): the simple
// global header over a centered column. Role-scoped portals (e.g. /system-admin)
// live outside this group and provide their own sidebar + top bar shell.
export default function HubLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-parchment">
      <AdminHeader />
      <div className="mx-auto max-w-7xl px-6 py-8">
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
