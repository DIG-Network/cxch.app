//! Prints the deterministic wXCH asset id and issuer public key. Useful for
//! populating the frontend's environment variables.
fn main() {
    println!(
        "NEXT_PUBLIC_WXCH_ASSET_ID=0x{}",
        hex::encode(wxch_core::tail::wxch_asset_id().to_bytes())
    );
    println!(
        "issuer_public_key=0x{}",
        hex::encode(wxch_core::constants::issuer_pk().to_bytes())
    );
}
