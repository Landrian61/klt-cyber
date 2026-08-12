"use client";

import { createElement, useEffect, useLayoutEffect, useRef } from "react";
import type { ReactNode } from "react";
import { animate, stagger, utils } from "animejs";
import { cn } from "@/lib/utils";

// useLayoutEffect on the client, useEffect on the server (avoids the SSR
// warning). We hide + animate before the browser paints the hydrated frame,
// so there's no visible flash.
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

export interface RevealProps {
  children: ReactNode;
  className?: string;
  /**
   * Element to render. Use `"ul"`/`"ol"` when the children are `<li>` — a
   * wrapping `<div>` around list items is invalid HTML.
   */
  as?: "div" | "ul" | "ol" | "section";
  /** Vertical travel (px) each child rises from. */
  y?: number;
  /** Delay (ms) before the first child animates. */
  delay?: number;
  /** Gap (ms) between successive children. */
  gap?: number;
  /** Per-child duration (ms). */
  duration?: number;
  /**
   * Re-run the reveal whenever this key changes — pass a data-dependent value
   * (e.g. a row count) so content that arrives after a loading skeleton still
   * animates in, rather than popping.
   */
  replayKey?: string | number;
}

/**
 * The admin console's entrance choreography — the restrained sibling of
 * `Stagger` (which carries the louder Kingdom Radiant landing/auth motion).
 * Animates its DIRECT children up into place with a short anime.js stagger.
 *
 * Like `Stagger`, the hidden start state is applied by JS rather than CSS, so
 * with JS disabled or prefers-reduced-motion the content is simply visible —
 * motion is never load-bearing for legibility.
 */
export function Reveal({
  children,
  className,
  as = "div",
  y = 10,
  delay = 0,
  gap = 55,
  duration = 480,
  replayKey,
}: RevealProps) {
  const ref = useRef<HTMLElement>(null);

  useIsomorphicLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;

    const items = Array.from(root.children) as HTMLElement[];
    if (items.length === 0) return;

    const prefersReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (prefersReduced) return; // leave children in their natural, visible state

    utils.set(items, { opacity: 0, translateY: y });
    const animation = animate(items, {
      opacity: [0, 1],
      translateY: [y, 0],
      delay: stagger(gap, { start: delay }),
      duration,
      ease: "outQuad",
    });

    return () => {
      animation.pause();
      // Leave the children visible if we unmount mid-flight.
      utils.set(items, { opacity: 1, translateY: 0 });
    };
  }, [y, delay, gap, duration, replayKey]);

  // createElement keeps the tag polymorphic without fighting per-element ref
  // variance (a union of intrinsic tags doesn't share one ref type in JSX) —
  // same approach as TextReveal.
  return createElement(as, { ref, className: cn(className) }, children);
}
