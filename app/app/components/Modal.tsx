"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title: string;
}

/**
 * Portal-based, accessible modal (mirrors the shielded-wallet reference).
 *
 * PORTAL: rendered through `createPortal(…, document.body)` so the fixed
 * overlay escapes any ancestor with `backdrop-filter`/`transform`/`filter`
 * (which would otherwise become the containing block for `position: fixed`
 * and clip it).
 *
 * ACCESSIBILITY: `role="dialog"` + `aria-modal` + `aria-labelledby`; focus
 * moves into the dialog on open and is trapped (Tab wraps); Escape closes;
 * focus returns to the trigger on close; background scroll is locked.
 */
export default function Modal({ isOpen, onClose, children, title }: ModalProps) {
  const [mounted, setMounted] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const prevFocus = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || !isOpen) return;

    prevFocus.current = (document.activeElement as HTMLElement) ?? null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusables = (): HTMLElement[] => {
      const card = cardRef.current;
      if (!card) return [];
      return Array.from(
        card.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);
    };

    const raf = requestAnimationFrame(() => {
      const f = focusables();
      (f[0] ?? cardRef.current)?.focus();
    });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const f = focusables();
      if (f.length === 0) {
        e.preventDefault();
        cardRef.current?.focus();
        return;
      }
      const first = f[0];
      const last = f[f.length - 1];
      const active = document.activeElement as HTMLElement;
      if (e.shiftKey && (active === first || !cardRef.current?.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      prevFocus.current?.focus?.();
    };
  }, [mounted, isOpen, onClose]);

  if (!mounted || !isOpen) return null;

  const overlay = (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--panel)] p-6 shadow-2xl"
        style={{ maxHeight: "min(85vh, calc(100vh - 2rem))", overflowY: "auto" }}
        // Stop propagation so clicks INSIDE the card don't dismiss the modal —
        // only clicks on the dimmed backdrop should.
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between border-b border-[var(--border)] pb-4">
          <h3 id={titleId} className="text-lg font-semibold">
            {title}
          </h3>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-gray-400 hover:text-white"
            aria-label="Close dialog"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
        <div>{children}</div>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}
