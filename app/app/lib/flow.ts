"use client";

// Shared "sign → aggregate → broadcast" pipeline used by both wrap and melt.
import { aggregate_signatures } from "./wasm";
import { pushTx } from "./coinset";
import { type CoinSpendJson } from "./sage";
import { with0x } from "./format";

export interface BuiltBundle {
  coin_spends: CoinSpendJson[];
  issuer_partial_signature: string;
}

type RequestFn = <T = unknown>(method: string, params: unknown) => Promise<T>;

function extractSignature(response: unknown): string {
  // Sage's chip0002_signCoinSpends returns the aggregated signature as a string.
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
 *
 * The coin spends are sent in exactly the shape Sage expects (snake_case coin
 * fields and `puzzle_reveal` / `solution`), which is what cmojo-core already
 * emits, so no conversion is needed. `partialSign: true` makes Sage sign only
 * the standard-coin signatures it controls, leaving the issuer's TAIL signature
 * for us to aggregate.
 */
export async function signAndBroadcast(request: RequestFn, built: BuiltBundle): Promise<string> {
  const walletResponse = await request("chip0002_signCoinSpends", {
    coinSpends: built.coin_spends,
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
