use core::fmt;

extern crate sodiumoxide;

type HexString = String;
type Buffer = Vec<u8>;

pub enum Format {
    Hex,
    Buffer,
}

pub enum HexStringOrBuffer {
    Hex(HexString),
    Buffer(Buffer),
}

impl fmt::Display for HexStringOrBuffer {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            HexStringOrBuffer::Hex(s) => write!(f, "{}", s),
            HexStringOrBuffer::Buffer(bytes) => {
                for b in bytes {
                    write!(f, "{:02X}", b)?;
                }
                Ok(())
            }
        }
    }
}

pub struct ShardusCrypto {
    hash_key: Buffer,
}
impl ShardusCrypto {
    /// Creates a new ShardusCrypto instance with the given key.
    ///
    /// # Arguments
    ///
    /// * `key` - A hexadecimal string representing the hash key used for cryptographic operations.
    ///
    /// # Panics
    ///
    /// Panics if initialization of sodiumoxide fails
    pub fn new(key: &str) -> ShardusCrypto {
        sodiumoxide::init().expect("Failed to initialize sodiumoxide");
        ShardusCrypto {
            hash_key: sodiumoxide::hex::decode(key).expect("Cannot initialize shardus crypto because hash key is not valid hex").to_vec(),
        }
    }

    /// Hashes the input string using the specified format.
    ///
    /// # Arguments
    ///
    /// * `input` - The input string to be hashed.
    /// * `fmt` - The desired format for the output (Hex or Buffer).
    ///
    /// # Panics
    ///
    /// Panics if the input cannot be hashed.
    pub fn hash(&self, input: &String, fmt: Format) -> HexStringOrBuffer {
        let digest = sodiumoxide::crypto::generichash::hash(&input.as_bytes(), Some(32), Some(&self.hash_key)).expect("Cannot digest input");

        match fmt {
            Format::Hex => HexStringOrBuffer::Hex(sodiumoxide::hex::encode(&digest)),
            Format::Buffer => HexStringOrBuffer::Buffer(digest.as_ref().to_vec()),
        }
    }

    /// Signs the input data using the provided secret key.
    ///
    /// # Arguments
    ///
    /// * `input` - The data to be signed (in Hex or Buffer format).
    /// * `sk` - The secret key used for signing (in Hex or Buffer format).
    ///
    /// # Errors
    ///
    /// Returns an error if the input or secret key is not a valid hexadecimal data.
    ///
    /// # Panics
    ///
    /// Panics if the secret key is not of a valid length.
    pub fn sign(&self, input: HexStringOrBuffer, sk: &HexStringOrBuffer) -> Result<HexString, Box<dyn std::error::Error>> {
        // Convert input to a Vec<u8>
        let input_buf = match input {
            HexStringOrBuffer::Hex(hex) => sodiumoxide::hex::decode(hex).map_err(|_| "Invalid hex format for input.")?,
            HexStringOrBuffer::Buffer(buf) => buf,
        };

        // Convert secret key to a Vec<u8>
        let sk_buf_vec = match sk {
            HexStringOrBuffer::Hex(hex) => sodiumoxide::hex::decode(hex).map_err(|_| "Invalid hex format for secret key.")?,
            HexStringOrBuffer::Buffer(buf) => buf.clone(),
        };

        // Ensure sk_buf corresponds to valid SecretKey size.
        let mut sk_buf = [0u8; sodiumoxide::crypto::sign::SECRETKEYBYTES];
        sk_buf.copy_from_slice(&sk_buf_vec[..sodiumoxide::crypto::sign::SECRETKEYBYTES]);

        if sk_buf_vec.len() != sodiumoxide::crypto::sign::SECRETKEYBYTES {
            panic!("Invalid secret key length.");
        }

        let secret_key = sodiumoxide::crypto::sign::SecretKey(sk_buf);

        // Sign the input using the secret key
        let signed_message = sodiumoxide::crypto::sign::sign(&input_buf, &secret_key);

        Ok(sodiumoxide::hex::encode(&signed_message))
    }

