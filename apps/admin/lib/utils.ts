import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Class name joiner used across the app (and required by shadcn/ui): clsx for
 * conditional composition, tailwind-merge to resolve conflicting Tailwind
 * utilities so the last-wins (e.g. `px-2` + `px-4` → `px-4`).
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
