import type { ReactNode } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { AmbientLight } from "./AmbientLight";

export interface BrandBackdropProps {
  children?: ReactNode;
  className?: string;
  /** Show the concentric halo rings behind the content (landing hero). */
  rings?: boolean;
  priority?: boolean;
  /**
   * next/image `sizes` for the backdrop photo. Defaults to full-bleed; the auth
   * rail overrides it (it only spans ~half the viewport on md+).
   */
  imageSizes?: string;
}

/**
 * The Kingdom Radiant canvas — the exact atmosphere of the mobile welcome &
 * splash, rebuilt for the web: the shared Church_Theme photograph washed under
 * a deep heaven-blue gradient, a gold dawn-glow rising from below, optional
 * halo rings, and a drift of gold embers. Everything decorative sits behind an
 * `z-10` content slot. Reused by the landing, the auth brand rail, and the role
 * picker so all three read as one continuous space.
 */
export function BrandBackdrop({
  children,
  className,
  rings = false,
  priority = false,
  imageSizes = "100vw",
}: BrandBackdropProps) {
  return (
    <div
      className={cn(
        "relative isolate overflow-hidden bg-heaven-deep",
        className,
      )}
    >
      {/* 1 — the shared theme photograph, present but seated into the canvas */}
      <Image
        src="/church-theme.jpg"
        alt=""
        fill
        priority={priority}
        sizes={imageSizes}
        className="object-cover object-center opacity-[0.55]"
      />

      {/* 2 — heaven-blue wash (mobile HeavenGradient), keeps text legible */}
      <div className="absolute inset-0 bg-[linear-gradient(158deg,rgba(12,33,84,0.86)_0%,rgba(18,48,110,0.76)_46%,rgba(44,99,217,0.48)_100%)]" />

      {/* 3 — gold dawn-glow rising from below */}
      <div className="absolute inset-x-[-20%] bottom-[-30%] h-[75%] bg-[radial-gradient(ellipse_at_bottom,rgba(237,182,60,0.34)_0%,rgba(196,127,8,0.12)_38%,transparent_70%)]" />

      {/* 4 — vignette to seat the corners */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_45%,rgba(6,18,48,0.55)_100%)]" />

      {/* 5 — concentric halo rings behind the wordmark */}
      {rings && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-[1]"
        >
          <span className="kr-halo absolute left-1/2 top-[8%] h-[440px] w-[440px] rounded-full border border-gold-radiant/15" />
          <span
            className="kr-halo absolute left-1/2 top-[2%] h-[620px] w-[620px] rounded-full border border-gold-radiant/10"
            style={{ animationDelay: "-3s" }}
          />
          <span
            className="kr-halo absolute left-1/2 top-[-4%] h-[820px] w-[820px] rounded-full border border-gold-radiant/[0.06]"
            style={{ animationDelay: "-6s" }}
          />
        </div>
      )}

      {/* 6 — breathing pool of gold light (WAAPI) */}
      <AmbientLight />

      {/* content */}
      <div className="relative z-10 flex h-full w-full flex-col">
        {children}
      </div>
    </div>
  );
}
