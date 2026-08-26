import { BrandBackdrop } from "@/components/brand/BrandBackdrop";
import { Wordmark } from "@/components/brand/Wordmark";
import { Skeleton } from "@/components/shadcn/skeleton";

/*
  Areas of Service is a full-screen Kingdom Radiant canvas — dark heaven-blue
  with glass tiles — not a parchment shell screen.

  Without this file it fell back to app/(admin)/loading.tsx, which draws the
  sidebar + top-bar shell: a light parchment skeleton flashing in front of a
  dark canvas, then being replaced by it. This keeps the wait on the same
  canvas the page resolves to, so only the tiles change.

  Placeholders are white-alpha to sit on the dark backdrop; the parchment
  `Skeleton` default would glare here.
*/
export default function AreasOfServiceLoading() {
  return (
    <main className="min-h-dvh w-full overflow-hidden">
      <BrandBackdrop priority className="min-h-dvh">
        <header className="flex items-center justify-between px-6 py-6 md:px-10">
          <Wordmark size={40} />
          <Skeleton className="h-9 w-28 rounded-full bg-white/10" />
        </header>

        <div className="flex flex-1 items-center justify-center px-6 py-10">
          <div className="w-full max-w-6xl">
            <Skeleton className="h-3 w-40 bg-white/10" />
            {/* matches the text-4xl/sm:text-5xl hero */}
            <Skeleton className="mt-4 h-11 w-[22rem] max-w-full bg-white/15 sm:h-14" />
            <Skeleton className="mt-4 h-5 w-full max-w-2xl bg-white/10" />

            <div className="mt-9 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="h-full rounded-2xl bg-white/[0.07] p-4 ring-1 ring-white/15 backdrop-blur-sm"
                >
                  <div className="flex items-center gap-3.5">
                    <Skeleton className="size-11 shrink-0 rounded-xl bg-white/15" />
                    <Skeleton className="h-4 flex-1 bg-white/15" />
                  </div>
                  <Skeleton className="mt-3 h-3 w-full bg-white/10" />
                  <Skeleton className="mt-2 h-3 w-2/3 bg-white/10" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </BrandBackdrop>

      <span className="sr-only" role="status">
        Loading your areas of service…
      </span>
    </main>
  );
}
