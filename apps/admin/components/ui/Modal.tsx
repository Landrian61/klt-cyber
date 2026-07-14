"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}

// Centered confirmation dialog (INTERFACE_SPEC §1.6/§1.7): reserved for
// destructive confirmations. Warm scrim, lifted parchment panel with the
// ambient shadow — no border. Escape and scrim click both close.
export function Modal({ open, onClose, title, children, footer }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-[rgba(28,28,24,0.45)]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative w-full max-w-md rounded-xl bg-surface-lowest p-6 shadow-[0_8px_32px_rgba(28,28,24,0.04)]"
      >
        <h2 className="font-display text-xl font-bold text-on-surface">
          {title}
        </h2>
        <div className="mt-4">{children}</div>
        {footer && (
          <div className="mt-6 flex items-center justify-end gap-2">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
