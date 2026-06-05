"use client";

import { useEffect, useState } from "react";
import { Toaster } from "react-hot-toast";
import { ensureWasm } from "./lib/wasm";
import { WalletConnectProvider } from "./lib/walletconnect";
import { ConnectButton } from "./components/ConnectButton";
import { AssetId } from "./components/AssetId";
import { Balances } from "./components/Balances";
import { WrapPanel } from "./components/WrapPanel";
import { MeltPanel } from "./components/MeltPanel";

export default function Page() {
  const [ready, setReady] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // The WASM engine must be initialized in the browser before any builder runs.
  useEffect(() => {
    ensureWasm()
      .then(() => setReady(true))
      .catch((e) => console.error("Failed to load cXCH engine", e));
  }, []);

  const bump = () => setRefreshKey((k) => k + 1);

  return (
    <WalletConnectProvider>
      <Toaster position="bottom-center" />
      <main className="mx-auto flex max-w-xl flex-col gap-5 p-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">cXCH</h1>
            <p className="text-sm text-gray-400">1:1 wrapped XCH, as a CAT2 token</p>
          </div>
          <ConnectButton />
        </header>

        {!ready ? (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-8 text-center text-gray-400">
            Loading cXCH engine…
          </div>
        ) : (
          <>
            <AssetId />
            <Balances refreshKey={refreshKey} />
            <WrapPanel onDone={bump} />
            <MeltPanel onDone={bump} />
          </>
        )}

        <footer className="mt-4 text-center text-xs text-gray-500">
          Backed 1:1 by Chia consensus. Permissionless mint &amp; melt.
        </footer>
      </main>
    </WalletConnectProvider>
  );
}
