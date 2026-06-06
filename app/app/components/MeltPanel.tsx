"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useSage } from "../lib/walletconnect";
import { melt as buildMelt, cmojo_asset_id, puzzle_hash_to_address } from "../lib/wasm";
import { mojosToXch, xchToMojos } from "../lib/format";
import {
  buildCatKeyResolver,
  buildKeyResolver,
  extractCoinName,
  getAssetCoins,
  getPublicKeys,
  getReceivePuzzleHash,
  normalizeCoin,
  normalizeLineageProof,
  selectCoins,
  sumCoinAmounts,
} from "../lib/sage";
import { type BuiltBundle } from "../lib/flow";
import { useSpendConfirm, type PreparedSpend } from "./SpendConfirm";

const DEFAULT_FEE = BigInt(process.env.NEXT_PUBLIC_DEFAULT_FEE_MOJOS ?? "100000000");

/** 0.1% dev fee (10 basis points, floored) — must mirror cmojo-core. */
function devFee(amount: bigint): bigint {
  return (amount * 10n) / 10_000n;
}

export function MeltPanel({ onDone }: { onDone: () => void }) {
  const { session, request } = useSage();
  const { runSpend, active } = useSpendConfirm();
  const [amount, setAmount] = useState("");
  const [cmojoBalance, setCmojoBalance] = useState<bigint | null>(null);

  // Track the cMojo balance so "Max" can fill the whole burnable amount. The
  // network and dev fees come out of the released XCH, so the full CAT balance
  // is always meltable. Re-polled every ~10s, mirroring the Balances card.
  useEffect(() => {
    if (!session) {
      setCmojoBalance(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const coins = await getAssetCoins(request, "cat", cmojo_asset_id());
        if (!cancelled) setCmojoBalance(sumCoinAmounts(coins));
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

  function fillMax() {
    if (cmojoBalance === null) return;
    setAmount(cmojoBalance > 0n ? mojosToXch(cmojoBalance) : "0");
  }

  async function melt() {
    if (!session) {
      toast.error("Connect Sage first");
      return;
    }
    let meltMojos: bigint;
    try {
      meltMojos = xchToMojos(amount);
      if (meltMojos <= 0n) throw new Error("Enter an amount greater than zero");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Enter a valid amount");
      return;
    }

    const prepare = async (report: (s: string) => void): Promise<PreparedSpend> => {
      report("Fetching wallet keys");
      const publicKeys = await getPublicKeys(request);
      const resolver = buildKeyResolver(publicKeys);
      // CAT coins carry the OUTER (CAT2-wrapped) puzzle hash on-chain.
      const catResolver = buildCatKeyResolver(publicKeys);
      const recipientPuzzleHash = await getReceivePuzzleHash(request);

      report("Selecting cMojo coins");
      // Select cMojo (CAT) coins to burn.
      const rawCats = await getAssetCoins(request, "cat", cmojo_asset_id());
      const cats = rawCats.map((raw) => {
        const coin = normalizeCoin(raw);
        return { raw, coin, amount: coin.amount };
      });
      const selectedCats = selectCoins(cats, meltMojos);

      report("Selecting an XCH anchor coin");
      // A CAT coin can only ever create CAT children, so the released XCH must
      // be created by an ordinary coin spent in the same bundle.
      const rawXch = (await getAssetCoins(request, null, null)).map((raw) => ({
        raw,
        ...normalizeCoin(raw),
      }));
      // The fee and dev fee come out of (anchor + melt); anchors only need to
      // keep that redeemable total above the deductions.
      const deductions = DEFAULT_FEE + devFee(meltMojos);
      const anchors = selectCoins(
        rawXch,
        deductions >= meltMojos ? deductions - meltMojos + 1n : 1n
      );

      report("Building spend bundle");
      const cmojo_coins = selectedCats.map(({ raw, coin }) => {
        const synthetic_key = catResolver(coin.puzzle_hash);
        if (!synthetic_key) throw new Error(`No known key for cMojo coin at ${coin.puzzle_hash}`);
        const rawObj = raw as Record<string, unknown>;
        const lineage_proof = normalizeLineageProof(
          rawObj.lineageProof ?? rawObj.lineage_proof
        );
        return { coin, lineage_proof, synthetic_key };
      });

      const anchor_coins = anchors.map(({ parent_coin_info, puzzle_hash, amount: amt }) => {
        const synthetic_key = resolver(puzzle_hash);
        if (!synthetic_key) throw new Error(`No known key for coin at ${puzzle_hash}`);
        return { coin: { parent_coin_info, puzzle_hash, amount: amt }, synthetic_key };
      });

      const built = buildMelt({
        cmojo_coins,
        anchor_coins,
        recipient_puzzle_hash: recipientPuzzleHash,
        cat_change_puzzle_hash: recipientPuzzleHash,
        melt_amount_mojos: meltMojos.toString(),
        fee_mojos: DEFAULT_FEE.toString(),
      }) as BuiltBundle;

      return {
        built,
        // Watch the first burned cMojo coin's SPEND on coinset — bundle landed.
        watchCoinId: extractCoinName(selectedCats[0].raw),
        summary: [
          { label: "Action", value: "Melt cMojo → XCH" },
          { label: "Burn", value: `${amount} cMojo`, strong: true },
          { label: "XCH released", value: `${amount} XCH` },
          { label: "Fee", value: `${mojosToXch(DEFAULT_FEE)} XCH` },
          { label: "Dev fee (0.1%)", value: `${mojosToXch(devFee(meltMojos))} XCH` },
          { label: "Recipient", value: puzzle_hash_to_address(recipientPuzzleHash) },
        ],
      };
    };

    try {
      await runSpend({ title: `Melt ${amount} cMojo`, prepare });
      toast.success(`Melted ${amount} cMojo → XCH`);
      setAmount("");
      onDone();
    } catch {
      /* the modal already surfaced the error / cancel */
    }
  }

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-5">
      <h2 className="text-lg font-semibold">Melt cMojo → XCH</h2>
      <p className="mt-1 text-sm text-gray-400">
        Burn cMojo and release the same amount of native XCH (minus the fee).
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
            disabled={!session || cmojoBalance === null}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md border border-[var(--border)] px-2 py-1 text-xs font-semibold text-[var(--accent)] hover:border-[var(--accent)] disabled:opacity-50"
          >
            Max
          </button>
        </div>
        <button
          onClick={melt}
          disabled={active || !session}
          className="rounded-lg bg-[var(--accent)] px-5 py-2 font-semibold text-black disabled:opacity-60"
        >
          {active ? "Working…" : "Melt"}
        </button>
      </div>
      <p className="mt-2 text-xs text-gray-500">
        Balance: {cmojoBalance === null ? "…" : `${mojosToXch(cmojoBalance)} cMojo`}
      </p>
    </section>
  );
}
