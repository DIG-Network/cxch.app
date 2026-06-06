// Mojo <-> XCH conversion helpers. 1 XCH = 1,000,000,000,000 mojos.
export const MOJOS_PER_XCH = 1_000_000_000_000n;

/** Parses a human XCH amount (e.g. "1.5") into mojos. Throws on bad input. */
export function xchToMojos(value: string): bigint {
  const trimmed = value.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error("Enter a valid amount");
  }
  const [whole, fraction = ""] = trimmed.split(".");
  const paddedFraction = (fraction + "000000000000").slice(0, 12);
  return BigInt(whole) * MOJOS_PER_XCH + BigInt(paddedFraction || "0");
}

/** Formats mojos into a human XCH string, trimming trailing zeros. */
export function mojosToXch(mojos: bigint): string {
  const whole = mojos / MOJOS_PER_XCH;
  const fraction = (mojos % MOJOS_PER_XCH).toString().padStart(12, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

/** CAT2 tokens carry 3 decimals, so one displayed token = 1,000 mojos. */
export const MOJOS_PER_CAT = 1_000n;

/** Groups an integer string with thousands separators. */
function groupThousands(value: string): string {
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Formats mojos as a cMojo (CAT) token count — the number of tokens a CAT
 * wallet like Sage shows: 1 token = 1,000 mojos, 3 decimals, trailing zeros
 * trimmed, whole part grouped. */
export function mojosToCat(mojos: bigint): string {
  const whole = groupThousands((mojos / MOJOS_PER_CAT).toString());
  const fraction = (mojos % MOJOS_PER_CAT).toString().padStart(3, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}

/** Formats a raw mojo count with thousands separators. */
export function formatMojos(mojos: bigint): string {
  return groupThousands(mojos.toString());
}

/** Ensures a hex string has a leading 0x. */
export function with0x(hex: string): string {
  return hex.startsWith("0x") ? hex : `0x${hex}`;
}

/** Strips a leading 0x. Sage's chip0002_* params reject prefixed hex
 * ("Hex decoding error: Invalid character 'x' at position 1"). */
export function strip0x(hex: string): string {
  return hex.startsWith("0x") ? hex.slice(2) : hex;
}
