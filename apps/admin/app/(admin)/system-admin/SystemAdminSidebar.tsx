"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// Full-height sidebar for the system_admin portal — the familiar admin shell:
// brand up top, modules in the middle, the way out of the role at the bottom.
// Tonal separation from the page (bg-surface-low), no border line (No-Line
// Rule). Future admin modules (clans, broadcasts, giving, …) add themselves to
// NAV_ITEMS — the sidebar itself never needs restructuring. Desktop-first:
// full labels at lg+, icon-only rail below.

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
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <path d="M8 9h8M8 13h8M8 17h5" />
      </svg>
    ),
  },
  {
    href: "/system-admin/activity",
    label: "Activity",
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
        <path d="M3.5 12h4l2.5-6.5 4 13L16.5 12h4" />
      </svg>
    ),
  },
];

export function SystemAdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 flex h-dvh w-16 shrink-0 flex-col bg-[linear-gradient(165deg,var(--color-heaven-deep)_0%,var(--color-heaven)_50%,var(--color-heaven-bright)_100%)] lg:w-60">
      {/* ── Brand: the KLT mark (shared with the mobile app), not the full
             wordmark — the mark carries the identity, the caption the context. */}
      <Link
        href="/system-admin"
        className="flex h-16 shrink-0 items-center justify-center gap-2.5 lg:justify-start lg:px-4"
      >
        <Image
          src="/logo-circle.png"
          alt="KLT Cyber Church"
          width={36}
          height={36}
          className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-white/15"
        />
        <span className="hidden min-w-0 flex-col leading-tight lg:flex">
          <span className="truncate font-body text-sm font-semibold text-white">
            KLT Cyber Church
          </span>
          <span className="truncate font-body text-[11px] uppercase tracking-[0.16em] text-gold-radiant">
            Admin Portal
          </span>
        </span>
      </Link>

      {/* ── Modules ───────────────────────────────────────────────────────── */}
      <nav aria-label="Admin modules" className="min-h-0 flex-1 overflow-y-auto px-2 pt-4 lg:px-3">
        <p className="hidden px-3 pb-2 font-body text-xs font-semibold uppercase tracking-wide text-white/45 lg:block">
          Modules
        </p>
        <ul className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => {
            const active = item.exact
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  title={item.label}
                  aria-label={item.label}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex h-10 items-center justify-center gap-3 rounded-md font-body text-sm transition-colors lg:justify-start lg:px-3",
                    active
                      ? "bg-white/10 font-semibold text-gold-radiant"
                      : "font-medium text-white/65 hover:bg-white/10 hover:text-white",
                  )}
                >
                  {active && (
                    <span
                      aria-hidden="true"
                      className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-gold-radiant"
                    />
                  )}
                  {item.icon}
                  <span className="hidden lg:inline">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* ── Footer: the way out of this role ──────────────────────────────── */}
      <div className="shrink-0 px-2 pb-4 pt-2 lg:px-3">
        <Link
          href="/select-role"
          title="Switch role"
          aria-label="Switch role"
          className="flex h-10 items-center justify-center gap-3 rounded-md font-body text-sm font-medium text-white/65 transition-colors hover:bg-white/10 hover:text-white lg:justify-start lg:px-3"
        >
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
            <path d="M7 8h13l-3.5-3.5" />
            <path d="M17 16H4l3.5 3.5" />
          </svg>
          <span className="hidden lg:inline">Switch role</span>
        </Link>
      </div>
    </aside>
  );
}
