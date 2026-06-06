"use client";

// Landing — what cMojo is (XCH as a CAT) and why you'd use it.
// Shown on the App tab when no wallet is connected. Mirrors the structure of
// the shielded-wallet reference landing: hero (message + visual), a two-card
// "what it is" compare, how-it-works steps, why-use-it features, closing CTA.

import { ConnectButton } from "./ConnectButton";
import PoweredByChia from "./PoweredByChia";
import SageBadge from "./SageBadge";

export function Landing() {
  return (
    <div className="flex flex-col gap-10">
      {/* Hero — message (left) + visual (right). */}
      <section className="grid gap-8 md:grid-cols-[1.1fr_0.9fr] md:items-center">
        <div className="order-2 md:order-1">
          <span
            className="mb-4 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold"
            style={{
              borderColor: "rgba(63,185,80,0.35)",
              color: "var(--accent)",
              background: "rgba(63,185,80,0.08)",
            }}
          >
            ⬡ 1:1 backed · permissionless · Chia mainnet
          </span>
          <h1 className="text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl">
            Your XCH, inside the CAT.
          </h1>
          <p className="mt-4 max-w-md text-base leading-relaxed text-gray-400">
            Convert your XCH into cMojo whenever you need{" "}
            <strong>value-preserving CATs</strong> — tokens that carry native XCH
            inside them, one mojo for one mojo. The XCH isn&apos;t held in a
            treasury or a bridge; it <em>is</em> the CAT. Own the cMojo and you
            own the XCH, and recover it any time by melting back to native XCH.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <ConnectButton />
          </div>
          <p className="mt-3 max-w-md text-xs leading-relaxed text-gray-500">
            <span className="font-medium text-[var(--foreground)]">
              No treasury to trust. No custodian. No bridge.
            </span>{" "}
            The XCH value is an intrinsic property of each cMojo coin — a coin of N
            mojos literally holds N mojos of XCH. Melting unlocks exactly that,
            enforced by Chia consensus. Your keys never leave your wallet.
          </p>
        </div>

        {/* Visual: native ⇄ CAT centerpiece. */}
        <div className="order-1 flex flex-col items-center gap-7 md:order-2">
          <div
            className="relative inline-flex aspect-square w-full max-w-[19rem] items-center justify-center rounded-[2.25rem]"
            style={{
              background:
                "radial-gradient(120% 120% at 50% 0%, rgba(63,185,80,0.20), rgba(63,185,80,0.04) 55%, transparent 80%), var(--panel)",
              boxShadow:
                "inset 0 0 0 1px rgba(63,185,80,0.30), 0 24px 70px -20px rgba(63,185,80,0.45)",
            }}
            aria-hidden
          >
            <span
              className="absolute rounded-full"
              style={{
                inset: "14%",
                border: "1px solid rgba(63,185,80,0.18)",
                boxShadow: "0 0 60px rgba(63,185,80,0.30)",
              }}
            />
            <span
              className="absolute rounded-full"
              style={{ inset: "28%", border: "1px solid rgba(63,185,80,0.12)" }}
            />
            <span className="relative text-7xl font-bold text-[var(--accent)]">
              cMojo
            </span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span
              className="inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 font-semibold"
              style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
            >
              <span aria-hidden>◎</span> XCH
            </span>
            <span className="text-base text-gray-500" aria-hidden>
              ⇄
            </span>
            <span
              className="inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 font-semibold"
              style={{
                borderColor: "rgba(63,185,80,0.35)",
                color: "var(--accent)",
                background: "rgba(63,185,80,0.08)",
              }}
            >
              ⬡ cMojo
            </span>
          </div>
        </div>
      </section>

      {/* Trust callout — standard, audited puzzles only. */}
      <section
        className="flex items-start gap-4 rounded-xl border p-5"
        style={{
          borderColor: "rgba(63,185,80,0.35)",
          background: "rgba(63,185,80,0.06)",
        }}
      >
        <span
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg text-[var(--accent)]"
          style={{ background: "rgba(63,185,80,0.12)" }}
          aria-hidden
        >
          🛡️
        </span>
        <div>
          <div className="font-semibold">
            Built on standard, audited Chia puzzles — no custom on-chain code
          </div>
          <p className="mt-1 text-sm leading-relaxed text-gray-400">
            cMojo is assembled entirely from the same battle-tested primitives
            Chia and every CAT already rely on: the <strong>CAT2 layer</strong>,
            the <strong>standard payment puzzle</strong>, and a published-key{" "}
            <strong>TAIL</strong>. There is no bespoke contract to trust or to
            audit. Wrapping and melting are enforced by{" "}
            <strong>Chia consensus itself</strong> — exactly like any other CAT —
            so the security of your funds rests on Chia&apos;s reviewed,
            in-production puzzles, not on this app.
          </p>
        </div>
      </section>

      {/* What it is — native vs CAT */}
      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-5">
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
            <span aria-hidden>◎</span> Native XCH
          </span>
          <p className="mt-3 text-sm leading-relaxed text-gray-400">
            Chia&apos;s base coin. Powerful, but invisible to the CAT ecosystem —
            token pools, CAT-only tooling, and asset-id-keyed integrations
            can&apos;t hold it directly.
          </p>
        </div>
        <div
          className="rounded-xl border bg-[var(--panel)] p-5"
          style={{ borderColor: "rgba(63,185,80,0.35)" }}
        >
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--accent)]">
            ⬡ cMojo
          </span>
          <p className="mt-3 text-sm leading-relaxed text-gray-400">
            The same XCH, with the coin&apos;s mojos carried <em>inside</em> a
            standard CAT2 token. The XCH is embedded in the cMojo itself — not
            parked in a treasury — so holding the CAT <em>is</em> holding the
            XCH, recoverable any time by melting.
          </p>
        </div>
      </section>

      {/* How it works */}
      <section>
        <h2 className="mb-1 text-lg font-semibold">How it works</h2>
        <p className="mb-4 text-sm text-gray-400">
          Two moves, both permissionless. The peg is automatic.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <HowCard
            icon="🔗"
            title="Connect"
            body="Connect Sage Wallet over WalletConnect. cMojo never holds your keys or funds."
          />
          <HowCard
            icon="↓"
            title="Wrap"
            body="Spend XCH, mint the same number of cMojo mojos in one atomic bundle. Consensus rejects anything unbalanced."
          />
          <HowCard
            icon="↑"
            title="Melt"
            body="Burn cMojo and the XCH embedded in it re-emerges as native XCH in the same block. No lock-up, no queue, no permission."
          />
        </div>
      </section>

      {/* Why use it */}
      <section>
        <h2 className="mb-4 text-lg font-semibold">Why cMojo</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <HowCard
            icon="🔒"
            title="No treasury to trust"
            body="The XCH lives inside each cMojo coin — a coin of N mojos holds exactly N mojos of XCH. There is no reserve, vault, or bridge anyone could drain, freeze, or rug. Nothing to trust but Chia consensus."
          />
          <HowCard
            icon="♻️"
            title="Always recoverable"
            body="Owning the cMojo IS owning the XCH. Melt the CAT and the embedded mojos re-emerge as native XCH in the same block — anyone, any size, any time, no permission and no counterparty."
          />
          <HowCard
            icon="🧩"
            title="Plugs into the CAT ecosystem"
            body="One canonical asset id that AMMs, offer files, and wallets already understand. Bring XCH liquidity anywhere CATs are traded."
          />
        </div>
      </section>

      {/* Powered by Chia — cursor-reactive glow chip — + Sage wallet badge */}
      <section className="flex flex-wrap items-center justify-center gap-4">
        <PoweredByChia />
        <SageBadge />
      </section>

      {/* Closing CTA */}
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-5">
        <div>
          <div className="font-semibold">Ready to wrap?</div>
          <p className="text-sm text-gray-400">
            Connect Sage and mint your first cMojo in one signature.
          </p>
        </div>
        <ConnectButton />
      </section>
    </div>
  );
}

function HowCard({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div className="h-full rounded-xl border border-[var(--border)] bg-[var(--panel)] p-5">
      <span
        className="inline-flex h-10 w-10 items-center justify-center rounded-full text-lg text-[var(--accent)]"
        style={{ background: "rgba(63,185,80,0.12)" }}
        aria-hidden
      >
        {icon}
      </span>
      <div className="mt-3 font-semibold">{title}</div>
      <p className="mt-1 text-sm leading-relaxed text-gray-400">{body}</p>
    </div>
  );
}
