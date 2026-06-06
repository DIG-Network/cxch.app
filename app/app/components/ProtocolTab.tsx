"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { cmojo_asset_id, issuer_public_key } from "../lib/wasm";

// The Protocol tab — the integration spec for the canonical cMojo asset id.
// It tells any app exactly which asset id to use and how to construct spend
// bundles that mint (wrap) and melt (burn) cMojo. It deliberately does NOT
// discuss deploying a new CAT: there is exactly one cMojo.

/** The intentionally published issuer secret key (see cmojo-core/constants.rs).
 * Publishing it is what makes mint and melt permissionless: the
 * `everything_with_signature` TAIL only authorises the *supply change*, while
 * Chia consensus independently enforces the 1:1 mojo backing. */
const ISSUER_SECRET_KEY =
  "0x0000000000000000000000000000000000000000000000000000000063786368";

const MAINNET_GENESIS_CHALLENGE =
  "0xccd5bb71183532bff220ba46c268991a3ff07eb358e8255a65c30a2dce0e5fbb";

function CopyableValue({ label, value, note }: { label: string; value: string; note?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(`${label} copied`);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy to clipboard");
    }
  }

  return (
    <button
      onClick={copy}
      className="group w-full rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4 text-left transition hover:border-[var(--accent)]"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-gray-400">{label}</span>
        <span className="text-xs text-gray-500 group-hover:text-[var(--accent)]">
          {copied ? "Copied ✓" : "Click to copy"}
        </span>
      </div>
      {/* Never truncated. */}
      <div className="mt-1 break-all font-mono text-sm">{value}</div>
      {note && <p className="mt-2 text-xs leading-relaxed text-gray-500">{note}</p>}
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-5">
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span
        className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-[var(--accent)]"
        style={{ background: "rgba(63,185,80,0.12)" }}
      >
        {n}
      </span>
      <div>
        <div className="text-sm font-semibold">{title}</div>
        <div className="mt-0.5 text-sm leading-relaxed text-gray-400">{children}</div>
      </div>
    </li>
  );
}

