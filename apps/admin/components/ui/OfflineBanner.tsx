import { cn } from "@/lib/utils";

// Non-blocking connectivity notice (AC-2): a screen that already has data
// keeps showing it — this never replaces a working screen, it just says why
// a retry/refresh might not land yet. Clears itself once `useIsOffline` flips.
export function OfflineBanner({ className }: { className?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-center gap-2 rounded-md bg-surface-high px-4 py-2 font-body text-sm text-on-surface-variant",
        className,
      )}
    >
      <span className="h-2 w-2 shrink-0 rounded-full bg-crimson" aria-hidden="true" />
      You&apos;re offline — showing what was already loaded.
    </div>
  );
}
