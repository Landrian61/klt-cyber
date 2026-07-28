import type { Metadata } from "next";
import Link from "next/link";
import { BrandBackdrop } from "@/components/brand/BrandBackdrop";
import { Wordmark } from "@/components/brand/Wordmark";
import { GoldCta, GhostCta } from "@/components/brand/BrandCta";
import { Stagger } from "@/components/motion/Stagger";
import { TextReveal } from "@/components/motion/TextReveal";

export const metadata: Metadata = {
  title: "KLT Cyber Church — Portal",
  description:
    "The administrative portal for KLT Cyber Church. Steward programs, events, people, and the Word from one radiant console.",
};

// Public landing — the front door to the portal. Full-viewport Kingdom Radiant
// canvas (the same heaven-blue + gold atmosphere as the mobile welcome screen),
// with the shared Church_Theme photograph beneath. Nothing here is gated; the
// CTAs hand off to /sign-in and /sign-up.
export default function LandingPage() {
  return (
    <main className="h-dvh w-full overflow-hidden">
      <BrandBackdrop rings priority className="h-full">
        {/* top bar */}
        <header className="flex items-center justify-between px-6 py-6 md:px-12 md:py-8">
          <Wordmark size={44} />
          <Link
            href="/sign-in"
            className="rounded-full px-4 py-2 font-body text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
          >
            Sign in
          </Link>
        </header>

        {/* hero */}
        <div className="flex flex-1 items-center">
          <div className="mx-auto flex w-full max-w-3xl flex-col items-center px-6 text-center md:px-12">
            <Stagger delay={140}>
              <p className="font-body text-[11px] font-semibold uppercase tracking-[0.32em] text-gold-radiant sm:text-xs">
                The Year of Kingdom Leadership &amp; Governance
              </p>
            </Stagger>

            <TextReveal
              as="h1"
              text="Manifesting Kingdom Life."
              highlight="Kingdom"
              delay={340}
              stagger={95}
              className="mt-6 max-w-2xl text-balance font-display text-5xl font-bold leading-[1.04] tracking-tight text-white sm:text-6xl md:text-7xl"
            />

            <Stagger
              className="flex flex-col items-center"
              delay={980}
              gap={120}
            >
              <p className="mt-6 max-w-xl text-pretty font-body text-base leading-relaxed text-white/80 sm:text-lg">
                Shepherd the life of KLT Cyber Church — programs, events,
                people, and the Word — from one radiant console. Sign in to
                continue your stewardship.
              </p>

              <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row">
                <GoldCta href="/sign-in">Enter the Portal</GoldCta>
                <GhostCta href="/sign-up">Create an account</GhostCta>
              </div>

              <p className="mt-12 max-w-md font-display text-sm italic leading-relaxed text-white/55">
                &ldquo;I will give unto thee the keys of the kingdom of
                heaven.&rdquo;
                <span className="mt-1 block font-body text-xs not-italic tracking-wide text-gold-radiant/80">
                  Matthew 16:19
                </span>
              </p>
            </Stagger>
          </div>
        </div>

        {/* footer */}
        <footer className="px-6 py-6 text-center md:px-12">
          <p className="font-body text-xs text-white/45">
            Administrative access only · Church members, please use the mobile
            app.
          </p>
        </footer>
      </BrandBackdrop>
    </main>
  );
}
