use thiserror::Error;

/// All errors that can be produced while building a wXCH spend bundle.
#[derive(Debug, Error)]
pub enum Error {
    #[error("driver error: {0}")]
    Driver(#[from] chia_sdk_driver::DriverError),

    #[error("signer error: {0}")]
    Signer(#[from] chia_sdk_signer::SignerError),

    #[error("hex decode error: {0}")]
    Hex(#[from] hex::FromHexError),

    #[error("expected a 32-byte value, got {0} bytes")]
    BadLength(usize),

    #[error("invalid BLS key or signature: {0}")]
    Bls(String),

    #[error("invalid integer: {0}")]
    Int(#[from] std::num::ParseIntError),

    #[error("at least one input coin is required for {0}")]
    NoCoins(&'static str),

    #[error("insufficient funds: have {have} mojos, need {need} mojos")]
    InsufficientFunds { have: u64, need: u64 },

    #[error("amount must be greater than zero")]
    ZeroAmount,

    #[error("the melt fee ({fee}) exceeds the total redeemable XCH ({redeemable})")]
    FeeExceedsRedeemable { fee: u64, redeemable: u64 },

    #[error("serde error: {0}")]
    Serde(String),
}

impl From<Error> for wasm_bindgen::JsValue {
    fn from(err: Error) -> Self {
        wasm_bindgen::JsError::new(&err.to_string()).into()
    }
}

pub type Result<T> = std::result::Result<T, Error>;
