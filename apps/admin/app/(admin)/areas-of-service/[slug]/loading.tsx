import { Skeleton } from "@/components/shadcn/skeleton";

export default function DepartmentEntryLoading() {
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
