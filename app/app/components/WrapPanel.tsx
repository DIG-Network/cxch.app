"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { useSage } from "../lib/walletconnect";
import { build_wrap_spends } from "../lib/wasm";
import { xchToMojos } from "../lib/format";
import {
  buildKeyResolver,
  getAssetCoins,
  getPublicKeys,
  getReceivePuzzleHash,
  normalizeCoin,
  selectCoins,
} from "../lib/sage";
import { signAndBroadcast, type BuiltBundle } from "../lib/flow";

const DEFAULT_FEE = BigInt(process.env.NEXT_PUBLIC_DEFAULT_FEE_MOJOS ?? "100000000");

export function WrapPanel({ onDone }: { onDone: () => void }) {
  const { session, request } = useSage();
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  async function wrap() {
    if (!session) {
      toast.error("Connect Sage first");
      return;
    }
    setBusy(true);
    try {
      const mintMojos = xchToMojos(amount);
      if (mintMojos <= 0n) throw new Error("Enter an amount greater than zero");

      const resolver = buildKeyResolver(await getPublicKeys(request));
      const recipientPuzzleHash = await getReceivePuzzleHash(request);

      const rawCoins = await getAssetCoins(request, null, null);
      const coins = rawCoins.map(normalizeCoin);
      const selected = selectCoins(coins, mintMojos + DEFAULT_FEE);

      const xch_coins = selected.map((coin) => {
        const synthetic_key = resolver(coin.puzzle_hash);
        if (!synthetic_key) {
          throw new Error(`No known key for coin at ${coin.puzzle_hash}`);
        }
        return { coin, synthetic_key };
      });

      const built = build_wrap_spends({
        xch_coins,
        recipient_puzzle_hash: recipientPuzzleHash,
        change_puzzle_hash: recipientPuzzleHash,
        mint_amount_mojos: mintMojos.toString(),
        fee_mojos: DEFAULT_FEE.toString(),
      }) as BuiltBundle;

      const status = await signAndBroadcast(request, built);
      toast.success(`Wrapped ${amount} XCH → wXCH (${status})`);
      setAmount("");
      onDone();
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Wrap failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-5">
      <h2 className="text-lg font-semibold">Wrap XCH → wXCH</h2>
      <p className="mt-1 text-sm text-gray-400">
        Lock XCH and receive an equal amount of wXCH, backed 1:1 by consensus.
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
          disabled={busy || !session}
          className="rounded-lg bg-[var(--accent)] px-5 py-2 font-semibold text-black disabled:opacity-60"
        >
          {busy ? "Wrapping…" : "Wrap"}
        </button>
      </div>
    </section>
  );
}
