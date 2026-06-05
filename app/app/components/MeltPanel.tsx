"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { useSage } from "../lib/walletconnect";
import { build_melt_spends, wxch_asset_id } from "../lib/wasm";
import { xchToMojos } from "../lib/format";
import {
  buildKeyResolver,
  getAssetCoins,
  getPublicKeys,
  getReceivePuzzleHash,
  normalizeCoin,
  normalizeLineageProof,
  selectCoins,
} from "../lib/sage";
import { signAndBroadcast, type BuiltBundle } from "../lib/flow";

const DEFAULT_FEE = BigInt(process.env.NEXT_PUBLIC_DEFAULT_FEE_MOJOS ?? "100000000");

export function MeltPanel({ onDone }: { onDone: () => void }) {
  const { session, request } = useSage();
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  async function melt() {
    if (!session) {
      toast.error("Connect Sage first");
      return;
    }
    setBusy(true);
    try {
      const meltMojos = xchToMojos(amount);
      if (meltMojos <= 0n) throw new Error("Enter an amount greater than zero");

      const resolver = buildKeyResolver(await getPublicKeys(request));
      const recipientPuzzleHash = await getReceivePuzzleHash(request);

      // Select wXCH (CAT) coins to burn.
      const rawCats = await getAssetCoins(request, "cat", wxch_asset_id());
      const cats = rawCats.map((raw) => {
        const coin = normalizeCoin(raw);
        return { raw, coin, amount: coin.amount };
      });
      const selectedCats = selectCoins(cats, meltMojos);

      // Select an XCH anchor coin to absorb the freed mojos and pay the fee.
      // A CAT coin can only ever create CAT children, so the released XCH must be
      // created by an ordinary coin spent in the same bundle.
      const rawXch = (await getAssetCoins(request, null, null)).map(normalizeCoin);
      const anchors = selectCoins(rawXch, DEFAULT_FEE > 0n ? DEFAULT_FEE : 1n);

      const wxch_coins = selectedCats.map(({ raw, coin }) => {
        const synthetic_key = resolver(coin.puzzle_hash);
        if (!synthetic_key) throw new Error(`No known key for wXCH coin at ${coin.puzzle_hash}`);
        const rawObj = raw as Record<string, unknown>;
        const lineage_proof = normalizeLineageProof(
          rawObj.lineageProof ?? rawObj.lineage_proof
        );
        return { coin, lineage_proof, synthetic_key };
      });

      const anchor_coins = anchors.map((coin) => {
        const synthetic_key = resolver(coin.puzzle_hash);
        if (!synthetic_key) throw new Error(`No known key for coin at ${coin.puzzle_hash}`);
        return { coin, synthetic_key };
      });

      const built = build_melt_spends({
        wxch_coins,
        anchor_coins,
        recipient_puzzle_hash: recipientPuzzleHash,
        cat_change_puzzle_hash: recipientPuzzleHash,
        melt_amount_mojos: meltMojos.toString(),
        fee_mojos: DEFAULT_FEE.toString(),
      }) as BuiltBundle;

      const status = await signAndBroadcast(request, built);
      toast.success(`Melted ${amount} wXCH → XCH (${status})`);
      setAmount("");
      onDone();
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Melt failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-5">
      <h2 className="text-lg font-semibold">Melt wXCH → XCH</h2>
      <p className="mt-1 text-sm text-gray-400">
        Burn wXCH and release the same amount of native XCH (minus the fee).
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
          onClick={melt}
          disabled={busy || !session}
          className="rounded-lg bg-[var(--accent)] px-5 py-2 font-semibold text-black disabled:opacity-60"
        >
          {busy ? "Melting…" : "Melt"}
        </button>
      </div>
    </section>
  );
}
