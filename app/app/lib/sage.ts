"use client";

// Helpers that adapt Sage / CHIP-0002 WalletConnect responses into the shapes
// the wxch-core WASM module expects, and back into the shapes Sage and
// coinset.org expect for signing and broadcasting.
//
// NOTE ON WIRE FORMATS: different Chia wallets have historically used slightly
// different field casings for coins and coin spends. The normalizers below
// accept both camelCase and snake_case and tolerate `0x` prefixes, so the dApp
// is resilient to those differences. If a specific wallet build still rejects a
// request, the conversion helpers here are the single place to adjust.

import { address_to_puzzle_hash, derive_synthetic_key, standard_puzzle_hash } from "./wasm";
import { with0x } from "./format";

type RequestFn = <T = unknown>(method: string, params: unknown) => Promise<T>;

/** Fetches the wallet's current receive address and returns its puzzle hash. */
export async function getReceivePuzzleHash(request: RequestFn): Promise<string> {
  const response = await request("chia_getCurrentAddress", {});
  const address =
    typeof response === "string"
      ? response
      : ((response as Record<string, unknown>).address as string);
  if (!address) throw new Error("Wallet did not return a receive address");
  return address_to_puzzle_hash(address);
}

/** Fetches the wallet's public keys via CHIP-0002. */
export async function getPublicKeys(request: RequestFn): Promise<string[]> {
  const response = await request("chip0002_getPublicKeys", {});
  return extractPublicKeys(response);
}

/** Fetches spendable coins for an asset (XCH when assetId is null). */
export async function getAssetCoins(
  request: RequestFn,
  type: "cat" | null,
  assetId: string | null
): Promise<unknown[]> {
  const response = await request("chip0002_getAssetCoins", {
    type,
    assetId,
    includedLocked: false,
    offset: 0,
    limit: 100,
  });
  return Array.isArray(response) ? response : [];
}

export interface CoinJson {
  parent_coin_info: string;
  puzzle_hash: string;
  amount: string;
}

export interface LineageProofJson {
  parent_parent_coin_info: string;
  parent_inner_puzzle_hash: string;
  parent_amount: string;
}

export interface CoinSpendJson {
  coin: CoinJson;
  puzzle_reveal: string;
  solution: string;
}

type AnyRecord = Record<string, unknown>;

function pick(obj: AnyRecord, ...keys: string[]): unknown {
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null) return obj[key];
  }
  return undefined;
}

function asString(value: unknown): string {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number") return Math.round(value).toString();
  return String(value);
}

/** Normalizes a coin from any wallet shape into snake_case with `0x` hex. */
export function normalizeCoin(raw: unknown): CoinJson {
  const obj = raw as AnyRecord;
  const inner = (obj.coin ?? obj) as AnyRecord;
  return {
    parent_coin_info: with0x(asString(pick(inner, "parent_coin_info", "parentCoinInfo"))),
    puzzle_hash: with0x(asString(pick(inner, "puzzle_hash", "puzzleHash"))),
    amount: asString(pick(inner, "amount")),
  };
}

/** Normalizes a CAT lineage proof from any wallet shape. */
export function normalizeLineageProof(raw: unknown): LineageProofJson {
  const obj = (raw ?? {}) as AnyRecord;
  return {
    parent_parent_coin_info: with0x(
      asString(pick(obj, "parent_parent_coin_info", "parentParentCoinInfo", "parentCoinInfo"))
    ),
    parent_inner_puzzle_hash: with0x(
      asString(pick(obj, "parent_inner_puzzle_hash", "parentInnerPuzzleHash", "innerPuzzleHash"))
    ),
    parent_amount: asString(pick(obj, "parent_amount", "parentAmount", "amount")),
  };
}

/**
 * Resolves the synthetic public key that controls a given standard puzzle hash.
 *
 * Wallets expose observer public keys via `chip0002_getPublicKeys`; the standard
 * puzzle is curried with the *synthetic* key derived from the observer key. We
 * index both the synthetic-derived hash and the raw hash so we work whether the
 * wallet returns observer or already-synthetic keys.
 */
export function buildKeyResolver(publicKeys: string[]): (puzzleHash: string) => string | undefined {
  const map = new Map<string, string>();
  for (const raw of publicKeys) {
    const pk = with0x(raw);
    try {
      const synthetic = derive_synthetic_key(pk);
      map.set(standard_puzzle_hash(synthetic).toLowerCase(), synthetic);
    } catch {
      /* ignore non-BLS entries */
    }
    try {
      map.set(standard_puzzle_hash(pk).toLowerCase(), pk);
    } catch {
      /* the raw key may not be a valid synthetic key; that's fine */
    }
  }
  return (puzzleHash: string) => map.get(with0x(puzzleHash).toLowerCase());
}

/** Extracts the public keys array from a `chip0002_getPublicKeys` response. */
export function extractPublicKeys(response: unknown): string[] {
  if (Array.isArray(response)) return response as string[];
  const obj = response as AnyRecord;
  const keys = pick(obj, "publicKeys", "public_keys", "keys");
  return Array.isArray(keys) ? (keys as string[]) : [];
}

/** Greedily selects coins until their amounts cover `needed` mojos. */
export function selectCoins<T extends { amount: string }>(coins: T[], needed: bigint): T[] {
  const sorted = [...coins].sort((a, b) => (BigInt(b.amount) > BigInt(a.amount) ? 1 : -1));
  const selected: T[] = [];
  let total = 0n;
  for (const coin of sorted) {
    if (total >= needed) break;
    selected.push(coin);
    total += BigInt(coin.amount);
  }
  if (total < needed) {
    throw new Error("Insufficient spendable coins for this amount and fee");
  }
  return selected;
}

/** Converts wxch-core coin spends into the camelCase CHIP-0002 shape Sage signs. */
export function toSageCoinSpends(coinSpends: CoinSpendJson[]) {
  return coinSpends.map((cs) => ({
    coin: {
      parentCoinInfo: cs.coin.parent_coin_info,
      puzzleHash: cs.coin.puzzle_hash,
      amount: Number(cs.coin.amount),
    },
    puzzleReveal: cs.puzzle_reveal,
    solution: cs.solution,
  }));
}
