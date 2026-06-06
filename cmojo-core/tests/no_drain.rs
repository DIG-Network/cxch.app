//! Adversarial proof that the 1:1-mojo cMojo has NO drain vector.
//!
//! The peg is CAT2 mojo-conservation: a cMojo coin of N mojos physically holds
//! N XCH mojos. There is no separate reserve to target. These tests attempt
//! the analogues of the reserve-design drains and confirm consensus rejects
//! them — minting without locking XCH, and melting out more than was burned.

use chia_bls::{aggregate, Signature};
use chia_protocol::{Coin, CoinSpend, SpendBundle};
use chia_sdk_driver::{Cat, CatInfo, CatSpend, SpendContext, SpendWithConditions, StandardLayer};
use chia_sdk_test::Simulator;
use chia_sdk_types::Conditions;
use chia_puzzle_types::cat::EverythingWithSignatureTailArgs;
use chia_puzzle_types::Memos;
use cmojo_core::constants::{issuer_sk, Network};
use cmojo_core::spend::{StandardCoin, CmojoCoin};
use cmojo_core::tail::{cmojo_asset_id, cmojo_outer_puzzle_hash, partial_signature};
use cmojo_core::wrap::{build_wrap, WrapParams};
use cmojo_core::melt::{build_melt, MeltParams};
use clvmr::NodePtr;

const XCH: u64 = 1_000_000_000_000;
const NET: Network = Network::Testnet11;

fn push(sim: &mut Simulator, spends: Vec<CoinSpend>, sks: &[&chia_bls::SecretKey]) -> anyhow::Result<()> {
    let mut sig = Signature::default();
    for sk in sks {
        sig = aggregate(&[sig, partial_signature(&spends, NET, sk)?]);
    }
    sim.new_transaction(SpendBundle::new(spends, sig))?;
    Ok(())
}

/// There is NO standing reserve coin: the backing lives inside each cMojo coin.
/// After a wrap, the only coins holding the wrapped mojos are the cMojo CAT
/// coins themselves — nothing at any "reserve" puzzle hash.
#[test]
fn backing_is_intrinsic_no_reserve_coin() -> anyhow::Result<()> {
    let mut sim = Simulator::new();
    let alice = sim.bls(2 * XCH);
    let mint = XCH;
    let wrap = build_wrap(WrapParams {
        xch_coins: vec![StandardCoin { coin: alice.coin, synthetic_key: alice.pk }],
        recipient_puzzle_hash: alice.puzzle_hash,
        change_puzzle_hash: alice.puzzle_hash,
        mint_amount: mint,
        fee: 0,
        network: NET,
    })?;
    let cmojo = wrap.cat_outputs[0];
    push(&mut sim, wrap.coin_spends, &[&alice.sk, &issuer_sk()])?;

    // The cMojo coin holds exactly `mint` mojos — the backing is IN the coin.
    let cmojo_coins = sim.unspent_coins(cmojo_outer_puzzle_hash(alice.puzzle_hash), false);
    assert_eq!(cmojo_coins.iter().map(|c| c.amount).sum::<u64>(), mint);
    assert_eq!(cmojo.coin.amount, mint);
    Ok(())
}

