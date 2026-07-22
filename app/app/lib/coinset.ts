"use client";

// Minimal client for the coinset.org full-node REST API used to broadcast spend
// bundles and poll for confirmation (mirrors the shielded-wallet reference).
import type { CoinSpendJson } from "./sage";
import { strip0x } from "./format";

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

export interface CoinRecord {
  coin: { parent_coin_info: string; puzzle_hash: string; amount: number };
  confirmed_block_index: number;
  spent_block_index: number;
  spent: boolean;
}

/** Looks up a coin record by id, returning null if it is not yet known. */
export async function getCoinRecord(coinId: string): Promise<CoinRecord | null> {
  const response = await fetch(`${API}/get_coin_record_by_name`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: strip0x(coinId) }),
  });
  if (!response.ok) return null;
  const data = (await response.json()) as { coin_record?: CoinRecord };
  return data.coin_record ?? null;
}

/** All coin records at a puzzle hash (optionally including spent ones). */
export async function getCoinRecordsByPuzzleHash(
  puzzleHash: string,
  includeSpentCoins: boolean
): Promise<CoinRecord[]> {
  const response = await fetch(`${API}/get_coin_records_by_puzzle_hash`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      puzzle_hash: strip0x(puzzleHash),
      include_spent_coins: includeSpentCoins,
    }),
  });
  if (!response.ok) return [];
  const data = (await response.json()) as { coin_records?: CoinRecord[] };
  return data.coin_records ?? [];
}

/** Coin records for MANY puzzle hashes in one call (unspent only when
 * `includeSpentCoins` is false). */
export async function getCoinRecordsByPuzzleHashes(
  puzzleHashes: string[],
  includeSpentCoins: boolean
): Promise<CoinRecord[]> {
  if (puzzleHashes.length === 0) return [];
  const response = await fetch(`${API}/get_coin_records_by_puzzle_hashes`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      puzzle_hashes: puzzleHashes.map(strip0x),
      include_spent_coins: includeSpentCoins,
    }),
  });
  if (!response.ok) return [];
  const data = (await response.json()) as { coin_records?: CoinRecord[] };
  return data.coin_records ?? [];
}

/** The puzzle reveal + solution that spent a coin at `height`. */
export async function getPuzzleAndSolution(
  coinId: string,
  height: number
): Promise<{ puzzle_reveal: string; solution: string } | null> {
  const response = await fetch(`${API}/get_puzzle_and_solution`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ coin_id: strip0x(coinId), height }),
  });
  if (!response.ok) return null;
  const data = (await response.json()) as {
    coin_solution?: { puzzle_reveal: string; solution: string };
  };
  return data.coin_solution ?? null;
}

/** Current chain peak height. */
export async function getPeakHeight(): Promise<number> {
  const response = await fetch(`${API}/get_blockchain_state`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!response.ok) return 0;
  const data = (await response.json()) as {
    blockchain_state?: { peak?: { height?: number } };
  };
  return data.blockchain_state?.peak?.height ?? 0;
}

// ---- confirmation tracking --------------------------------------------------

export interface ConfirmProgress {
  /** "pending" until the spend reaches `confirmations`; then "confirmed"; "timeout" if it never did. */
  status: "pending" | "confirmed" | "timeout";
  /** Confirmations so far (peak - eventHeight + 1), 0 until the spend lands in a block. */
  confirmations: number;
  /** Block height the watched coin was spent at. */
  eventHeight?: number;
  /** Current chain peak height. */
  peakHeight?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Polls coinset until `coinId` (an INPUT coin of the broadcast bundle) is
 * SPENT on-chain and has `confirmations` confirmations. Watching an input
 * coin's spent height is a uniform "did the bundle land?" signal for both
 * wrap and melt. Transient RPC errors are swallowed and retried until the
 * timeout; calls `onProgress` after each poll so the UI can show a live count.
 */
export async function waitForConfirmation(
  coinId: string,
  opts: {
    confirmations?: number;
    timeoutMs?: number;
    intervalMs?: number;
    onProgress?: (p: ConfirmProgress) => void;
  } = {}
): Promise<ConfirmProgress> {
  const want = Math.max(1, opts.confirmations ?? 1);
  const timeoutMs = opts.timeoutMs ?? 8 * 60_000;
  const intervalMs = opts.intervalMs ?? 5_000;
  const start = Date.now();
  let last: ConfirmProgress = { status: "pending", confirmations: 0 };
  opts.onProgress?.(last);

  while (Date.now() - start < timeoutMs) {
    try {
      const rec = await getCoinRecord(coinId);
      const eventHeight = rec?.spent_block_index ?? 0;
      if (eventHeight > 0) {
        const peakHeight = await getPeakHeight();
        const confirmations = Math.max(0, peakHeight - eventHeight + 1);
        last = {
          status: confirmations >= want ? "confirmed" : "pending",
          confirmations,
          eventHeight,
          peakHeight,
        };
        opts.onProgress?.(last);
        if (confirmations >= want) return last;
      }
    } catch {
      // transient — keep polling
    }
    await sleep(intervalMs);
  }
  last = { ...last, status: "timeout" };
  opts.onProgress?.(last);
  return last;
}
