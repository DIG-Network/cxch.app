# wXCH — a 1:1 Wrapped-XCH CAT2 dApp on Chia

wXCH is a wrapped representation of native XCH expressed as a **CAT2** (Chia
Asset Token, version 2). Each wXCH mojo is backed **1:1** by a real XCH mojo, and
the peg is enforced by **Chia consensus itself** — not by a contract or a
custodian:

- **Wrap (mint):** spend XCH and run the multi-issuance TAIL with a positive
  delta in the same spend bundle. Consensus only accepts the bundle if the XCH
  consumed equals `mint + fee + change`, so newly minted wXCH is always matched
  by locked XCH.
- **Melt (burn):** spend wXCH and run the TAIL with a negative delta. The freed
  mojos re-emerge as ordinary XCH in the same block.

The TAIL is the canonical `everything_with_signature` puzzle curried with a
**publicly published** issuer key, so minting and melting are permissionless. The
signature only authorises the *supply change*; the 1:1 backing is a consequence
of the mojo-conservation rule that every spend bundle must obey.

This repository implements the architecture described in the project white paper
(`Research_Report.md`): a Rust spend-bundle builder compiled to WebAssembly, and
a Next.js 15 / React 19 frontend that talks to **Sage Wallet** over
WalletConnect v2. It is **mainnet-only**.

The WalletConnect / Sage integration is modelled on Yakuhito's reference dApp
[`streaming-ui`](https://github.com/Yakuhito/streaming-ui) and verified against
Sage's own CHIP-0002 command definitions in
[`xch-dev/sage`](https://github.com/xch-dev/sage).

```
wXCH/
├── wxch-core/        # Rust → WASM spend-bundle builder (the on-chain logic)
│   ├── src/          # lib.rs (wasm surface), wrap.rs, melt.rs, tail.rs, …
│   ├── tests/        # wrap → melt round trip against the chia-wallet-sdk simulator
│   └── examples/     # identity.rs prints the canonical asset id
└── app/              # Next.js 15 dApp (Sage + WalletConnect v2 + coinset.org)
    ├── app/lib/      # wasm, walletconnect, sage, coinset, flow helpers
    ├── app/components/  # Wrap / Melt panels, balances, connect button
    └── wasm-pkg/     # committed wasm-pack output (regenerate with npm run build:wasm)
```

## Canonical parameters

| Value | |
|---|---|
| wXCH asset id (TAIL hash) | `0xc3ab9294cca340fb5825ddae1b4787a15f306a99cb37940e47a0184e62428845` |
| TAIL | `everything_with_signature` (multi-issuance), from `chia-puzzles` |
| Issuer public key | `0xa3cafdf3d63c1032a410cbd91966333fc5ae5eb631226ef65e71354262ca0b29bdad443b72ffc7411267d4b8327676cc` |

Recompute these any time with `cargo run --example identity` inside `wxch-core`.

## How wrap and melt are built

The Rust core (`wxch-core`) is the heart of the project. It uses the real
[`chia-wallet-sdk`](https://github.com/xch-dev/chia-wallet-sdk) 0.27 driver
primitives:

- **Wrap** (`wrap.rs`) uses `Cat::issue_with_key` with
  `EverythingWithSignatureTailArgs(issuer_pk)`. The funder XCH coin emits the
  conditions that create the CAT eve coin (plus change and fee); the eve coin's
  inner puzzle mints the wXCH to the recipient. The 1:1 backing is guaranteed by
  the bundle's mojo balance.
- **Melt** (`melt.rs`) reveals the TAIL on the first wXCH coin via
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

> The white paper's code listings were a reconstruction; this implementation
> corrects them against the real 0.27 SDK — most importantly, `StandardLayer`
> takes a synthetic public key (not a puzzle hash), and melt routes the freed
> mojos through a non-CAT anchor coin.

## Verifying the core

The on-chain mechanism is validated against the in-process chia-wallet-sdk
simulator, which actually executes the CLVM puzzles and checks every puzzle, the
CAT2 ring accounting, the melt `extra_delta`, the wrap/melt announcement
bindings, the BLS signatures, and the bundle mojo balance (the source of the
peg):

```bash
cd wxch-core
cargo test
```

The suite covers wrap → melt round trips, the **full signature-aggregation path**
(wallet partial signature + issuer partial signature, proving the aggregate is
accepted by consensus), exact peg/fee accounting to the mojo, the fungibility
canary (different inner puzzle → same asset id), 1-mojo mints, multi-coin wraps
and melts, and input-validation error cases.

### How wallet wiring was derived

The CHIP-0002 contract used by the frontend is taken from Sage's source
(`src/walletconnect/commands.ts`) and the reference dApp. In particular:

- `chip0002_getPublicKeys` returns **synthetic** keys, used directly with
  `standardPuzzleHash` (no extra synthetic derivation).
- `chip0002_signCoinSpends` takes `{ coinSpends, partialSign }`, where each coin
  spend uses snake_case `coin` fields plus `puzzle_reveal` / `solution` — exactly
  what wxch-core emits — and returns the aggregated signature as a string. We
  call it with `partialSign: true` and aggregate the issuer's TAIL signature.
- `chip0002_getAssetCoins` returns coins with a `lineageProof`
  (`{ parentName, innerPuzzleHash, amount }`), mapped for melt.
- The receive address comes from `chia_getAddress`.

## Build & run

### Prerequisites

- Rust 1.78+ with the wasm target: `rustup target add wasm32-unknown-unknown`
- `wasm-pack`: `cargo install wasm-pack`
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

wXCH is mainnet-only: the chain id (`chia:mainnet`) is fixed in code and the
default `NEXT_PUBLIC_COINSET_API` points at `https://api.coinset.org`.

### Production build

```bash
cd app
npm run build && npm run start    # or deploy the static output
```

## Security notes

- **The issuer secret key is published on purpose.** Issuance is permissionless;
  the signature authorises the supply change while consensus enforces the peg.
- **Mojo conservation is the only peg mechanism.** There is no separate
  proof-of-reserves; the peg is exactly as strong as Chia consensus.
- **Single canonical TAIL → single asset id → full fungibility.** Never publish a
  second TAIL variant.
- **Pinned Next.js version.** `app/package.json` pins `next@15.2.1` to mirror the
  reference `streaming-ui` stack. That release carries a published advisory
  (CVE-2025-66478); for production, bump to the latest patched `15.x`
  (`npm i next@^15 eslint-config-next@^15`). The dApp is client-only and is
  typically deployed as a static export, which limits exposure.
- **Wallet wire formats.** The coin / coin-spend shapes are taken from Sage's
  CHIP-0002 command definitions; `app/app/lib/sage.ts` additionally tolerates
  field-casing differences and is the single place to adjust if a future Sage
  build changes the contract.

## License

MIT
