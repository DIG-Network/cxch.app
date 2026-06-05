"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useSage } from "../lib/walletconnect";
import { wxch_asset_id } from "../lib/wasm";
import { mojosToXch } from "../lib/format";

function readBalance(response: unknown): bigint {
  if (response === null || response === undefined) return 0n;
  if (typeof response === "number" || typeof response === "string") return BigInt(response);
  const obj = response as Record<string, unknown>;
  const value = obj.spendable ?? obj.confirmed ?? obj.balance ?? 0;
  return BigInt(value as never);
}

export function Balances({ refreshKey }: { refreshKey: number }) {
  const { session, request } = useSage();
  const [xch, setXch] = useState<bigint | null>(null);
  const [wxch, setWxch] = useState<bigint | null>(null);

  const refresh = useCallback(async () => {
    if (!session) return;
    try {
      const xchBalance = await request("chip0002_getAssetBalance", { type: null, assetId: null });
      const wxchBalance = await request("chip0002_getAssetBalance", {
        type: "cat",
        assetId: wxch_asset_id(),
      });
      setXch(readBalance(xchBalance));
      setWxch(readBalance(wxchBalance));
    } catch (e) {
      console.error(e);
      toast.error("Could not load balances");
    }
  }, [session, request]);

  useEffect(() => {
    refresh();
  }, [refresh, refreshKey]);

  if (!session) return null;

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4">
        <div className="text-xs uppercase text-gray-400">XCH</div>
        <div className="mt-1 text-2xl font-semibold">{xch === null ? "…" : mojosToXch(xch)}</div>
      </div>
      <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4">
        <div className="text-xs uppercase text-gray-400">wXCH</div>
        <div className="mt-1 text-2xl font-semibold">{wxch === null ? "…" : mojosToXch(wxch)}</div>
      </div>
    </div>
  );
}
