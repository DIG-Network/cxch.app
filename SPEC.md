# cMojo — normative specification

This is the authoritative contract for **cMojo**, a 1:1 wrapped-XCH CAT2 token on
Chia mainnet, and for the `cmojo-core` spend-bundle builder that mints (wraps) and
burns (melts) it. An independent reimplementation built to this document produces
byte-identical on-chain behaviour. The `cmojo-core` library is a convenience, not
a protocol dependency: any bundle that satisfies the shapes below is valid.

The key words MUST, MUST NOT, SHOULD, and MAY are used per RFC 2119.

## 1. Asset model

cMojo is a **CAT2** token whose value is 1 cMojo mojo = 1 XCH mojo. The peg is
CAT2 mojo-conservation enforced by consensus; there is **no reserve coin** — each
cMojo coin physically holds its backing mojos.

- The TAIL MUST be the `chia-puzzles` `everything_with_signature` multi-issuance
  TAIL, curried with the canonical issuer public key (§2).
- The **cMojo asset id** MUST equal the SHA-256 tree hash of that curried TAIL:
  `EverythingWithSignatureTailArgs::curry_tree_hash(issuer_pk)`. This is the single
  fungibility anchor; there is exactly one canonical cMojo.
- A cMojo coin lives on-chain at its **CAT2 outer puzzle hash**:
  `CatArgs::curry_tree_hash(asset_id, inner_puzzle_hash)`, where `inner_puzzle_hash`
  is a standard p2 puzzle hash.

## 2. Canonical constants

These values are fixed forever and identical for every integrator. They are the
single source of truth (`cmojo-core/src/constants.rs`); the frontend and the
Protocol tab MUST read them from the compiled WASM (§5), never hard-copy them.

| Constant | Value / definition |
|---|---|
| Issuer secret key | `0x0000000000000000000000000000000000000000000000000000000063786368` — **published on purpose** (§4) |
| Issuer public key | BLS public key of the issuer secret key, curried into the TAIL |
| Mainnet genesis challenge | `0xccd5bb71183532bff220ba46c268991a3ff07eb358e8255a65c30a2dce0e5fbb` (the `AGG_SIG_ME` additional data) |
| Dev-fee basis points | `10` (0.1%) |
| Dev-fee address | `xch1qza35raa2yezce9kvf5z76qgrajpa8dlv0eg63q7dpel3h78hgystyyehc` |
| Networks | `Mainnet` (`xch`) and `Testnet11` (`txch`); the dApp is mainnet-only |

## 3. Fee model

Two independent fees ride on every wrap and melt:

1. **Network fee** — an ordinary `RESERVE_FEE`, chosen by the caller
   (`fee_mojos`). It is NOT a cmojo-core constant; the dApp defaults it to
   `100_000_000` mojos (0.0001 XCH), overridable via `NEXT_PUBLIC_DEFAULT_FEE_MOJOS`.
2. **Dev fee** — a builder convention: an ordinary `CREATE_COIN(dev_fee_address, dev_fee)`
   output added inside the same bundle. It is **computed inside the builder**, never a
   caller parameter, so every bundle cmojo-core builds includes it by default.

The dev-fee amount MUST be:

```
dev_fee(amount) = floor(amount * 10 / 10_000)   // 0.1%, integer-floored
```

computed in `u128` to avoid overflow, returned as `u64`. Amounts under 1000 mojos
yield a fee of zero, and no dev-fee output is added. This function
(`cmojo_core::constants::dev_fee`) is the **single source of truth**: it is exported
to WASM as `dev_fee(amount: bigint): bigint` (§5) and the frontend's fee preview and
coin selection MUST call that export so the previewed fee can never desync from the
fee the builder spends. Golden vectors (shared by the Rust unit test and the
frontend parity test):

| amount (mojos) | dev_fee |
|---|---|
| 0 | 0 |
| 999 | 0 |
| 1 000 | 1 |
| 9 999 | 9 |
| 10 000 | 10 |
| 1 000 000 000 000 (1 XCH) | 1 000 000 000 |

The dev fee is a best-effort collection convention — NOT consensus-enforced. A
hand-built bundle MAY omit it; this affects neither the peg nor custody.

## 4. Permissionless issuance

The issuer secret key is **published**. The `everything_with_signature` TAIL only
authorises the *supply change* (an `AGG_SIG_ME` over the TAIL-running spend); it
cannot mint value out of nothing, because CAT2 consensus independently enforces
that the ring conserves mojos. Publishing the key therefore makes mint and melt
permissionless without weakening the peg. Anyone MAY compute the issuer's partial
signature; a wallet contributes the remaining signatures for the standard coins it
controls, and the two aggregate into the final spend-bundle signature.

## 5. WASM / crate surface

`cmojo-core` compiles to a native Rust `rlib` and to a WASM package
(`@dignetwork/cmojo-core`, wasm-pack `--target web`). Both expose the same builder
entry points (`wrap`, `melt`) with the dev fee baked in. The WASM module exports:

