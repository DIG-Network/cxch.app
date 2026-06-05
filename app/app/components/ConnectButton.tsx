"use client";

import { useSage } from "../lib/walletconnect";

export function ConnectButton() {
  const { session, connect, disconnect, connecting } = useSage();

  if (session) {
    return (
      <button
        onClick={disconnect}
        className="rounded-lg border border-[var(--border)] bg-[var(--panel)] px-4 py-2 text-sm hover:border-[var(--accent)]"
      >
        Disconnect
      </button>
    );
  }

  return (
    <button
      onClick={connect}
      disabled={connecting}
      className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black disabled:opacity-60"
    >
      {connecting ? "Connecting…" : "Connect Sage"}
    </button>
  );
}
