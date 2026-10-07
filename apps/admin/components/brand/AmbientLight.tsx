"use client";

import { useEffect, useRef } from "react";
import { waapi } from "animejs";

/**
 * A slow, breathing pool of gold light drifting behind the wordmark — the calm
 * replacement for the gold particles. Driven by anime.js's Web Animations API
 * module (waapi), so the loop runs on the browser's compositor rather than the
 * main thread. Skipped under prefers-reduced-motion.
 */
export function AmbientLight() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const anim = waapi.animate(el, {
      opacity: [0.4, 0.85],
      scale: [1, 1.18],
      duration: 11000,
      loop: true,
      alternate: true,
      ease: "ease-in-out",
    });

    return () => {
      anim.animations.forEach((a) => a.cancel());
    };
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none absolute left-1/2 top-[-10%] z-[1] h-[70vh] w-[70vh] -translate-x-1/2 rounded-full opacity-50 [background:radial-gradient(circle,rgba(237,182,60,0.30)_0%,rgba(196,127,8,0.12)_42%,transparent_70%)]"
    />
  );
}
