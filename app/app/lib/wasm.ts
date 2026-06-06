"use client";

// Thin wrapper around the cmojo-core WASM module. It guarantees the module is
// initialized exactly once before any of its functions are called.
//
// The default export `init` follows the wasm-pack `--target web` convention.
// Calling it with no argument lets webpack's `asyncWebAssembly` machinery
// resolve the `.wasm` blob automatically (see next.config.ts).
import init, {
  cmojo_asset_id,
  cmojo_outer_puzzle_hash,
  standard_puzzle_hash,
  derive_synthetic_key,
  issuer_public_key,
  address_to_puzzle_hash,
  puzzle_hash_to_address,
  wrap,
  melt,
  aggregate_signatures,
} from "@wasm";

let ready: Promise<void> | null = null;

export function ensureWasm(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("cMojo engine requires a browser"));
  }
  if (!ready) {
    ready = init().then(() => undefined);
  }
  return ready;
}

export {
  cmojo_asset_id,
  cmojo_outer_puzzle_hash,
  standard_puzzle_hash,
  derive_synthetic_key,
  issuer_public_key,
  address_to_puzzle_hash,
  puzzle_hash_to_address,
  wrap,
  melt,
  aggregate_signatures,
};
