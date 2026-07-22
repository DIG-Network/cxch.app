import { describe, it, expect } from "vitest";
import { selectCoins, sumCoinAmounts, normalizeCoin, extractCoinName } from "./sage";

const coin = (amount: string) => ({ amount });

describe("selectCoins", () => {
  it("greedily picks the largest coins until the need is covered", () => {
    const coins = [coin("100"), coin("500"), coin("300")];
    const selected = selectCoins(coins, 400n);
    // 500 alone covers 400 — only the largest is taken.
    expect(selected.map((c) => c.amount)).toEqual(["500"]);
  });

  it("accumulates multiple coins when one is not enough", () => {
    const coins = [coin("500"), coin("300"), coin("100")];
    const selected = selectCoins(coins, 700n);
    expect(selected.map((c) => c.amount)).toEqual(["500", "300"]);
  });

  it("selects an exact-match set without over-picking", () => {
    const coins = [coin("400"), coin("600")];
    expect(selectCoins(coins, 1000n).map((c) => c.amount)).toEqual(["600", "400"]);
  });

  it("throws when the coins cannot cover the amount plus fees", () => {
    expect(() => selectCoins([coin("100"), coin("50")], 1000n)).toThrow(
      "Insufficient spendable coins"
    );
  });

  it("does not mutate the input array order", () => {
    const coins = [coin("100"), coin("500")];
    selectCoins(coins, 100n);
    expect(coins.map((c) => c.amount)).toEqual(["100", "500"]);
  });
});

describe("sumCoinAmounts", () => {
  it("sums normalized coin amounts across mixed wallet shapes", () => {
    const coins = [
      { coin: { amount: 100 } },
      { amount: "250" },
      { coin: { amount: 1_000_000_000_000 } },
    ];
    expect(sumCoinAmounts(coins)).toBe(1_000_000_000_350n);
  });

  it("skips malformed entries instead of throwing", () => {
    expect(sumCoinAmounts([{ amount: "10" }, { nonsense: true }, null])).toBe(10n);
  });

  it("is zero for an empty list", () => {
    expect(sumCoinAmounts([])).toBe(0n);
  });
});

describe("normalizeCoin", () => {
  it("accepts camelCase and 0x-less hex, emitting snake_case 0x fields", () => {
    const normalized = normalizeCoin({
      parentCoinInfo: "aa",
      puzzleHash: "0xbb",
      amount: 42,
    });
    expect(normalized).toEqual({
      parent_coin_info: "0xaa",
      puzzle_hash: "0xbb",
      amount: "42",
    });
  });
});

describe("extractCoinName", () => {
  it("returns a 0x-prefixed name when present, else undefined", () => {
    expect(extractCoinName({ coinName: "cc" })).toBe("0xcc");
    expect(extractCoinName({ name: "0xdd" })).toBe("0xdd");
    expect(extractCoinName({})).toBeUndefined();
  });
});
