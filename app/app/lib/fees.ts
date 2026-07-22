"use client";

// The single source of truth for the two fees a wrap/melt carries. Keeping them
// here — and computing the dev fee via the canonical cmojo-core WASM export —
// guarantees the UI preview and coin selection can never desync from the fee the
// builder actually spends inside the bundle.
import { dev_fee } from "./wasm";

/**
 * The default network fee, in mojos, attached to every spend bundle (0.0001 XCH
 * by default). Overridable at build time via `NEXT_PUBLIC_DEFAULT_FEE_MOJOS`.
 * This is a client-side default, not a cmojo-core constant.
 */
export const DEFAULT_FEE = BigInt(process.env.NEXT_PUBLIC_DEFAULT_FEE_MOJOS ?? "100000000");

/**
 * The 0.1% dev fee (10 basis points, floored) for a wrap/melt of `amount` mojos.
 * A pass-through to the canonical `cmojo_core::constants::dev_fee` compiled to
 * WASM — never a re-derived copy of the formula. Amounts under 1000 mojos yield
 * zero. Requires the WASM engine to be initialized first (`ensureWasm`); the app
 * gates all spend UI on that, so callers here always run post-init.
 */
export function devFee(amount: bigint): bigint {
  return dev_fee(amount);
}
