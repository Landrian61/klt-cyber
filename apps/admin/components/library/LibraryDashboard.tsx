"use client";

import { Heading } from "@/components/ui/Heading";
import type { Id } from "@/lib/api";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/shadcn/tabs";
import { LibraryOverviewTab } from "./LibraryOverviewTab";
import { LibraryCollectionTab } from "./LibraryCollectionTab";
import { LibraryStockTab } from "./LibraryStockTab";
import { LibraryFreeContentTab } from "./LibraryFreeContentTab";
import { LibraryRosterSection } from "./LibraryRosterSection";

/**
 * The Library's own dashboard (spec 0017).
 *
 * The Library stops using the shared `DepartmentDashboard`, whose roster and
 * verification cards led a page the Library team never came for. Four tabs,
 * each about the shelf: Overview, Collection, Stock, Free content. The
 * Library's other four pages keep the shared `[slug]` shell, its sidebar and
 * its header unchanged, and no other department's dashboard changes at all
 * (AC-1).
 *
 * Library is the second department to take spec 0012's Dashboard exception,
 * after Media. Two is a pattern forming: the third department that wants one
 * should trigger a proper decision about what the shell is for rather than
 * another carve out.
 *
 * **Every caller holding `manageLibrary` sees the same four tabs with the same
 * content** — the HOD, a delegate and a roster member holding nothing else
 * alike, because SRS 4.13.2 gives every Library roster member the same
 * operational access (AC-3).
 *
 * **Per tab subscription (AC-24).** Each tab's query lives inside its own tab
 * component, and `TabsContent` does not mount an inactive tab, so an unopened
 * tab has no subscription at all and a stock movement never recomputes the
 * collection mix. Only Overview, the tab a fresh visit lands on, subscribes
 * immediately.
 */
export function LibraryDashboard({
  departmentId,
  departmentName,
  basePath,
  canViewRoster,
}: {
  departmentId: Id<"departments">;
  departmentName: string;
  /** The portal this dashboard sits in, e.g. `/areas-of-service/library`. */
  basePath: string;
  canViewRoster: boolean;
}) {
  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <Heading as="h1" size="xl">
          {departmentName}
        </Heading>
        <p className="font-body text-sm text-on-surface-variant">
          What the church holds, what is running out, and what the congregation
          can open right now.
        </p>
      </header>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="collection">Collection</TabsTrigger>
          <TabsTrigger value="stock">Stock</TabsTrigger>
          <TabsTrigger value="free">Free content</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <LibraryOverviewTab basePath={basePath} />
        </TabsContent>
        <TabsContent value="collection">
          <LibraryCollectionTab />
        </TabsContent>
        <TabsContent value="stock">
          <LibraryStockTab />
        </TabsContent>
        <TabsContent value="free">
          <LibraryFreeContentTab basePath={basePath} />
        </TabsContent>
      </Tabs>

      {/* Below the tabs, and only for a caller who may see it. For a caller
          without `viewRoster` the whole section is ABSENT — not hidden, not a
          placeholder, and neither shell query is called (AC-4). */}
      {canViewRoster && (
        <LibraryRosterSection
          departmentId={departmentId}
          basePath={basePath}
        />
      )}
    </div>
  );
}
