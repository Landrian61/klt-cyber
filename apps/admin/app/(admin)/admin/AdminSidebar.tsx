"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ClipboardCheck,
  Building2,
  Landmark,
  Users,
  Repeat,
} from "lucide-react";
import { cn } from "@/lib/utils";
import logo from "../../icon.png";

const NAV_ITEMS = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  {
    href: "/admin/verification",
    label: "Verification",
    icon: ClipboardCheck,
  },
  { href: "/admin/members", label: "Members", icon: Users },
  { href: "/admin/departments", label: "Departments", icon: Building2 },
  // { href: "/admin/facilities", label: "Facilities", icon: Landmark },
];

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-60 shrink-0 flex-col gap-1 bg-[var(--color-primary)] p-4 text-white/70">
      <div className="mb-6 flex items-center gap-2.5 px-2">
        <Image
          src={logo}
          alt="KLT Cyber Church"
          className="h-8 w-8 rounded-md"
        />
        <div>
          <p className="font-display text-sm font-semibold leading-tight text-white">
            KLT Cyber
          </p>
          <p className="text-[11px] uppercase tracking-wide text-white/50">
            Administration
          </p>
        </div>
      </div>

      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active =
          href === "/admin"
            ? pathname === href
            : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-white/10 text-white"
                : "text-white/60 hover:bg-white/5 hover:text-white",
            )}
          >
            <Icon
              className={cn("h-4 w-4", active && "text-[var(--color-brand)]")}
            />
            {label}
          </Link>
        );
      })}

      {/* The only way back to the department picker from inside a portal
          that isn't reached via a role/dept switcher elsewhere — without
          this, entering Administration is a one-way trip. */}
      <Link
        href="/areas-of-service"
        className="mt-auto flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-white/60 transition-colors hover:bg-white/5 hover:text-white"
      >
        <Repeat className="h-4 w-4" />
        Areas of Service
      </Link>
    </aside>
  );
}
