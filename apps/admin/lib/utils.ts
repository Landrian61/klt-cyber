/**
 * Minimal className joiner. Filters out falsy values so primitives can do
 * `cn("base", condition && "variant", className)`. Kept dependency-free — we
 * deliberately avoid pulling in clsx/tailwind-merge for this PR.
 */
export function cn(...inputs: Array<string | false | null | undefined>): string {
  return inputs.filter(Boolean).join(" ");
}
