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
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold">cXCH</h1>
            {/* Prerelease badge — this is unaudited, experimental software. */}
            <span
              className="rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase leading-none tracking-wider"
              style={{
                borderColor: "rgb(248,113,113)",
                color: "rgb(248,113,113)",
                background: "rgba(248, 113, 113, 0.10)",
              }}
              title="Prerelease, unaudited — test with small amounts only"
            >
              Pre-release
            </span>
          </div>
          <p className="text-sm text-gray-400">1:1 wrapped XCH, as a CAT2 token</p>
        </div>
        <div className="flex items-center gap-4">
          <TabNav tab={tab} setTab={setTab} />
          <a
            href="https://github.com/DIG-Network/cXCH_DAPP"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="View cXCH on GitHub"
            title="View on GitHub"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm hover:border-[var(--accent)] hover:text-[var(--accent)]"
          >
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
            </svg>
            <span className="hidden sm:inline">GitHub</span>
          </a>
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
