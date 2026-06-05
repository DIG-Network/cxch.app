use chia_bls::PublicKey;
use chia_protocol::{Bytes32, Coin, CoinSpend};
use chia_puzzle_types::LineageProof;
use chia_sdk_driver::{Cat, CatInfo};
use serde::{Deserialize, Serialize};

use crate::error::{Error, Result};
use crate::spend::{StandardCoin, UnsignedSpendBundle, WxchCoin};
use crate::tail::{standard_puzzle_hash, wxch_asset_id};

// ---------------------------------------------------------------------------
// Input DTOs
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Deserialize)]
pub struct CoinDto {
    pub parent_coin_info: String,
    pub puzzle_hash: String,
    #[serde(deserialize_with = "de_u64")]
    pub amount: u64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct LineageProofDto {
    pub parent_parent_coin_info: String,
    pub parent_inner_puzzle_hash: String,
    #[serde(deserialize_with = "de_u64")]
    pub parent_amount: u64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct StandardCoinDto {
    pub coin: CoinDto,
    pub synthetic_key: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct WxchCoinDto {
    pub coin: CoinDto,
    pub lineage_proof: LineageProofDto,
    pub synthetic_key: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct WrapRequestDto {
    pub xch_coins: Vec<StandardCoinDto>,
    pub recipient_puzzle_hash: String,
    pub change_puzzle_hash: String,
    #[serde(deserialize_with = "de_u64")]
    pub mint_amount_mojos: u64,
    #[serde(deserialize_with = "de_u64")]
    pub fee_mojos: u64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct MeltRequestDto {
    pub wxch_coins: Vec<WxchCoinDto>,
    pub anchor_coins: Vec<StandardCoinDto>,
    pub recipient_puzzle_hash: String,
    pub cat_change_puzzle_hash: String,
    #[serde(deserialize_with = "de_u64")]
    pub melt_amount_mojos: u64,
    #[serde(deserialize_with = "de_u64")]
    pub fee_mojos: u64,
}

// ---------------------------------------------------------------------------
// Output DTOs
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
pub struct CoinOut {
    pub parent_coin_info: String,
    pub puzzle_hash: String,
    pub amount: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct CoinSpendOut {
    pub coin: CoinOut,
    pub puzzle_reveal: String,
    pub solution: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct UnsignedSpendBundleOut {
    pub coin_spends: Vec<CoinSpendOut>,
    pub issuer_partial_signature: String,
}

// ---------------------------------------------------------------------------
// Conversions
// ---------------------------------------------------------------------------

impl CoinDto {
    pub fn to_coin(&self) -> Result<Coin> {
        Ok(Coin::new(
            parse_bytes32(&self.parent_coin_info)?,
            parse_bytes32(&self.puzzle_hash)?,
            self.amount,
        ))
    }
}

impl StandardCoinDto {
    pub fn to_standard_coin(&self) -> Result<StandardCoin> {
        Ok(StandardCoin {
            coin: self.coin.to_coin()?,
            synthetic_key: parse_pk(&self.synthetic_key)?,
        })
    }
}

impl LineageProofDto {
    pub fn to_lineage_proof(&self) -> Result<LineageProof> {
        Ok(LineageProof {
            parent_parent_coin_info: parse_bytes32(&self.parent_parent_coin_info)?,
            parent_inner_puzzle_hash: parse_bytes32(&self.parent_inner_puzzle_hash)?,
            parent_amount: self.parent_amount,
        })
    }
}

impl WxchCoinDto {
    pub fn to_wxch_coin(&self) -> Result<WxchCoin> {
        let synthetic_key = parse_pk(&self.synthetic_key)?;
        let p2_puzzle_hash = standard_puzzle_hash(synthetic_key);
        let info = CatInfo::new(wxch_asset_id(), None, p2_puzzle_hash);
        let cat = Cat::new(
            self.coin.to_coin()?,
            Some(self.lineage_proof.to_lineage_proof()?),
            info,
        );
        Ok(WxchCoin {
            cat,
            synthetic_key,
        })
    }
}

impl UnsignedSpendBundleOut {
    pub fn from_bundle(bundle: &UnsignedSpendBundle) -> Self {
        Self {
            coin_spends: bundle.coin_spends.iter().map(coin_spend_out).collect(),
            issuer_partial_signature: to_hex(&bundle.issuer_signature.to_bytes()),
        }
    }
}

fn coin_spend_out(spend: &CoinSpend) -> CoinSpendOut {
    CoinSpendOut {
        coin: CoinOut {
            parent_coin_info: to_hex(&spend.coin.parent_coin_info.to_bytes()),
            puzzle_hash: to_hex(&spend.coin.puzzle_hash.to_bytes()),
            amount: spend.coin.amount,
        },
        puzzle_reveal: to_hex(spend.puzzle_reveal.as_slice()),
        solution: to_hex(spend.solution.as_slice()),
    }
}

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

/// Parses a 32-byte value from a hex string, with or without a `0x` prefix.
pub fn parse_bytes32(value: &str) -> Result<Bytes32> {
    let bytes = parse_hex(value)?;
    let array: [u8; 32] = bytes.try_into().map_err(|v: Vec<u8>| Error::BadLength(v.len()))?;
    Ok(Bytes32::new(array))
}

/// Parses a 48-byte BLS public key from a hex string.
pub fn parse_pk(value: &str) -> Result<PublicKey> {
    let bytes = parse_hex(value)?;
    let array: [u8; 48] = bytes.try_into().map_err(|v: Vec<u8>| Error::BadLength(v.len()))?;
    PublicKey::from_bytes(&array).map_err(|e| Error::Bls(format!("{e:?}")))
}

fn parse_hex(value: &str) -> Result<Vec<u8>> {
    let trimmed = value.strip_prefix("0x").unwrap_or(value);
    Ok(hex::decode(trimmed)?)
}

fn to_hex(bytes: &[u8]) -> String {
    format!("0x{}", hex::encode(bytes))
}

/// Deserializes a `u64` from either a JSON number or a decimal string. Strings
/// are accepted so that JavaScript can pass amounts larger than `2^53` without
/// losing precision.
fn de_u64<'de, D>(deserializer: D) -> std::result::Result<u64, D::Error>
where
    D: serde::Deserializer<'de>,
{
    use serde::de::Error as DeError;

    #[derive(Deserialize)]
    #[serde(untagged)]
    enum NumOrStr {
        Num(u64),
        Float(f64),
        Str(String),
    }

    match NumOrStr::deserialize(deserializer)? {
        NumOrStr::Num(n) => Ok(n),
        NumOrStr::Float(f) => {
            if f < 0.0 || f.fract() != 0.0 {
                return Err(D::Error::custom("amount must be a non-negative integer"));
            }
            Ok(f as u64)
        }
        NumOrStr::Str(s) => s
            .trim()
            .parse::<u64>()
            .map_err(|e| D::Error::custom(format!("invalid amount '{s}': {e}"))),
    }
}
