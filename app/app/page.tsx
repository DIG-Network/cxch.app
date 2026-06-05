"use client";

import { useEffect, useState } from "react";
import { Toaster } from "react-hot-toast";
import { ensureWasm } from "./lib/wasm";
import { WalletConnectProvider, useSage } from "./lib/walletconnect";
import { ConnectButton } from "./components/ConnectButton";
import { AssetId } from "./components/AssetId";
import { Balances } from "./components/Balances";
import { WrapPanel } from "./components/WrapPanel";
import { MeltPanel } from "./components/MeltPanel";
import { ProtocolTab } from "./components/ProtocolTab";
import { Landing } from "./components/Landing";
import { SpendConfirmProvider } from "./components/SpendConfirm";

type Tab = "app" | "protocol";

function TabNav({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const base = "rounded-lg px-4 py-2 text-sm font-medium transition";
  const active = "bg-[var(--panel)] border border-[var(--accent)] text-[var(--accent)]";
  const inactive = "border border-transparent text-gray-400 hover:text-[var(--foreground)]";
  return (
    <nav className="flex gap-2" aria-label="Sections">
      <button className={`${base} ${tab === "app" ? active : inactive}`} onClick={() => setTab("app")}>
        App
      </button>
      <button
        className={`${base} ${tab === "protocol" ? active : inactive}`}
        onClick={() => setTab("protocol")}
      >
        Protocol
      </button>
    </nav>
  );
}

function Content() {
  const { session } = useSage();
  const [tab, setTab] = useState<Tab>("app");
  const [refreshKey, setRefreshKey] = useState(0);
  const bump = () => setRefreshKey((k) => k + 1);

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-5 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">cXCH</h1>
          <p className="text-sm text-gray-400">1:1 wrapped XCH, as a CAT2 token</p>
        </div>
        <div className="flex items-center gap-4">
          <TabNav tab={tab} setTab={setTab} />
          <ConnectButton />
        </div>
      </header>

      {tab === "protocol" ? (
        <ProtocolTab />
      ) : session ? (
        <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
          <AssetId />
          <Balances refreshKey={refreshKey} />
          <WrapPanel onDone={bump} />
          <MeltPanel onDone={bump} />
        </div>
      ) : (
        <Landing />
      )}

      <footer className="mt-4 text-center text-xs text-gray-500">
        Backed 1:1 by Chia consensus. Permissionless mint &amp; melt.
      </footer>
    </main>
  );
}

export default function Page() {
  const [ready, setReady] = useState(false);

  // The WASM engine must be initialized in the browser before any builder runs
  // (the Protocol tab and landing also read the asset id from it).
  useEffect(() => {
    ensureWasm()
      .then(() => setReady(true))
      .catch((e) => console.error("Failed to load cXCH engine", e));
  }, []);

  return (
    <WalletConnectProvider>
      <Toaster position="bottom-center" />
      {!ready ? (
        <main className="mx-auto max-w-xl p-6">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-8 text-center text-gray-400">
            Loading cXCH engine…
          </div>
        </main>
      ) : (
        <SpendConfirmProvider>
          <Content />
        </SpendConfirmProvider>
      )}
    </WalletConnectProvider>
  );
}
