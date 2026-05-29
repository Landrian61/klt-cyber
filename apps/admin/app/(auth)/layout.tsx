import type { ReactNode } from "react";

// Public auth shell: a centered, branded column on the warm parchment page.
// No top header, no module rail — auth screens are chrome-free (INTERFACE_SPEC
// §3). The wordmark uses the display face; each page drops its form into a
// glass-light Card.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-parchment px-5 py-16">
      <div className="w-full max-w-md">
        <div className="mb-10 text-center">
          <p className="font-display text-2xl font-bold tracking-tight text-primary">
            KLT Cyber Church
          </p>
          <p className="mt-2 font-body text-sm text-on-surface-variant">
            Administration
          </p>
        </div>
        {children}
      </div>
    </main>
  );
}
