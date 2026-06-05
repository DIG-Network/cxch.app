"use client";

// Shared "sign → aggregate → broadcast" pipeline used by both wrap and melt.
import { aggregate_signatures } from "./wasm";
import { pushTx } from "./coinset";
import { toSageCoinSpends, type CoinSpendJson } from "./sage";
import { with0x } from "./format";

export interface BuiltBundle {
  coin_spends: CoinSpendJson[];
  issuer_partial_signature: string;
}

type RequestFn = <T = unknown>(method: string, params: unknown) => Promise<T>;

function extractSignature(response: unknown): string {
  if (typeof response === "string") return with0x(response);
  const obj = response as Record<string, unknown>;
  const sig = obj.signature ?? obj.aggregatedSignature ?? obj.aggregated_signature;
  if (typeof sig !== "string") {
    throw new Error("Wallet did not return a signature");
  }
  return with0x(sig);
}

/**
 * Asks the wallet to partially sign the unsigned coin spends, aggregates that
 * partial signature with the issuer's partial signature, and broadcasts the
 * resulting spend bundle. Returns the coinset push_tx status.
 */
export async function signAndBroadcast(request: RequestFn, built: BuiltBundle): Promise<string> {
  const walletResponse = await request("chip0002_signCoinSpends", {
    coinSpends: toSageCoinSpends(built.coin_spends),
    partialSign: true,
  });
  const walletSig = extractSignature(walletResponse);

  const aggregated = aggregate_signatures([walletSig, built.issuer_partial_signature]);

  const result = await pushTx({
    coin_spends: built.coin_spends,
    aggregated_signature: aggregated,
  });
  return result.status ?? "SUCCESS";
}
