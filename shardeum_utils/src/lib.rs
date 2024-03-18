extern crate ethers;
extern crate hex;
extern crate secp256k1;

use ethers::types::{Address, H256, U256, transaction::eip2718::TypedTransaction};
use sha3::{Digest, Keccak256};

pub fn ecrecover(sig_hash: H256, v: u64, r: U256, s: U256, chainid: Option<U256>) -> Result<secp256k1::PublicKey, secp256k1::Error> {
    // Replicated from @ethereumjs/tx code
    // v accepts 0, 1, 27, 28 or chainid embbded to prevent replay attacks.
    let v_standard = match v {
        0 | 1 => v,
        _ => match chainid {
            Some(chainid) => v - (2 * chainid.as_u64() + 35),
            None => v - 27,
        },
    };

    if v_standard != 0 && v_standard != 1 {
        return Err(secp256k1::Error::InvalidRecoveryId);
    }

    let recovery_id = secp256k1::ecdsa::RecoveryId::from_i32(v_standard as i32)?;

    // * EIP-2: All transaction signatures whose s-value is greater than secp256k1n/2 are considered invalid.
    // * Reasoning: https://ethereum.stackexchange.com/a/55728
    let secp256k1n = U256::from_str_radix("FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141", 16).unwrap();

    if s > secp256k1n / U256::from(2u64) {
        return Err(secp256k1::Error::InvalidSignature);
    }

    let mut r_bytes = [0u8; 32];
    let mut s_bytes = [0u8; 32];
    r.to_big_endian(&mut r_bytes);
    s.to_big_endian(&mut s_bytes);

    let mut sig = [0u8; 64];
    sig[..32].copy_from_slice(&r_bytes);
    sig[32..].copy_from_slice(&s_bytes);
    let signature = secp256k1::ecdsa::RecoverableSignature::from_compact(&sig, recovery_id)?;

    let message = secp256k1::Message::from_digest(*sig_hash.as_fixed_bytes());

    signature.recover(&message)
}

pub fn pub_to_addr(pubkey: secp256k1::PublicKey) -> (Address, bool) {
    // check the length of the publickey
    let pub_key_serialized = pubkey.serialize_uncompressed();
    let is_valid = pub_key_serialized.len() == 65;

    // skip the first byte (0x04), which indicates an uncompressed public key
    let pub_key_bytes = &pub_key_serialized[1..];
    let hash = Keccak256::digest(pub_key_bytes);
    let mut address = Address::default();
    address.assign_from_slice(&hash[12..]);
    (address, is_valid)
}

pub fn get_transaction(raw_tx: &str) -> ethers::types::Transaction {
    let bytes = &hex::decode(raw_tx).unwrap();
    ethers::utils::rlp::decode::<ethers::types::Transaction>(bytes).unwrap()
}

pub fn get_typed_transaction(tx: &ethers::types::Transaction) -> ethers::types::transaction::eip2718::TypedTransaction {
    let typedtx: ethers::types::transaction::eip2718::TypedTransaction = Into::into(tx);
    typedtx
}

pub fn get_base_fee(tx: &ethers::types::transaction::eip2718::TypedTransaction) -> U256 {
    // current shardeum evm is in istanbul hardforks
    // legacy transaction gas fee is 21000
    let base_gas = U256::from(21000); // Base intrinsic gas for a transaction

    // Calculate gas for the transaction data
    // 4 gas for every zero byte of data or 16 gas for non-zero byte of data
    // legacy transaction data gas fee is 0
    let data_gas: U256 = tx
        .data()
        .map(|data| data.0.iter().fold(U256::zero(), |acc, &byte| acc + if byte == 0 { U256::from(4) } else { U256::from(16) }))
        .unwrap_or(U256::zero());

    // If the transaction is to a 'null' address (contract creation), add additional gas
    let creation_gas = match tx.to() {
        Some(to) if to.as_address().unwrap() == &Address::zero() => U256::from(32000),
        _ => U256::zero(),
    };

    base_gas + data_gas + creation_gas
}

pub fn zero_bigint() -> U256 {
    U256::zero()
}

#[cfg(test)]
mod tests {

    use ethers::types::transaction::eip2718::TypedTransaction;

    use super::*;

