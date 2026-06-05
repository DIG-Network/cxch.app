"use client";

// Minimal client for the coinset.org full-node REST API used to broadcast spend
// bundles and poll for confirmation.
import type { CoinSpendJson } from "./sage";

const API = process.env.NEXT_PUBLIC_COINSET_API ?? "https://api.coinset.org";

export interface SpendBundleJson {
  coin_spends: CoinSpendJson[];
  aggregated_signature: string;
}

export interface PushTxResult {
  success: boolean;
  status?: string;
  error?: string;
}

/** Broadcasts a fully-signed spend bundle. */
export async function pushTx(bundle: SpendBundleJson): Promise<PushTxResult> {
  const response = await fetch(`${API}/push_tx`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ spend_bundle: bundle }),
  });
  const data = (await response.json()) as PushTxResult;
  if (!response.ok || data.success === false) {
    throw new Error(data.error ?? `push_tx failed: ${response.status}`);
  }
  return data;
}

/** Looks up a coin record by id, returning null if it is not yet known. */
export async function getCoinRecord(coinId: string): Promise<unknown | null> {
  const response = await fetch(`${API}/get_coin_record_by_name`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: coinId }),
  });
  if (!response.ok) return null;
  const data = (await response.json()) as { coin_record?: unknown };
  return data.coin_record ?? null;
}