export function ProtocolTab() {
  const assetId = cmojo_asset_id();
  const issuerPk = issuer_public_key();

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm leading-relaxed text-gray-400">
        Everything an application needs to mint or melt <strong>this exact asset id</strong>.
        There is one canonical cMojo — these parameters are fixed forever and identical for
        every integrator. cMojo is a standard{" "}
        <span className="font-mono">CAT2</span> token on Chia mainnet; any wallet or dApp
        that understands CATs can hold and transfer it with no extra work. Minting and
        melting are permissionless: no registration, no allowlist, no counterparty.
      </p>

      <Section title="Canonical parameters">
        <div className="flex flex-col gap-3">
          <CopyableValue
            label="cMojo asset id (TAIL hash)"
            value={assetId}
            note="Use this as the CAT2 asset id everywhere: balance queries, coin lookups, transfers, and the outer-puzzle hash computation. Wallet RPCs (e.g. Sage's chip0002_*) expect it WITHOUT the 0x prefix."
          />
          <CopyableValue
            label="Issuer public key (curried into the TAIL)"
            value={issuerPk}
            note="The TAIL is the canonical `everything_with_signature` multi-issuance puzzle from chia-puzzles, curried with this BLS public key. TAIL hash = cMojo asset id."
          />
          <CopyableValue
            label="Issuer secret key — published on purpose"
            value={ISSUER_SECRET_KEY}
            note="Anyone can sign supply changes with this key; that is what makes mint and melt permissionless. The signature only authorises the supply delta — the 1:1 XCH backing is enforced independently by Chia consensus (every spend bundle must conserve mojos), so publishing the key does not weaken the peg."
          />
          <CopyableValue
            label="AGG_SIG additional data (mainnet genesis challenge)"
            value={MAINNET_GENESIS_CHALLENGE}
            note="The issuer signature is an AGG_SIG_ME-style BLS signature: sign(issuer_sk, message || coin_id || genesis_challenge) for the coin spend that runs the TAIL."
          />
        </div>
      </Section>

      <Section title="Mint (wrap): XCH → cMojo">
        <p className="mb-3 text-sm leading-relaxed text-gray-400">
          A mint is a single spend bundle that locks XCH and issues the same number of cMojo
          mojos. Consensus only accepts the bundle if{" "}
          <span className="font-mono">XCH in = mint + fee + change</span>, so newly minted
          cMojo is always matched 1:1 by consumed XCH.
        </p>
        <ol className="flex flex-col gap-3">
          <Step n={1} title="Spend XCH funder coins">
            Spend one or more ordinary XCH coins. Their conditions create the CAT{" "}
            <em>eve coin</em> (amount = mint amount) at the CAT2 outer puzzle for this asset
            id, plus optional change back to the funder and the transaction fee.
          </Step>
          <Step n={2} title="Run the TAIL with a positive delta">
            The eve coin&apos;s spend reveals the `everything_with_signature` TAIL (curried
            with the issuer public key above) and runs it with a positive supply delta equal
            to the mint amount. Its inner puzzle pays the freshly minted cMojo to the
            recipient&apos;s puzzle hash.
          </Step>
          <Step n={3} title="Sign with the issuer key">
            The TAIL requires a BLS signature from the issuer key over the supply change.
            Compute it with the published secret key (AGG_SIG_ME semantics: message, coin
            id, and the mainnet genesis challenge above).
          </Step>
          <Step n={4} title="Aggregate and broadcast">
            Aggregate the issuer signature with the wallet&apos;s signatures for the funder
            coins into one BLS signature, assemble the spend bundle, and push it to the
            mempool (e.g. coinset.org push_tx).
          </Step>
        </ol>
      </Section>

      <Section title="Melt (burn): cMojo → XCH">
        <p className="mb-3 text-sm leading-relaxed text-gray-400">
          A melt runs the TAIL with a <em>negative</em> delta, retiring cMojo mojos. Because
          a CAT coin can only create CAT children, the freed mojos are claimed by an
          ordinary XCH <em>anchor</em> coin spent in the same bundle.
        </p>
        <ol className="flex flex-col gap-3">
          <Step n={1} title="Spend the cMojo coins">
            Spend the cMojo coins to melt. The first coin reveals the TAIL and runs it with a
            negative <span className="font-mono">extra_delta</span> equal to the melt
            amount; the CAT ring accounting must net out to (total − melt).
          </Step>
          <Step n={2} title="Spend an XCH anchor coin">
            Spend any ordinary XCH coin in the same bundle. The mojos released by the
            negative delta flow to it, and it pays{" "}
            <span className="font-mono">melt + anchor − fee</span> XCH to the recipient.
          </Step>
          <Step n={3} title="Bind the two spends with announcements">
            So a farmer cannot split the bundle, bind them bidirectionally with coin
            announcements: the CAT spend creates announcement{" "}
            <span className="font-mono">&quot;cmojo-melt&quot;</span> and asserts the
            anchor&apos;s <span className="font-mono">&quot;cmojo-anchor&quot;</span>; the
            anchor creates <span className="font-mono">&quot;cmojo-anchor&quot;</span> and
            asserts the CAT&apos;s <span className="font-mono">&quot;cmojo-melt&quot;</span>.
          </Step>
          <Step n={4} title="Sign, aggregate, broadcast">
            As with mint: issuer signature over the (negative) supply change, aggregated
            with the wallet&apos;s signatures for the cMojo inner puzzles and the anchor
            coin, then push the bundle.
          </Step>
        </ol>
      </Section>

      <Section title="Use it in your own dApp">
        <p className="mb-3 text-sm leading-relaxed text-gray-400">
          The builder ships as both an npm (WASM) package and a Rust crate, with the
          same two-function interface — <span className="font-mono">wrap</span> and{" "}
          <span className="font-mono">melt</span> — and the <strong>0.1% dev fee baked in
          by default</strong> (it is computed inside the library, never a caller
          parameter). Drop it into any Chia dApp:
        </p>

        <div className="mb-3 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wide text-gray-400">
              TypeScript / WASM
            </span>
            <a
              href="https://www.npmjs.com/package/@dig-network/cmojo-core"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-gray-500 underline-offset-2 hover:text-[var(--accent)] hover:underline"
            >
              @dig-network/cmojo-core ↗
            </a>
          </div>
          <pre className="mt-2 overflow-x-auto rounded-lg bg-[var(--background)] p-3 font-mono text-xs leading-relaxed">{`npm install @dig-network/cmojo-core

import init, { wrap, melt } from "@dig-network/cmojo-core";
await init();
const bundle = wrap({ xch_coins, recipient_puzzle_hash,
  change_puzzle_hash, mint_amount_mojos, fee_mojos });
// melt(...) is symmetric. Dev fee is already included.`}</pre>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wide text-gray-400">Rust</span>
            <a
              href="https://crates.io/crates/cmojo-core"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-gray-500 underline-offset-2 hover:text-[var(--accent)] hover:underline"
            >
              crates.io/crates/cmojo-core ↗
            </a>
          </div>
          <pre className="mt-2 overflow-x-auto rounded-lg bg-[var(--background)] p-3 font-mono text-xs leading-relaxed">{`cargo add cmojo-core

use cmojo_core::{wrap, melt, WrapParams};
let bundle = wrap(WrapParams { /* coins, recipient, mint_amount, … */ })?;
// melt(MeltParams { … })? is symmetric. Dev fee is baked in.`}</pre>
        </div>

        <p className="mt-3 text-sm leading-relaxed text-gray-400">
          Both call the identical builder, so they produce byte-identical on-chain
          behavior — and both always include the 0.1% dev fee output. Any implementation
          that follows the bundle shapes above is valid; the library is a convenience, not
          a protocol dependency.
        </p>
      </Section>
    </div>
  );
}
