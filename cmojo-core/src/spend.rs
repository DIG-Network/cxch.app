use chia_bls::{PublicKey, Signature};
use chia_protocol::{Coin, CoinSpend};
use chia_sdk_driver::Cat;

/// An XCH coin together with the synthetic public key that controls it. The
/// synthetic key is required to reconstruct the standard puzzle reveal.
#[derive(Debug, Clone, Copy)]
pub struct StandardCoin {
    pub coin: Coin,
    pub synthetic_key: PublicKey,
}

/// A cMojo CAT coin together with the synthetic public key controlling its inner
/// (p2) puzzle. The [`Cat`] carries its own lineage proof and asset info.
#[derive(Debug, Clone, Copy)]
pub struct CmojoCoin {
    pub cat: Cat,
    pub synthetic_key: PublicKey,
}

/// The result of building a wrap or melt: a set of unsigned coin spends plus the
/// issuer's partial signature over the TAIL conditions. The frontend asks the
/// wallet to sign the coin spends, then aggregates the wallet's partial
/// signature with [`UnsignedSpendBundle::issuer_signature`] to form the final
/// `SpendBundle`.
#[derive(Debug, Clone)]
pub struct UnsignedSpendBundle {
    pub coin_spends: Vec<CoinSpend>,
    pub issuer_signature: Signature,
    /// The resulting CAT coins created by this bundle: the minted cMojo coins for
    /// a wrap, or the leftover cMojo change for a melt. Useful for predicting the
    /// next coin to spend without waiting for a block.
    pub cat_outputs: Vec<Cat>,
}
