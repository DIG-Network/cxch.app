"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { useSage } from "../lib/walletconnect";
import { build_wrap_spends, puzzle_hash_to_address } from "../lib/wasm";
import { mojosToXch, xchToMojos } from "../lib/format";
import {
  buildKeyResolver,
  extractCoinName,
  getAssetCoins,
  getPublicKeys,
  getReceivePuzzleHash,
  normalizeCoin,
  selectCoins,
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

      const built = build_wrap_spends({
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
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          placeholder="0.0"
          className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2"
        />
        <button
          onClick={wrap}
          disabled={active || !session}
          className="rounded-lg bg-[var(--accent)] px-5 py-2 font-semibold text-black disabled:opacity-60"
        >
          {active ? "Working…" : "Wrap"}
        </button>
      </div>
    </section>
  );
}
