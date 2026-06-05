use chia_bls::{aggregate, sign, SecretKey, Signature};
use chia_protocol::{Bytes32, CoinSpend};
use chia_puzzle_types::cat::{CatArgs, EverythingWithSignatureTailArgs};
use chia_puzzle_types::standard::StandardArgs;
use chia_bls::PublicKey;
use chia_sdk_signer::RequiredSignature;
use clvmr::Allocator;

use crate::constants::{issuer_pk, issuer_sk, Network};
use crate::error::Result;

/// The canonical wXCH asset id (the TAIL hash). This is the SHA-256 tree hash of
/// the `everything_with_signature` TAIL curried with the issuer public key, and
/// it is the single fungibility anchor for every wXCH coin.
pub fn wxch_asset_id() -> Bytes32 {
    EverythingWithSignatureTailArgs::curry_tree_hash(issuer_pk()).into()
}

/// The CAT2 outer puzzle hash for a wXCH coin with the given inner (p2) puzzle
/// hash. This is the on-chain `puzzle_hash` a wXCH coin lives at.
pub fn wxch_outer_puzzle_hash(inner_puzzle_hash: Bytes32) -> Bytes32 {
    CatArgs::curry_tree_hash(wxch_asset_id(), inner_puzzle_hash.into()).into()
}

/// The standard (p2_delegated_puzzle_or_hidden_puzzle) puzzle hash for a given
/// synthetic public key.
pub fn standard_puzzle_hash(synthetic_key: PublicKey) -> Bytes32 {
    StandardArgs::curry_tree_hash(synthetic_key).into()
}

/// Computes the issuer's partial BLS signature for a set of coin spends.
///
/// The TAIL emits a single `AGG_SIG_ME` condition signed by the issuer key on
/// every supply-changing spend (eve issuance on wrap, melt on burn). We let the
/// signer crate run each puzzle, collect every required signature, keep only the
/// ones bound to the issuer public key, sign them, and aggregate the result.
///
/// The user's wallet (Sage) contributes the remaining signatures for the
/// standard coins it controls; the two partial signatures aggregate into the
/// final spend-bundle signature.
pub fn issuer_partial_signature(coin_spends: &[CoinSpend], network: Network) -> Result<Signature> {
    partial_signature(coin_spends, network, &issuer_sk())
}

/// Computes the partial BLS signature contributed by a single secret key over a
/// set of coin spends: it signs exactly the `AGG_SIG` conditions whose public
/// key matches `sk`'s public key, and aggregates them.
///
/// This is the building block for both the issuer's partial signature and (in
/// tests) the wallet's partial signature, so the full aggregation path can be
/// validated end-to-end.
pub fn partial_signature(
    coin_spends: &[CoinSpend],
    network: Network,
    sk: &SecretKey,
) -> Result<Signature> {
    let constants = network.agg_sig_constants();
    let public_key = sk.public_key();

    let mut allocator = Allocator::new();
    let required = RequiredSignature::from_coin_spends(&mut allocator, coin_spends, &constants)?;

    let mut signatures = Vec::new();
    for requirement in required {
        if let RequiredSignature::Bls(bls) = requirement {
            if bls.public_key == public_key {
                signatures.push(sign(sk, bls.message()));
            }
        }
    }

    Ok(aggregate(&signatures))
}
