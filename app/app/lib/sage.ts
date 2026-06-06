"use client";

// Helpers that adapt Sage / CHIP-0002 WalletConnect responses into the shapes
// the cmojo-core WASM module expects, and back into the shapes Sage and
// coinset.org expect for signing and broadcasting.
//
// NOTE ON WIRE FORMATS: different Chia wallets have historically used slightly
// different field casings for coins and coin spends. The normalizers below
// accept both camelCase and snake_case and tolerate `0x` prefixes, so the dApp
// is resilient to those differences. If a specific wallet build still rejects a
// request, the conversion helpers here are the single place to adjust.

import { address_to_puzzle_hash, cmojo_outer_puzzle_hash, standard_puzzle_hash } from "./wasm";
import { strip0x, with0x } from "./format";

type RequestFn = <T = unknown>(method: string, params: unknown) => Promise<T>;

/** Fetches the wallet's current receive address and returns its puzzle hash. */
export async function getReceivePuzzleHash(request: RequestFn): Promise<string> {
  // Sage exposes `chia_getAddress` (there is no `chia_getCurrentAddress`);
  // the method must also be in the namespace list granted at pairing time.
  const response = await request("chia_getAddress", {});
  const address =
    typeof response === "string"
      ? response
      : ((response as Record<string, unknown>).address as string);
  if (!address) throw new Error("Wallet did not return a receive address");
  return address_to_puzzle_hash(address);
}

// Public keys are stable for a wallet session, and every wallet round-trip
// is a liability on mobile (a backgrounded Sage can't answer). Fetch ONCE
// per page load and share the in-flight promise across all callers.
let publicKeysCache: Promise<string[]> | null = null;

/** Clears the cached public keys (call on disconnect). */
export function clearPublicKeysCache(): void {
  publicKeysCache = null;
}

/** Fetches the wallet's public keys via CHIP-0002 (cached per session).
 * Sage returns synthetic keys usable directly in the standard puzzle. */
export function getPublicKeys(request: RequestFn): Promise<string[]> {
  if (!publicKeysCache) {
    publicKeysCache = request("chip0002_getPublicKeys", { limit: 500, offset: 0 })
      .then(extractPublicKeys)
      .catch((e) => {
        // Don't cache failures.
        publicKeysCache = null;
        throw e;
      });
  }
  return publicKeysCache;
}

/** Fetches ALL spendable coins for an asset (XCH when assetId is null),
 * paging through Sage's 100-coin response window. */
export async function getAssetCoins(
  request: RequestFn,
  type: "cat" | null,
  assetId: string | null
): Promise<unknown[]> {
  const PAGE = 100;
  const all: unknown[] = [];
  // Cap at 20 pages (2000 coins) as a runaway guard.
  for (let offset = 0; offset < 20 * PAGE; offset += PAGE) {
    const response = await request("chip0002_getAssetCoins", {
      type,
      // Sage hex params must NOT carry a 0x prefix.
      assetId: assetId === null ? null : strip0x(assetId),
      includedLocked: false,
      offset,
      limit: PAGE,
    });
    const page = Array.isArray(response) ? response : [];
    all.push(...page);
    if (page.length < PAGE) break;
  }
  return all;
}

/** Sums the amounts of asset coins returned by `getAssetCoins` (mojos). */
export function sumCoinAmounts(coins: unknown[]): bigint {
  let total = 0n;
  for (const raw of coins) {
    try {
      total += BigInt(normalizeCoin(raw).amount);
    } catch {
      /* skip malformed entries */
    }
  }
  return total;
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

/** Extracts the coin id ("coin name") Sage attaches to each asset coin.
 * Used to watch the spend on coinset.org after broadcast. */
export function extractCoinName(raw: unknown): string | undefined {
  const obj = raw as AnyRecord;
  const name = pick(obj, "coinName", "coin_name", "name");
  return typeof name === "string" && name.length > 0 ? with0x(name) : undefined;
}

/** Normalizes a CAT lineage proof from any wallet shape. */
export function normalizeLineageProof(raw: unknown): LineageProofJson {
  const obj = (raw ?? {}) as AnyRecord;
  // Sage's chip0002_getAssetCoins returns lineageProof as
  // { parentName, innerPuzzleHash, amount }.
  return {
    parent_parent_coin_info: with0x(
      asString(pick(obj, "parentName", "parent_parent_coin_info", "parentParentCoinInfo", "parentCoinInfo"))
    ),
    parent_inner_puzzle_hash: with0x(
      asString(pick(obj, "innerPuzzleHash", "parent_inner_puzzle_hash", "parentInnerPuzzleHash"))
    ),
    parent_amount: asString(pick(obj, "parent_amount", "parentAmount", "amount")),
  };
}

/**
 * Resolves the synthetic public key that controls a given standard puzzle hash.
 *
 * Sage's `chip0002_getPublicKeys` returns synthetic keys, so the standard puzzle
 * hash is computed directly from each key (this matches the reference
 * streaming-ui dApp, which matches coins via `standardPuzzleHash(key)`).
 */
export function buildKeyResolver(publicKeys: string[]): (puzzleHash: string) => string | undefined {
  const map = new Map<string, string>();
  for (const raw of publicKeys) {
    const pk = with0x(raw);
    try {
      map.set(standard_puzzle_hash(pk).toLowerCase(), pk);
    } catch {
      /* skip entries that are not valid BLS public keys */
    }
  }
  return (puzzleHash: string) => map.get(with0x(puzzleHash).toLowerCase());
}

/**
 * Resolves the synthetic public key controlling a cMojo CAT coin.
 *
 * A CAT coin's on-chain puzzle hash is the OUTER (CAT2-wrapped) puzzle hash,
 * not the inner standard puzzle hash, so the lookup maps
 * `cmojo_outer_puzzle_hash(standard_puzzle_hash(key))` → key.
 */
export function buildCatKeyResolver(publicKeys: string[]): (outerPuzzleHash: string) => string | undefined {
  const map = new Map<string, string>();
  for (const raw of publicKeys) {
    const pk = with0x(raw);
    try {
      const inner = standard_puzzle_hash(pk);
      map.set(with0x(cmojo_outer_puzzle_hash(inner)).toLowerCase(), pk);
    } catch {
      /* skip entries that are not valid BLS public keys */
    }
  }
  return (outerPuzzleHash: string) => map.get(with0x(outerPuzzleHash).toLowerCase());
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
