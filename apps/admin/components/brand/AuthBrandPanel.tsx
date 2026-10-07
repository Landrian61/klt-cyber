import { BrandBackdrop } from "./BrandBackdrop";
import { Wordmark } from "./Wordmark";
import { BackButton } from "./BackButton";
import { Stagger } from "@/components/motion/Stagger";
import { TextReveal } from "@/components/motion/TextReveal";

/**
 * The immersive left rail on the auth screens. Same Kingdom Radiant canvas as
 * the landing, sized to the viewport, with a scripture anchor at the foot.
 * Hidden on small screens (the form column carries a compact wordmark there).
 */
export function AuthBrandPanel() {
  return (
    <BrandBackdrop
      className="hidden md:flex md:min-h-dvh"
      priority
      imageSizes="(min-width: 768px) 55vw, 100vw"
    >
      <div className="flex flex-1 flex-col justify-between p-10 lg:p-14">
        <div className="flex items-center gap-4">
          <BackButton tone="light" />
          <Wordmark size={48} />
        </div>

        <div className="max-w-md">
          <Stagger delay={160}>
            <p className="font-body text-[11px] font-semibold uppercase tracking-[0.3em] text-gold-radiant">
              Kingdom Leadership &amp; Governance
            </p>
          </Stagger>

          <TextReveal
            as="h2"
            text="Welcome to the Sanctuary Console."
            highlight="Sanctuary"
            delay={360}
            stagger={80}
            className="mt-5 font-display text-4xl font-bold leading-[1.08] tracking-tight text-white lg:text-5xl"
          />

          <Stagger delay={900}>
            <p className="mt-5 font-body text-base leading-relaxed text-white/75">
              A quiet, powerful place to shepherd the church — its programs,
              events, people, and the Word — with the care they deserve.
            </p>
          </Stagger>
        </div>

        <p className="max-w-sm font-display text-sm italic leading-relaxed text-white/55">
          &ldquo;And I will give unto thee the keys of the kingdom of
          heaven.&rdquo;
          <span className="mt-1 block font-body text-xs not-italic tracking-wide text-gold-radiant/80">
            Matthew 16:19
          </span>
        </p>
      </div>
    </BrandBackdrop>
  );
}
