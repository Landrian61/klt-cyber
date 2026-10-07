"use client";

/*
  On-demand loader for the shared Zod validators.

  `@klt-cyber/shared` is a flat `export *` barrel (packages/shared/src/index.ts),
  so importing one schema pulls zod's whole runtime — ~64 KB gzip — into the
  importing route's entry graph. On /sign-in and /sign-up that is the first
  thing any user ever downloads, on the coldest possible cache, to validate an
  email and a password.

  Importing inside the submit handler moves it off first paint, but would then
  stall the click on a slow connection. So: `warm()` on first field interaction
  (the user has shown intent, but has not clicked yet), and `load()` at submit
  as the correctness guarantee. The promise is memoized, so warm-then-load
  resolves instantly and a second submit never refetches.

  @klt-cyber/shared remains the single source of truth — nothing here
  duplicates or reimplements a schema.
*/

type SharedModule = typeof import("@klt-cyber/shared");

let pending: Promise<SharedModule> | null = null;

/** Load the shared validators, reusing an in-flight or completed load. */
export function loadValidators(): Promise<SharedModule> {
  pending ??= import("@klt-cyber/shared");
  return pending;
}

/**
 * Start loading without awaiting. Safe to call on every keystroke/focus —
 * after the first call this is a no-op.
 */
export function warmValidators(): void {
  void loadValidators();
}
