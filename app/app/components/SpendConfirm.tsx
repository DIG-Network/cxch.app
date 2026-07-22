"use client";

// ============================================================================
// SpendConfirm — one modal for the whole spend lifecycle (reference pattern)
// ============================================================================
//
// Wrap and melt route through `runSpend(...)`. The modal walks these phases:
//   1. PREPARING — the build runs INSIDE the modal with a live step list
//      (fetch keys → fetch coins → build bundle), so the user sees exactly
//      what's happening instead of a dead spinner.
//   2. CONFIRM   — human-readable summary; the user authorizes the spend.
//   3. SIGNING   — Sage signs, the bundle is aggregated and pushed to coinset.
//   4. WAITING   — poll coinset.org until the watched input coin is spent
//      on-chain (uniform "did the bundle land?" signal).
//   5. DONE / ERROR.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useSage } from "../lib/walletconnect";
import { signAndBroadcast, type BuiltBundle } from "../lib/flow";
import { waitForConfirmation, type ConfirmProgress } from "../lib/coinset";
import { Spinner } from "./Spinner";

export interface SpendSummaryLine {
  label: string;
  value: string;
  strong?: boolean;
}

/** What `prepare` resolves to — everything the confirm + submit phases need. */
export interface PreparedSpend {
  built: BuiltBundle;
  summary: SpendSummaryLine[];
  /** Coin id of an INPUT coin of the bundle, watched (as spent) on coinset
   * after broadcast. Optional — without it the wait phase is skipped. */
  watchCoinId?: string;
}

export interface SpendRequest {
  /** Modal title, e.g. "Wrap 1.0 XCH". */
  title: string;
  /** Async builder run INSIDE the modal with a live progress stream.
   * Call `report("Fetching coins…")` to push a step. */
  prepare: (report: (step: string) => void) => Promise<PreparedSpend>;
  /** Confirm-button label (default "Confirm & sign"). */
  confirmLabel?: string;
}

type Phase = "idle" | "preparing" | "confirm" | "signing" | "waiting" | "done" | "error";

interface SpendCtx {
  runSpend: (req: SpendRequest) => Promise<ConfirmProgress>;
  /** True while a spend is anywhere in its lifecycle (not idle). */
  active: boolean;
}
const Ctx = createContext<SpendCtx | null>(null);

export function useSpendConfirm(): SpendCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useSpendConfirm must be used within SpendConfirmProvider");
  return c;
}

interface StepState {
  label: string;
  done: boolean;
}

