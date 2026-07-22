use chia_bls::{PublicKey, SecretKey};
use chia_protocol::Bytes32;
use chia_sdk_signer::AggSigConstants;
use chia_sdk_types::{MAINNET_CONSTANTS, TESTNET11_CONSTANTS};

/// The genesis challenge of the Chia mainnet, which is also the
/// `AGG_SIG_ME` additional data used when validating signatures.
pub const MAINNET_GENESIS_CHALLENGE: [u8; 32] =
    hex_lit(b"ccd5bb71183532bff220ba46c268991a3ff07eb358e8255a65c30a2dce0e5fbb");

/// The genesis challenge of testnet11.
pub const TESTNET11_GENESIS_CHALLENGE: [u8; 32] =
    hex_lit(b"37a90eb5185a9c4439a91ddc98bbadce7b4feba060d50116a067de66bf236615");

/// The cMojo issuer secret key. This key is published **on purpose**: the
/// `everything_with_signature` TAIL only authorises the *supply change*, while
/// Chia consensus independently enforces the 1:1 mojo backing. Publishing the
/// key therefore makes minting and melting permissionless without weakening the
/// peg. See the white paper, §1.3 and §7.4.
pub const ISSUER_SK_BYTES: [u8; 32] =
    hex_lit(b"0000000000000000000000000000000000000000000000000000000063786368");

/// The cMojo issuer secret key.
pub fn issuer_sk() -> SecretKey {
    SecretKey::from_bytes(&ISSUER_SK_BYTES).expect("issuer secret key is a valid BLS scalar")
}

/// The cMojo issuer public key. This is curried into the TAIL and therefore
/// determines the single canonical cMojo asset id.
pub fn issuer_pk() -> PublicKey {
    issuer_sk().public_key()
}

/// The two networks this dApp supports.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Network {
    Mainnet,
    Testnet11,
}

impl Network {
    /// The bech32m address prefix for this network.
    pub fn address_prefix(self) -> &'static str {
        match self {
            Network::Mainnet => "xch",
            Network::Testnet11 => "txch",
        }
    }

    /// The genesis challenge for this network.
    pub fn genesis_challenge(self) -> Bytes32 {
        match self {
            Network::Mainnet => Bytes32::new(MAINNET_GENESIS_CHALLENGE),
            Network::Testnet11 => Bytes32::new(TESTNET11_GENESIS_CHALLENGE),
        }
    }

    /// The `AGG_SIG_ME` signing constants for this network, used to compute the
    /// exact message the issuer key must sign.
    pub fn agg_sig_constants(self) -> AggSigConstants {
        match self {
            Network::Mainnet => AggSigConstants::from(&*MAINNET_CONSTANTS),
            Network::Testnet11 => AggSigConstants::from(&*TESTNET11_CONSTANTS),
        }
    }
}

/// The 0.1% dev fee, in basis points, applied to every wrap and melt built by
/// this dApp. The fee is paid as an ordinary XCH output to [`DEV_FEE_ADDRESS`]
/// inside the same spend bundle. This is a dApp builder convention, NOT a
/// protocol requirement — bundles built elsewhere don't need it.
pub const DEV_FEE_BASIS_POINTS: u64 = 10;

/// The dev fee recipient address.
pub const DEV_FEE_ADDRESS: &str =
    "xch1qza35raa2yezce9kvf5z76qgrajpa8dlv0eg63q7dpel3h78hgystyyehc";

/// The dev fee recipient puzzle hash (decoded from [`DEV_FEE_ADDRESS`]).
pub fn dev_fee_puzzle_hash() -> Bytes32 {
    chia_sdk_utils::Address::decode(DEV_FEE_ADDRESS)
        .expect("dev fee address is a valid bech32m address")
        .puzzle_hash
}

/// The dev fee in mojos for a wrap/melt of `amount` mojos: 0.1%, floored.
/// Amounts under 1000 mojos round to a fee of zero (no output is added).
pub fn dev_fee(amount: u64) -> u64 {
    ((amount as u128 * DEV_FEE_BASIS_POINTS as u128) / 10_000) as u64
}

/// Compile-time hex literal decoder for fixed 32-byte arrays.
const fn hex_lit(hex: &[u8; 64]) -> [u8; 32] {
    let mut out = [0u8; 32];
    let mut i = 0;
    while i < 32 {
        out[i] = (nibble(hex[i * 2]) << 4) | nibble(hex[i * 2 + 1]);
        i += 1;
    }
    out
}

const fn nibble(c: u8) -> u8 {
    match c {
        b'0'..=b'9' => c - b'0',
        b'a'..=b'f' => c - b'a' + 10,
        b'A'..=b'F' => c - b'A' + 10,
        _ => panic!("invalid hex nibble"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Pins the dev-fee formula to 0.1% (10 bps), floored — the single source of
    /// truth the WASM `dev_fee` export and the frontend both consume. Any drift
    /// here would desync the UI fee preview from the amount the builder spends.
    #[test]
    fn dev_fee_is_ten_basis_points_floored() {
        // Golden vectors shared with the frontend parity test (fees.test.ts):
        // fee = floor(amount * 10 / 10_000).
        assert_eq!(dev_fee(0), 0);
        assert_eq!(dev_fee(999), 0); // under 1000 mojos rounds to zero
        assert_eq!(dev_fee(1_000), 1);
        assert_eq!(dev_fee(9_999), 9);
        assert_eq!(dev_fee(10_000), 10);
        assert_eq!(dev_fee(1_000_000_000_000), 1_000_000_000); // 1 XCH → 0.001 XCH
        assert_eq!(dev_fee(u64::MAX), (u64::MAX as u128 * 10 / 10_000) as u64);
    }
}
