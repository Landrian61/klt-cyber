"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  Building2,
  CalendarDays,
  Download,
  KeyRound,
  LayoutDashboard,
  MessageSquare,
  Package,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/shadcn/sidebar";
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
const NAV: {
  segment: string;
  label: string;
  icon: LucideIcon;
  capability: keyof DepartmentShellContext["can"] | null;
}[] = [
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
  { segment: "settings", label: "Settings", icon: Settings, capability: null },
];

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

  return (
    <Sidebar collapsible="icon" className={SIDEBAR_GRADIENT}>
      {/* The KLT mark, not the department icon: every rail in the portal
          reads the same, and the department is named in the caption. Its own
          icon identifies it in the top bar instead, where the switcher sits. */}
      <SidebarBrandHeader href={`${base}/dashboard`} caption={departmentName} />

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Department</SidebarGroupLabel>
          <SidebarMenu>
            {items.map((item) => {
              const href = `${base}/${item.segment}`;
              const active =
                pathname === href || pathname.startsWith(`${href}/`);
              const Icon = item.icon;
              return (
                <SidebarMenuItem key={item.segment}>
                  <SidebarMenuButton
                    asChild
                    isActive={active}
                    tooltip={item.label}
                    className="text-white/70 hover:text-white data-[active=true]:text-sidebar-primary"
                  >
                    <Link href={href} aria-current={active ? "page" : undefined}>
                      <Icon className="h-5 w-5 shrink-0" />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarRail />
    </Sidebar>
  );
}
