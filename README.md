# cXCH — a 1:1 Wrapped-XCH CAT2 dApp on Chia

cXCH is native XCH expressed as a **CAT2** (Chia Asset Token, version 2). Each
cXCH mojo is backed **1:1** by a real XCH mojo — not held in a treasury, bridge,
or custodial reserve, but carried **inside the token itself**. A cXCH coin of
`N` mojos literally holds `N` mojos of XCH. Own the cXCH and you own the XCH;
melt it and that exact XCH re-emerges as native coin in the same block.

The peg is enforced by **Chia consensus itself**:

- **Wrap (mint):** spend XCH and run the issuance TAIL with a positive delta in
  the same spend bundle. Consensus only accepts the bundle if the XCH consumed
  equals `mint + fee + change`, so newly minted cXCH is always matched by an
  equal amount of XCH locked into the coin.
- **Melt (burn):** spend cXCH and run the TAIL with a negative delta. The mojos
  embedded in the coin re-emerge as ordinary XCH in the same block.

There is **no reserve, vault, or bridge** anyone could drain, freeze, or rug —
the backing is an intrinsic property of every coin, and melting is always
available to anyone holding cXCH.

## Built only on standard, audited Chia puzzles

cXCH ships **no bespoke on-chain code.** It is assembled entirely from the same
battle-tested, in-production primitives that Chia and every CAT already rely on:

| Layer | Puzzle |
|---|---|
| Asset (TAIL) | `everything_with_signature` (multi-issuance), from `chia-puzzles` |
| Token | the standard **CAT2** layer, from `chia-puzzles` / `chia-wallet-sdk` |
| Ownership | the standard **payment (p2) puzzle** (`StandardLayer`) |

Because there is no custom contract, the security of your funds rests on Chia's
reviewed puzzles and on consensus-level mojo conservation — exactly like any
other CAT — not on this application. The dApp only assembles standard spend
bundles; your wallet signs them locally.

> **Prerelease.** This is experimental software under active development. The
> canonical asset id may change before the production launch — keep your own
> record of the asset id you wrapped into (see *Canonical parameters*), so you
> can always melt a retired asset id with a matching local build.

This repository is a Rust spend-bundle builder compiled to WebAssembly, plus a
Next.js 15 / React 19 frontend that talks to **Sage Wallet** over WalletConnect
v2. It is **mainnet-only**.