    #[test]
    fn test_ecrecover_eip2930() {
        let raw_tx = "01f90129821f9205832dc6c0832dc6c0946b92bdc43874fc19ead67ac7e37f2e126667b30780b844a9059cbb000000000000000000000000cd21d146980570e2dfb5f65a5881efbfdd882ab2000000000000000000000000000000000000000000000000016345785d8a0000f87cf87a946b92bdc43874fc19ead67ac7e37f2e126667b307f863a04d6102e88f63713248aa95286e545e26b440b909136464216b41036801218d26a0216d8091b2612eb7def258a018b1f2bdc6633976c86e5206357ff8385135f664a08066a4dac9c48b171b3aec8bfb10db23409617b8d8cc77acd57d766f7cc4f40080a0131cc2e628e7312f6f8ba901e83c75df0c780f99f588b3cd1d88d2d546140126a008e7e60fe3996a4601e4378d8a10c99ec30887d0dabdd6d8944b8c5a0c04caab";
        let expected_addr_str = "0x384913564a4b0b6f54adcac3c5fc627d69f9fe41";
        let bytes = &hex::decode(raw_tx).unwrap();
        let tx = ethers::utils::rlp::decode::<ethers::types::Transaction>(bytes).unwrap();

        //conversion typed transaction based on transaction type
        let typedtx: TypedTransaction = Into::into(&tx);
        let sighash = typedtx.sighash();

        let v = tx.v.as_u64();
        let r = tx.r;
        let s = tx.s;
        let pubkey = ecrecover(sighash, v + 27, r, s, None).unwrap();
        let (addr, is_valid) = pub_to_addr(pubkey);

        let addr_str = format!("{:?}", addr);

        assert_eq!(addr_str, expected_addr_str);
        assert!(is_valid);
    }

    #[test]
    fn test_ecrecover_legacy() {
        let raw_tx = "f86d5c853f84fc751682520894bd0a42d14bd5cb0fb787476ad777241c210e979e872386f26fc1000080823f48a0dea7f6599e38b40757e31b4747059a264795d587a202426600655a81d2d9a27ea0051d012a55da07ae557edbef305eea1a034df90519002f4e24787f9a218aa280";
        let expected_addr_str = "0x32b6f2c027d4c9d99ca07d047d17987390a5eb39";
        let bytes = &hex::decode(raw_tx).unwrap();
        let tx = ethers::utils::rlp::decode::<ethers::types::Transaction>(bytes).unwrap();

        let typedtx: TypedTransaction = Into::into(&tx);
        let sighash = typedtx.sighash();

        let v = tx.v.as_u64();
        let r = tx.r;
        let s = tx.s;

        let pubkey = ecrecover(sighash, v, r, s, tx.chain_id).unwrap();
        let (addr, is_valid) = pub_to_addr(pubkey);

        //format addr
        let addr_str = format!("{:?}", addr);

        assert_eq!(addr_str, expected_addr_str);
        assert!(is_valid);
    }

    #[test]
    fn test_gas_base_fee_legacy() {
        let raw_tx = "f86d5c853f84fc751682520894bd0a42d14bd5cb0fb787476ad777241c210e979e872386f26fc1000080823f48a0dea7f6599e38b40757e31b4747059a264795d587a202426600655a81d2d9a27ea0051d012a55da07ae557edbef305eea1a034df90519002f4e24787f9a218aa280";

        let tx = get_transaction(raw_tx);
        let typedtx = get_typed_transaction(&tx);
        let base_fee = get_base_fee(&typedtx);

        let zero_bigint = U256::zero();
        let gas_limit = typedtx.gas().unwrap_or(&zero_bigint);
        assert_eq!(base_fee, U256::from(21000));
        assert_eq!(gas_limit.as_u128(), 21000);
    }

    #[test]
    fn test_gas_base_fee_eip2930() {
        let raw_tx = "01f90129821f9205832dc6c0832dc6c0946b92bdc43874fc19ead67ac7e37f2e126667b30780b844a9059cbb000000000000000000000000cd21d146980570e2dfb5f65a5881efbfdd882ab2000000000000000000000000000000000000000000000000016345785d8a0000f87cf87a946b92bdc43874fc19ead67ac7e37f2e126667b307f863a04d6102e88f63713248aa95286e545e26b440b909136464216b41036801218d26a0216d8091b2612eb7def258a018b1f2bdc6633976c86e5206357ff8385135f664a08066a4dac9c48b171b3aec8bfb10db23409617b8d8cc77acd57d766f7cc4f40080a0131cc2e628e7312f6f8ba901e83c75df0c780f99f588b3cd1d88d2d546140126a008e7e60fe3996a4601e4378d8a10c99ec30887d0dabdd6d8944b8c5a0c04caab";
        let tx = get_transaction(raw_tx);
        let typedtx = get_typed_transaction(&tx);

        let base_fee = get_base_fee(&typedtx);
        let zero_bigint = U256::zero();
        let gas_limit = typedtx.gas().unwrap_or(&zero_bigint);

        let valid = base_fee.as_u128() < gas_limit.as_u128();

        assert!(valid);
        assert_eq!(gas_limit.as_u128(), U256::from(3000000).as_u128());
    }
}
