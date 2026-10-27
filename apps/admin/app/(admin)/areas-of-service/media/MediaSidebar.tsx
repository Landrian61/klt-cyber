"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, MessageSquare, Settings, Users } from "lucide-react";
import {
  useDepartmentShell,
  type DepartmentCapability,
} from "@/components/department/DepartmentShellProvider";
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

interface NavItem {
  href: string;
  label: string;
  exact?: boolean;
  icon: ReactNode;
  /** When set, the item renders only if the caller holds this capability. */
  capability?: DepartmentCapability;
}

interface NavGroup {
  label: string;
  items: NavItem[];
  /**
   * When true, the whole group is hidden from a caller with no shell access, so
   * nobody is shown a page the gate would bounce them back from.
   *
   * Unreachable in practice today: the Media layout's `hasMediaAccess` gate is
   * already System Admin or Media's HOD or delegate, which is exactly the set
   * that gets a shell context. Kept because the two gates are separate rules
   * that could diverge, and because this rail must not depend on them agreeing.
   */
  requiresShell?: boolean;
}

const iconClass = "h-5 w-5 shrink-0";

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Content",
    items: [
      {
        href: "/areas-of-service/media/devotionals",
        label: "Devotionals",
        icon: (
          <svg
            className={iconClass}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 6.5C10.5 5.3 8.3 4.7 5 4.7v13c3.3 0 5.5.6 7 1.8 1.5-1.2 3.7-1.8 7-1.8v-13c-3.3 0-5.5.6-7 1.8Z" />
            <path d="M12 6.5v13" />
          </svg>
        ),
      },
      {
        href: "/areas-of-service/media/past-events",
        label: "Past events",
        icon: (
          <svg
            className={iconClass}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
            <path d="m10.5 9.5 4 2.5-4 2.5Z" />
          </svg>
        ),
      },
    ],
  },
  // The shared department pages (spec 0012, AC-3). Media renders exactly the
  // same components every other department does, in its own chrome, and keeps
  // Devotionals and Past events above as the pages that are genuinely its own.
  // Each item is gated by the capability its page needs, from the same `can`
  // object the Convex functions enforce, so a plain roster member sees none of
  // them and a delegate sees only what a delegate may do.
  {
    label: "Department",
    requiresShell: true,
    items: [
      {
        href: "/areas-of-service/media/roster",
        label: "Roster",
        capability: "viewRoster",
        icon: <Users className={iconClass} />,
      },
      {
        href: "/areas-of-service/media/activities",
        label: "Activities",
        capability: "createActivity",
        icon: <CalendarDays className={iconClass} />,
      },
      {
        href: "/areas-of-service/media/messages",
        label: "Messages",
        capability: "viewMessages",
        icon: <MessageSquare className={iconClass} />,
      },
      {
        href: "/areas-of-service/media/settings",
        label: "Settings",
        icon: <Settings className={iconClass} />,
      },
    ],
  },
];

const SIDEBAR_GRADIENT =
  "[&_[data-slot=sidebar-inner]]:bg-[linear-gradient(180deg,var(--color-heaven-deep)_0%,var(--color-heaven-deep)_58%,var(--color-heaven)_82%,var(--color-heaven-bright)_100%)]";

export function MediaSidebar() {
  const pathname = usePathname();
  // Null for a plain Media roster member, who reaches Devotionals and Past
  // events but holds no shell page at all.
  const shell = useDepartmentShell();

  const groups = NAV_GROUPS.filter((group) => !group.requiresShell || shell)
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) => !item.capability || shell?.can[item.capability],
      ),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <Sidebar collapsible="icon" className={SIDEBAR_GRADIENT}>
      <SidebarBrandHeader
        href="/areas-of-service/media/devotionals"
        caption="Media"
      />

      <SidebarContent>
        {groups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarMenu>
              {group.items.map((item) => {
                const active = item.exact
                  ? pathname === item.href
                  : pathname === item.href ||
                    pathname.startsWith(`${item.href}/`);
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

      <SidebarRail />
    </Sidebar>
  );
}
