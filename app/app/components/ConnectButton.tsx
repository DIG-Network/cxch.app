"use client";

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import toast from "react-hot-toast";
import Modal from "./Modal";
import { useSage } from "../lib/walletconnect";

/**
 * The "Connect Sage" control. Opens a QR modal when connecting (spinner
 * until the relay mints the pairing URI, then the QR + copy-link button),
 * shows a disconnect button when connected. Mirrors the shielded-wallet
 * reference `WalletConnector`.
 */
export function ConnectButton() {
  const { session, connect, cancelConnect, disconnect, connecting, qrUri } = useSage();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  const handleModalClose = () => {
    setIsModalOpen(false);
    cancelConnect();
  };

  const handleConnect = async () => {
    setIsModalOpen(true);
    try {
      await connect();
    } catch (e) {
      console.error("Wallet connection failed:", e);
    } finally {
      setIsModalOpen(false);
    }
  };

  const handleCopyLink = async () => {
    if (!qrUri) return;
    try {
      await navigator.clipboard.writeText(qrUri);
      setIsCopied(true);
      toast.success("Link copied!");
      setTimeout(() => setIsCopied(false), 1000);
    } catch {
      toast.error("Failed to copy");
    }
  };

  return (
    <>
      {session ? (
        <button
          onClick={disconnect}
          className="rounded-lg border border-[var(--border)] bg-[var(--panel)] px-4 py-2 text-sm hover:border-[var(--accent)]"
        >
          Disconnect
        </button>
      ) : (
        <button
          onClick={handleConnect}
          disabled={connecting}
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black disabled:opacity-60"
        >
          {connecting ? "Connecting…" : "Connect Sage"}
        </button>
      )}

      <Modal isOpen={isModalOpen} onClose={handleModalClose} title="Connect your wallet">
        <div className="flex flex-col items-center gap-4">
          {qrUri ? (
            <>
              <div className="rounded-lg bg-white p-4">
                <QRCodeSVG value={qrUri} size={256} />
              </div>
              <button
                onClick={handleCopyLink}
                className={`rounded-lg border border-[var(--border)] px-4 py-2 text-sm hover:border-[var(--accent)] ${
                  isCopied ? "text-[var(--accent)]" : ""
                }`}
              >
                {isCopied ? "Copied!" : "Copy Link"}
              </button>
              <p className="mt-1 text-center text-sm text-gray-400">
                Scan with Sage, or copy the link and paste it into Sage&apos;s
                WalletConnect dialog.
              </p>
            </>
          ) : (
            <div className="flex items-center justify-center p-4">
              <div
                className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent"
                role="status"
                aria-label="Loading"
              />
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
