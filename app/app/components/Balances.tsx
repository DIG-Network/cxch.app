"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useSage } from "../lib/walletconnect";
import { cmojo_asset_id } from "../lib/wasm";
import { mojosToXch } from "../lib/format";
import { getAssetCoins, sumCoinAmounts } from "../lib/sage";

export function Balances({ refreshKey }: { refreshKey: number }) {
  const { session, request } = useSage();
  const [xch, setXch] = useState<bigint | null>(null);
  const [cmojo, setCmojo] = useState<bigint | null>(null);

  const refresh = useCallback(
    async (silent = false) => {
      if (!session) return;
      try {
        // Sum the wallet's spendable coins instead of trusting
        // chip0002_getAssetBalance — the same approach as the shielded-wallet
        // reference, and it always matches what wrap/melt can actually spend.
        const xchCoins = await getAssetCoins(request, null, null);
        const cmojoCoins = await getAssetCoins(request, "cat", cmojo_asset_id());
        setXch(sumCoinAmounts(xchCoins));
        setCmojo(sumCoinAmounts(cmojoCoins));
      } catch (e) {
        console.error(e);
        // Background polls fail quietly (transient wallet/relay blips) —
        // only the initial load surfaces a toast.
        if (!silent) toast.error("Could not load balances");
      }
    },
    [session, request]
  );

  useEffect(() => {
    refresh();
    // Keep balances live: re-poll the wallet every ~10s while connected.
    const id = setInterval(() => refresh(true), 10_000);
    return () => clearInterval(id);
  }, [refresh, refreshKey]);

  if (!session) return null;

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4">
        <div className="text-xs uppercase text-gray-400">XCH</div>
        <div className="mt-1 text-2xl font-semibold">{xch === null ? "…" : mojosToXch(xch)}</div>
      </div>
      <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4">
        <div className="text-xs uppercase text-gray-400">cMojo</div>
        <div className="mt-1 text-2xl font-semibold">{cmojo === null ? "…" : mojosToXch(cmojo)}</div>
      </div>
    </div>
  );
}
