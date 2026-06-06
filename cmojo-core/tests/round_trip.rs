//! Robust local CLVM-execution tests for cMojo.
//!
//! Every test here builds spend bundles with the real `cmojo-core` builders and
//! runs them through the chia-wallet-sdk simulator, which actually executes the
//! CLVM puzzles and validates: the CAT2 outer puzzle and ring announcements, the
//! `everything_with_signature` TAIL, the melt `extra_delta`, the wrap/melt
//! announcement bindings, the BLS signatures, and the bundle mojo balance
//! (the source of the 1:1 peg).
//!
//! The simulator validates with `TESTNET11_CONSTANTS`, so signing-related tests
//! build with `Network::Testnet11`. (The dApp itself is mainnet-only; the
//! network only selects the `AGG_SIG_ME` domain.)

use chia_bls::{aggregate, SecretKey, Signature};
use chia_protocol::{Coin, CoinSpend, SpendBundle};
use chia_sdk_test::Simulator;
use cmojo_core::constants::{dev_fee, dev_fee_puzzle_hash, issuer_sk, Network};
use cmojo_core::error::Error;
use cmojo_core::melt::{build_melt, MeltParams};
use cmojo_core::spend::{StandardCoin, CmojoCoin};
use cmojo_core::tail::{partial_signature, cmojo_asset_id, cmojo_outer_puzzle_hash};
use cmojo_core::wrap::{build_wrap, WrapParams};

const XCH: u64 = 1_000_000_000_000;
const NET: Network = Network::Testnet11;

/// Assembles the final signature exactly the way the dApp does — by aggregating
/// each signer's *partial* signature (computed with `partial_signature`) — and
/// pushes the bundle through the simulator. This exercises the real production
/// signing path: wallet partial signature(s) + issuer partial signature.
fn push_with_partial_sigs(
    sim: &mut Simulator,
    coin_spends: Vec<CoinSpend>,
    signers: &[&SecretKey],
) -> anyhow::Result<()> {
    let mut signature = Signature::default();
    for sk in signers {
        let partial = partial_signature(&coin_spends, NET, sk)?;
        signature = aggregate(&[signature, partial]);
    }
    sim.new_transaction(SpendBundle::new(coin_spends, signature))?;
    Ok(())
}

fn wrap_params(coin: Coin, key: chia_bls::PublicKey, ph: chia_protocol::Bytes32, mint: u64, fee: u64) -> WrapParams {
    WrapParams {
        xch_coins: vec![StandardCoin { coin, synthetic_key: key }],
        recipient_puzzle_hash: ph,
        change_puzzle_hash: ph,
        mint_amount: mint,
        fee,
        network: NET,
    }
}

// ---------------------------------------------------------------------------
// Happy-path round trips
// ---------------------------------------------------------------------------

#[test]
fn wrap_then_melt_round_trip() -> anyhow::Result<()> {
    let mut sim = Simulator::new();
    let alice = sim.bls(2 * XCH);

    let mint = XCH;
    let wrap = build_wrap(wrap_params(alice.coin, alice.pk, alice.puzzle_hash, mint, 0))?;

    assert_eq!(wrap.cat_outputs.len(), 1);
    let cmojo = wrap.cat_outputs[0];
    assert_eq!(cmojo.coin.amount, mint);
    assert_eq!(cmojo.info.asset_id, cmojo_asset_id());
    assert_eq!(cmojo.coin.puzzle_hash, cmojo_outer_puzzle_hash(alice.puzzle_hash));

    sim.spend_coins(wrap.coin_spends, &[alice.sk.clone(), issuer_sk()])?;

    // The wrap change is reduced by the 0.1% dev fee paid in the same bundle.
    let anchor = Coin::new(alice.coin.coin_id(), alice.puzzle_hash, XCH - dev_fee(mint));

    let melt_amount = 400_000_000_000;
    let fee = 1_000;
    let melt = build_melt(MeltParams {
        cmojo_coins: vec![CmojoCoin { cat: cmojo, synthetic_key: alice.pk }],
        anchor_coins: vec![StandardCoin { coin: anchor, synthetic_key: alice.pk }],
        recipient_puzzle_hash: alice.puzzle_hash,
        cat_change_puzzle_hash: alice.puzzle_hash,
        melt_amount,
        fee,
        network: NET,
    })?;

    assert_eq!(melt.cat_outputs.len(), 1);
    assert_eq!(melt.cat_outputs[0].coin.amount, mint - melt_amount);

    sim.spend_coins(melt.coin_spends, &[alice.sk.clone(), issuer_sk()])?;

    let expected = (XCH - dev_fee(mint)) + melt_amount - fee - dev_fee(melt_amount);
    let xch_coins = sim.unspent_coins(alice.puzzle_hash, false);
    assert!(
        xch_coins.iter().any(|c| c.amount == expected),
        "expected released XCH of {expected}, got {:?}",
        xch_coins.iter().map(|c| c.amount).collect::<Vec<_>>()
    );
    Ok(())
}

