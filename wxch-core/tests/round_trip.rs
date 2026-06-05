//! End-to-end wrap → melt round trip against the chia-wallet-sdk simulator.
//!
//! These tests build spend bundles with the real `wxch-core` builders and push
//! them through the in-process simulator, which validates every puzzle, the CAT
//! ring accounting, the melt `extra_delta`, the announcement bindings, the
//! signatures, and the bundle mojo balance. Because the simulator validates with
//! `TESTNET11_CONSTANTS`, we sign with both the user key and the published issuer
//! key and use the `Testnet11` network when building.

use chia_protocol::Coin;
use chia_sdk_test::Simulator;
use wxch_core::constants::{issuer_sk, Network};
use wxch_core::melt::{build_melt, MeltParams};
use wxch_core::spend::{StandardCoin, WxchCoin};
use wxch_core::tail::{wxch_asset_id, wxch_outer_puzzle_hash};
use wxch_core::wrap::{build_wrap, WrapParams};

const XCH: u64 = 1_000_000_000_000;

#[test]
fn wrap_then_melt_round_trip() -> anyhow::Result<()> {
    let mut sim = Simulator::new();

    // Alice starts with 2 XCH in a single coin.
    let alice = sim.bls(2 * XCH);

    // --- Wrap 1 XCH -------------------------------------------------------
    let mint_amount = XCH;
    let wrap = build_wrap(WrapParams {
        xch_coins: vec![StandardCoin {
            coin: alice.coin,
            synthetic_key: alice.pk,
        }],
        recipient_puzzle_hash: alice.puzzle_hash,
        change_puzzle_hash: alice.puzzle_hash,
        mint_amount,
        fee: 0,
        network: Network::Testnet11,
    })?;

    // The minted wXCH coin is predicted in `cat_outputs`.
    assert_eq!(wrap.cat_outputs.len(), 1);
    let wxch = wrap.cat_outputs[0];
    assert_eq!(wxch.coin.amount, mint_amount);
    assert_eq!(wxch.info.asset_id, wxch_asset_id());
    assert_eq!(
        wxch.coin.puzzle_hash,
        wxch_outer_puzzle_hash(alice.puzzle_hash)
    );

    sim.spend_coins(wrap.coin_spends, &[alice.sk.clone(), issuer_sk()])?;

    // The wrap produced 1 XCH of change back to Alice, which we reuse as the
    // melt anchor coin (a CAT can only create CAT children, so plain XCH must be
    // produced from a standard coin).
    let anchor = Coin::new(alice.coin.coin_id(), alice.puzzle_hash, XCH);

    // --- Melt 0.4 wXCH ----------------------------------------------------
    let melt_amount = 400_000_000_000; // 0.4 XCH
    let fee = 1_000;
    let melt = build_melt(MeltParams {
        wxch_coins: vec![WxchCoin {
            cat: wxch,
            synthetic_key: alice.pk,
        }],
        anchor_coins: vec![StandardCoin {
            coin: anchor,
            synthetic_key: alice.pk,
        }],
        recipient_puzzle_hash: alice.puzzle_hash,
        cat_change_puzzle_hash: alice.puzzle_hash,
        melt_amount,
        fee,
        network: Network::Testnet11,
    })?;

    // The leftover wXCH change should be 0.6 XCH.
    assert_eq!(melt.cat_outputs.len(), 1);
    assert_eq!(melt.cat_outputs[0].coin.amount, mint_amount - melt_amount);

    sim.spend_coins(melt.coin_spends, &[alice.sk.clone(), issuer_sk()])?;

    // Alice should now hold the released XCH: the anchor (1 XCH) plus the melted
    // 0.4 XCH, minus the fee.
    let expected_xch_payout = XCH + melt_amount - fee;
    let xch_coins = sim.unspent_coins(alice.puzzle_hash, false);
    assert!(
        xch_coins.iter().any(|c| c.amount == expected_xch_payout),
        "expected a released XCH coin of {expected_xch_payout} mojos, got {:?}",
        xch_coins.iter().map(|c| c.amount).collect::<Vec<_>>()
    );

    Ok(())
}

#[test]
fn melt_entire_balance_no_change() -> anyhow::Result<()> {
    let mut sim = Simulator::new();
    let alice = sim.bls(2 * XCH);

    let mint_amount = XCH;
    let wrap = build_wrap(WrapParams {
        xch_coins: vec![StandardCoin {
            coin: alice.coin,
            synthetic_key: alice.pk,
        }],
        recipient_puzzle_hash: alice.puzzle_hash,
        change_puzzle_hash: alice.puzzle_hash,
        mint_amount,
        fee: 0,
        network: Network::Testnet11,
    })?;
    let wxch = wrap.cat_outputs[0];
    sim.spend_coins(wrap.coin_spends, &[alice.sk.clone(), issuer_sk()])?;

    let anchor = Coin::new(alice.coin.coin_id(), alice.puzzle_hash, XCH);

    // Melt the entire wXCH balance (no CAT change).
    let melt = build_melt(MeltParams {
        wxch_coins: vec![WxchCoin {
            cat: wxch,
            synthetic_key: alice.pk,
        }],
        anchor_coins: vec![StandardCoin {
            coin: anchor,
            synthetic_key: alice.pk,
        }],
        recipient_puzzle_hash: alice.puzzle_hash,
        cat_change_puzzle_hash: alice.puzzle_hash,
        melt_amount: mint_amount,
        fee: 0,
        network: Network::Testnet11,
    })?;
    assert!(melt.cat_outputs.is_empty());

    sim.spend_coins(melt.coin_spends, &[alice.sk.clone(), issuer_sk()])?;

    // No wXCH should remain.
    let wxch_ph = wxch_outer_puzzle_hash(alice.puzzle_hash);
    assert!(sim.unspent_coins(wxch_ph, false).is_empty());

    Ok(())
}