    /// Verifies a signature using the provided public key.
    ///
    /// # Arguments
    ///
    /// * `_msg` - The message to verify.
    /// * `_sig` - The signature (including message) to verify.
    /// * `_pk` - The public key used for verification.
    ///
    /// # Panics
    ///
    /// Panics if the signature or PublicKey is not of valid length.
    pub fn verify(&self, _msg: &String, _sig: &HexStringOrBuffer, _pk: &HexStringOrBuffer) -> bool {
        // Convert public key to a Vec<u8>
        let pk_buf = match _pk {
            HexStringOrBuffer::Hex(hex) => sodiumoxide::hex::decode(hex).expect("Invalid hex format for public key"),
            HexStringOrBuffer::Buffer(buf) => buf.clone(),
        };

        let pk = sodiumoxide::crypto::sign::PublicKey::from_slice(&pk_buf).expect("Couldn't convert public key to bytes");

        // Convert signature to a Vec<u8>
        let sig_buf = match _sig {
            HexStringOrBuffer::Hex(hex) => sodiumoxide::hex::decode(hex).expect("Invalid hex format for signature"),
            HexStringOrBuffer::Buffer(buf) => buf.clone(),
        };

        let opened = sodiumoxide::crypto::sign::verify(&sig_buf.as_slice(), &pk);

        match opened {
            Ok(opened_msg) => sodiumoxide::hex::encode(opened_msg) == _msg.clone(),
            Err(_) => false,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hash() {
        let sc = ShardusCrypto::new("64f152869ca2d473e4ba64ab53f49ccdb2edae22da192c126850970e788af347");

        let result = sc.hash(&"hello world".to_string(), Format::Hex);

        println!("Shardus-crypto compatibility Test: hash - result: {}", result.to_string());

        // this hashed comes from shardus-crypto-utils nodejs library with the same input string and hash key
        let expected = "463bad7a09d224af5251be7d979cc8db3df37c422ea38d6c3986c54ee9c8f116".to_string();

        assert_eq!(expected, result.to_string());
    }

    #[test]
    fn test_sign() {
        let sc = ShardusCrypto::new("64f152869ca2d473e4ba64ab53f49ccdb2edae22da192c126850970e788af347");

        let (_pk, sk) = (
            HexStringOrBuffer::Hex("8088b37f6f458104515ae18c2a05bde890199322f62ab5114d20c77bde5e6c9d".to_string()),
            HexStringOrBuffer::Hex("c3774b92cc8850fb4026b073081290b82cab3c0f66cac250b4d710ee9aaf83ed8088b37f6f458104515ae18c2a05bde890199322f62ab5114d20c77bde5e6c9d".to_string()),
        );

        let some_hex_string = "1234567890abcdef".to_string();
        let buffer_fed_sig = sc
            .sign(HexStringOrBuffer::Buffer(sodiumoxide::hex::decode(some_hex_string.clone()).unwrap()), &sk)
            .expect("Couldn't sign buffer");
        let str_fed_sig = sc.sign(HexStringOrBuffer::Hex(some_hex_string), &sk).expect("Couldn't sign hex string");

        // this signature came from shardus-crypto-utils nodejs library with the same inputs and same hash key
        let expected_sig = "cd1159381c39554a07309b0a0803a0cef4a85eb78685086f8ccbd06fe846bbd260bd8cd1ae9c4eff6af672be72c2a18d561793a301986276af999f2fd49477011234567890abcdef";

        println!("Shardus-crypto compatibility Test: sign - result: buffer_fed_sig: {}, str_fed_sig: {}", buffer_fed_sig, str_fed_sig);

        assert_eq!(expected_sig.to_string(), buffer_fed_sig, "Shardus-crypto-utils nodejs incompatibility when digesting input as buffer");
        assert_eq!(
            expected_sig.to_string(),
            str_fed_sig,
            "Shardus-crypto-utils nodejs incompatibility when digesting input as hexadecimal string"
        );
        assert_eq!(
            buffer_fed_sig, str_fed_sig,
            "Signature changed for the same input when using different input types (buffer, hex string)"
        );
    }

    #[test]
    fn test_verify() {
        let sc = ShardusCrypto::new("64f152869ca2d473e4ba64ab53f49ccdb2edae22da192c126850970e788af347");
        let pk = HexStringOrBuffer::Hex("8088b37f6f458104515ae18c2a05bde890199322f62ab5114d20c77bde5e6c9d".to_string());

        // this signature came from shardus-crypto-utils nodejs library with the same inputs and same hash key
        let nodejs_signed_sig = "cd1159381c39554a07309b0a0803a0cef4a85eb78685086f8ccbd06fe846bbd260bd8cd1ae9c4eff6af672be72c2a18d561793a301986276af999f2fd49477011234567890abcdef".to_string();
        println!("Shardus-crypto compatibility Test: verify - result: {}", HexStringOrBuffer::Hex(nodejs_signed_sig.clone()));

        let some_hex_string = "1234567890abcdef".to_string();

        let result = sc.verify(&some_hex_string, &HexStringOrBuffer::Hex(nodejs_signed_sig), &pk);

        assert_eq!(true, result);
    }
}
