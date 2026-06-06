"use client";

// ============================================================================
// RiskWarningModal — blocking prerelease/risk disclaimer, shown after a
// wallet connects until the user checks the box and accepts. Acceptance is
// SESSION-scoped (sessionStorage): the warning returns every new browser
// session by design. Not dismissible: backdrop/esc/X are no-ops; the only
// way through is the accept button. (Mirrors the shielded-wallet reference.)
// ============================================================================

import { useState } from "react";
import Modal from "./Modal";

export default function RiskWarningModal({
  isOpen,
  onAccept,
}: {
  isOpen: boolean;
  onAccept: () => void;
}) {
  const [checked, setChecked] = useState(false);

  return (
    <Modal isOpen={isOpen} onClose={() => {}} title="Before you use cXCH">
      <div className="space-y-4">
        <div
          className="rounded-lg border p-3 text-sm font-semibold"
          style={{
            borderColor: "rgb(248,113,113)",
            color: "rgb(248,113,113)",
            background: "rgba(248, 113, 113, 0.08)",
          }}
        >
          ⚠ This is prerelease, highly experimental software. Funds you put in
          can be lost forever.
        </div>

        <ul className="list-disc space-y-2 pl-5 text-sm">
          <li>
            The on-chain puzzles are <strong>unaudited</strong>. A flaw could
            permanently lock or destroy the XCH reserve backing your cXCH.
          </li>
          <li>
            This deployment exists to test <strong>small amounts only</strong>.
            Never wrap more than you are fully prepared to lose.
          </li>
          <li>
            Funds lost or locked inside the puzzles are{" "}
            <strong>unrecoverable</strong> — no one (including the developer)
            has any ability to access, unlock, or return them.
          </li>
          <li>
            <strong>The protocol may change before the official release.</strong>{" "}
            As this app is audited, it may be{" "}
            <strong>redeployed under a completely different asset id</strong> at
            any time before the production launch. If that happens, this hosted
            app will point at the new asset and will no longer see your old
            balance. The only way to melt cXCH of a retired asset id would be to{" "}
            <strong>
              run a local copy of this app, checked out at the matching version
              tag
            </strong>{" "}
            — keep your own record of the asset id you wrapped into.
          </li>
          <li>There is no support, no recourse, and no warranty of any kind.</li>
        </ul>

        <div className="space-y-2 rounded-lg border border-[var(--border)] p-3 text-xs text-gray-400">
          <p>
            <strong className="text-[var(--foreground)]">How this app runs:</strong>{" "}
            cXCH is a self-contained single-page app that runs{" "}
            <strong>entirely in your browser</strong>. It holds no keys, has{" "}
            <strong>no backend server</strong>, and stores nothing for you. It
            connects to the Chia blockchain through your own wallet via
            WalletConnect (Sage). Every transaction is signed locally by your
            wallet and broadcast directly to the chain — the developer never
            touches your keys, your funds, or your data, and cannot act on your
            behalf.
          </p>
          <p>
            <strong className="text-[var(--foreground)]">
              Agreement &amp; no liability:
            </strong>{" "}
            By continuing you agree that you use this application entirely at
            your own risk and that you are solely responsible for your use of
            it. You agree that{" "}
            <strong className="text-[var(--foreground)]">
              no person or party bears any liability or responsibility
            </strong>{" "}
            — including the developer and creator — for any loss, damage, or
            outcome arising from its use, to the maximum extent permitted by
            law. The creator is not responsible for how you use this app. If you
            do not agree to these terms, use of this application is{" "}
            <strong className="text-[var(--foreground)]">forbidden</strong> by
            this agreement.
          </p>
        </div>

        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[var(--border)] p-3">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            aria-label="I have read and accept all risks and terms"
          />
          <span className="text-sm">
            I have read and understood this warning, I agree to all the terms
            above, and I accept all risks — including the permanent loss of
            everything I wrap.
          </span>
        </label>

        <button
          type="button"
          className="w-full rounded-lg bg-[var(--accent)] px-4 py-2 font-semibold text-black disabled:opacity-50"
          disabled={!checked}
          onClick={onAccept}
        >
          I understand — continue
        </button>
      </div>
    </Modal>
  );
}
