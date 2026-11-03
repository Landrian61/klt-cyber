"use client";

import {
  createContext,
  useContext,
  useEffect,
  type ReactNode,
} from "react";
import { notFound, useRouter } from "next/navigation";
import type { FunctionReturnType } from "convex/server";
import { useAuthQuery } from "@/lib/useAuthQuery";
import { api } from "@/lib/api";
import { Skeleton } from "@/components/shadcn/skeleton";

/**
 * The department a shell page is about, and what the caller may do in it
 * (spec 0012).
 *
 * The shared page components take their department from this context rather
 * than reading the route, which is what lets a bespoke portal (Media) mount the
 * same components inside its own layout.
 *
 * It is a live subscription on purpose. `getShellContext` resolves to `null`
 * when the caller signs out or loses their role, and this provider then sends
 * them back to the hub instead of leaving a page rendering against authority
 * they no longer hold.
 */

/**
 * Taken from the query's own return type rather than restated, so every
 * capability the matrix grows is immediately visible to the components that
 * branch on it, and a renamed one is a type error rather than a silently
 * falsy `can.whatever`.
 */
export type DepartmentShellContext = NonNullable<
  FunctionReturnType<typeof api.departmentShell.getShellContext>
>;

/** The capability names the interface may branch on. */
export type DepartmentCapability = keyof DepartmentShellContext["can"];

const Context = createContext<{
  /** `undefined` while loading, `null` when the caller has no shell access. */
  shell: DepartmentShellContext | null | undefined;
}>({ shell: undefined });

export function DepartmentShellProvider({
  slug,
  children,
}: {
  slug: string;
  children: ReactNode;
}) {
  const shell = useAuthQuery(api.departmentShell.getShellContext, { slug });

  return <Context.Provider value={{ shell }}>{children}</Context.Provider>;
}

/**
 * The shell context, or `undefined`/`null` while loading or without access.
 *
 * Most pages want {@link useDepartmentShellOrRedirect} instead. This raw form
 * exists for a bespoke portal's own chrome, which has to render whether or not
 * the caller holds a shell role and must never redirect on its own.
 */
export function useDepartmentShell() {
  return useContext(Context).shell;
}

/**
 * The shell context for a page that requires it, sending the caller to the hub
 * when they have none.
 *
 * Returns `undefined` while the subscription is loading or the redirect is in
 * flight, so a page renders its skeleton rather than briefly rendering with no
 * department.
 */
export function useDepartmentShellOrRedirect() {
  const shell = useDepartmentShell();
  const router = useRouter();

  useEffect(() => {
    if (shell === null) router.replace("/areas-of-service");
  }, [shell, router]);

  return shell ?? undefined;
}

/**
 * Wrapper for a shell page: renders `children(shell)` once the department is
 * known, a skeleton while it loads, and nothing at all while the redirect for a
 * caller without access is in flight.
 *
 * `requires` names a capability the page needs beyond reaching the shell, and
 * a caller without it gets a NOT FOUND rather than an empty page (spec 0015,
 * AC-5). Not found rather than "not authorised", deliberately: these are pages
 * that exist for one department only, so for every other department the route
 * genuinely does not exist, and saying so leaks nothing about what Library
 * happens to have. The matching Convex function re-checks the same capability,
 * so this is chrome and not the boundary.
 */
export function DepartmentShellGate({
  requires,
  children,
}: {
  requires?: DepartmentCapability;
  children: (shell: DepartmentShellContext) => ReactNode;
}) {
  const shell = useDepartmentShellOrRedirect();
  if (shell && requires && !shell.can[requires]) notFound();
  if (!shell) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-8 w-56 rounded-full" />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
    );
  }
  return <>{children(shell)}</>;
}
