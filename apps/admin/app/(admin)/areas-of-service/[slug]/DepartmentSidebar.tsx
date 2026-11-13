"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  Building2,
  CalendarDays,
  ChartColumn,
  ClipboardCheck,
  Download,
  KeyRound,
  LayoutDashboard,
  MessageSquare,
  Network,
  Package,
  Settings,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import { badgeLabel } from "@klt-cyber/shared";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/shadcn/sidebar";
import { api } from "@/lib/api";
import { useAuthQuery } from "@/lib/useAuthQuery";
import { SidebarBrandHeader } from "@/components/brand/SidebarBrandHeader";
import type { DepartmentShellContext } from "@/components/department/DepartmentShellProvider";

/**
 * The shell's navigation, driven entirely by the `can` object the server
 * computed (spec 0012, AC-5).
 *
 * `capability: null` means the page is open to anyone who reached the shell at
 * all: Dashboard and Settings are the two, since Settings also holds the
 * caller's own account panel. Everything else names the one capability that
 * gates it, and the matching Convex function re-checks the same rule, so a
 * hidden item is a convenience rather than the boundary.
 */
type NavItem = {
  segment: string;
  label: string;
  icon: LucideIcon;
  capability: keyof DepartmentShellContext["can"] | null;
};

const NAV: NavItem[] = [
  { segment: "dashboard", label: "Dashboard", icon: LayoutDashboard, capability: null },
  { segment: "roster", label: "Roster", icon: Users, capability: "viewRoster" },
  {
    segment: "activities",
    label: "Activities",
    icon: CalendarDays,
    capability: "createActivity",
  },
  {
    segment: "messages",
    label: "Messages",
    icon: MessageSquare,
    capability: "viewMessages",
  },
  // Library's three pages (spec 0015, AC-5). `manageLibrary` is a
  // department-scoped capability — only `Library & Information` grants it, and
  // there to its HOD, its delegates, its verified roster and a System Admin
  // alike — so these three entries simply never render for any other
  // department. Library is the first department to put a page on the shared
  // `[slug]` shell that only it can open, and this is the pattern Hospitality
  // and Real Estate will follow.
  {
    segment: "catalogue",
    label: "Catalogue",
    icon: BookOpen,
    capability: "manageLibrary",
  },
  {
    segment: "free-content",
    label: "Free content",
    icon: Download,
    capability: "manageLibrary",
  },
  {
    segment: "stock",
    label: "Stock",
    icon: Package,
    capability: "manageLibrary",
  },
  // Spec 0018. The same scoped mechanism, one department along: only
  // `Real Estate` grants `manageRealEstate`, so these two never render for any
  // other department. Unlike the Library's three, they never reach a roster
  // member either — Real Estate is deliberately absent from
  // ROSTER_PORTAL_DEPARTMENTS, so a roster member resolves to no shell role
  // there at all and `can.manageRealEstate` is false for them.
  {
    segment: "tower",
    label: "Tower of Faith",
    icon: Building2,
    capability: "manageRealEstate",
  },
  {
    segment: "spaces",
    label: "Spaces to let",
    icon: KeyRound,
    capability: "manageRealEstate",
  },
  // Spec 0024. Hospitality's pages, on the same scoped mechanism. Only
  // `Hospitality` grants `manageHospitality`, and there to its HOD, delegates,
  // a System Admin and its verified roster. Spec 0025 groups them by
  // purpose on Hospitality's own sidebar (`HOSPITALITY_GROUPS` below).
  {
    segment: "visitors",
    label: "Visitors",
    icon: UserRound,
    capability: "manageHospitality",
  },
  {
    segment: "follow-ups",
    label: "Follow ups",
    icon: ClipboardCheck,
    capability: "manageHospitality",
  },
  {
    segment: "clan-placement",
    label: "Clan placement",
    icon: Network,
    capability: "manageHospitality",
  },
  {
    segment: "reports",
    label: "Reports",
    icon: ChartColumn,
    capability: "manageHospitality",
  },
  { segment: "settings", label: "Settings", icon: Settings, capability: null },
];

/**
 * Hospitality's sidebar, grouped by purpose (spec 0025, AC-21). Only the
 * segments here render, in this order; each still goes through its own
 * capability, and a group with nothing visible is left out. Dashboard sits
 * alone at the top and Settings in the footer.
 */
const HOSPITALITY_GROUPS: { label: string; segments: string[] }[] = [
  { label: "Welcome and care", segments: ["visitors", "follow-ups", "clan-placement"] },
  { label: "Insights", segments: ["reports"] },
  { label: "Team", segments: ["roster", "activities", "messages"] },
];

