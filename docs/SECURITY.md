# cMojo security — known-exploit audit

cMojo is a **1:1-mojo CAT2** (1 cMojo mojo = 1 XCH mojo). The peg is CAT2
mojo-conservation: a cMojo coin physically holds its backing mojos, there is
**no separate reserve**, and minting/melting is enforced by consensus. TAIL =
chia-puzzles `everything_with_signature` (audited), curried with a published
issuer key (permissionless supply changes; the key cannot break the peg).

This file audits the design against every named Chialisp/CAT exploit, with the
simulator test that proves immunity (`cmojo-core/tests/`).

## Named exploits

### 1. CATbleed (CAT1 counterfeiting, CVE-2022) — IMMUNE
CAT1 let a holder of 1 mojo print unlimited supply by forging the ring
announcements / shifting the coin-id preimage. **Fixed in CAT2.** cMojo uses
CAT2 throughout (`EverythingWithSignatureTailArgs`, `CatArgs`,
`Cat::issue_with_key`, `Cat::spend_all`). A CAT2 ring with output > input is
rejected unless a TAIL authorizes the exact delta.
- Test: `no_drain::catbleed_counterfeit_rejected` — inflating a held cMojo coin
  without a TAIL-authorized delta is rejected.

### 2. Unchecked hashing / solution bit-shifting / truncation — IMMUNE
The CAT1 root cause: `sha256(parent ++ puzzlehash ++ amount)` with unchecked
component lengths let an attacker shift the puzzlehash/amount boundary to forge
a colliding coin id with an inflated amount. Fixed by length-checks / the
`coinid` operator (CHIP-11).
- cMojo has **zero hand-rolled concatenation** in live code. Every coin id and
  announcement id is computed by the audited SDK (`Coin::coin_id()`,
  `announcement_id()`), which uses length-validated hashing. `grep sha256 src/`
  returns nothing.
- Note: the **deleted** reserve/vault/owner_tail puzzles DID hand-roll
  `sha256(parent ++ ph ++ amount)` and `sha256(my_id ++ release ++ recipient)`
  — exactly this surface. Removing them eliminated it.

### 3. Non-deterministic spends (farmer modifies a valid solution) — IMMUNE
A farmer can rewrite any coin solution if the result is still valid. cMojo locks
every value-bearing output behind `AGG_SIG_ME` (standard p2 / the
`everything_with_signature` TAIL), which binds the signature to the exact
delegated puzzle (the full condition list) AND the coin id. Wrap (funder
creating the eve coin, change, dev fee) and melt (cMojo recipient/cat-change,
anchor payout, dev fee, announcements) are all inside signed conditions — a
farmer cannot redirect the minted cMojo, the released XCH, or the change.
- Tests: `round_trip` (the full signed path validates),
  `no_drain::melt_cannot_be_split_to_keep_payout` (stripping the bound cMojo
  burn invalidates the payout).

### 4. Announcement replay (announcement without coin id) — IMMUNE
An announcement that omits the spending coin's id can be asserted by multiple
coins. The melt's `cmojo-melt`/`cmojo-anchor` binding uses `announcement_id(coin_id, msg)`
(SDK) — the coin id is in the preimage, so each is single-use, and the CAT spend
↔ anchor pair is 1:1.

### 5. Password / solution-revealed secret — N/A
cMojo uses no password locks; authorization is `AGG_SIG_ME` signatures only.

## Peg invariants (consensus-enforced, tested)

- **Mint is exactly 1:1** — creating N cMojo mojos consumes N XCH mojos; nothing
  is conjured. Tests: `mint_locks_exactly_one_to_one`,
  `cannot_mint_more_than_funded`, `cannot_mint_without_backing`.
- **Melt is exactly 1:1** — burning N cMojo frees exactly N XCH; the anchor
  cannot over-create. Test: `cannot_overdraw_on_melt`.
- **No reserve to drain** — backing is intrinsic to each coin. Test:
  `backing_is_intrinsic_no_reserve_coin`.

## Known non-peg limitations (not exploits)

- **Dev fee is a builder convention**, a plain `CREATE_COIN(dev_ph, 0.1%)`
  output our builder adds — NOT consensus-enforced. A hand-built bundle can mint
  or melt without paying it. This does not affect the peg or let anyone steal;
  it only means fee collection is best-effort.
- **Sage displays cMojo at 3 decimals** (hardcoded; `cat_queue.rs`), so 1 XCH of
  cMojo shows as ~1,000,000,000. The dApp shows correct XCH parity. Display
  parity in Sage would require a scaled reserve, which is provably drainable
  (see git history / prior post-mortem) — so it was rejected.

## Test summary
`cargo test` in `cmojo-core/`: round_trip (12) + no_drain (8) = **20 tests**,
all passing. The design uses only audited chia-puzzles/SDK primitives; there is
no custom on-chain puzzle code.
