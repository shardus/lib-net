extern crate ethers;
extern crate secp256k1;
extern crate hex;

use ethers::types::{H256, U256, Address};
use sha3::{Digest, Keccak256};

pub fn ecrecover(sig_hash: H256, v: u64, r: U256, s: U256, chainid: Option<U256>) -> Result<secp256k1::PublicKey, secp256k1::Error> {

    // Replicated from @ethereumjs/tx code
    // v accepts 0, 1, 27, 28 or chainid embbded to prevent replay attacks.
    let v_standard = match v {
        0 | 1 => v,
        _ => {
            match chainid {
                Some(chainid) => v - (2 * chainid.as_u64() + 35),
                None => v - 27,
            }
        }
    };

    if v_standard != 0 && v_standard != 1 {
        return Err(secp256k1::Error::InvalidRecoveryId);
    }

    let recovery_id = secp256k1::ecdsa::RecoveryId::from_i32(v_standard as i32)?;

   // * EIP-2: All transaction signatures whose s-value is greater than secp256k1n/2are considered invalid.
   // * Reasoning: https://ethereum.stackexchange.com/a/55728
   let secp256k1n = U256::from_str_radix(
        "FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141",
        16
    ).unwrap();

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

    // Skip the first byte (0x04), which indicates an uncompressed public key
    let pub_key_bytes = &pub_key_serialized[1..];
    let hash = Keccak256::digest(pub_key_bytes);
    let mut address = Address::default();
    address.assign_from_slice(&hash[12..]);
    (address, is_valid)
}

pub fn get_transaction(raw_tx: &str) -> ethers::types::Transaction {
    let bytes = &hex::decode(raw_tx).unwrap();
    let tx = ethers::utils::rlp::decode::<ethers::types::Transaction>(bytes).unwrap();
    tx
}

pub fn get_typed_transaction(raw_tx: &str) -> ethers::types::transaction::eip2718::TypedTransaction {
    let bytes = &hex::decode(raw_tx).unwrap();
    let tx = ethers::utils::rlp::decode::<ethers::types::transaction::eip2718::TypedTransaction>(bytes).unwrap();
    tx
}


// test
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ecrecover() {

        let raw_tx = "01f90129821f9205832dc6c0832dc6c0946b92bdc43874fc19ead67ac7e37f2e126667b30780b844a9059cbb000000000000000000000000cd21d146980570e2dfb5f65a5881efbfdd882ab2000000000000000000000000000000000000000000000000016345785d8a0000f87cf87a946b92bdc43874fc19ead67ac7e37f2e126667b307f863a04d6102e88f63713248aa95286e545e26b440b909136464216b41036801218d26a0216d8091b2612eb7def258a018b1f2bdc6633976c86e5206357ff8385135f664a08066a4dac9c48b171b3aec8bfb10db23409617b8d8cc77acd57d766f7cc4f40080a0131cc2e628e7312f6f8ba901e83c75df0c780f99f588b3cd1d88d2d546140126a008e7e60fe3996a4601e4378d8a10c99ec30887d0dabdd6d8944b8c5a0c04caab";
        let expected_addr_str = "0x384913564a4b0b6f54adcac3c5fc627d69f9fe41";
        let bytes = &hex::decode(raw_tx).unwrap();
        let typedtx = ethers::utils::rlp::decode::<ethers::types::transaction::eip2718::TypedTransaction>(bytes).unwrap();
        let tx = ethers::utils::rlp::decode::<ethers::types::Transaction>(bytes).unwrap();

        let sighash = typedtx.sighash();
    
        let v = tx.v.as_u64();
        let r = tx.r;
        let s = tx.s;
        let pubkey = ecrecover(sighash, v, r, s, tx.chain_id).unwrap();
        let (addr, is_valid) = pub_to_addr(pubkey);

        //format addr
        let addr_str = format!("{:?}", addr);
    
        // println!("recovered address: {:?}", addr_str);
        // println!("expected address: {:?}", addr_str);

        assert_eq!(addr_str, expected_addr_str);
        assert_eq!(is_valid, true);
    }

}
