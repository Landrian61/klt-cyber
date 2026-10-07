"use client";

import { useEffect, useRef, useState } from "react";
import { animate } from "animejs";
import { cn } from "@/lib/utils";

export interface CountUpProps {
  /** The final value. Re-animates from the previous value when this changes. */
  value: number;
  /** Duration in ms. */
  duration?: number;
  className?: string;
}

/**
 * Dashboard stat counter: rolls up to `value` on mount, and tweens between
 * values when live Convex data changes underneath it — so a number that moves
 * reads as *something happened*, not a silent re-render.
 *
 * Under prefers-reduced-motion the final value renders immediately. The
 * element carries the resolved number as text at all times (never a blank
 * frame), so screen readers and no-JS snapshots see the real figure; it's
 * marked aria-live="off" because a counting number is decorative motion, not
 * an announcement.
 */
export function CountUp({ value, duration = 900, className }: CountUpProps) {
  const [display, setDisplay] = useState(value);
  // Start the next tween from whatever is on screen, not from zero — a live
  // update from 12 → 13 should tick, not rewind through the whole range.
  const fromRef = useRef(value);

  useEffect(() => {
    const from = fromRef.current;
    fromRef.current = value;

    if (from === value) return;

    const prefersReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (prefersReduced) {
      setDisplay(value);
      return;
    }

    const state = { n: from };
    const animation = animate(state, {
      n: value,
      duration,
      ease: "outExpo",
      onUpdate: () => setDisplay(Math.round(state.n)),
      // Guarantee we land exactly on the target — rounding mid-tween can
      // otherwise leave the final frame a digit short.
      onComplete: () => setDisplay(value),
    });

    return () => {
      animation.pause();
    };
  }, [value, duration]);

  return (
    <span className={cn("tabular-nums", className)} aria-live="off">
      {display}
    </span>
  );
}