| Export | Signature | Purpose |
|---|---|---|
| `cmojo_asset_id()` | `→ string` (`0x`-hex) | the canonical asset id |
| `cmojo_outer_puzzle_hash(inner)` | `string → string` | CAT2 outer puzzle hash |
| `standard_puzzle_hash(synthetic_key)` | `string → string` | p2 puzzle hash |
| `derive_synthetic_key(observer_key)` | `string → string` | observer → synthetic key |
| `issuer_public_key()` | `→ string` | issuer BLS public key |
| `issuer_secret_key()` | `→ string` | published issuer secret key (§4) |
| `mainnet_genesis_challenge()` | `→ string` | `AGG_SIG_ME` additional data |
| `dev_fee(amount)` | `bigint → bigint` | canonical 0.1% dev fee (§3) |
| `address_to_puzzle_hash(addr)` | `string → string` | bech32m → puzzle hash |
| `puzzle_hash_to_address(ph)` | `string → string` | puzzle hash → `xch` address |
| `wrap(request)` | `WrapRequest → UnsignedSpendBundle` | build a mint bundle |
| `melt(request)` | `MeltRequest → UnsignedSpendBundle` | build a burn bundle |
| `aggregate_signatures(sigs)` | `string[] → string` | aggregate BLS signatures |

The surface is **append-only**: exports MAY be added; an existing export's
signature or semantics MUST NOT change. Adding an export is a MINOR version bump.

### 5.1 Request / response shapes

Amounts are decimal strings or JSON numbers (strings accepted so JS can pass values
above 2^53); hex fields are `0x`-prefixed 32-byte (puzzle hashes) or 48-byte (keys).

- `WrapRequest`: `{ xch_coins: StandardCoin[], recipient_puzzle_hash, change_puzzle_hash, mint_amount_mojos, fee_mojos }`
- `MeltRequest`: `{ cmojo_coins: CmojoCoin[], anchor_coins: StandardCoin[], recipient_puzzle_hash, cat_change_puzzle_hash, melt_amount_mojos, fee_mojos }`
- `StandardCoin`: `{ coin: { parent_coin_info, puzzle_hash, amount }, synthetic_key }`
- `CmojoCoin`: `StandardCoin` fields plus `lineage_proof: { parent_parent_coin_info, parent_inner_puzzle_hash, parent_amount }`
- `UnsignedSpendBundle`: `{ coin_spends: CoinSpend[], issuer_partial_signature, minted_coins: Cat[] }`

`minted_coins` are the CAT coins this bundle creates (minted cMojo for a wrap,
cMojo change for a melt), so a caller MAY spend them in the same bundle without a
block wait.

## 6. Wrap (mint): XCH → cMojo

A wrap is a single spend bundle that locks XCH and issues an equal number of cMojo
mojos. It MUST be rejected before building when `mint_amount == 0`, when no XCH
coins are supplied, or when `total_in < mint_amount + fee + dev_fee`.

1. The first XCH coin (the **funder**) issues the CAT eve coin via
   `Cat::issue_with_key(funder_coin_id, issuer_pk, mint_amount, eve_conditions)`.
   The eve coin's inner puzzle creates `mint_amount` cMojo at `recipient_puzzle_hash`,
   hinted for wallet indexing.
2. The funder additionally creates the dev-fee output (when non-zero), the XCH
   change output (when non-zero), and reserves the network fee.
3. Additional funder coins MUST be bound to the funder with a `cmojo-wrap` coin
   announcement so a farmer cannot split the bundle.
4. The issuer partial signature is computed over all coin spends (§7).

The 1:1 peg holds because consensus accepts the bundle only if
`XCH in = mint_amount + fee + dev_fee + change`.

## 7. Melt (burn): cMojo → XCH

A melt runs the TAIL with a negative delta, retiring cMojo, and an ordinary XCH
**anchor** coin claims the freed mojos (a CAT coin can only create CAT children).
It MUST be rejected when `melt_amount == 0`, when no cMojo or no anchor coins are
supplied, when `cat_total < melt_amount`, or when `fee + dev_fee >= anchor_total + melt_amount`.

1. The first cMojo coin reveals the TAIL (`run_cat_tail`) with the negative
   `extra_delta` computed by `Cat::spend_all`, creates cMojo change at
   `cat_change_puzzle_hash` (when non-zero), and binds to the anchor by creating a
   `cmojo-melt` announcement and asserting the anchor's `cmojo-anchor` announcement.
   Secondary cMojo coins contribute their full value via the CAT ring.
2. The first anchor coin pays `redeemable - fee - dev_fee` XCH to
   `recipient_puzzle_hash` (where `redeemable = anchor_total + melt_amount`), creates
   the `cmojo-anchor` announcement, asserts the CAT's `cmojo-melt` announcement,
   creates the dev-fee output (when non-zero), and reserves the network fee.
3. Additional anchor coins MUST be bound with the `cmojo-anchor` announcement.
4. The issuer partial signature is computed over all coin spends.

The bidirectional `cmojo-melt` / `cmojo-anchor` binding uses
`announcement_id(coin_id, msg)`, so each announcement embeds its spending coin id
and is single-use — the CAT spend ↔ anchor pair is 1:1 and cannot be replayed or split.

## 8. Signing

Every supply-changing spend emits one `AGG_SIG_ME` condition bound to the issuer
public key. The issuer partial signature signs exactly those `AGG_SIG` conditions
whose public key matches the issuer key, under the network's `AGG_SIG_ME` constants
(mainnet genesis challenge). The wallet signs the standard coins it controls;
`aggregate_signatures` combines the two into the final bundle signature. Because
every value-bearing output lives inside a signed condition list bound to a coin id,
a farmer cannot redirect minted cMojo, released XCH, or change.

## 9. Security invariants

The design uses only audited `chia-puzzles`/SDK primitives with zero hand-rolled
hashing. The named-exploit audit and its simulator proofs live in `docs/SECURITY.md`;
the peg invariants (mint exactly 1:1, melt exactly 1:1, no reserve to drain) are
enforced by consensus and pinned by the `cmojo-core/tests/` round-trip and no-drain
suites. Any reimplementation MUST preserve these invariants.
