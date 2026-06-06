"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useSage } from "../lib/walletconnect";
import { wrap as buildWrap, puzzle_hash_to_address } from "../lib/wasm";
import { mojosToXch, xchToMojos } from "../lib/format";
import {
  buildKeyResolver,
  extractCoinName,
  getAssetCoins,
  getPublicKeys,
  getReceivePuzzleHash,
  normalizeCoin,
  selectCoins,
  sumCoinAmounts,
} from "../lib/sage";
import { type BuiltBundle } from "../lib/flow";
import { useSpendConfirm, type PreparedSpend } from "./SpendConfirm";

const DEFAULT_FEE = BigInt(process.env.NEXT_PUBLIC_DEFAULT_FEE_MOJOS ?? "100000000");

/** 0.1% dev fee (10 basis points, floored) — must mirror cxch-core. */
function devFee(amount: bigint): bigint {
  return (amount * 10n) / 10_000n;
}

export function WrapPanel({ onDone }: { onDone: () => void }) {
  const { session, request } = useSage();
  const { runSpend, active } = useSpendConfirm();
  const [amount, setAmount] = useState("");
  const [spendable, setSpendable] = useState<bigint | null>(null);

  // Track the spendable XCH balance so "Max" can fill the largest wrappable
  // amount. Re-polled every ~10s, mirroring the Balances card.
  useEffect(() => {
    if (!session) {
      setSpendable(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const coins = await getAssetCoins(request, null, null);
        if (!cancelled) setSpendable(sumCoinAmounts(coins));
      } catch {
        /* transient — keep the last known value */
      }
    };
    load();
    const id = setInterval(load, 10_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [session, request]);

  // The largest amount that still leaves room for the network fee and the
  // 0.1% dev fee the builder adds on top: maxMint + DEFAULT_FEE +
  // floor(maxMint/1000) <= spendable.
  function fillMax() {
    if (spendable === null) return;
    if (spendable <= DEFAULT_FEE) {
      setAmount("0");
      return;
    }
    let m = ((spendable - DEFAULT_FEE) * 1000n) / 1001n;
    while (m > 0n && m + DEFAULT_FEE + devFee(m) > spendable) m -= 1n;
    setAmount(m > 0n ? mojosToXch(m) : "0");
  }

  async function wrap() {
    if (!session) {
      toast.error("Connect Sage first");
      return;
    }
    let mintMojos: bigint;
    try {
      mintMojos = xchToMojos(amount);
      if (mintMojos <= 0n) throw new Error("Enter an amount greater than zero");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Enter a valid amount");
      return;
    }

    const prepare = async (report: (s: string) => void): Promise<PreparedSpend> => {
      report("Fetching wallet keys");
      const resolver = buildKeyResolver(await getPublicKeys(request));
      const recipientPuzzleHash = await getReceivePuzzleHash(request);

      report("Selecting XCH coins");
      const rawCoins = await getAssetCoins(request, null, null);
      const coins = rawCoins.map((raw) => ({ raw, ...normalizeCoin(raw) }));
      // Inputs must also cover the 0.1% dev fee the builder adds.
      const selected = selectCoins(coins, mintMojos + DEFAULT_FEE + devFee(mintMojos));

      report("Building spend bundle");
      const xch_coins = selected.map(({ parent_coin_info, puzzle_hash, amount: amt }) => {
        const synthetic_key = resolver(puzzle_hash);
        if (!synthetic_key) {
          throw new Error(`No known key for coin at ${puzzle_hash}`);
        }
        return { coin: { parent_coin_info, puzzle_hash, amount: amt }, synthetic_key };
      });

      const built = buildWrap({
        xch_coins,
        recipient_puzzle_hash: recipientPuzzleHash,
        change_puzzle_hash: recipientPuzzleHash,
        mint_amount_mojos: mintMojos.toString(),
        fee_mojos: DEFAULT_FEE.toString(),
      }) as BuiltBundle;

      return {
        built,
        // Watch the first funder coin's SPEND on coinset — bundle landed.
        watchCoinId: extractCoinName(selected[0].raw),
        summary: [
          { label: "Action", value: "Wrap XCH → cXCH" },
          { label: "Mint", value: `${amount} cXCH`, strong: true },
          { label: "XCH locked", value: `${amount} XCH` },
          { label: "Fee", value: `${mojosToXch(DEFAULT_FEE)} XCH` },
          { label: "Dev fee (0.1%)", value: `${mojosToXch(devFee(mintMojos))} XCH` },
          { label: "Recipient", value: puzzle_hash_to_address(recipientPuzzleHash) },
        ],
      };
    };

    try {
      await runSpend({ title: `Wrap ${amount} XCH`, prepare });
      toast.success(`Wrapped ${amount} XCH → cXCH`);
      setAmount("");
      onDone();
    } catch {
      /* the modal already surfaced the error / cancel */
    }
  }

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-5">
      <h2 className="text-lg font-semibold">Wrap XCH → cXCH</h2>
      <p className="mt-1 text-sm text-gray-400">
        Lock XCH and receive an equal amount of cXCH, backed 1:1 by consensus.
      </p>
      <div className="mt-4 flex gap-2">
        <div className="relative flex-1">
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="0.0"
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 pr-16"
          />
          <button
            type="button"
            onClick={fillMax}
            disabled={!session || spendable === null}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md border border-[var(--border)] px-2 py-1 text-xs font-semibold text-[var(--accent)] hover:border-[var(--accent)] disabled:opacity-50"
          >
            Max
          </button>
        </div>
        <button
          onClick={wrap}
          disabled={active || !session}
          className="rounded-lg bg-[var(--accent)] px-5 py-2 font-semibold text-black disabled:opacity-60"
        >
          {active ? "Working…" : "Wrap"}
        </button>
      </div>
      <p className="mt-2 text-xs text-gray-500">
        Spendable: {spendable === null ? "…" : `${mojosToXch(spendable)} XCH`}
      </p>
    </section>
  );
}
