"use client";

// DecimalsBanner — explains the decimal-convention gap between native XCH (12
// decimals) and cMojo (a CAT2, which follows the 3-decimal CAT standard), while
// stressing that a cMojo coin holds the EXACT same mojos as the XCH inside it.
// Pre-empts the "why does Sage show a huge cMojo number?" confusion: this app
// shows cMojo in XCH terms, a CAT wallet shows the same coin ~1e9x larger.
// Dismissible; the choice is remembered per browser.
import { useEffect, useState } from "react";

const KEY = "cmojo-decimals-note-dismissed";

export function DecimalsBanner() {
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    setHidden(localStorage.getItem(KEY) === "1");
  }, []);

  if (hidden) return null;

  const dismiss = () => {
    localStorage.setItem(KEY, "1");
    setHidden(true);
  };

  return (
    <div
      className="relative flex items-start gap-3 rounded-xl border p-4 text-sm"
      style={{
        borderColor: "rgba(63,185,80,0.35)",
        background: "rgba(63,185,80,0.06)",
      }}
    >
      <span
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold text-[var(--accent)]"
        style={{ background: "rgba(63,185,80,0.14)" }}
        aria-hidden
      >
        i
      </span>
      <div className="pr-6">
        <div className="font-semibold">Same mojos, different decimals</div>
        <p className="mt-1 leading-relaxed text-gray-400">
          Native XCH uses <strong>12 decimals</strong> (1 XCH = 1,000,000,000,000
          mojos); cMojo, as a <strong>CAT2</strong> token, uses the CAT standard of{" "}
          <strong>3 decimals</strong>. A cMojo coin always holds the{" "}
          <strong>exact same number of mojos</strong> as the XCH inside it — the
          peg is 1 mojo to 1 mojo, never a multiple. This app shows cMojo in XCH
          terms, so 1 XCH wrapped reads as 1 cMojo here; a CAT wallet like{" "}
          <strong>Sage</strong> shows that same coin with 3 decimals — a much
          larger number (≈ ×1,000,000,000). Identical value, different decimal
          scale.
        </p>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="absolute right-2 top-2 rounded-md px-2 py-1 text-gray-500 hover:text-[var(--foreground)]"
      >
        ✕
      </button>
    </div>
  );
}
