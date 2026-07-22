import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import init from "@wasm";
import { DEFAULT_FEE, devFee } from "./fees";

// The single most important guarantee in this dApp: the fee the UI previews and
// selects coins for must equal the fee the builder actually spends. Both derive
// from `cmojo_core::constants::dev_fee`. This test runs the REAL compiled Rust
// (via the wasm-pack build) and pins it to the SAME golden vectors as the Rust
// unit test `dev_fee_is_ten_basis_points_floored`, so JS(wasm) == Rust by
// transitivity. If either drifts, one side fails against the shared table.
//
// Golden vectors: fee = floor(amount * 10 / 10_000).
const GOLDEN: ReadonlyArray<readonly [bigint, bigint]> = [
  [0n, 0n],
  [999n, 0n], // under 1000 mojos rounds to zero — no dev-fee output is added
  [1_000n, 1n],
  [9_999n, 9n],
  [10_000n, 10n],
  [1_000_000_000_000n, 1_000_000_000n], // 1 XCH → 0.001 XCH
];

beforeAll(async () => {
  const wasmPath = fileURLToPath(new URL("../../wasm-pkg/cmojo_core_bg.wasm", import.meta.url));
  await init({ module_or_path: readFileSync(wasmPath) });
});

describe("devFee (wasm parity with cmojo-core::constants::dev_fee)", () => {
  it.each(GOLDEN.map(([a, f]) => ({ amount: a, fee: f })))(
    "dev_fee($amount) === $fee",
    ({ amount, fee }) => {
      expect(devFee(amount)).toBe(fee);
    }
  );

  it("is exactly 0.1% for a large spread of amounts", () => {
    for (let xch = 1n; xch <= 250n; xch += 7n) {
      const amount = xch * 1_000_000_000_000n;
      // 0.1% of the amount, computed independently as the oracle.
      const expected = (amount * 10n) / 10_000n;
      expect(devFee(amount)).toBe(expected);
    }
  });
});

describe("DEFAULT_FEE", () => {
  it("defaults to 0.0001 XCH (100_000_000 mojos)", () => {
    expect(DEFAULT_FEE).toBe(100_000_000n);
  });
});
