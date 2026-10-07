"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import type { ReactNode } from "react";
import { animate, stagger, utils } from "animejs";
import { cn } from "@/lib/utils";

// useLayoutEffect on the client, useEffect on the server (avoids the SSR
// warning). We hide + animate the children before the browser paints the
// hydrated frame, so there's no visible flash.
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

export interface StaggerProps {
  children: ReactNode;
  className?: string;
  /** Vertical travel (px) each child rises from. */
  y?: number;
  /** Delay (ms) before the first child animates. */
  delay?: number;
  /** Gap (ms) between successive children. */
  gap?: number;
  /** Per-child duration (ms). */
  duration?: number;
}

/**
 * Kingdom Radiant entrance choreography: animates its DIRECT children up into
 * place on mount with an anime.js stagger. Critically, the hidden start state
 * is applied by JS (not CSS) — so with JS disabled or prefers-reduced-motion,
 * the content is simply visible. Reused across the landing hero, auth brand
 * panel, and role picker.
 */
export function Stagger({
  children,
  className,
  y = 22,
  delay = 0,
  gap = 90,
  duration = 780,
}: StaggerProps) {
  const ref = useRef<HTMLDivElement>(null);

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
    animate(items, {
      opacity: [0, 1],
      translateY: [y, 0],
      delay: stagger(gap, { start: delay }),
      duration,
      ease: "outExpo",
    });
  }, [y, delay, gap, duration]);

  return (
    <div ref={ref} className={cn(className)}>
      {children}
    </div>
  );
}
