//! Prints the deterministic cXCH asset id and issuer public key. Useful for
//! populating the frontend's environment variables.
fn main() {
    println!(
        "NEXT_PUBLIC_CXCH_ASSET_ID=0x{}",
        hex::encode(cxch_core::tail::cxch_asset_id().to_bytes())
    );
    println!(
        "issuer_public_key=0x{}",
        hex::encode(cxch_core::constants::issuer_pk().to_bytes())
    );
}