/// The same round trip, but signed using the explicit partial-signature
/// aggregation path the dApp uses (wallet partial + issuer partial), proving the
/// aggregated signature is accepted by consensus.
#[test]
fn full_signature_aggregation_validates() -> anyhow::Result<()> {
    let mut sim = Simulator::new();
    let alice = sim.bls(2 * XCH);
    let issuer = issuer_sk();

    let mint = XCH;
    let wrap = build_wrap(wrap_params(alice.coin, alice.pk, alice.puzzle_hash, mint, 0))?;
    let cmojo = wrap.cat_outputs[0];
    push_with_partial_sigs(&mut sim, wrap.coin_spends, &[&alice.sk, &issuer])?;

    // The wrap change is reduced by the 0.1% dev fee paid in the same bundle.
    let anchor = Coin::new(alice.coin.coin_id(), alice.puzzle_hash, XCH - dev_fee(mint));
    let melt = build_melt(MeltParams {
        cmojo_coins: vec![CmojoCoin { cat: cmojo, synthetic_key: alice.pk }],
        anchor_coins: vec![StandardCoin { coin: anchor, synthetic_key: alice.pk }],
        recipient_puzzle_hash: alice.puzzle_hash,
        cat_change_puzzle_hash: alice.puzzle_hash,
        melt_amount: mint,
        fee: 0,
        network: NET,
    })?;
    push_with_partial_sigs(&mut sim, melt.coin_spends, &[&alice.sk, &issuer])?;

    // All cMojo burned, all XCH released.
    assert!(sim.unspent_coins(cmojo_outer_puzzle_hash(alice.puzzle_hash), false).is_empty());
    Ok(())
}

// ---------------------------------------------------------------------------
// Peg, fungibility, fee accounting
// ---------------------------------------------------------------------------

#[test]
fn wrap_peg_and_fee_are_exact_to_the_mojo() -> anyhow::Result<()> {
    let mut sim = Simulator::new();
    let alice = sim.bls(2 * XCH);

    let mint = 1_234_567_890_123;
    let fee = 100_000_000;
    let change = 2 * XCH - mint - fee - dev_fee(mint);

    let wrap = build_wrap(wrap_params(alice.coin, alice.pk, alice.puzzle_hash, mint, fee))?;
    let cmojo = wrap.cat_outputs[0];
    assert_eq!(cmojo.coin.amount, mint, "minted cMojo must equal requested mint, to the mojo");

    sim.spend_coins(wrap.coin_spends, &[alice.sk.clone(), issuer_sk()])?;

    // Exactly `mint` cMojo exists, and the XCH change is exact.
    let cmojo_coins = sim.unspent_coins(cmojo_outer_puzzle_hash(alice.puzzle_hash), false);
    assert_eq!(cmojo_coins.iter().map(|c| c.amount).sum::<u64>(), mint);
    let xch_coins = sim.unspent_coins(alice.puzzle_hash, false);
    assert!(xch_coins.iter().any(|c| c.amount == change), "change must be exact");

    // The 0.1% dev fee coin exists, to the mojo.
    let dev_coins = sim.unspent_coins(dev_fee_puzzle_hash(), false);
    assert_eq!(dev_coins.iter().map(|c| c.amount).sum::<u64>(), dev_fee(mint));
    Ok(())
}

#[test]
fn one_mojo_mint() -> anyhow::Result<()> {
    let mut sim = Simulator::new();
    let alice = sim.bls(XCH);
    let wrap = build_wrap(wrap_params(alice.coin, alice.pk, alice.puzzle_hash, 1, 0))?;
    assert_eq!(wrap.cat_outputs[0].coin.amount, 1);
    sim.spend_coins(wrap.coin_spends, &[alice.sk.clone(), issuer_sk()])?;
    Ok(())
}

