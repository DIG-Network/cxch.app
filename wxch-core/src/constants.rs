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

/// The wXCH issuer secret key. This key is published **on purpose**: the
/// `everything_with_signature` TAIL only authorises the *supply change*, while
/// Chia consensus independently enforces the 1:1 mojo backing. Publishing the
/// key therefore makes minting and melting permissionless without weakening the
/// peg. See the white paper, §1.3 and §7.4.
pub const ISSUER_SK_BYTES: [u8; 32] =
    hex_lit(b"0000000000000000000000000000000000000000000000000000000077786368");

/// The wXCH issuer secret key.
pub fn issuer_sk() -> SecretKey {
    SecretKey::from_bytes(&ISSUER_SK_BYTES).expect("issuer secret key is a valid BLS scalar")
}

/// The wXCH issuer public key. This is curried into the TAIL and therefore
/// determines the single canonical wXCH asset id.
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