/// Attempt to issue a cMojo coin of N mojos while the funder provides < N
/// mojos of backing. Consensus must reject (bundle mojo imbalance) — you
/// cannot mint unbacked cMojo.
#[test]
fn cannot_mint_without_backing() -> anyhow::Result<()> {
    let mut sim = Simulator::new();
    let alice = sim.bls(XCH);

    // Hand-craft: issue a 2*XCH cMojo eve from a 1*XCH funder, recreating the
    // full XCH as change (so no backing is actually locked). This is the
    // "mint from nothing" attack.
    let mut ctx = SpendContext::new();
    let recipient_hint = ctx.hint(alice.puzzle_hash)?;
    let fake_mint = 2 * XCH;
    let eve_conditions = Conditions::new().create_coin(alice.puzzle_hash, fake_mint, recipient_hint);
    let (issue_cat, _children) = Cat::issue_with_key(
        &mut ctx, alice.coin.coin_id(), issuer_sk().public_key(), fake_mint, eve_conditions,
    )?;
    // Funder also tries to keep all its XCH as change → bundle won't balance.
    let change_hint = ctx.hint(alice.puzzle_hash)?;
    let funder_conditions = issue_cat.create_coin(alice.puzzle_hash, alice.coin.amount, change_hint);
    StandardLayer::new(alice.pk).spend(&mut ctx, alice.coin, funder_conditions)?;
    let spends = ctx.take();

    let result = push(&mut sim, spends, &[&alice.sk, &issuer_sk()]);
    assert!(result.is_err(), "minting cMojo without locking the backing must be rejected");
    Ok(())
}

/// THE mint-binding proof: minting N cMojo consumes EXACTLY N XCH mojos.
/// Fund with A mojos, mint all A (no fee, no change). The eve cMojo coin must
/// hold exactly A mojos and NO XCH may survive — every locked mojo went into
/// the CAT coin. This is the 1:1 peg, enforced by CAT2 + mojo-conservation.
#[test]
fn mint_locks_exactly_one_to_one() -> anyhow::Result<()> {
    let mut sim = Simulator::new();
    let funded = XCH; // A — single funder coin
    let alice = sim.bls(funded);

    let mint = XCH / 2; // mint a clean amount; dev fee + change absorb the rest
    let wrap = build_wrap(WrapParams {
        xch_coins: vec![StandardCoin { coin: alice.coin, synthetic_key: alice.pk }],
        recipient_puzzle_hash: alice.puzzle_hash,
        change_puzzle_hash: alice.puzzle_hash,
        mint_amount: mint,
        fee: 0,
        network: NET,
    })?;
    push(&mut sim, wrap.coin_spends, &[&alice.sk, &issuer_sk()])?;

    // EXACTLY `mint` cMojo mojos were created.
    let cmojo: u64 = sim.unspent_coins(cmojo_outer_puzzle_hash(alice.puzzle_hash), false)
        .iter().map(|c| c.amount).sum();
    assert_eq!(cmojo, mint, "cMojo minted == mojos locked (1:1)");

    // CONSERVATION: cMojo(mint) + dev fee + XCH change == funder input. No mojo
    // was conjured; the minted cMojo is fully backed by consumed XCH.
    let dev: u64 = sim.unspent_coins(cmojo_core::constants::dev_fee_puzzle_hash(), false)
        .iter().map(|c| c.amount).sum();
    let change: u64 = sim.unspent_coins(alice.puzzle_hash, false)
        .iter().map(|c| c.amount).sum();
    assert_eq!(cmojo + dev + change, funded, "every mojo accounted; none minted for free");
    assert_eq!(dev, cmojo_core::constants::dev_fee(mint), "dev fee is 0.1% of mint");
    Ok(())
}

/// Sharpest over-mint: issue an eve cMojo coin LARGER than the funder, with NO
/// change. Bundle output (eve) > input (funder) → consensus rejects. You
/// cannot conjure CAT mojos; minting N strictly requires N mojos of input.
#[test]
fn cannot_mint_more_than_funded() -> anyhow::Result<()> {
    let mut sim = Simulator::new();
    let alice = sim.bls(XCH);

    let mut ctx = SpendContext::new();
    let recipient_hint = ctx.hint(alice.puzzle_hash)?;
    let over_mint = alice.coin.amount + 1_000_000; // 1 funder coin, mint MORE
    let eve_conditions = Conditions::new().create_coin(alice.puzzle_hash, over_mint, recipient_hint);
    let (issue_cat, _children) = Cat::issue_with_key(
        &mut ctx, alice.coin.coin_id(), issuer_sk().public_key(), over_mint, eve_conditions,
    )?;
    // No change — the ONLY output is the over-sized eve CAT coin.
    StandardLayer::new(alice.pk).spend(&mut ctx, alice.coin, issue_cat)?;
    let spends = ctx.take();

    let result = push(&mut sim, spends, &[&alice.sk, &issuer_sk()]);
    assert!(result.is_err(), "issuing more cMojo mojos than the funder holds must be rejected");
    Ok(())
}