#[test]
fn fungibility_canary_same_asset_id_different_inner() -> anyhow::Result<()> {
    let mut sim = Simulator::new();
    let alice = sim.bls(XCH);
    let bob = sim.bls(XCH);

    let wrap_a = build_wrap(wrap_params(alice.coin, alice.pk, alice.puzzle_hash, XCH / 2, 0))?;
    let wrap_b = build_wrap(wrap_params(bob.coin, bob.pk, bob.puzzle_hash, XCH / 2, 0))?;

    let a = wrap_a.cat_outputs[0];
    let b = wrap_b.cat_outputs[0];

    // Two independent wraps differ only in inner puzzle hash, never in asset id.
    assert_eq!(a.info.asset_id, b.info.asset_id);
    assert_eq!(a.info.asset_id, cmojo_asset_id());
    assert_ne!(a.coin.puzzle_hash, b.coin.puzzle_hash);
    Ok(())
}

// ---------------------------------------------------------------------------
// Multiple input coins
// ---------------------------------------------------------------------------

#[test]
fn wrap_with_two_funder_coins() -> anyhow::Result<()> {
    let mut sim = Simulator::new();
    let alice = sim.bls(XCH);
    let bob = sim.bls(XCH);

    // Both Alice and Bob fund the mint; the cMojo goes to Alice. This exercises
    // the inter-coin announcement binding in CLVM.
    let mint = XCH + XCH / 2;
    let wrap = build_wrap(WrapParams {
        xch_coins: vec![
            StandardCoin { coin: alice.coin, synthetic_key: alice.pk },
            StandardCoin { coin: bob.coin, synthetic_key: bob.pk },
        ],
        recipient_puzzle_hash: alice.puzzle_hash,
        change_puzzle_hash: alice.puzzle_hash,
        mint_amount: mint,
        fee: 0,
        network: NET,
    })?;
    assert_eq!(wrap.cat_outputs[0].coin.amount, mint);

    push_with_partial_sigs(&mut sim, wrap.coin_spends, &[&alice.sk, &bob.sk, &issuer_sk()])?;

    let cmojo = sim.unspent_coins(cmojo_outer_puzzle_hash(alice.puzzle_hash), false);
    assert_eq!(cmojo.iter().map(|c| c.amount).sum::<u64>(), mint);
    Ok(())
}

#[test]
fn melt_with_two_cmojo_coins() -> anyhow::Result<()> {
    let mut sim = Simulator::new();
    let alice = sim.bls(3 * XCH);

    // Wrap twice to produce two distinct cMojo coins at the same puzzle hash.
    let wrap1 = build_wrap(wrap_params(alice.coin, alice.pk, alice.puzzle_hash, XCH, 0))?;
    let cmojo1 = wrap1.cat_outputs[0];
    sim.spend_coins(wrap1.coin_spends, &[alice.sk.clone(), issuer_sk()])?;

    let change1 = Coin::new(alice.coin.coin_id(), alice.puzzle_hash, 2 * XCH - dev_fee(XCH));
    let wrap2 = build_wrap(WrapParams {
        xch_coins: vec![StandardCoin { coin: change1, synthetic_key: alice.pk }],
        recipient_puzzle_hash: alice.puzzle_hash,
        change_puzzle_hash: alice.puzzle_hash,
        mint_amount: XCH,
        fee: 0,
        network: NET,
    })?;
    let cmojo2 = wrap2.cat_outputs[0];
    sim.spend_coins(wrap2.coin_spends, &[alice.sk.clone(), issuer_sk()])?;

    let anchor = Coin::new(change1.coin_id(), alice.puzzle_hash, XCH - 2 * dev_fee(XCH));

    // Melt both cMojo coins (the ring spans two CATs; the TAIL is revealed once).
    let melt = build_melt(MeltParams {
        cmojo_coins: vec![
            CmojoCoin { cat: cmojo1, synthetic_key: alice.pk },
            CmojoCoin { cat: cmojo2, synthetic_key: alice.pk },
        ],
        anchor_coins: vec![StandardCoin { coin: anchor, synthetic_key: alice.pk }],
        recipient_puzzle_hash: alice.puzzle_hash,
        cat_change_puzzle_hash: alice.puzzle_hash,
        melt_amount: 2 * XCH,
        fee: 0,
        network: NET,
    })?;
    push_with_partial_sigs(&mut sim, melt.coin_spends, &[&alice.sk, &issuer_sk()])?;

    assert!(sim.unspent_coins(cmojo_outer_puzzle_hash(alice.puzzle_hash), false).is_empty());
    Ok(())
}

