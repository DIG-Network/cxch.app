import { describe, it, expect } from "vitest";
import {
  xchToMojos,
  mojosToXch,
  mojosToCat,
  formatMojos,
  with0x,
  strip0x,
  MOJOS_PER_XCH,
} from "./format";

describe("xchToMojos", () => {
  it("converts whole and fractional XCH to mojos", () => {
    expect(xchToMojos("1")).toBe(MOJOS_PER_XCH);
    expect(xchToMojos("1.5")).toBe(1_500_000_000_000n);
    expect(xchToMojos("0.000000000001")).toBe(1n);
    expect(xchToMojos("0")).toBe(0n);
  });

  it("pads and truncates fractions to 12 decimal places", () => {
    expect(xchToMojos("0.5")).toBe(500_000_000_000n);
    // more than 12 fractional digits are truncated, not rounded
    expect(xchToMojos("0.0000000000019")).toBe(1n);
  });

  it("rejects non-numeric input", () => {
    expect(() => xchToMojos("abc")).toThrow("Enter a valid amount");
    expect(() => xchToMojos("1.2.3")).toThrow();
    expect(() => xchToMojos("")).toThrow();
  });
});

describe("mojosToXch", () => {
  it("formats mojos into a trimmed XCH string", () => {
    expect(mojosToXch(MOJOS_PER_XCH)).toBe("1");
    expect(mojosToXch(1_500_000_000_000n)).toBe("1.5");
    expect(mojosToXch(1n)).toBe("0.000000000001");
    expect(mojosToXch(0n)).toBe("0");
  });

  it("round-trips with xchToMojos", () => {
    for (const s of ["1", "1.5", "0.001", "123.456789"]) {
      expect(mojosToXch(xchToMojos(s))).toBe(s);
    }
  });
});

describe("mojosToCat", () => {
  it("shows CAT tokens at 3 decimals with grouped thousands", () => {
    expect(mojosToCat(1_000n)).toBe("1");
    expect(mojosToCat(1_500n)).toBe("1.5");
    expect(mojosToCat(1_000_000n)).toBe("1,000");
    expect(mojosToCat(0n)).toBe("0");
  });
});

describe("formatMojos", () => {
  it("groups raw mojo counts with thousands separators", () => {
    expect(formatMojos(0n)).toBe("0");
    expect(formatMojos(1_000n)).toBe("1,000");
    expect(formatMojos(1_234_567n)).toBe("1,234,567");
  });
});

describe("with0x / strip0x", () => {
  it("adds a 0x prefix only when missing", () => {
    expect(with0x("ab")).toBe("0xab");
    expect(with0x("0xab")).toBe("0xab");
  });

  it("strips a leading 0x only when present", () => {
    expect(strip0x("0xab")).toBe("ab");
    expect(strip0x("ab")).toBe("ab");
  });
});
