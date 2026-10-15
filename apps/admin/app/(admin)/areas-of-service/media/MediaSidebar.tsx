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

interface NavItem {
  href: string;
  label: string;
  exact?: boolean;
  icon: ReactNode;
}

interface NavGroup {
  label: string;
  items: NavItem[];
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
];

const SIDEBAR_GRADIENT =
  "[&_[data-slot=sidebar-inner]]:bg-[linear-gradient(180deg,var(--color-heaven-deep)_0%,var(--color-heaven-deep)_58%,var(--color-heaven)_82%,var(--color-heaven-bright)_100%)]";

export function MediaSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon" className={SIDEBAR_GRADIENT}>
      <SidebarHeader className="p-3">
        <Link
          href="/areas-of-service/media/devotionals"
          className="flex items-center gap-2.5 group-data-[collapsible=icon]:justify-center"
        >
          <Image
            src="/logo-circle-96.png"
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
              Media
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