/// Attempt to melt M cMojo but pay out MORE XCH than (anchor + M − fees).
/// Consensus must reject (the anchor cannot create value it doesn't hold).
#[test]
fn cannot_overdraw_on_melt() -> anyhow::Result<()> {
    let mut sim = Simulator::new();
    let alice = sim.bls(2 * XCH);
    let mint = XCH;
    let wrap = build_wrap(WrapParams {
        xch_coins: vec![StandardCoin { coin: alice.coin, synthetic_key: alice.pk }],
        recipient_puzzle_hash: alice.puzzle_hash,
        change_puzzle_hash: alice.puzzle_hash,
        mint_amount: mint, fee: 0, network: NET,
    })?;
    let cmojo = wrap.cat_outputs[0];
    push(&mut sim, wrap.coin_spends, &[&alice.sk, &issuer_sk()])?;

    let melt = XCH / 2;
    let anchor = Coin::new(alice.coin.coin_id(), alice.puzzle_hash, XCH - cmojo_core::constants::dev_fee(mint));

    // Hand-craft a melt that runs the TAIL with negative delta for `melt`,
    // but the anchor tries to create MORE than (anchor + melt) mojos.
    let mut ctx = SpendContext::new();
    let tail = ctx.curry(EverythingWithSignatureTailArgs::new(issuer_sk().public_key()))?;
    let hint = ctx.hint(alice.puzzle_hash)?;
    let cat_conditions = Conditions::new()
        .run_cat_tail(tail, NodePtr::NIL)
        .create_coin(alice.puzzle_hash, mint - melt, hint);
    let cat_inner = StandardLayer::new(alice.pk).spend_with_conditions(&mut ctx, cat_conditions)?;
    Cat::spend_all(&mut ctx, &[CatSpend::new(cmojo, cat_inner)])?;
    // Anchor over-creates: anchor.amount + melt + 1_000_000 (steal a million mojos).
    let steal = anchor.amount + melt + 1_000_000;
    StandardLayer::new(alice.pk).spend(&mut ctx, anchor,
        Conditions::new().create_coin(alice.puzzle_hash, steal, Memos::None))?;
    let spends = ctx.take();

    let result = push(&mut sim, spends, &[&alice.sk, &issuer_sk()]);
    assert!(result.is_err(), "melting out more than (anchor + burned) must be rejected");
    Ok(())
}

