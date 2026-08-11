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

// The system_admin rail, built on shadcn's Sidebar (collapsible="icon"): the
// icon-only rail, mobile drawer, Cmd/Ctrl+B shortcut, and rail-drag toggle all
// come from the primitive. Ours is themed dark (heaven-blue gradient, dark blue
// dominating) with deep-gold active items — matching the "Admin Portal" caption.

interface NavItem {
  href: string;
  label: string;
  /** Active only on an exact pathname match (the section landing page). */
  exact?: boolean;
  icon: ReactNode;
}

const iconClass = "h-5 w-5 shrink-0";

const NAV_ITEMS: NavItem[] = [
  {
    href: "/system-admin",
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
  {
    href: "/system-admin/users",
    label: "Users",
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
    href: "/system-admin/content",
    label: "Content",
    icon: (
      <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <path d="M8 9h8M8 13h8M8 17h5" />
      </svg>
    ),
  },
  {
    href: "/system-admin/activity",
    label: "Activity",
    icon: (
      <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3.5 12h4l2.5-6.5 4 13L16.5 12h4" />
      </svg>
    ),
  },
];

// Dark blue dominates ~58% before easing into the brighter royal at the foot.
const SIDEBAR_GRADIENT =
  "[&_[data-slot=sidebar-inner]]:bg-[linear-gradient(180deg,var(--color-heaven-deep)_0%,var(--color-heaven-deep)_58%,var(--color-heaven)_82%,var(--color-heaven-bright)_100%)]";

export function SystemAdminSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon" className={SIDEBAR_GRADIENT}>
      <SidebarHeader className="p-3">
        <Link
          href="/system-admin"
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
              Admin Portal
            </span>
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Modules</SidebarGroupLabel>
          <SidebarMenu>
            {NAV_ITEMS.map((item) => {
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
      </SidebarContent>

      {/* No switcher here — switching Areas of Service lives in exactly one
          place, the top bar's DepartmentSwitcher. */}

      <SidebarRail />
    </Sidebar>
  );
}
