use chia_protocol::Bytes32;
use chia_puzzle_types::Memos;
use chia_sdk_driver::{Cat, SpendContext, StandardLayer};
use chia_sdk_types::{announcement_id, Conditions};

use crate::constants::{dev_fee, dev_fee_puzzle_hash, issuer_pk, Network};
use crate::error::{Error, Result};
use crate::spend::{StandardCoin, UnsignedSpendBundle};
use crate::tail::{issuer_partial_signature, cmojo_asset_id};

const WRAP_ANNOUNCEMENT: &[u8] = b"cmojo-wrap";

/// Parameters for a wrap (mint) operation: lock `mint_amount` mojos of XCH and
/// receive the same number of mojos of cMojo.
pub struct WrapParams {
    /// The user's XCH coins to spend, each with its synthetic key. The first
    /// coin is the funder that creates the CAT eve coin.
    pub xch_coins: Vec<StandardCoin>,
    /// The p2 puzzle hash that should receive the freshly minted cMojo.
    pub recipient_puzzle_hash: Bytes32,
    /// The p2 puzzle hash that should receive the XCH change.
    pub change_puzzle_hash: Bytes32,
    /// The amount of cMojo to mint, in mojos.
    pub mint_amount: u64,
    /// The network fee, in mojos, paid from the XCH inputs.
    pub fee: u64,
    pub network: Network,
}

/// Builds the unsigned spend bundle for a wrap.
///
/// Net effect: `mint_amount` mojos leave the user's XCH wallet and an equal
/// amount appears as cMojo at the CAT2 outer puzzle hash of `recipient_puzzle_hash`.
/// The 1:1 peg is enforced by consensus: the bundle is only valid if the XCH
/// consumed equals `mint_amount + fee + change`.
pub fn build_wrap(params: WrapParams) -> Result<UnsignedSpendBundle> {
    if params.mint_amount == 0 {
        return Err(Error::ZeroAmount);
    }
    if params.xch_coins.is_empty() {
        return Err(Error::NoCoins("wrap"));
    }

    let total_in: u64 = params.xch_coins.iter().map(|c| c.coin.amount).sum();
    // 0.1% dev fee, paid as an XCH output in the same bundle.
    let dev_fee_amount = dev_fee(params.mint_amount);
    let total_out = params
        .mint_amount
        .checked_add(params.fee)
        .and_then(|v| v.checked_add(dev_fee_amount))
        .ok_or(Error::ZeroAmount)?;
    if total_in < total_out {
        return Err(Error::InsufficientFunds {
            have: total_in,
            need: total_out,
        });
    }
    let change = total_in - total_out;

    let mut ctx = SpendContext::new();
    let _asset_id = cmojo_asset_id();

    // The eve coin's inner puzzle creates the actual cMojo output for the
    // recipient, hinted so wallets can index it.
    let recipient_hint = ctx.hint(params.recipient_puzzle_hash)?;
    let eve_conditions =
        Conditions::new().create_coin(params.recipient_puzzle_hash, params.mint_amount, recipient_hint);

    let funder = params.xch_coins[0];
    // `issue_cat` is a `Conditions` list that creates the CAT eve coin from the
    // funder. We append the change / fee / binding conditions and have the
    // funder emit the whole thing.
    let (issue_cat, eve_children) = Cat::issue_with_key(
        &mut ctx,
        funder.coin.coin_id(),
        issuer_pk(),
        params.mint_amount,
        eve_conditions,
    )?;

    let mut funder_conditions = issue_cat;
    if dev_fee_amount > 0 {
        funder_conditions =
            funder_conditions.create_coin(dev_fee_puzzle_hash(), dev_fee_amount, Memos::None);
    }
    if change > 0 {
        let change_hint = ctx.hint(params.change_puzzle_hash)?;
        funder_conditions =
            funder_conditions.create_coin(params.change_puzzle_hash, change, change_hint);
    }
    if params.fee > 0 {
        funder_conditions = funder_conditions.reserve_fee(params.fee);
    }
    // If there are additional funder coins, bind them to the primary funder with
    // an announcement so a farmer cannot split the bundle.
    let has_extra_funders = params.xch_coins.len() > 1;
    if has_extra_funders {
        funder_conditions =
            funder_conditions.create_coin_announcement(WRAP_ANNOUNCEMENT.to_vec().into());
    }

    StandardLayer::new(funder.synthetic_key).spend(&mut ctx, funder.coin, funder_conditions)?;

    if has_extra_funders {
        let bind = announcement_id(funder.coin.coin_id(), WRAP_ANNOUNCEMENT);
        for extra in &params.xch_coins[1..] {
            let conditions = Conditions::new().assert_coin_announcement(bind);
            StandardLayer::new(extra.synthetic_key).spend(&mut ctx, extra.coin, conditions)?;
        }
    }

    let coin_spends = ctx.take();
    let issuer_signature = issuer_partial_signature(&coin_spends, params.network)?;

    Ok(UnsignedSpendBundle {
        coin_spends,
        issuer_signature,
        cat_outputs: eve_children,
    })
}
