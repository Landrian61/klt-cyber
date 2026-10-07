import type { ReactNode } from "react";
import { AuthBrandPanel } from "@/components/brand/AuthBrandPanel";
import { BackButton } from "@/components/brand/BackButton";

// Public auth shell — a split canvas. On md+ the immersive Kingdom Radiant rail
// sits beside a clean parchment form column; on small screens the rail drops
// away and a compact ink wordmark leads the form. The back-to-home control
// lives on the left: over the rail on md+ (see AuthBrandPanel), and top-left of
// the form column on small screens.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-dvh w-full md:grid md:grid-cols-[1.05fr_1fr] lg:grid-cols-[1.1fr_1fr]">
      {/* immersive brand rail (md+) — carries its own back button + wordmark */}
      <AuthBrandPanel />

      {/* form column */}
      <div className="flex min-h-dvh flex-col bg-parchment px-5 py-10 sm:px-8">
        {/* small-screen back button (the rail is hidden here) */}
        <div className="mx-auto w-full max-w-md md:hidden">
          <BackButton tone="ink" />
        </div>

        {/* centered form */}
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-md">
            {/* small-screen brand lockup above the card */}
            <div className="mb-8 text-center md:hidden">
              <p className="font-display text-2xl font-bold tracking-tight text-primary">
                KLT Cyber Church
              </p>
              <p className="mt-1.5 font-body text-sm text-on-surface-variant">
                Administration
              </p>
            </div>
            {children}
          </div>
        </div>
      </div>
    </main>
  );
}
