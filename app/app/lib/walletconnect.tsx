"use client";

// WalletConnect provider for the cMojo dApp — wired the same way as the
// shielded-wallet reference (chia_shielded_transactions/apps/wallet):
//
//   * The chia namespace is declared under `optionalNamespaces`.
//     WalletConnect 2.x deprecated `requiredNamespaces` (it silently
//     forwards them with a console warning, but Sage's approval flow
//     rejects sessions whose chia namespace arrived via the deprecated
//     path with "missing chia namespace"). Sending under the current
//     key is the canonical fix.
//   * The pairing URI is exposed via context (`qrUri`) and rendered by
//     `ConnectButton` inside a portal-based modal: spinner while the
//     relay mints the URI, then the QR + copy-link controls.
//   * Every method the dApp will ever request is listed up front — Sage
//     grants only the methods present at pairing time and rejects
//     anything else locally at request time.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import SignClient from "@walletconnect/sign-client";
import type { SessionTypes } from "@walletconnect/types";
import toast from "react-hot-toast";
import { clearPublicKeysCache } from "./sage";

const PROJECT_ID =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ??
  process.env.NEXT_PUBLIC_WC_PROJECT_ID ??
  "";

// cMojo is mainnet-only.
export const CHAIN_ID = "chia:mainnet";

// The CHIP-0002 / Sage method set this dApp relies on. Sage surfaces an
// approval UI keyed off this list — anything not declared here is rejected
// at request time even if the wallet supports it.
const METHODS = [
  "chia_getAddress",
  // Owner fee-address updates: Sage signs the fee-config hash with the
  // owner wallet key (CHIP-0002 envelope, verified by the TAIL).
  "chia_signMessageByAddress",
  "chip0002_connect",
  "chip0002_chainId",
  "chip0002_getPublicKeys",
  "chip0002_getAssetCoins",
  "chip0002_getAssetBalance",
  "chip0002_signCoinSpends",
];

interface WalletContext {
  client: SignClient | null;
  session: SessionTypes.Struct | null;
  connecting: boolean;
  /** Pairing URI while a connect is pending — render as a QR code. */
  qrUri: string | null;
  connect(): Promise<void>;
  /** Abort a pending connect (close the QR modal). */
  cancelConnect(): void;
  disconnect(): Promise<void>;
  request<T = unknown>(method: string, params: unknown): Promise<T>;
}

const Ctx = createContext<WalletContext | null>(null);

export function useSage(): WalletContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSage must be used within WalletConnectProvider");
  return ctx;
}

export function WalletConnectProvider({ children }: { children: ReactNode }) {
  const [client, setClient] = useState<SignClient | null>(null);
  const [session, setSession] = useState<SessionTypes.Struct | null>(null);
  const [qrUri, setQrUri] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    if (!PROJECT_ID) {
      // Surfacing this loudly avoids the cryptic "400" the WalletConnect
      // relay returns when handed an empty projectId. Get a free one from
      // https://cloud.reown.com and put it in `app/.env.local` as
      // `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=…`.
      const msg =
        "Missing NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID — create one at " +
        "https://cloud.reown.com and add it to app/.env.local.";
      console.error("[cMojo/WalletConnect]", msg);
      toast.error(msg, { duration: 8000 });
      return;
    }
    SignClient.init({
      logger: "error",
      projectId: PROJECT_ID,
      metadata: {
        name: "cMojo",
        description: "Wrap and melt XCH as a 1:1 CAT2 token",
        // Pin metadata.url to the page's actual origin — WalletConnect warns
        // (and wallet verification can flag the dApp) if these differ.
        url: typeof window !== "undefined" ? window.location.origin : "",
        icons: [
          typeof window !== "undefined"
            ? `${window.location.origin}/favicon-512.png`
            : "/favicon-512.png",
        ],
      },
    })
      .then((c) => {
        setClient(c);
        // Restore the previous session if one survives in storage.
        const last = c.session.getAll().pop();
        if (last) setSession(last);
        c.on("session_delete", () => setSession(null));
        c.on("session_expire", () => setSession(null));
      })
      .catch((e) => {
        console.error("Failed to initialize WalletConnect:", e);
        toast.error(`WalletConnect init failed: ${(e as Error)?.message ?? e}`);
      });
  }, []);

  const connect = useCallback(async () => {
    if (!client) {
      toast.error("WalletConnect not ready yet — try again in a second.");
      return;
    }
    setConnecting(true);
    try {
      const { uri, approval } = await client.connect({
        optionalNamespaces: {
          chia: { methods: METHODS, chains: [CHAIN_ID], events: [] },
        },
      });
      if (uri) setQrUri(uri);
      const s = await approval();
      setSession(s);
      toast.success("Connected to Sage");
    } catch (e) {
      console.error("Connection failed:", e);
      toast.error("Connection rejected or failed");
    } finally {
      setQrUri(null);
      setConnecting(false);
    }
  }, [client]);

  const cancelConnect = useCallback(() => {
    setQrUri(null);
    setConnecting(false);
  }, []);

  const disconnect = useCallback(async () => {
    if (!client || !session) return;
    try {
      await client.disconnect({
        topic: session.topic,
        reason: { code: 6000, message: "User disconnected" },
      });
    } catch (e) {
      console.error("Error disconnecting:", e);
    }
    clearPublicKeysCache();
    setSession(null);
    toast.success("Disconnected");
  }, [client, session]);

  const request = useCallback(
    async <T,>(method: string, params: unknown): Promise<T> => {
      if (!client || !session) throw new Error("Wallet not connected");
      // TIMEOUT GUARD: on mobile the OS suspends a backgrounded Sage, so a
      // request can hang forever. Surface an actionable error instead.
      const call = client.request<T>({
        topic: session.topic,
        chainId: CHAIN_ID,
        request: { method, params },
      });
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(
                "Sage did not respond — open the Sage app (keep it running in the background) and try again."
              )
            ),
          60_000
        )
      );
      return Promise.race([call, timeout]);
    },
    [client, session]
  );

  return (
    <Ctx.Provider
      value={{ client, session, connecting, qrUri, connect, cancelConnect, disconnect, request }}
    >
      {children}
    </Ctx.Provider>
  );
}
