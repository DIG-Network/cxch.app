"use client";

/**
 * The single loading spinner used across the app.
 *
 * - `size` — diameter in pixels (default 20).
 * - `variant` — `"solid"` (accent ring, transparent top; the default) or
 *   `"track"` (muted border ring with an accent top, for on-panel balances).
 * - `inline` — render inline (aligned to surrounding text) instead of block.
 * - `label` — the accessible status label announced to screen readers.
 */
export function Spinner({
  size = 20,
  variant = "solid",
  inline = false,
  label = "Loading",
}: {
  size?: number;
  variant?: "solid" | "track";
  inline?: boolean;
  label?: string;
}) {
  const ring =
    variant === "track"
      ? "border-[var(--border)] border-t-[var(--accent)]"
      : "border-[var(--accent)] border-t-transparent";
  const display = inline ? "inline-block align-middle" : "block";
  return (
    <span
      role="status"
      aria-label={label}
      className={`${display} shrink-0 animate-spin rounded-full border-2 ${ring}`}
      style={{ width: size, height: size }}
    />
  );
}
