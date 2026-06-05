//! wXCH spend-bundle builder.
//!
//! This crate builds the unsigned coin spends for wrapping (minting) and melting
//! (burning) wXCH, a 1:1 wrapped representation of native XCH expressed as a
//! CAT2 token. It compiles both to a native library (for the simulator tests)
//! and to WebAssembly (consumed by the Next.js frontend).
//!
//! The public WebAssembly surface lives at the bottom of this file; the pure
//! Rust API lives in the [`wrap`] and [`melt`] modules.

pub mod constants;
pub mod dto;
pub mod error;
pub mod melt;
pub mod spend;
pub mod tail;
pub mod wrap;

pub use constants::Network;
pub use error::{Error, Result};

use chia_bls::{aggregate, Signature};
use chia_puzzle_types::DeriveSynthetic;
use chia_sdk_utils::Address;
use serde::Serialize;
use wasm_bindgen::prelude::*;

use crate::dto::{parse_bytes32, parse_pk, MeltRequestDto, UnsignedSpendBundleOut, WrapRequestDto};

/// Serializes a value into a JSON-compatible `JsValue` (numbers stay as JS
/// numbers rather than `BigInt`, so the result survives `JSON.stringify`).
fn to_js<T: Serialize>(value: &T) -> std::result::Result<JsValue, JsValue> {
    let serializer = serde_wasm_bindgen::Serializer::json_compatible();
    value
        .serialize(&serializer)
        .map_err(|e| JsError::new(&e.to_string()).into())
}

/// The canonical wXCH asset id (TAIL hash), as a `0x`-prefixed hex string.
#[wasm_bindgen]
pub fn wxch_asset_id() -> String {
    format!("0x{}", hex::encode(tail::wxch_asset_id().to_bytes()))
}

/// The wXCH issuer public key, as a `0x`-prefixed hex string.
#[wasm_bindgen]
pub fn issuer_public_key() -> String {
    format!("0x{}", hex::encode(constants::issuer_pk().to_bytes()))
}

/// The CAT2 outer puzzle hash for a wXCH coin with the given inner puzzle hash.
#[wasm_bindgen]
pub fn wxch_outer_puzzle_hash(inner_puzzle_hash: String) -> std::result::Result<String, JsValue> {
    let inner = parse_bytes32(&inner_puzzle_hash)?;
    Ok(format!(
        "0x{}",
        hex::encode(tail::wxch_outer_puzzle_hash(inner).to_bytes())
    ))
}

/// The standard puzzle hash for a synthetic public key.
#[wasm_bindgen]
pub fn standard_puzzle_hash(synthetic_key: String) -> std::result::Result<String, JsValue> {
    let key = parse_pk(&synthetic_key)?;
    Ok(format!(
        "0x{}",
        hex::encode(tail::standard_puzzle_hash(key).to_bytes())
    ))
}

/// Derives the synthetic public key (with the default hidden puzzle) from an
/// observer public key. Wallets expose observer keys; the standard puzzle is
/// curried with the synthetic key.
#[wasm_bindgen]
pub fn derive_synthetic_key(observer_key: String) -> std::result::Result<String, JsValue> {
    let key = parse_pk(&observer_key)?;
    Ok(format!(
        "0x{}",
        hex::encode(key.derive_synthetic().to_bytes())
    ))
}

/// Converts a bech32m address into a `0x`-prefixed puzzle hash.
#[wasm_bindgen]
pub fn address_to_puzzle_hash(address: String) -> std::result::Result<String, JsValue> {
    let decoded = Address::decode(&address).map_err(|e| JsError::new(&e.to_string()))?;
    Ok(format!("0x{}", hex::encode(decoded.puzzle_hash.to_bytes())))
}

/// Converts a `0x`-prefixed puzzle hash into a mainnet (`xch`) bech32m address.
#[wasm_bindgen]
pub fn puzzle_hash_to_address(puzzle_hash: String) -> std::result::Result<String, JsValue> {
    let ph = parse_bytes32(&puzzle_hash)?;
    let address = Address::new(ph, Network::Mainnet.address_prefix().to_string())
        .encode()
        .map_err(|e| JsError::new(&e.to_string()))?;
    Ok(address)
}

/// Builds the unsigned coin spends for a wrap (mint) operation.
#[wasm_bindgen]
pub fn build_wrap_spends(request: JsValue) -> std::result::Result<JsValue, JsValue> {
    let dto: WrapRequestDto = serde_wasm_bindgen::from_value(request)
        .map_err(|e| Error::Serde(e.to_string()))?;

    let mut xch_coins = Vec::with_capacity(dto.xch_coins.len());
    for coin in &dto.xch_coins {
        xch_coins.push(coin.to_standard_coin()?);
    }

    let params = wrap::WrapParams {
        xch_coins,
        recipient_puzzle_hash: parse_bytes32(&dto.recipient_puzzle_hash)?,
        change_puzzle_hash: parse_bytes32(&dto.change_puzzle_hash)?,
        mint_amount: dto.mint_amount_mojos,
        fee: dto.fee_mojos,
        network: Network::Mainnet,
    };

    let bundle = wrap::build_wrap(params)?;
    to_js(&UnsignedSpendBundleOut::from_bundle(&bundle))
}

/// Builds the unsigned coin spends for a melt (burn) operation.
#[wasm_bindgen]
pub fn build_melt_spends(request: JsValue) -> std::result::Result<JsValue, JsValue> {
    let dto: MeltRequestDto = serde_wasm_bindgen::from_value(request)
        .map_err(|e| Error::Serde(e.to_string()))?;

    let mut wxch_coins = Vec::with_capacity(dto.wxch_coins.len());
    for coin in &dto.wxch_coins {
        wxch_coins.push(coin.to_wxch_coin()?);
    }
    let mut anchor_coins = Vec::with_capacity(dto.anchor_coins.len());
    for coin in &dto.anchor_coins {
        anchor_coins.push(coin.to_standard_coin()?);
    }

    let params = melt::MeltParams {
        wxch_coins,
        anchor_coins,
        recipient_puzzle_hash: parse_bytes32(&dto.recipient_puzzle_hash)?,
        cat_change_puzzle_hash: parse_bytes32(&dto.cat_change_puzzle_hash)?,
        melt_amount: dto.melt_amount_mojos,
        fee: dto.fee_mojos,
        network: Network::Mainnet,
    };

    let bundle = melt::build_melt(params)?;
    to_js(&UnsignedSpendBundleOut::from_bundle(&bundle))
}

/// Aggregates a list of `0x`-prefixed hex BLS signatures into one. Used to
/// combine the wallet's partial signature with the issuer's partial signature.
#[wasm_bindgen]
pub fn aggregate_signatures(signatures: Vec<String>) -> std::result::Result<String, JsValue> {
    let mut parsed = Vec::with_capacity(signatures.len());
    for sig in &signatures {
        let trimmed = sig.strip_prefix("0x").unwrap_or(sig);
        let bytes = hex::decode(trimmed).map_err(Error::from)?;
        let array: [u8; 96] = bytes
            .try_into()
            .map_err(|v: Vec<u8>| Error::BadLength(v.len()))?;
        let signature =
            Signature::from_bytes(&array).map_err(|e| Error::Bls(format!("{e:?}")))?;
        parsed.push(signature);
    }
    Ok(format!("0x{}", hex::encode(aggregate(&parsed).to_bytes())))
}