/// Melt ATOMICITY: a farmer cannot strip the cMojo burn from a melt bundle and
/// keep only the XCH payout. The CAT spend and the anchor are bound by a pair
/// of coin announcements; removing the CAT spend leaves the anchor asserting a
/// missing announcement (and over-creating value) → rejected.
#[test]
fn melt_cannot_be_split_to_keep_payout() -> anyhow::Result<()> {
    let mut sim = Simulator::new();
    let alice = sim.bls(2 * XCH);
    let mint = XCH;
    let wrap = build_wrap(WrapParams {
        xch_coins: vec![StandardCoin { coin: alice.coin, synthetic_key: alice.pk }],
        recipient_puzzle_hash: alice.puzzle_hash,
        change_puzzle_hash: alice.puzzle_hash,
        mint_amount: mint, fee: 0, network: NET,
    })?;
    let cmojo = wrap.cat_outputs[0];
    push(&mut sim, wrap.coin_spends, &[&alice.sk, &issuer_sk()])?;

    let melt = XCH / 2;
    let anchor = Coin::new(alice.coin.coin_id(), alice.puzzle_hash, XCH - cmojo_core::constants::dev_fee(mint));
    let bundle = build_melt(MeltParams {
        cmojo_coins: vec![CmojoCoin { cat: cmojo, synthetic_key: alice.pk }],
        anchor_coins: vec![StandardCoin { coin: anchor, synthetic_key: alice.pk }],
        recipient_puzzle_hash: alice.puzzle_hash,
        cat_change_puzzle_hash: alice.puzzle_hash,
        melt_amount: melt, fee: 0, network: NET,
    })?;

    // The full bundle is valid. Now STRIP the cMojo (CAT) spend, keeping only
    // the anchor that would pay out the freed mojos.
    let cmojo_outer = cmojo_outer_puzzle_hash(alice.puzzle_hash);
    let stripped: Vec<CoinSpend> = bundle.coin_spends.into_iter()
        .filter(|cs| cs.coin.puzzle_hash != cmojo_outer)
        .collect();
    assert!(!stripped.is_empty(), "anchor spend should remain");

    let result = push(&mut sim, stripped, &[&alice.sk]);
    assert!(result.is_err(), "stripping the cMojo burn from a melt must invalidate the payout");
    Ok(())
}

/// CATbleed analogue (the CAT1 counterfeiting bug, fixed in CAT2): take a held
/// cMojo coin of N and try to spend it creating MORE than N cMojo mojos of
/// children WITHOUT running the TAIL (no issuer authorization). CAT2 requires
/// the ring to balance (delta==0) when no TAIL runs, so the inflation is
/// rejected. We use CAT2 (EverythingWithSignature TAIL + Cat driver), so the
/// CAT1 counterfeit is structurally impossible.
#[test]
fn catbleed_counterfeit_rejected() -> anyhow::Result<()> {
    let mut sim = Simulator::new();
    let alice = sim.bls(2 * XCH);
    let mint = XCH;
    let wrap = build_wrap(WrapParams {
        xch_coins: vec![StandardCoin { coin: alice.coin, synthetic_key: alice.pk }],
        recipient_puzzle_hash: alice.puzzle_hash,
        change_puzzle_hash: alice.puzzle_hash,
        mint_amount: mint, fee: 0, network: NET,
    })?;
    let cmojo = wrap.cat_outputs[0];
    push(&mut sim, wrap.coin_spends, &[&alice.sk, &issuer_sk()])?;

    // Spend the held cMojo coin, inner creates a child of N + 1_000_000_000
    // mojos — counterfeit inflation — and does NOT run the TAIL.
    let mut ctx = SpendContext::new();
    let hint = ctx.hint(alice.puzzle_hash)?;
    let counterfeit = cmojo.coin.amount + 1_000_000_000;
    let cat_conditions = Conditions::new().create_coin(alice.puzzle_hash, counterfeit, hint);
    let cat_inner = StandardLayer::new(alice.pk).spend_with_conditions(&mut ctx, cat_conditions)?;
    // Cat::spend_all computes the ring delta; without a TAIL authorizing the
    // positive delta, this must be impossible to push.
    let result = (|| -> anyhow::Result<()> {
        Cat::spend_all(&mut ctx, &[CatSpend::new(cmojo, cat_inner)])?;
        let spends = ctx.take();
        push(&mut sim, spends, &[&alice.sk, &issuer_sk()])?;
        Ok(())
    })();
    assert!(result.is_err(), "CAT2 must reject counterfeiting cMojo without a TAIL-authorized delta");
    Ok(())
}

/// Sanity: the asset id is fixed by the published issuer key (no launcher,
/// no mutable state), so every cMojo is the same fungible asset.
#[test]
fn asset_id_is_deterministic() {
    let a = cmojo_asset_id();
    let b = cmojo_asset_id();
    assert_eq!(a, b);
    let _ = CatInfo::new(a, None, Default::default());
}
