"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/shadcn/sidebar";

// The Administration rail, built on shadcn's Sidebar (collapsible="icon") —
// the icon-only rail, mobile drawer, Cmd/Ctrl+B shortcut, and rail-drag toggle
// all come from the primitive. Themed to match the system_admin rail exactly:
// heaven-blue gradient with deep-gold active items.

interface NavItem {
  href: string;
  label: string;
  /** Active only on an exact pathname match (the section landing page). */
  exact?: boolean;
  icon: ReactNode;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const iconClass = "h-5 w-5 shrink-0";

// The full 8-page Administration IA (docs/Admin_Portal.md "Navigation"): every
// authorized person — HOD, delegate, System Admin — sees the same pages here.
// What differs per role is which *actions* a page offers, gated inside each
// page/mutation, not which pages appear in this list.
const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [
      {
        href: "/admin",
        label: "Dashboard",
        exact: true,
        icon: (
          <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
            <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
            <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
            <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
          </svg>
        ),
      },
    ],
  },
  {
    label: "Membership",
    items: [
      {
        href: "/admin/verification",
        label: "Verification queue",
        icon: (
          <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 4.5h11l3 3V19a.5.5 0 0 1-.5.5h-13A.5.5 0 0 1 5 19V5a.5.5 0 0 1 .5-.5Z" />
            <path d="m9 12.5 2 2 4-4.5" />
          </svg>
        ),
      },
      {
        href: "/admin/members",
        label: "Members directory",
        icon: (
          <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="9" cy="8" r="3.25" />
            <path d="M3.5 19.5c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
            <path d="M15.5 5.4a3.25 3.25 0 0 1 0 5.2" />
            <path d="M17.5 14.9c1.8.7 3 2.2 3 4.6" />
          </svg>
        ),
      },
      {
        // No dedicated Administration-scoped Roster screen yet — this reuses
        // the existing department-picker → department-members flow. Repoint
        // at a purpose-built /admin/roster once that page exists.
        href: "/admin/departments",
        label: "Roster",
        icon: (
          <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 20.5V6.5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v14" />
            <path d="M12 20.5v-9a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v9" />
            <path d="M2.5 20.5h19" />
            <path d="M7 9h2M7 12.5h2M15.5 14h2" />
          </svg>
        ),
      },
    ],
  },
  {
    label: "Programs & content",
    items: [
      {
        href: "/admin/weekly-program",
        label: "Weekly program",
        icon: (
          <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3.5" y="4.5" width="17" height="16" rx="2" />
            <path d="M3.5 9.5h17" />
            <path d="M8 3v3M16 3v3" />
            <path d="M12 13.5a2.5 2.5 0 1 1 2.5 2.5" />
            <path d="m12.2 13.3.9 1" />
          </svg>
        ),
      },
      {
        href: "/admin/events",
        label: "Events",
        icon: (
          <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3.5" y="4.5" width="17" height="16" rx="2" />
            <path d="M3.5 9.5h17" />
            <path d="M8 3v3M16 3v3" />
            <path d="m12 12.7 1 2 2.2.3-1.6 1.5.4 2.2-2-1-2 1 .4-2.2-1.6-1.5 2.2-.3Z" />
          </svg>
        ),
      },
      {
        href: "/admin/announcements",
        label: "Announcements",
        icon: (
          <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 11v3a1 1 0 0 0 1 1h1.3l1.4 4.2a1 1 0 0 0 1 .7h.9a1 1 0 0 0 .95-1.3L9.6 15H11l8-3.6v-3L11 5 4 8.6v2.4Z" />
            <path d="M19 8.4v6.2" />
          </svg>
        ),
      },
    ],
  },
  {
    label: "Planning",
    items: [
      {
        href: "/admin/year-planner",
        label: "Year planner",
        icon: (
          <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3.5" y="4.5" width="17" height="16" rx="2" />
            <path d="M3.5 9.5h17" />
            <path d="M8 3v3M16 3v3" />
            <path d="M7.5 13h2M11 13h2M14.5 13h2M7.5 16.5h2M11 16.5h2" />
          </svg>
        ),
      },
    ],
  },
];

// Dark blue dominates ~58% before easing into the brighter royal at the foot.
const SIDEBAR_GRADIENT =
  "[&_[data-slot=sidebar-inner]]:bg-[linear-gradient(180deg,var(--color-heaven-deep)_0%,var(--color-heaven-deep)_58%,var(--color-heaven)_82%,var(--color-heaven-bright)_100%)]";

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon" className={SIDEBAR_GRADIENT}>
      <SidebarHeader className="p-3">
        <Link
          href="/admin"
          className="flex items-center gap-2.5 group-data-[collapsible=icon]:justify-center"
        >
          <Image
            src="/logo-circle.png"
            alt="KLT Cyber Church"
            width={36}
            height={36}
            className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-white/15"
          />
          <span className="flex min-w-0 flex-col leading-tight group-data-[collapsible=icon]:hidden">
            <span className="truncate font-body text-sm font-semibold text-white">
              KLT Cyber Church
            </span>
            <span className="truncate font-body text-[11px] uppercase tracking-[0.16em] text-sidebar-primary">
              Administration
            </span>
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        {NAV_GROUPS.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarMenu>
              {group.items.map((item) => {
                const active = item.exact
                  ? pathname === item.href
                  : pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      tooltip={item.label}
                      className="text-white/70 hover:text-white data-[active=true]:text-sidebar-primary"
                    >
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                      >
                        {item.icon}
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>

      {/* No switcher here — switching Areas of Service lives in exactly one
          place, the top bar's DepartmentSwitcher. */}

      <SidebarRail />
    </Sidebar>
  );
}
