import { Skeleton } from "@/components/shadcn/skeleton";

/*
  The department "coming soon" page is a centred, full-height parchment
  screen with no sidebar. Like areas-of-service, it previously fell back to
  app/(admin)/loading.tsx and flashed the portal shell before rendering
  something structurally unrelated.

  The one thing actually resolving here is the department's name, behind the
  getDepartmentAccess round trip, so this holds that shape and nothing more.
*/
export default function DepartmentComingSoonLoading() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-background px-6 text-center">
      <Skeleton className="size-16 rounded-full" />
      <div className="flex flex-col items-center">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="mt-3 h-5 w-28 bg-surface-low" />
        <Skeleton className="mt-4 h-4 w-80 max-w-full bg-surface-low" />
      </div>

      <span className="sr-only" role="status">
        Loading department…
      </span>
    </div>
  );
}
