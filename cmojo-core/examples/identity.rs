//! Prints the deterministic cMojo asset id and issuer public key. Useful for
//! populating the frontend's environment variables.
fn main() {
    println!(
        "NEXT_PUBLIC_CMOJO_ASSET_ID=0x{}",
        hex::encode(cmojo_core::tail::cmojo_asset_id().to_bytes())
    );
    println!(
        "issuer_public_key=0x{}",
        hex::encode(cmojo_core::constants::issuer_pk().to_bytes())
    );
}
