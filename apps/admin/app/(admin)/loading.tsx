import { Skeleton } from "@/components/shadcn/skeleton";

/*
  The portal shell, before it exists.

  Both segment layouts under (admin) are async server components: they await
  fetchAuthQuery(api.profile.getMyAccount) to verify authority before rendering
  anything. Until that Convex round trip resolves, nothing paints — and from
  Kampala that is the slowest hop on the page. A loading.tsx at THIS level
  (the parent of admin/ and system-admin/) is what covers that window; one
  placed inside those segments would not, because it only wraps the page and
  the layout still has to resolve first.

  So this mirrors the shell rather than any one screen: the heaven-blue rail at
  its real 15rem width, the glass top bar at its real h-16, and a neutral
  content block. When the real shell arrives it lands in the same geometry.

  Deliberately not a Kingdom Radiant entrance animation — this is a
  sub-second wait, and motion here would draw the eye to a state we want gone.
*/
export default function AdminShellLoading() {
  return (
    <div className="flex min-h-svh w-full">
      {/* Sidebar rail — same gradient and width as the real Sidebar. */}
      <div
        aria-hidden="true"
        className="hidden w-60 shrink-0 bg-[linear-gradient(180deg,var(--color-heaven-deep)_0%,var(--color-heaven-deep)_58%,var(--color-heaven)_82%,var(--color-heaven-bright)_100%)] p-3 md:block"
      >
        <div className="flex items-center gap-2.5">
          <Skeleton className="size-9 shrink-0 rounded-full bg-white/15" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3 w-28 bg-white/15" />
            <Skeleton className="h-2.5 w-20 bg-white/10" />
          </div>
        </div>

        <div className="mt-8 space-y-1.5">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full rounded-md bg-white/10" />
          ))}
        </div>
      </div>

      {/* Content column */}
      <div className="flex min-w-0 flex-1 flex-col bg-surface-low">
        <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between gap-3 bg-parchment/85 pl-1.5 pr-3 shadow-header backdrop-blur-xl lg:pl-2 lg:pr-6">
          <Skeleton className="size-8 rounded-md" />
          <div className="flex items-center gap-3">
            <Skeleton className="size-8 rounded-full" />
            <Skeleton className="size-8 rounded-full" />
          </div>
        </header>

        <div className="w-full min-w-0 flex-1 px-6 py-8 lg:px-10">
          <div className="space-y-6">
            <div className="space-y-1">
              <Skeleton className="h-9 w-56" />
              <Skeleton className="mt-2 h-5 w-72 bg-surface-low" />
            </div>
            <Skeleton className="h-64 w-full rounded-md" />
          </div>
        </div>
      </div>

      <span className="sr-only" role="status">
        Loading the administration portal…
      </span>
    </div>
  );
}
