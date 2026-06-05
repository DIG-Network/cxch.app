//! Robust local CLVM-execution tests for wXCH.
//!
//! Every test here builds spend bundles with the real `wxch-core` builders and
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
use wxch_core::constants::{issuer_sk, Network};
use wxch_core::error::Error;
use wxch_core::melt::{build_melt, MeltParams};
use wxch_core::spend::{StandardCoin, WxchCoin};
use wxch_core::tail::{partial_signature, wxch_asset_id, wxch_outer_puzzle_hash};
use wxch_core::wrap::{build_wrap, WrapParams};

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
    let wxch = wrap.cat_outputs[0];
    assert_eq!(wxch.coin.amount, mint);
    assert_eq!(wxch.info.asset_id, wxch_asset_id());
    assert_eq!(wxch.coin.puzzle_hash, wxch_outer_puzzle_hash(alice.puzzle_hash));

    sim.spend_coins(wrap.coin_spends, &[alice.sk.clone(), issuer_sk()])?;

    let anchor = Coin::new(alice.coin.coin_id(), alice.puzzle_hash, XCH);

    let melt_amount = 400_000_000_000;
    let fee = 1_000;
    let melt = build_melt(MeltParams {
        wxch_coins: vec![WxchCoin { cat: wxch, synthetic_key: alice.pk }],
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

    let expected = XCH + melt_amount - fee;
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
    let wxch = wrap.cat_outputs[0];
    push_with_partial_sigs(&mut sim, wrap.coin_spends, &[&alice.sk, &issuer])?;

    let anchor = Coin::new(alice.coin.coin_id(), alice.puzzle_hash, XCH);
    let melt = build_melt(MeltParams {
        wxch_coins: vec![WxchCoin { cat: wxch, synthetic_key: alice.pk }],
        anchor_coins: vec![StandardCoin { coin: anchor, synthetic_key: alice.pk }],
        recipient_puzzle_hash: alice.puzzle_hash,
        cat_change_puzzle_hash: alice.puzzle_hash,
        melt_amount: mint,
        fee: 0,
        network: NET,
    })?;
    push_with_partial_sigs(&mut sim, melt.coin_spends, &[&alice.sk, &issuer])?;

    // All wXCH burned, all XCH released.
    assert!(sim.unspent_coins(wxch_outer_puzzle_hash(alice.puzzle_hash), false).is_empty());
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
    let change = 2 * XCH - mint - fee;

    let wrap = build_wrap(wrap_params(alice.coin, alice.pk, alice.puzzle_hash, mint, fee))?;
    let wxch = wrap.cat_outputs[0];
    assert_eq!(wxch.coin.amount, mint, "minted wXCH must equal requested mint, to the mojo");

    sim.spend_coins(wrap.coin_spends, &[alice.sk.clone(), issuer_sk()])?;

    // Exactly `mint` wXCH exists, and the XCH change is exact.
    let wxch_coins = sim.unspent_coins(wxch_outer_puzzle_hash(alice.puzzle_hash), false);
    assert_eq!(wxch_coins.iter().map(|c| c.amount).sum::<u64>(), mint);
    let xch_coins = sim.unspent_coins(alice.puzzle_hash, false);
    assert!(xch_coins.iter().any(|c| c.amount == change), "change must be exact");
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
    assert_eq!(a.info.asset_id, wxch_asset_id());
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

    // Both Alice and Bob fund the mint; the wXCH goes to Alice. This exercises
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

    let wxch = sim.unspent_coins(wxch_outer_puzzle_hash(alice.puzzle_hash), false);
    assert_eq!(wxch.iter().map(|c| c.amount).sum::<u64>(), mint);
    Ok(())
}

#[test]
fn melt_with_two_wxch_coins() -> anyhow::Result<()> {
    let mut sim = Simulator::new();
    let alice = sim.bls(3 * XCH);

    // Wrap twice to produce two distinct wXCH coins at the same puzzle hash.
    let wrap1 = build_wrap(wrap_params(alice.coin, alice.pk, alice.puzzle_hash, XCH, 0))?;
    let wxch1 = wrap1.cat_outputs[0];
    sim.spend_coins(wrap1.coin_spends, &[alice.sk.clone(), issuer_sk()])?;

    let change1 = Coin::new(alice.coin.coin_id(), alice.puzzle_hash, 2 * XCH);
    let wrap2 = build_wrap(WrapParams {
        xch_coins: vec![StandardCoin { coin: change1, synthetic_key: alice.pk }],
        recipient_puzzle_hash: alice.puzzle_hash,
        change_puzzle_hash: alice.puzzle_hash,
        mint_amount: XCH,
        fee: 0,
        network: NET,
    })?;
    let wxch2 = wrap2.cat_outputs[0];
    sim.spend_coins(wrap2.coin_spends, &[alice.sk.clone(), issuer_sk()])?;

    let anchor = Coin::new(change1.coin_id(), alice.puzzle_hash, XCH);

    // Melt both wXCH coins (the ring spans two CATs; the TAIL is revealed once).
    let melt = build_melt(MeltParams {
        wxch_coins: vec![
            WxchCoin { cat: wxch1, synthetic_key: alice.pk },
            WxchCoin { cat: wxch2, synthetic_key: alice.pk },
        ],
        anchor_coins: vec![StandardCoin { coin: anchor, synthetic_key: alice.pk }],
        recipient_puzzle_hash: alice.puzzle_hash,
        cat_change_puzzle_hash: alice.puzzle_hash,
        melt_amount: 2 * XCH,
        fee: 0,
        network: NET,
    })?;
    push_with_partial_sigs(&mut sim, melt.coin_spends, &[&alice.sk, &issuer_sk()])?;

    assert!(sim.unspent_coins(wxch_outer_puzzle_hash(alice.puzzle_hash), false).is_empty());
    Ok(())
}

#[test]
fn melt_entire_balance_no_change() -> anyhow::Result<()> {
    let mut sim = Simulator::new();
    let alice = sim.bls(2 * XCH);

    let wrap = build_wrap(wrap_params(alice.coin, alice.pk, alice.puzzle_hash, XCH, 0))?;
    let wxch = wrap.cat_outputs[0];
    sim.spend_coins(wrap.coin_spends, &[alice.sk.clone(), issuer_sk()])?;

    let anchor = Coin::new(alice.coin.coin_id(), alice.puzzle_hash, XCH);
    let melt = build_melt(MeltParams {
        wxch_coins: vec![WxchCoin { cat: wxch, synthetic_key: alice.pk }],
        anchor_coins: vec![StandardCoin { coin: anchor, synthetic_key: alice.pk }],
        recipient_puzzle_hash: alice.puzzle_hash,
        cat_change_puzzle_hash: alice.puzzle_hash,
        melt_amount: XCH,
        fee: 0,
        network: NET,
    })?;
    assert!(melt.cat_outputs.is_empty());
    sim.spend_coins(melt.coin_spends, &[alice.sk.clone(), issuer_sk()])?;
    assert!(sim.unspent_coins(wxch_outer_puzzle_hash(alice.puzzle_hash), false).is_empty());
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
    let alice = sim.bls(XCH);
    let wrap = build_wrap(wrap_params(alice.coin, alice.pk, alice.puzzle_hash, XCH, 0)).unwrap();
    let wxch = wrap.cat_outputs[0];
    let anchor = Coin::new(alice.coin.coin_id(), alice.puzzle_hash, XCH);

    let err = build_melt(MeltParams {
        wxch_coins: vec![WxchCoin { cat: wxch, synthetic_key: alice.pk }],
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
    let alice = sim.bls(XCH);
    let wrap = build_wrap(wrap_params(alice.coin, alice.pk, alice.puzzle_hash, XCH, 0)).unwrap();
    let wxch = wrap.cat_outputs[0];
    let anchor = Coin::new(alice.coin.coin_id(), alice.puzzle_hash, 1_000);

    // Anchor (1000) + melt (1000) = 2000 redeemable, but fee is 5000.
    let err = build_melt(MeltParams {
        wxch_coins: vec![WxchCoin { cat: wxch, synthetic_key: alice.pk }],
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