#[test]
fn melt_entire_balance_no_change() -> anyhow::Result<()> {
    let mut sim = Simulator::new();
    let alice = sim.bls(2 * XCH);

    let wrap = build_wrap(wrap_params(alice.coin, alice.pk, alice.puzzle_hash, XCH, 0))?;
    let cmojo = wrap.cat_outputs[0];
    sim.spend_coins(wrap.coin_spends, &[alice.sk.clone(), issuer_sk()])?;

    let anchor = Coin::new(alice.coin.coin_id(), alice.puzzle_hash, XCH - dev_fee(XCH));
    let melt = build_melt(MeltParams {
        cmojo_coins: vec![CmojoCoin { cat: cmojo, synthetic_key: alice.pk }],
        anchor_coins: vec![StandardCoin { coin: anchor, synthetic_key: alice.pk }],
        recipient_puzzle_hash: alice.puzzle_hash,
        cat_change_puzzle_hash: alice.puzzle_hash,
        melt_amount: XCH,
        fee: 0,
        network: NET,
    })?;
    assert!(melt.cat_outputs.is_empty());
    sim.spend_coins(melt.coin_spends, &[alice.sk.clone(), issuer_sk()])?;
    assert!(sim.unspent_coins(cmojo_outer_puzzle_hash(alice.puzzle_hash), false).is_empty());
    Ok(())
}

// ---------------------------------------------------------------------------
// Error handling (input validation, no CLVM execution required)
// ---------------------------------------------------------------------------

#[test]
fn wrap_rejects_zero_amount() {
    let mut sim = Simulator::new();
    let alice = sim.bls(XCH);
    let err = build_wrap(wrap_params(alice.coin, alice.pk, alice.puzzle_hash, 0, 0)).unwrap_err();
    assert!(matches!(err, Error::ZeroAmount));
}

#[test]
fn wrap_rejects_insufficient_funds() {
    let mut sim = Simulator::new();
    let alice = sim.bls(XCH);
    let err = build_wrap(wrap_params(alice.coin, alice.pk, alice.puzzle_hash, 2 * XCH, 0)).unwrap_err();
    assert!(matches!(err, Error::InsufficientFunds { .. }));
}

#[test]
fn melt_rejects_insufficient_cat() {
    let mut sim = Simulator::new();
    // 2×XCH so the funder also covers the 0.1% dev fee on a 1 XCH mint.
    let alice = sim.bls(2 * XCH);
    let wrap = build_wrap(wrap_params(alice.coin, alice.pk, alice.puzzle_hash, XCH, 0)).unwrap();
    let cmojo = wrap.cat_outputs[0];
    let anchor = Coin::new(alice.coin.coin_id(), alice.puzzle_hash, XCH);

    let err = build_melt(MeltParams {
        cmojo_coins: vec![CmojoCoin { cat: cmojo, synthetic_key: alice.pk }],
        anchor_coins: vec![StandardCoin { coin: anchor, synthetic_key: alice.pk }],
        recipient_puzzle_hash: alice.puzzle_hash,
        cat_change_puzzle_hash: alice.puzzle_hash,
        melt_amount: 2 * XCH,
        fee: 0,
        network: NET,
    })
    .unwrap_err();
    assert!(matches!(err, Error::InsufficientFunds { .. }));
}

#[test]
fn melt_rejects_fee_exceeding_redeemable() {
    let mut sim = Simulator::new();
    // 2×XCH so the funder also covers the 0.1% dev fee on a 1 XCH mint.
    let alice = sim.bls(2 * XCH);
    let wrap = build_wrap(wrap_params(alice.coin, alice.pk, alice.puzzle_hash, XCH, 0)).unwrap();
    let cmojo = wrap.cat_outputs[0];
    let anchor = Coin::new(alice.coin.coin_id(), alice.puzzle_hash, 1_000);

    // Anchor (1000) + melt (1000) = 2000 redeemable, but fee is 5000.
    let err = build_melt(MeltParams {
        cmojo_coins: vec![CmojoCoin { cat: cmojo, synthetic_key: alice.pk }],
        anchor_coins: vec![StandardCoin { coin: anchor, synthetic_key: alice.pk }],
        recipient_puzzle_hash: alice.puzzle_hash,
        cat_change_puzzle_hash: alice.puzzle_hash,
        melt_amount: 1_000,
        fee: 5_000,
        network: NET,
    })
    .unwrap_err();
    assert!(matches!(err, Error::FeeExceedsRedeemable { .. }));
}
