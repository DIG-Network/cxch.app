"use client";

/** Small accent-colored loading spinner. `size` in pixels (default 20). */
export function Spinner({ size = 20 }: { size?: number }) {
  return (
    <div
      className="shrink-0 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent"
      style={{ width: size, height: size }}
      role="status"
      aria-label="Loading"
    />
  );
}
