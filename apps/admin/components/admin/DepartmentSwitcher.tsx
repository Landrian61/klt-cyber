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
import { canEnterDepartment, departmentHref } from "@/lib/departmentRoutes";
import { departmentIconByName, departmentIconFor } from "@/lib/departmentIcons";

/**
 * Move between the Areas of Service you can actually work in.
 *
 * It reads `listMyDepartmentsForHub` — the same query the hub page reads — so
 * the two can never disagree about where you may go. It then applies the same
 * `canEnterDepartment` rule the hub applies, for the same reason: a row that
 * leads to a layout which turns you around is a loop, not a shortcut.
 *
 * Three things it deliberately does NOT offer:
 *
 * - a department you are only on the ROSTER of, which has no pages for you,
 * - a paused department, which has no portal at all (it is listed, greyed, so
 *   its own leaders can see it is coming rather than wonder where it went),
 * - a department you do not serve in, unless you are a System Admin.
 *
 * The trigger carries the current department's own fixed icon, which is where
 * a department identifies itself now that every rail shows the KLT mark.
 */
export function DepartmentSwitcher({
  /**
   * Name of the department whose portal is currently open. Omit outside a
   * department portal (e.g. System Admin) — the trigger then reads "Areas of
   * Service" and nothing is check-marked, since you aren't in one.
   */
  current,
  /**
   * The current department's icon key, when the caller already has it from
   * `getShellContext`. Without it the icon is resolved from `current`, which
   * gives the same answer; the prop just saves re-deriving it.
   */
  iconKey,
}: {
  current?: string;
  iconKey?: string;
}) {
  const router = useRouter();
  const hub = useAuthQuery(api.departmentMemberships.listMyDepartmentsForHub);

  const label = current ?? "Areas of Service";
  const TriggerIcon = iconKey
    ? departmentIconFor(iconKey)
    : current
      ? departmentIconByName(current)
      : LayoutGrid;

  // `undefined` = loading; `null` = the query resolved unauthenticated (the
  // sign-out teardown window) or without portal access. Both mean "no data to
  // show yet".
  if (!hub) {
    return <Skeleton className="h-9 w-44 rounded-full" />;
  }

  const enterable = hub.active.filter(({ roles, isSystemAdmin }) =>
    canEnterDepartment(roles, isSystemAdmin),
  );

  // A System Admin has a tie to no department in particular, so listing all six
  // paused ones under their switcher is noise they can read on the hub instead.
  // For everyone else the paused list is short and is their own.
  const showPaused = !hub.active.some((entry) => entry.isSystemAdmin);
  const paused = showPaused ? hub.paused : [];

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Switch Area of Service"
          className="flex max-w-[15rem] items-center gap-2 rounded-full border border-border bg-surface-low/70 px-3 py-1.5 font-body text-sm font-semibold text-on-surface outline-none transition-colors hover:bg-surface-low focus-visible:ring-2 focus-visible:ring-primary"
        >
          <TriggerIcon
            className="h-4 w-4 shrink-0 text-on-surface-variant"
            aria-hidden="true"
          />
          <span className="truncate">{label}</span>
          <ChevronsUpDown
            className="h-3.5 w-3.5 shrink-0 text-on-surface-variant"
            aria-hidden="true"
          />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-72">
        {enterable.length > 0 && (
          <>
            <DropdownMenuLabel className="font-body text-xs uppercase tracking-[0.14em] text-on-surface-variant">
              Areas of Service
            </DropdownMenuLabel>
            {/* `overflow-y-auto` keeps the (slim, tonal) bar out of sight until
                the list actually overflows — present exactly when it's useful. */}
            <DropdownMenuGroup className="subtle-scrollbar max-h-72 overflow-y-auto">
              {enterable.map(({ department }) => {
                const active = department.name === current;
                const Icon = departmentIconByName(department.name);
                return (
                  <DropdownMenuItem
                    key={department._id}
                    onSelect={() => router.push(departmentHref(department.name))}
                    aria-current={active ? "page" : undefined}
                    className="gap-2"
                  >
                    <Icon
                      aria-hidden="true"
                      className="shrink-0 text-on-surface-variant"
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {department.name}
                    </span>
                    <Check
                      aria-hidden="true"
                      className={cn("shrink-0 opacity-0", active && "opacity-100")}
                    />
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuGroup>
          </>
        )}

        {paused.length > 0 && (
          <>
            {enterable.length > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel className="font-body text-xs uppercase tracking-[0.14em] text-outline">
              Coming soon
            </DropdownMenuLabel>
            <DropdownMenuGroup>
              {paused.map(({ department }) => {
                const Icon = departmentIconByName(department.name);
                return (
                  <DropdownMenuItem
                    key={department._id}
                    disabled
                    className="gap-2"
                  >
                    <Icon aria-hidden="true" className="shrink-0" />
                    <span className="min-w-0 flex-1 truncate">
                      {department.name}
                    </span>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuGroup>
          </>
        )}

        {/* Always present, even for someone who serves in exactly one
            department: inside a department portal this is the only way back to
            the hub, so it is never hidden. */}
        {(enterable.length > 0 || paused.length > 0) && <DropdownMenuSeparator />}
        <DropdownMenuItem onSelect={() => router.push("/areas-of-service")}>
          <LayoutGrid aria-hidden="true" />
          View all
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
