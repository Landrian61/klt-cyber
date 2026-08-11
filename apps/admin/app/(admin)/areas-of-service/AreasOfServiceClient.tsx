"use client";

import { useState } from "react";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { authClient } from "@/lib/auth";
import { BrandBackdrop } from "@/components/brand/BrandBackdrop";
import { Wordmark } from "@/components/brand/Wordmark";
import { Stagger } from "@/components/motion/Stagger";
import { TextReveal } from "@/components/motion/TextReveal";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/shadcn/card";

export interface DepartmentTile {
  id: string;
  name: string;
  description: string | null;
  href: string;
}

export interface ClanTile {
  id: string;
  clanName: string;
  href: string;
}

// The Kingdom Radiant glass-card treatment, shared by department and clan
// tiles: a shadcn Card whose default "lifted parchment" styling is fully
// overridden for the dark BrandBackdrop canvas (tailwind-merge resolves the
// conflicting bg/text/shadow utilities in our favor).
const GLASS_CARD =
  "h-full gap-3 rounded-2xl border-0 bg-white/[0.07] p-4 shadow-none ring-1 ring-white/15 backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-white/[0.12] hover:ring-gold-radiant/40";

function InitialBadge({ letter }: { letter: string }) {
  return (
    <span
      aria-hidden="true"
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[image:linear-gradient(135deg,var(--color-gold-radiant),var(--color-gold-rich))] font-display text-lg font-bold text-gold-ink shadow-[0_8px_20px_-6px_rgba(196,127,8,0.7)]"
    >
      {letter.toUpperCase()}
    </span>
  );
}

// Post-login landing: one glass card per Area of Service the minister serves
// in (System Admin sees all 13; everyone else sees their own), staggered
// into a responsive grid on the Kingdom Radiant canvas — the same immersive
// design as the old role picker, restructured for up to 13 tiles instead of
// 1-3. Deliberately no System Administrator tile here; that portal is
// reached via the small badge in the header instead (docs/Alignment.md,
// "Part 2").
export function AreasOfServiceClient({
  displayName,
  departments,
  clans,
  isSystemAdmin,
}: {
  displayName: string;
  departments: DepartmentTile[];
  clans: ClanTile[];
  isSystemAdmin: boolean;
}) {
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    await authClient.signOut();
    // Hard navigation on purpose — auth state just changed (see sign-in page).
    window.location.assign("/sign-in");
  }

  return (
    <main className="min-h-dvh w-full overflow-hidden">
      <BrandBackdrop priority className="min-h-dvh">
        <header className="flex items-center justify-between px-6 py-6 md:px-10">
          <Wordmark size={40} />
          <div className="flex items-center gap-2.5">
            {isSystemAdmin && (
              <Link
                href="/system-admin"
                className="flex items-center gap-1.5 rounded-full px-4 py-2 font-body text-sm font-semibold text-white/80 ring-1 ring-white/20 transition-colors hover:bg-white/10 hover:text-white"
              >
                <ShieldCheck className="h-4 w-4" />
                System Admin
              </Link>
            )}
            <button
              type="button"
              onClick={handleSignOut}
              disabled={signingOut}
              className="rounded-full px-4 py-2 font-body text-sm font-semibold text-white/80 ring-1 ring-white/20 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-60"
            >
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </header>

        <div className="flex flex-1 items-center justify-center px-6 py-10">
          <div className="w-full max-w-6xl">
            <Stagger delay={120}>
              <p className="font-body text-[11px] font-semibold uppercase tracking-[0.3em] text-gold-radiant">
                Welcome, {displayName}
              </p>
            </Stagger>

            <TextReveal
              as="h1"
              text="Choose your Area of Service."
              highlight="Service."
              delay={300}
              stagger={80}
              className="mt-4 font-display text-4xl font-bold leading-[1.1] tracking-tight text-white sm:text-5xl"
            />

            <Stagger delay={620}>
              <p className="mt-4 max-w-2xl font-body text-base leading-relaxed text-white/70">
                Ministers of Kingdom Life Tabernacle access the areas they
                serve here. Select a department to step into its workspace.
              </p>
            </Stagger>

            {departments.length > 0 && (
              <Stagger
                delay={760}
                gap={70}
                className="mt-9 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
              >
                {departments.map((department) => (
                  <Link key={department.id} href={department.href} className="group block h-full">
                    <Card className={GLASS_CARD}>
                      <CardHeader className="flex-row items-center gap-3.5 space-y-0">
                        <InitialBadge letter={department.name.charAt(0)} />
                        <div className="min-w-0 flex-1">
                          <CardTitle className="truncate font-body text-base font-semibold text-white">
                            {department.name}
                          </CardTitle>
                        </div>
                      </CardHeader>
                      {department.description && (
                        <CardDescription className="font-body text-[13px] leading-relaxed text-white/55">
                          {department.description}
                        </CardDescription>
                      )}
                      <CardFooter className="justify-end">
                        <span className="font-body text-sm font-semibold text-gold-radiant transition-transform duration-200 group-hover:translate-x-0.5">
                          Enter →
                        </span>
                      </CardFooter>
                    </Card>
                  </Link>
                ))}
              </Stagger>
            )}

            {clans.length > 0 && (
              <div className="mt-12">
                <Stagger delay={0}>
                  <p className="font-body text-[11px] font-semibold uppercase tracking-[0.3em] text-gold-radiant">
                    Clan Leadership
                  </p>
                </Stagger>
                <Stagger
                  delay={100}
                  gap={70}
                  className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
                >
                  {clans.map((clan) => (
                    <Link key={clan.id} href={clan.href} className="group block h-full">
                      <Card className={GLASS_CARD}>
                        <CardHeader className="flex-row items-center gap-3.5 space-y-0">
                          <InitialBadge letter={clan.clanName.charAt(0)} />
                          <div className="min-w-0 flex-1">
                            <CardTitle className="truncate font-body text-base font-semibold text-white">
                              Clan {clan.clanName}
                            </CardTitle>
                          </div>
                        </CardHeader>
                        <CardFooter className="justify-end">
                          <span className="font-body text-sm font-semibold text-gold-radiant transition-transform duration-200 group-hover:translate-x-0.5">
                            Enter →
                          </span>
                        </CardFooter>
                      </Card>
                    </Link>
                  ))}
                </Stagger>
              </div>
            )}
          </div>
        </div>
      </BrandBackdrop>
    </main>
  );
}