export function SpendConfirmProvider({ children }: { children: React.ReactNode }) {
  const { request } = useSage();
  const [phase, setPhase] = useState<Phase>("idle");
  const [req, setReq] = useState<SpendRequest | null>(null);
  const [progress, setProgress] = useState<ConfirmProgress | null>(null);
  const [errMsg, setErrMsg] = useState("");
  const [steps, setSteps] = useState<StepState[]>([]);
  // Elapsed seconds on the CURRENT in-progress step, so a slow wallet RPC
  // shows a live timer instead of looking stuck.
  const [stepElapsed, setStepElapsed] = useState(0);
  const preparedRef = useRef<PreparedSpend | null>(null);
  const prepareStartedRef = useRef(false);
  const resolveRef = useRef<((p: ConfirmProgress) => void) | null>(null);
  const rejectRef = useRef<((e: Error) => void) | null>(null);

  const settleReject = (e: Error) => {
    rejectRef.current?.(e);
    resolveRef.current = null;
    rejectRef.current = null;
  };

  const close = useCallback(() => {
    if (rejectRef.current) settleReject(new Error("Cancelled by user"));
    setPhase("idle");
    setReq(null);
    setProgress(null);
    setErrMsg("");
    setSteps([]);
    preparedRef.current = null;
    prepareStartedRef.current = false;
  }, []);

  const runSpend = useCallback((r: SpendRequest) => {
    setReq(r);
    setProgress(null);
    setErrMsg("");
    setSteps([]);
    preparedRef.current = null;
    prepareStartedRef.current = false;
    setPhase("preparing");
    return new Promise<ConfirmProgress>((resolve, reject) => {
      resolveRef.current = resolve;
      rejectRef.current = reject;
    });
  }, []);

  // PREPARE phase: run the builder once, streaming steps, then go to confirm.
  useEffect(() => {
    if (phase !== "preparing" || !req || prepareStartedRef.current) return;
    prepareStartedRef.current = true;
    const report = (label: string) => {
      setSteps((prev) => [
        ...prev.map((s) => ({ ...s, done: true })),
        { label, done: false },
      ]);
    };
    (async () => {
      try {
        preparedRef.current = await req.prepare(report);
        setSteps((prev) => prev.map((s) => ({ ...s, done: true })));
        setPhase("confirm");
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        setErrMsg(err.message);
        setPhase("error");
        settleReject(err);
      }
    })();
  }, [phase, req]);

  // Per-step elapsed timer (re-keys on each new reported step).
  useEffect(() => {
    if (phase !== "preparing") {
      setStepElapsed(0);
      return;
    }
    setStepElapsed(0);
    const t0 = Date.now();
    const id = setInterval(() => setStepElapsed(Math.floor((Date.now() - t0) / 1000)), 500);
    return () => clearInterval(id);
  }, [phase, steps.length]);

  const onConfirm = useCallback(async () => {
    const prepared = preparedRef.current;
    if (!prepared) return;
    try {
      setPhase("signing");
      await signAndBroadcast(request, prepared.built);
      let final: ConfirmProgress = { status: "confirmed", confirmations: 0 };
      if (prepared.watchCoinId) {
        setPhase("waiting");
        final = await waitForConfirmation(prepared.watchCoinId, {
          confirmations: 1,
          onProgress: setProgress,
        });
      }
      setProgress(final);
      setPhase("done");
      resolveRef.current?.(final);
      resolveRef.current = null;
      rejectRef.current = null;
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      setErrMsg(err.message);
      setPhase("error");
      settleReject(err);
    }
  }, [request]);

  const summary = preparedRef.current?.summary ?? [];

  return (
    <Ctx.Provider value={{ runSpend, active: phase !== "idle" }}>
      {children}
      {phase !== "idle" && req && (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md space-y-4 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-6 shadow-2xl">
            <h2 className="text-lg font-bold">{req.title}</h2>

            {/* PREPARING — live build progress */}
            {phase === "preparing" && (
              <div className="space-y-3">
                <p className="text-xs text-gray-400">
                  Preparing your spend — fetching wallet keys and coins, then
                  assembling the bundle.
                </p>
                <p className="text-xs text-gray-500">
                  On mobile? Sage must be awake to answer — if a step hangs,
                  switch to the Sage app briefly and come back.
                </p>
                <ul className="space-y-1.5">
                  {steps.map((s, i) => (
                    <li key={i} className="flex items-center gap-2.5 text-sm">
                      {s.done ? (
                        <span className="text-[var(--accent)]">✓</span>
                      ) : (
                        <Spinner size={16} label="Working" />
                      )}
                      <span className={s.done ? "text-gray-400" : "font-medium"}>
                        {s.label}
                      </span>
                      {!s.done && (
                        <span className="ml-auto font-mono text-xs tabular-nums text-gray-500">
                          {stepElapsed}s
                        </span>
                      )}
                    </li>
                  ))}
                  {steps.length === 0 && (
                    <li className="flex items-center gap-2.5 text-sm">
                      <Spinner size={16} label="Working" />
                      <span className="font-medium">Starting…</span>
                    </li>
                  )}
                </ul>
                <button
                  className="w-full rounded-lg border border-[var(--border)] px-4 py-2 text-sm hover:border-[var(--accent)]"
                  onClick={close}
                >
                  Cancel
                </button>
              </div>
            )}

            {/* Summary (confirm + later phases) */}
            {phase !== "preparing" && summary.length > 0 && (
              <dl className="space-y-1.5 rounded-lg border border-[var(--border)] p-3">
                {summary.map((l, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 text-sm">
                    <dt className="text-gray-400">{l.label}</dt>
                    <dd
                      className={`break-all text-right font-mono ${
                        l.strong ? "font-semibold text-[var(--accent)]" : ""
                      }`}
                    >
                      {l.value}
                    </dd>
                  </div>
                ))}
              </dl>
            )}

            {phase === "confirm" && (
              <>
                <p className="text-xs text-gray-400">
                  Sage will ask you to sign the underlying coin spends. After
                  broadcast we wait for on-chain confirmation via coinset.org.
                </p>
                <div className="flex gap-2">
                  <button
                    className="flex-1 rounded-lg border border-[var(--border)] px-4 py-2 text-sm hover:border-[var(--accent)]"
                    onClick={close}
                  >
                    Cancel
                  </button>
                  <button
                    className="flex-1 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black"
                    onClick={onConfirm}
                  >
                    {req.confirmLabel ?? "Confirm & sign"}
                  </button>
                </div>
              </>
            )}

            {phase === "signing" && (
              <div className="flex items-center gap-3 text-sm text-gray-400">
                <Spinner size={16} label="Working" />
                Sign in Sage, then we broadcast to mainnet…
              </div>
            )}

            {phase === "waiting" && (
              <div className="space-y-2">
                <div className="flex items-center gap-3 text-sm text-gray-400">
                  <Spinner size={16} label="Working" />
                  Waiting for on-chain confirmation…
                </div>
                <p className="text-xs text-gray-400">
                  {progress && progress.confirmations > 0
                    ? `${progress.confirmations} confirmation${
                        progress.confirmations === 1 ? "" : "s"
                      }${
                        progress.peakHeight
                          ? ` (block ${progress.eventHeight} / peak ${progress.peakHeight})`
                          : ""
                      }`
                    : "Broadcast — waiting for the transaction to enter a block…"}
                </p>
              </div>
            )}

            {phase === "done" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold"
                    style={{
                      borderColor: "rgba(63,185,80,0.35)",
                      color: "var(--accent)",
                      background: "rgba(63,185,80,0.08)",
                    }}
                  >
                    {progress?.status === "confirmed"
                      ? `✓ confirmed (${progress.confirmations} conf${
                          progress.confirmations === 1 ? "" : "s"
                        })`
                      : "broadcast — confirming"}
                  </span>
                  {progress?.eventHeight ? (
                    <span className="font-mono text-xs text-gray-400">
                      block {progress.eventHeight}
                    </span>
                  ) : null}
                </div>
                {progress?.status === "timeout" && (
                  <p className="text-xs text-gray-400">
                    Broadcast accepted, but confirmation didn&apos;t land in
                    time. It may still confirm — your balances will update once
                    it does.
                  </p>
                )}
                <button
                  className="w-full rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black"
                  onClick={close}
                >
                  Close
                </button>
              </div>
            )}

            {phase === "error" && (
              <div className="space-y-3">
                <p className="break-words text-sm text-red-400">{errMsg}</p>
                <button
                  className="w-full rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black"
                  onClick={close}
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}