The WalletConnect / Sage integration is modelled on Yakuhito's reference dApp
[`streaming-ui`](https://github.com/Yakuhito/streaming-ui) and verified against
Sage's own CHIP-0002 command definitions in
[`xch-dev/sage`](https://github.com/xch-dev/sage).

```
cXCH/
├── cxch-core/        # Rust → WASM spend-bundle builder (wrap + melt)
│   ├── src/          # lib.rs (public surface), wrap.rs, melt.rs, tail.rs, …
│   ├── tests/        # round_trip.rs (sim round trips) + no_drain.rs (adversarial)
│   └── examples/     # identity.rs prints the canonical asset id
├── app/              # Next.js 15 dApp (Sage + WalletConnect v2 + coinset.org)
│   ├── app/lib/      # wasm, walletconnect, sage, coinset, flow helpers
│   ├── app/components/  # Wrap / Melt panels, balances, Protocol tab, landing
│   └── wasm-pkg/     # committed wasm-pack output (regenerate with npm run build:wasm)
├── docs/SECURITY.md  # audit of named Chialisp/CAT exploits vs this design
└── .github/workflows/  # ci.yml + release.yml (publish npm + crate on tag)
```

## Canonical parameters

| Value | |
|---|---|
| cXCH asset id (TAIL hash) | `0x8808ca01803e09bf6d067075c9373b227aa8b086504ff0ac63cb3f02fe21c9ba` |
| TAIL | `everything_with_signature` (multi-issuance), from `chia-puzzles` |
| Issuer public key | `0xa4190e0dbbe68920ce6fb1b22c1da7c70561aad975a93544b5af91995329a4f75cbd8096b2f1baa07a2c339b74bd45ab` |

Recompute these any time with `cargo run --example identity` inside `cxch-core`.

## Use it in your own dApp

The builder ships as **both** an npm (WASM) package and a Rust crate, with the
same two-function interface — **`wrap`** and **`melt`** — and the **0.1% dev fee
baked in by default** (it is computed inside the library, never a caller
parameter, so it is always included behind both surfaces).

### npm (TypeScript / WASM) — [`@dig-network/cxch-core`](https://www.npmjs.com/package/@dig-network/cxch-core)

```bash
npm install @dig-network/cxch-core
```

```ts
import init, { wrap, melt } from "@dig-network/cxch-core";

await init();
const bundle = wrap({
  xch_coins,
  recipient_puzzle_hash,
  change_puzzle_hash,
  mint_amount_mojos,
  fee_mojos,
});
// melt({ cxch_coins, anchor_coins, recipient_puzzle_hash,
//   cat_change_puzzle_hash, melt_amount_mojos, fee_mojos }) is symmetric.
// The 0.1% dev fee is already included.
```

### crates.io (Rust) — [`cxch-core`](https://crates.io/crates/cxch-core)

```bash
cargo add cxch-core
```

```rust
use cxch_core::{wrap, melt, WrapParams, MeltParams};

let bundle = wrap(WrapParams { /* coins, recipient, mint_amount, … */ })?;
// melt(MeltParams { … })? is symmetric. The dev fee is baked in.
```

Both call the identical builder, so they produce byte-identical on-chain
behavior. The library is a convenience, not a protocol dependency — any
implementation that follows the bundle shapes (see the **Protocol** tab in the
app, or `docs/SECURITY.md`) is equally valid.

## How wrap and melt are built

The Rust core (`cxch-core`) uses the real
[`chia-wallet-sdk`](https://github.com/xch-dev/chia-wallet-sdk) 0.27 driver
primitives:

- **Wrap** (`wrap.rs`) uses `Cat::issue_with_key` with
  `EverythingWithSignatureTailArgs(issuer_pk)`. The funder XCH coin emits the
  conditions that create the CAT eve coin (plus change and fee); the eve coin's
  inner puzzle mints the cXCH to the recipient. The 1:1 backing is guaranteed by
  the bundle's mojo balance.
- **Melt** (`melt.rs`) reveals the TAIL on the first cXCH coin via
  `Conditions::run_cat_tail`, and `Cat::spend_all` computes the negative
  `extra_delta` automatically. Because a CAT coin can only create CAT children,
  the freed mojos are claimed by an ordinary **anchor** XCH coin spent in the
  same bundle, which pays the released XCH to the recipient (minus fee). The CAT
  spend and the anchor spend are bound together with a pair of coin
  announcements so a farmer cannot split the bundle.

Both builders return unsigned coin spends plus the **issuer's partial
signature** (computed with the signer crate's `RequiredSignature`, filtered to
the issuer key). The frontend asks Sage to partially sign the same coin spends
and aggregates the two signatures into the final `SpendBundle`.

## Verifying the core

The on-chain mechanism is validated against the in-process chia-wallet-sdk
simulator, which actually executes the CLVM puzzles and checks every puzzle, the
CAT2 ring accounting, the melt `extra_delta`, the wrap/melt announcement
bindings, the BLS signatures, and the bundle mojo balance (the source of the
peg):

```bash
cd cxch-core
cargo test
```

Two suites run:

- **`round_trip.rs`** — wrap → melt round trips, the full signature-aggregation
  path (wallet partial signature + issuer partial signature), exact peg/fee
  accounting to the mojo, the fungibility canary (different inner puzzle → same
  asset id), 1-mojo mints, multi-coin wraps and melts, and input-validation
  error cases.
- **`no_drain.rs`** — adversarial tests asserting the intrinsic 1:1 backing
  cannot be cheated: no reserve coin exists to drain, you cannot mint without
  locking the matching XCH, a melt cannot over-draw or be split to keep the
  payout, the CATbleed (CAT1 counterfeit) class is rejected, and the asset id is
  deterministic. See `docs/SECURITY.md` for the full exploit audit.

### How wallet wiring was derived

The CHIP-0002 contract used by the frontend is taken from Sage's source
(`src/walletconnect/commands.ts`) and the reference dApp. In particular:

- `chip0002_getPublicKeys` returns **synthetic** keys, used directly with
  `standardPuzzleHash` (no extra synthetic derivation).
- `chip0002_signCoinSpends` takes `{ coinSpends, partialSign }`, where each coin
  spend uses snake_case `coin` fields plus `puzzle_reveal` / `solution` — exactly
  what cxch-core emits — and returns the aggregated signature as a string. We
  call it with `partialSign: true` and aggregate the issuer's TAIL signature.
- `chip0002_getAssetCoins` returns coins with a `lineageProof`
  (`{ parentName, innerPuzzleHash, amount }`), mapped for melt.
- The receive address comes from `chia_getAddress`.

## Build & run

### Prerequisites

- Rust 1.78+ with the wasm target: `rustup target add wasm32-unknown-unknown`
- `wasm-pack`: `cargo install wasm-pack`
- `clang` (LLVM) on PATH — required to compile `blst` to `wasm32`
- Node.js 20+, npm 10+
- [Sage Wallet](https://sagewallet.net) (beta)
- A WalletConnect Cloud project id from <https://cloud.walletconnect.com>

### Build the WASM module

The committed `app/wasm-pkg/` lets you run the app immediately, but you can
rebuild it any time:

```bash
cd app
npm install
npm run build:wasm     # wasm-pack build → app/wasm-pkg
```

### Run the dApp

```bash
cd app
cp .env.example .env.local   # set NEXT_PUBLIC_WC_PROJECT_ID
npm run dev                  # http://localhost:3000
```

cXCH is mainnet-only: the chain id (`chia:mainnet`) is fixed in code and the
default `NEXT_PUBLIC_COINSET_API` points at `https://api.coinset.org`.

### Production build (static export)

The app is configured for a static host (`output: "export"` in
`next.config.ts`): `npm run build` emits a fully static site to `app/out/`,
ready to upload to S3 + CloudFront or any static host.

```bash
cd app
npm run build        # → app/out/
```

## Releases & publishing

Tagging a release as `v*` triggers `.github/workflows/release.yml`, which builds
and publishes both packages from the same source:

- **npm** — stamps the WASM package as `@dig-network/cxch-core@<tag>` and runs
  `npm publish` (needs the `NPM_TOKEN` repo secret).
- **crates.io** — stamps `cxch-core`'s version and runs `cargo publish` (needs
  the `CARGO_REGISTRY_TOKEN` repo secret).

Both surfaces expose the same `wrap` / `melt` interface with the dev fee baked
in, so integrators get identical behavior whichever they install.

## Security notes

- **No reserve to drain.** The XCH backing is intrinsic to each cXCH coin, not
  held in any pool, vault, or bridge. Mojo conservation — enforced by Chia
  consensus on every spend bundle — is the entire peg; there is no separate
  proof-of-reserves because there is nothing separate to prove.
- **Standard, audited puzzles only.** No custom on-chain code: the TAIL, the
  CAT2 layer, and the p2 puzzle are all stock `chia-puzzles` primitives.
- **The issuer secret key is published on purpose.** Issuance is permissionless;
  the signature authorises the *supply change* while consensus enforces the peg.
  Publishing it does not weaken the peg (a mint still has to lock matching XCH).
- **Single canonical TAIL → single asset id → full fungibility.** Never publish a
  second TAIL variant.
- **Pinned Next.js version.** `app/package.json` pins `next@15.2.1` to mirror the
  reference `streaming-ui` stack. That release carries a published advisory
  (CVE-2025-66478); for production, bump to the latest patched `15.x`
  (`npm i next@^15 eslint-config-next@^15`). The dApp is a client-only static
  export, which limits exposure.
- **Wallet wire formats.** The coin / coin-spend shapes are taken from Sage's
  CHIP-0002 command definitions; `app/app/lib/sage.ts` additionally tolerates
  field-casing differences and is the single place to adjust if a future Sage
  build changes the contract.

## License

MIT
