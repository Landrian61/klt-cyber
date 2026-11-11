"use client";

import { DepartmentShellGate } from "@/components/department/DepartmentShellProvider";
import { MediaDashboard } from "@/components/radio/MediaDashboard";

/**
 * Media's portal opens on its own dashboard (spec 0019, AC-34). Gated on
 * `manageRadio`, which every person this portal admits holds, Media's leaders
 * and the verified roster alike, so nobody lands on a page that turns them
 * away. The query behind it re-checks the same capability.
 */
export default function MediaPortalPage() {
  return (
    <DepartmentShellGate requires="manageRadio">
      {() => <MediaDashboard />}
    </DepartmentShellGate>
  );
}
