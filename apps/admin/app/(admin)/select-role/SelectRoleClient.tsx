"use client";

import { useState } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth";
import { BrandBackdrop } from "@/components/brand/BrandBackdrop";
import { Wordmark } from "@/components/brand/Wordmark";
import { Stagger } from "@/components/motion/Stagger";
import { TextReveal } from "@/components/motion/TextReveal";

export interface RoleChoice {
  id: string;
  label: string;
  href: string;
}

// Presentational role picker on the Kingdom Radiant canvas. Server component
// resolves identity + roles and hands this the serializable choices.
export function SelectRoleClient({
  displayName,
  roles,
}: {
  displayName: string;
  roles: RoleChoice[];
}) {
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    await authClient.signOut();
    // Hard navigation on purpose — auth state just changed (see sign-in page).
    window.location.assign("/sign-in");
  }

  const multiple = roles.length > 1;

  return (
    <main className="min-h-dvh w-full overflow-hidden">
      <BrandBackdrop priority className="min-h-dvh">
        {/* top bar */}
        <header className="flex items-center justify-between px-6 py-6 md:px-10">
          <Wordmark size={40} />
          <button
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
            className="rounded-full px-4 py-2 font-body text-sm font-semibold text-white/80 ring-1 ring-white/20 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-60"
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </header>

        {/* content */}
        <div className="flex flex-1 items-center justify-center px-6 py-10">
          <div className="w-full max-w-lg">
            <Stagger delay={120}>
              <p className="font-body text-[11px] font-semibold uppercase tracking-[0.3em] text-gold-radiant">
                Welcome, {displayName}
              </p>
            </Stagger>

            <TextReveal
              as="h1"
              text="Choose a role to continue."
              highlight="continue"
              delay={300}
              stagger={80}
              className="mt-4 font-display text-4xl font-bold leading-[1.1] tracking-tight text-white sm:text-5xl"
            />

            <Stagger delay={720}>
              <p className="mt-4 font-body text-base leading-relaxed text-white/70">
                {multiple
                  ? "You hold multiple administrative roles on this portal. Pick the one you'd like to step into."
                  : "Step into your administrative role to continue."}
              </p>
            </Stagger>

            <Stagger delay={860} gap={90} className="mt-9 flex flex-col gap-3.5">
              {roles.map((role) => (
                <Link
                  key={role.id}
                  href={role.href}
                  className="group flex items-center gap-4 rounded-2xl bg-white/[0.07] p-4 ring-1 ring-white/15 backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-white/[0.12] hover:ring-gold-radiant/40"
                >
                  <span
                    aria-hidden="true"
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[image:linear-gradient(135deg,var(--color-gold-radiant),var(--color-gold-rich))] font-display text-lg font-bold text-gold-ink shadow-[0_8px_20px_-6px_rgba(196,127,8,0.7)]"
                  >
                    {role.label.charAt(0).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-body text-base font-semibold text-white">
                      {role.label}
                    </span>
                    <span className="block font-body text-xs text-white/55">
                      Enter workspace
                    </span>
                  </span>
                  <span className="font-body text-sm font-semibold text-gold-radiant transition-transform duration-200 group-hover:translate-x-0.5">
                    Continue →
                  </span>
                </Link>
              ))}
            </Stagger>
          </div>
        </div>
      </BrandBackdrop>
    </main>
  );
}
