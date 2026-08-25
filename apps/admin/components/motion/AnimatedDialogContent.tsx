"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
} from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { animate } from "animejs";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

// useLayoutEffect on the client, useEffect on the server (avoids the SSR
// warning) — same convention as Reveal/Stagger.
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

const ENTER_DURATION = 260;
const EXIT_DURATION = 200;

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export interface AnimatedDialogContentProps
  extends Omit<ComponentProps<typeof DialogPrimitive.Content>, "forceMount"> {
  open: boolean;
  showCloseButton?: boolean;
}

/**
 * A forceMount-based replacement for the shared shadcn DialogContent —
 * drives open/close with a short anime.js rise+scale+fade instead of
 * Tailwind's generic zoom/fade utilities, so opening/closing one of the
 * content-management dialogs (Weekly Program, Event, Announcement — the
 * "click a card, review, close" surfaces) reads as a considered transition
 * rather than a stock modal pop. Short and small (~260ms, 8px, scale 0.96)
 * per the admin motion norm — kept separate from components/shadcn/dialog.tsx
 * rather than changed in place, so the many one-shot confirm dialogs
 * elsewhere in the app are untouched.
 *
 * Uses Radix's documented integration point for external animation
 * libraries: both the overlay and content are `forceMount`ed (always in the
 * DOM whenever this component itself is mounted) and only actually removed
 * — by this component returning null — once anime.js's `onComplete` fires,
 * rather than the instant it goes.
 */
export function AnimatedDialogContent({
  open,
  showCloseButton = true,
  className,
  children,
  ...props
}: AnimatedDialogContentProps) {
  const [mounted, setMounted] = useState(open);
  const contentRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  // Tracks whether we were actually showing something last render, so a
  // dialog that's never been opened doesn't run an exit animation on its
  // very first (closed) render.
  const wasOpen = useRef(open);

  // Closing: play the exit animation, then unmount once it completes.
  useIsomorphicLayoutEffect(() => {
    if (open) {
      wasOpen.current = true;
      setMounted(true);
      return;
    }
    if (!wasOpen.current) return;
    wasOpen.current = false;

    if (prefersReducedMotion() || !contentRef.current) {
      setMounted(false);
      return;
    }

    animate(contentRef.current, {
      opacity: [1, 0],
      scale: [1, 0.97],
      translateY: [0, 6],
      duration: EXIT_DURATION,
      ease: "inQuad",
      onComplete: () => setMounted(false),
    });
    if (overlayRef.current) {
      animate(overlayRef.current, { opacity: [1, 0], duration: EXIT_DURATION, ease: "inQuad" });
    }
  }, [open]);

  // Opening: play the entrance animation once the content is actually in
  // the DOM to animate.
  useIsomorphicLayoutEffect(() => {
    if (!mounted || !open || !contentRef.current) return;
    if (prefersReducedMotion()) return; // fully visible immediately, no animated entrance

    animate(contentRef.current, {
      opacity: [0, 1],
      scale: [0.96, 1],
      translateY: [8, 0],
      duration: ENTER_DURATION,
      ease: "outQuad",
    });
    if (overlayRef.current) {
      animate(overlayRef.current, { opacity: [0, 1], duration: 180, ease: "outQuad" });
    }
  }, [mounted, open]);

  if (!mounted) return null;

  return (
    <DialogPrimitive.Portal forceMount>
      <DialogPrimitive.Overlay
        ref={overlayRef}
        forceMount
        className="fixed inset-0 z-50 bg-heaven-deep/45 backdrop-blur-sm"
      />
      {/* Flex-centered wrapper rather than Tailwind's usual translate(-50%,-50%)
          trick — anime.js fully owns the content's `transform` (scale +
          translateY) for the rise/settle motion, so nothing else can share it. */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <DialogPrimitive.Content
          ref={contentRef}
          forceMount
          className={cn(
            "relative grid w-full max-w-lg gap-5 rounded-xl bg-card p-6 text-card-foreground shadow-e3",
            className,
          )}
          {...props}
        >
          {children}
          {showCloseButton && (
            <DialogPrimitive.Close
              data-slot="dialog-close"
              className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-outline transition-colors hover:bg-surface-low hover:text-on-surface focus:outline-none disabled:pointer-events-none"
            >
              <X className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          )}
        </DialogPrimitive.Content>
      </div>
    </DialogPrimitive.Portal>
  );
}
