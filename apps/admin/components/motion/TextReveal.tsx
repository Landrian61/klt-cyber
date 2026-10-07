"use client";

import * as React from "react";
import { useEffect, useLayoutEffect, useRef } from "react";
import { animate, createSpring, stagger, text, utils } from "animejs";
import { cn } from "@/lib/utils";

const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

type Tag = "h1" | "h2" | "h3" | "p" | "span";

export interface TextRevealProps {
  /** Plain text to reveal. Rendered as-is on the server (SSR/SEO-safe). */
  text: string;
  as?: Tag;
  className?: string;
  /** A single word to gild with the running-gold shimmer. */
  highlight?: string;
  /** Delay (ms) before the first word rises. */
  delay?: number;
  /** Gap (ms) between words. */
  stagger?: number;
}

/**
 * Headline choreography built on anime.js's text + easings modules: the string
 * is split into words (accessible, SSR-safe) then each word springs up into
 * place. An optional highlight word receives the gold shimmer. Under
 * prefers-reduced-motion the words are split for the highlight but left static.
 */
export function TextReveal({
  text: content,
  as = "h2",
  className,
  highlight,
  delay = 0,
  stagger: gap = 70,
}: TextRevealProps) {
  const ref = useRef<HTMLElement>(null);

  useIsomorphicLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    // anime.js text module: wrap each word in a span, preserving spacing.
    const splitter = text.splitText(el, {
      words: true,
      chars: false,
      accessible: true,
    });
    const words = splitter.words as HTMLElement[];

    if (highlight) {
      // Normalise away punctuation so "continue." / "Life." still match a
      // clean highlight word.
      const norm = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]/gi, "");
      const target = norm(highlight);
      words.forEach((w) => {
        if (norm(w.textContent ?? "") === target) {
          w.classList.add("kr-shimmer");
        }
      });
    }

    const prefersReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (prefersReduced) {
      return () => {
        splitter.revert();
      };
    }

    utils.set(words, {
      display: "inline-block",
      opacity: 0,
      translateY: "0.9em",
      rotate: -6,
    });
    animate(words, {
      opacity: [0, 1],
      translateY: ["0.9em", 0],
      rotate: [-6, 0],
      delay: stagger(gap, { start: delay }),
      duration: 1100,
      // easings module — a soft spring gives the words a living settle.
      ease: createSpring({ stiffness: 90, damping: 13 }),
    });

    return () => {
      splitter.revert();
    };
  }, [content, highlight, delay, gap]);

  // createElement keeps the tag polymorphic without fighting per-element ref
  // variance (a union of intrinsic tags doesn't share one ref type in JSX).
  return React.createElement(
    as,
    { ref, className: cn(className) },
    content,
  );
}
