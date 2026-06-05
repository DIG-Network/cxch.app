"use client";

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
import { QRCodeSVG } from "qrcode.react";
import toast from "react-hot-toast";

const PROJECT_ID = process.env.NEXT_PUBLIC_WC_PROJECT_ID ?? "";

// wXCH is mainnet-only.
export const CHAIN_ID = "chia:mainnet";

// The CHIP-0002 / Sage method set this dApp relies on.
const REQUIRED_METHODS = [
  "chip0002_connect",
  "chip0002_chainId",
  "chip0002_getPublicKeys",
  "chip0002_getAssetCoins",
  "chip0002_getAssetBalance",
  "chip0002_signCoinSpends",
  "chia_getAddress",
];

interface WalletContext {
  client: SignClient | null;
  session: SessionTypes.Struct | null;
  connecting: boolean;
  connect(): Promise<void>;
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
  const [uri, setUri] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    if (!PROJECT_ID) {
      console.warn("NEXT_PUBLIC_WC_PROJECT_ID is not set; connect will fail.");
    }
    SignClient.init({
      projectId: PROJECT_ID,
      metadata: {
        name: "wXCH",
        description: "Wrap and melt XCH as a 1:1 CAT2 token",
        url: typeof window !== "undefined" ? window.location.origin : "",
        icons: ["/icon.png"],
      },
    })
      .then((c) => {
        setClient(c);
        const last = c.session.getAll().pop();
        if (last) setSession(last);
        c.on("session_delete", () => setSession(null));
        c.on("session_expire", () => setSession(null));
      })
      .catch((e) => {
        console.error(e);
        toast.error("Failed to initialize WalletConnect");
      });
  }, []);

  const connect = useCallback(async () => {
    if (!client) throw new Error("WalletConnect not ready");
    setConnecting(true);
    try {
      const { uri: u, approval } = await client.connect({
        requiredNamespaces: {
          chia: { methods: REQUIRED_METHODS, chains: [CHAIN_ID], events: [] },
        },
      });
      if (u) setUri(u);
      const s = await approval();
      setSession(s);
      setUri(null);
      toast.success("Connected to Sage");
    } catch (e) {
      console.error(e);
      toast.error("Connection rejected or failed");
    } finally {
      setConnecting(false);
    }
  }, [client]);

  const disconnect = useCallback(async () => {
    if (!client || !session) return;
    await client.disconnect({
      topic: session.topic,
      reason: { code: 6000, message: "User disconnected" },
    });
    setSession(null);
  }, [client, session]);

  const request = useCallback(
    async <T,>(method: string, params: unknown): Promise<T> => {
      if (!client || !session) throw new Error("Wallet not connected");
      return client.request<T>({
        topic: session.topic,
        chainId: CHAIN_ID,
        request: { method, params },
      });
    },
    [client, session]
  );

  return (
    <Ctx.Provider value={{ client, session, connecting, connect, disconnect, request }}>
      {children}
      {uri && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70">
          <div className="rounded-xl bg-white p-6 text-center text-black">
            <QRCodeSVG value={uri} size={256} />
            <p className="mt-3 text-sm font-medium">Scan with Sage Wallet</p>
            <button
              className="mt-2 rounded-md border px-3 py-1 text-sm"
              onClick={() => {
                navigator.clipboard.writeText(uri);
                toast.success("URI copied");
              }}
            >
              Copy URI
            </button>
            <button
              className="ml-2 mt-2 rounded-md border px-3 py-1 text-sm"
              onClick={() => setUri(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}
