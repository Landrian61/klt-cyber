"use client";

import { useRouter } from "next/navigation";
import { Check, ChevronsUpDown, LayoutGrid } from "lucide-react";
import { useAuthQuery } from "@/lib/useAuthQuery";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/shadcn/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/shadcn/dropdown-menu";

// Instant Area-of-Service switcher for the portal top bars. Jumps straight to
// another department's workspace instead of bouncing back through
// /areas-of-service. Sourced from listMyDepartments, so it shows exactly what
// the caller may enter: System Admin sees all 13, everyone else sees the
// departments they're rostered in or hold hod/department_admin for.
//
// Administration is the one department with a dedicated portal today; the rest
// route to their placeholder page (docs/Alignment.md, "Out of scope — Part 2").
const ADMINISTRATION = "Administration";

function hrefFor(name: string, id: string) {
  return name === ADMINISTRATION ? "/admin" : `/departments/${id}`;
}

export function DepartmentSwitcher({
  /**
   * Name of the department whose portal is currently open. Omit outside a
   * department portal (e.g. System Admin) — the trigger then reads "Areas of
   * Service" and nothing is check-marked, since you aren't in one.
   */
  current,
}: {
  current?: string;
}) {
  const router = useRouter();
  const departments = useAuthQuery(api.departmentMemberships.listMyDepartments);

  const label = current ?? "Areas of Service";

  // `undefined` = loading; `null` = the query resolved unauthenticated (the
  // sign-out teardown window). Both mean "no data to show yet".
  if (!departments) {
    return <Skeleton className="h-9 w-44 rounded-full" />;
  }

  // Nothing to switch between — render the label as plain text rather than a
  // dead control that opens an empty menu.
  if (departments.length <= 1 && current) {
    return (
      <span className="flex items-center gap-2 px-2 font-body text-sm font-semibold text-on-surface">
        <LayoutGrid className="h-4 w-4 text-on-surface-variant" aria-hidden="true" />
        {current}
      </span>
    );
  }

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Switch Area of Service"
          className="flex max-w-[15rem] items-center gap-2 rounded-full bg-surface-low/70 px-3 py-1.5 font-body text-sm font-semibold text-on-surface outline-none transition-colors hover:bg-surface-low focus-visible:ring-2 focus-visible:ring-primary"
        >
          <LayoutGrid className="h-4 w-4 shrink-0 text-on-surface-variant" aria-hidden="true" />
          <span className="truncate">{label}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-on-surface-variant" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel className="font-body text-xs uppercase tracking-[0.14em] text-on-surface-variant">
          Areas of Service
        </DropdownMenuLabel>
        {/* `overflow-y-auto` keeps the (slim, tonal) bar out of sight until the
            list actually overflows — present exactly when it's useful. */}
        <DropdownMenuGroup className="subtle-scrollbar max-h-72 overflow-y-auto">
          {departments.map(({ department }) => {
            const active = department.name === current;
            return (
              <DropdownMenuItem
                key={department._id}
                onSelect={() => router.push(hrefFor(department.name, department._id))}
                className="gap-2"
              >
                <Check
                  aria-hidden="true"
                  className={cn("opacity-0", active && "opacity-100")}
                />
                <span className="truncate">{department.name}</span>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuItem onSelect={() => router.push("/areas-of-service")}>
          <LayoutGrid aria-hidden="true" />
          View all
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