type Badges = {
  unassignedFollowUps: number;
  waitingForClan: number;
  requestsWaiting: number | null;
};

/**
 * Which badge an item carries, and the words that go with its count in the
 * accessible name and tooltip (AC-22). Roster's count is `null` for a caller
 * without `viewRoster`, so it never shows for them.
 */
function badgeFor(
  segment: string,
  badges: Badges | null | undefined,
): { count: number; words: string } | null {
  if (!badges) return null;
  if (segment === "follow-ups") return { count: badges.unassignedFollowUps, words: "unassigned" };
  if (segment === "clan-placement") {
    return { count: badges.waitingForClan, words: "waiting for a clan" };
  }
  if (segment === "roster" && badges.requestsWaiting !== null) {
    return { count: badges.requestsWaiting, words: "requests waiting" };
  }
  return null;
}

const SIDEBAR_GRADIENT =
  "[&_[data-slot=sidebar-inner]]:bg-[linear-gradient(180deg,var(--color-heaven-deep)_0%,var(--color-heaven-deep)_58%,var(--color-heaven)_82%,var(--color-heaven-bright)_100%)]";

export function DepartmentSidebar({
  slug,
  departmentName,
  can,
}: {
  slug: string;
  departmentName: string;
  can: DepartmentShellContext["can"];
}) {
  const pathname = usePathname();
  const base = `/areas-of-service/${slug}`;
  const items = NAV.filter((item) => !item.capability || can[item.capability]);
  const grouped = can.manageHospitality;
  // One small subscription, Hospitality only (AC-23).
  const badges = useAuthQuery(api.hospitality.getSidebarBadges, grouped ? {} : "skip");

  const renderItem = (item: NavItem) => {
    const href = `${base}/${item.segment}`;
    const active = pathname === href || pathname.startsWith(`${href}/`);
    const Icon = item.icon;
    const badge = badgeFor(item.segment, badges);
    const label = badge ? badgeLabel(badge.count) : null;
    const spoken = label ? `${label} ${badge!.words}` : null;
    return (
      <SidebarMenuItem key={item.segment}>
        <SidebarMenuButton
          asChild
          isActive={active}
          tooltip={spoken ? `${item.label}, ${spoken}` : item.label}
          className="text-white/70 hover:text-white data-[active=true]:text-sidebar-primary"
        >
          <Link href={href} aria-current={active ? "page" : undefined}>
            <Icon className="h-5 w-5 shrink-0" />
            <span>
              {item.label}
              {spoken && <span className="sr-only">, {spoken}</span>}
            </span>
          </Link>
        </SidebarMenuButton>
        {label && (
          <SidebarMenuBadge
            aria-hidden
            className="bg-crimson font-mono text-white peer-hover/menu-button:text-white peer-data-[active=true]/menu-button:text-white"
          >
            {label}
          </SidebarMenuBadge>
        )}
      </SidebarMenuItem>
    );
  };

  const bySegment = new Map(items.map((item) => [item.segment, item]));
  const dashboard = bySegment.get("dashboard");
  const settings = bySegment.get("settings");

  return (
    <Sidebar collapsible="icon" className={SIDEBAR_GRADIENT}>
      {/* The KLT mark, not the department icon: every rail in the portal
          reads the same, and the department is named in the caption. Its own
          icon identifies it in the top bar instead, where the switcher sits. */}
      <SidebarBrandHeader href={`${base}/dashboard`} caption={departmentName} />

      {grouped ? (
        <>
          <SidebarContent>
            {dashboard && (
              <SidebarGroup>
                <SidebarMenu>{renderItem(dashboard)}</SidebarMenu>
              </SidebarGroup>
            )}
            {HOSPITALITY_GROUPS.map((group) => {
              const visible = group.segments
                .map((segment) => bySegment.get(segment))
                .filter((item): item is NavItem => item !== undefined);
              if (visible.length === 0) return null;
              return (
                <SidebarGroup key={group.label}>
                  <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
                  <SidebarMenu>{visible.map(renderItem)}</SidebarMenu>
                </SidebarGroup>
              );
            })}
          </SidebarContent>
          {settings && (
            <SidebarFooter>
              <SidebarMenu>{renderItem(settings)}</SidebarMenu>
            </SidebarFooter>
          )}
        </>
      ) : (
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Department</SidebarGroupLabel>
            <SidebarMenu>{items.map(renderItem)}</SidebarMenu>
          </SidebarGroup>
        </SidebarContent>
      )}

      <SidebarRail />
    </Sidebar>
  );
}
