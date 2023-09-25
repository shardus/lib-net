use core::fmt;

extern crate sodiumoxide;

use serde_json::{Value, to_string, json};  // 'Value' represents any valid JSON value. 'to_string' serializes Rust data structures into JSON strings.
                                     
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
    hash_key: Vec<u8>
}
impl ShardusCrypto {
    pub fn new (key: &str) -> ShardusCrypto {
        sodiumoxide::init().expect("Failed to initialize sodiumoxide");
        ShardusCrypto {
            hash_key: sodiumoxide::hex::decode(key).expect("Cannot init shardus crypto because hash key is not hash").to_vec(),
        }
    }

    fn generate_keypair(&self) -> (HexString, HexString) {
        let (public_key, secret_key) = sodiumoxide::crypto::sign::gen_keypair();

        return (sodiumoxide::hex::encode(&public_key), sodiumoxide::hex::encode(&secret_key)) 
    }

    fn hash(&self, input: &str, fmt: Format) -> HexStringOrBuffer {

         
        let digest = sodiumoxide::crypto::generichash::hash(&input.as_bytes(), Some(32), Some(&self.hash_key))
            .expect("Cannot digest input");
        
        match fmt {
            Format::Hex => HexStringOrBuffer::Hex(sodiumoxide::hex::encode(&digest)),
            Format::Buffer => HexStringOrBuffer::Buffer(digest.as_ref().to_vec()),
        }



    }
    
    pub fn hash_object(&self, json_object: &Value, remove_sign: bool, remove_tag: bool) -> Result<HexString, Box<dyn std::error::Error>> {
        let mut obj = json_object.clone();
        if remove_sign {
            if obj["sign"].is_null() {
                panic!("Object must contain a sign field if removeSign is flagged true.");
            }
            obj["sign"] = Value::Null;
            let hashed = self.hash(&self.stringify(&obj).expect("Cannot stringify json obj"), Format::Hex);
            return Ok(hashed.to_string());
        } else if remove_tag {
            if obj["tag"].is_null() {
                panic!("Object must contain a tag field if removeTag is flagged true.");
            }
            obj["tag"] = Value::Null;
            let hashed = self.hash(&self.stringify(&obj).expect("Cannot stringify json obj"), Format::Hex);
            return Ok(hashed.to_string());
        } else if remove_sign && remove_tag {
            if obj["sign"].is_null() || obj["tag"].is_null() {
                panic!("Object must contain sign and tag fields if both argument is flagged true.");
            }
            obj["sign"] = Value::Null;
            obj["tag"] = Value::Null;
            let hashed = self.hash(&self.stringify(&obj).expect("Cannot stringify json obj"), Format::Hex);
            return Ok(hashed.to_string());

        } else {
            return Ok(self.hash(&to_string(&obj).unwrap(), Format::Hex).to_string());
        }
    }

    fn ensure_buffer(&self, input: HexStringOrBuffer, name: &str) -> Result<Buffer, Box<dyn std::error::Error>> {
        match input {
            HexStringOrBuffer::Hex(s) => {
                if sodiumoxide::hex::decode(&s).is_err() {
                    panic!("{} string must be in hex format.", name);
                }
                return Ok(sodiumoxide::hex::decode(&s).unwrap().to_vec());
            },
            HexStringOrBuffer::Buffer(b) => {
                return Ok(b);
            },
        }
    }

    fn get_auth_key(&self, shared_key: HexStringOrBuffer, nonce: HexStringOrBuffer) -> Buffer {
        let shared_key_buf = self.ensure_buffer(HexStringOrBuffer::Hex(shared_key.to_string()), "SharedKey").unwrap();
        let nonce_buf = self.ensure_buffer(nonce, "get_auth_key nonce").unwrap();
        let result_buf = self.xor(&shared_key_buf, &nonce_buf);
        return result_buf;
    }

    fn xor(&self, buf1: &[u8], buf2: &[u8]) -> Vec<u8> {
        let mut result: Vec<u8> = Vec::new();

        // Determine the minimum length of the two buffers
        let min_length = std::cmp::min(buf1.len(), buf2.len());

        // XOR up to the minimum length
        for i in 0..min_length {
            result.push(buf1[i] ^ buf2[i]);
        }

        // If buf1 is longer, append the remaining part of buf1
        if buf1.len() > min_length {
            result.extend_from_slice(&buf1[min_length..]);
        }

        // If buf2 is longer, append the remaining part of buf2
        if buf2.len() > min_length {
            result.extend_from_slice(&buf2[min_length..]);
        }

        result
    }

    fn stringify(&self, json: &Value) -> Result<String, serde_json::Error> {
        serde_json::to_string(json)
    }

    fn tag(&self, message: &String, shared_key: HexStringOrBuffer) -> HexString {
        let message_buf = message.as_bytes().to_vec();
        let mut nonce_buf = [0u8; sodiumoxide::crypto::auth::TAGBYTES]; 
        sodiumoxide::randombytes::randombytes_into(&mut nonce_buf);
        let nonce = sodiumoxide::hex::encode(nonce_buf);
        let key_buf = self.get_auth_key(shared_key, HexStringOrBuffer::Hex(nonce.clone()));
        let key = sodiumoxide::crypto::auth::Key::from_slice(&key_buf).unwrap();
        let tag_buf = sodiumoxide::crypto::auth::authenticate(message_buf.as_ref(), &key);
        let tag = sodiumoxide::hex::encode(tag_buf.as_ref());

        return tag + &nonce;
    }

    fn tag_object(&self, obj: &mut Value, shared_key: HexStringOrBuffer) -> Result<(), Box<dyn std::error::Error>> {
        if !obj.is_object() {
            panic!("Input json must be an object.");
        }
        if obj.is_array() {
            panic!("Input json cannot be an array.");
        }

        let obj_str = self.stringify(obj).unwrap();
        let tag = self.tag(&obj_str, shared_key);
        obj["tag"] = Value::String(tag);
        Ok(())  
    }

    fn authenticate(&self, message: &String, tag: &String, shared_key: HexStringOrBuffer) -> bool {
        let nonce = tag.get(sodiumoxide::crypto::auth::TAGBYTES * 2..).unwrap();
        let tag_str = tag.get(..sodiumoxide::crypto::auth::TAGBYTES * 2).unwrap();
        let tag_buf = self.ensure_buffer(HexStringOrBuffer::Hex(tag_str.to_string()), "Tag").unwrap();
        let sodium_tag = sodiumoxide::crypto::auth::Tag::from_slice(&tag_buf).unwrap();
        let key_buf = self.get_auth_key(shared_key, HexStringOrBuffer::Hex(nonce.to_string()));
        let key = sodiumoxide::crypto::auth::Key::from_slice(&key_buf).unwrap();
        let message_buf = message.as_bytes().to_vec();
        return sodiumoxide::crypto::auth::verify(&sodium_tag, message_buf.as_ref(), &key);
    }

    fn authenticate_object(&self, obj: &Value, shared_key: HexStringOrBuffer) -> bool {
        if !obj.is_object() {
            panic!("Input json must be an object.");
        }
        if obj["tag"].is_null() {
            panic!("Object must contain a tag field");
        }

        let tag = obj["tag"].as_str().unwrap();
        let mut tagless = obj.clone();
        tagless["tag"] = Value::Null;
        let tagless_obj_str = tagless.to_string();
        return self.authenticate(&tagless_obj_str, &tag.to_string(), shared_key);
    }

    // fn sign(&self, _inp: HexStringOrBuffer, _sk: HexStringOrBuffer) -> HexString {
    //     let input_buf = self.ensure_buffer(_inp, "Sign input").unwrap();
    //     println!("sign() input_buf:{:?}" , input_buf);
    //     let sk_buf = self.ensure_buffer(_sk, "SecretKey").unwrap();
    //     let sk = sodiumoxide::crypto::sign::SecretKey::from_slice(&sk_buf).unwrap();
    //     let sig = sodiumoxide::crypto::sign::sign_detached(&input_buf, &sk);
    //     println!("sign() sig:{}" , sig);
    //     let sig_str = sodiumoxide::hex::encode(sig.as_ref());
    //     println!("sign() sig_str:{}" , sig_str);
    //     return sig_str;
    // }
    pub fn sign(&self, input: HexStringOrBuffer, sk: HexStringOrBuffer) -> Result<HexString, Box<dyn std::error::Error>> {
        let input_buf = match input {
            HexStringOrBuffer::Hex(hex) => sodiumoxide::hex::decode(hex).map_err(|_| "Invalid hex format for input.")?,
            HexStringOrBuffer::Buffer(buf) => buf,
        };

        let sk_buf_vec = match sk {
            HexStringOrBuffer::Hex(hex) => sodiumoxide::hex::decode(hex).map_err(|_| "Invalid hex format for secret key.")?,
            HexStringOrBuffer::Buffer(buf) => buf,
        };

        // Convert Vec<u8> to [u8; 64]
        let mut sk_buf = [0u8; sodiumoxide::crypto::sign::SECRETKEYBYTES];
        sk_buf.copy_from_slice(&sk_buf_vec[..sodiumoxide::crypto::sign::SECRETKEYBYTES]);

        // Ensure sk_buf corresponds to valid SecretKey size.
        if sk_buf_vec.len() != sodiumoxide::crypto::sign::SECRETKEYBYTES {
            panic!("Invalid secret key length.");
        }

        let secret_key = sodiumoxide::crypto::sign::SecretKey(sk_buf);

        // Sign the input using the secret key
        let signed_message = sodiumoxide::crypto::sign::sign(&input_buf, &secret_key);

        Ok(sodiumoxide::hex::encode(&signed_message))
    }

    fn sign_object(&self, obj: &mut Value, sk: HexStringOrBuffer, pk: HexStringOrBuffer) -> Result<(), Box<dyn std::error::Error>> {
        if !obj.is_object() {
            panic!("Input json must be an object.");
        }
        if obj.is_array() {
            panic!("Input json cannot be an array.");
        }

        let obj_str = self.stringify(obj).expect("Couldn't stringify json object");
        let hashed = self.hash(&obj_str, Format::Buffer);
        let sig = self.sign(hashed, sk).expect("Couldn't sign object");
        // println!("sign_object() sig:{}" , sig);

        let pk_str = match pk {
            HexStringOrBuffer::Hex(s) => s,
            HexStringOrBuffer::Buffer(b) => sodiumoxide::hex::encode(b),
        };

        let sig_obj = json!({
            "owner": pk_str,
            "sig": sig,
        });


        obj["sign"] = sig_obj;
        Ok(())

    }

    fn verify(&self, _msg: &String, _sig: HexStringOrBuffer, _pk: HexStringOrBuffer) -> bool {
        let msg_buf = _msg.as_bytes().to_vec();
        let sig_buf = self.ensure_buffer(_sig, "Signature").unwrap();
        let sig = sodiumoxide::crypto::sign::Signature::from_bytes(&sig_buf).unwrap();
        let pk_buf = self.ensure_buffer(_pk, "PublicKey").unwrap();
        let pk = sodiumoxide::crypto::sign::PublicKey::from_slice(&pk_buf).unwrap();
        return sodiumoxide::crypto::sign::verify_detached(&sig, &msg_buf, &pk);
    }

    fn verify_object(&self, obj: &Value, pk: HexStringOrBuffer) -> bool {
        if !obj.is_object() {
            panic!("Input json must be an object.");
        }
        if obj["sign"].is_null() {
            panic!("Object must contain a sign field");
        }
        if obj["owner"].is_null() {
            panic!("Object must contain an owner field");
        }

        let obj_hash = self.hash_object(obj, true, false).unwrap();
        let owner = obj["owner"].as_str().unwrap();
        let sign = obj["sign"].as_str().unwrap();
        return self.verify(&obj_hash, HexStringOrBuffer::Hex(sign.to_string()), HexStringOrBuffer::Hex(owner.to_string()));
    }

    fn buffer_to_hex(&self, buf: &Buffer) -> HexString {
        return sodiumoxide::hex::encode(buf);
    }

    fn generate_shared_key(&self, _curve_sk: HexStringOrBuffer, _curve_pk: HexStringOrBuffer) -> Buffer {
        let curve_sk_buf = self.ensure_buffer(_curve_sk, "CurveSecretKey").unwrap();
        let curve_pk_buf = self.ensure_buffer(_curve_pk, "CurvePublicKey").unwrap();

        let scalar_sk = sodiumoxide::crypto::scalarmult::Scalar::from_slice(&curve_sk_buf).unwrap();
        let group_el = sodiumoxide::crypto::scalarmult::GroupElement::from_slice(&curve_pk_buf).unwrap();

        let key = sodiumoxide::crypto::scalarmult::scalarmult(&scalar_sk, &group_el).unwrap();

        return key.as_ref().to_vec();
    }

    fn random_bytes(&self, length: usize) -> Buffer {
        let mut buf = vec![0u8; length];
        sodiumoxide::randombytes::randombytes_into(&mut buf);
        return buf;
    }

}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_buffer_xor() {
        let sc = ShardusCrypto::new("64f152869ca2d473e4ba64ab53f49ccdb2edae22da192c126850970e788af347");

        let buf1 = vec![0x00, 0xff, 0x0f];
        let buf2 = vec![0xf0, 0xf0];

        let result = sc.xor(&buf1, &buf2);

        print!("Shardus-crypto compitibility Test: buffer_xor - result: {}",HexStringOrBuffer::Buffer(result.clone()));

        assert_eq!(vec![0xf0, 0x0f, 0x0f], result);
    }

    #[test]
    fn test_ensure_buffer() {
        let sc = ShardusCrypto::new("64f152869ca2d473e4ba64ab53f49ccdb2edae22da192c126850970e788af347");

        let result = sc.ensure_buffer(HexStringOrBuffer::Hex("fe2d0f".to_string()), "test").unwrap();

        print!("Shardus-crypto compitibility Test: ensure_buffer - result: {}", HexStringOrBuffer::Buffer(result.clone()));
        assert_eq!(vec![0xfe, 0x2d, 0x0f], result);
    }

    #[test]
    fn test_hash_object(){
        let sc = ShardusCrypto::new("64f152869ca2d473e4ba64ab53f49ccdb2edae22da192c126850970e788af347");
        let json = json!({
            "payload": "hello world",
        });

        let result = sc.hash_object(&json, false, false).unwrap();

        print!("Shardus-crypto compitibility Test: hash_object - hash: {}", result);

        assert_eq!("f22109863479626956b6b99ab0a40d8a0e07f0156a945726098a6f851d70bd0d", result);
        
    }

    #[test]
    fn test_sign_object(){
        let sc = ShardusCrypto::new("64f152869ca2d473e4ba64ab53f49ccdb2edae22da192c126850970e788af347");
        let keypair = json!(
                {
                  "publicKey": "8088b37f6f458104515ae18c2a05bde890199322f62ab5114d20c77bde5e6c9d",
                  "secretKey": "c3774b92cc8850fb4026b073081290b82cab3c0f66cac250b4d710ee9aaf83ed8088b37f6f458104515ae18c2a05bde890199322f62ab5114d20c77bde5e6c9d"
                }
            );
        let obj: &mut Value = &mut json!({
            "payload": "hello world",
        });

        let sk = keypair["secretKey"].as_str().unwrap().to_string();
        let pk = keypair["publicKey"].as_str().unwrap().to_string();

        // print!("Shardus-crypto compitibility Test: sign - sk: {}, pk: {}", sk, pk);
        let _ = sc.sign_object(
                obj, 
                HexStringOrBuffer::Hex(sk),
                HexStringOrBuffer::Hex(pk)
            ).unwrap();

        print!("Shardus-crypto compitibility Test: sign - result: {}", obj);
        let expected_signed_object = json!(
                {
                  "payload": "hello world",
                  "sign": {
                    "owner": "8088b37f6f458104515ae18c2a05bde890199322f62ab5114d20c77bde5e6c9d",
                    "sig": "18aeb46ca7e01c39a34d39fa505908da76d5fd326914a7b1b81e8766d00769e2d2a44c8e1210674dcd7ba5a43531192bce43df484a1ba8014ad568c02b932600f22109863479626956b6b99ab0a40d8a0e07f0156a945726098a6f851d70bd0d"
                  }
                }
            );

        let expected_payload = expected_signed_object["payload"].as_str().unwrap();
        let expected_sign = expected_signed_object["sign"].clone();
        let expected_owner = expected_sign["owner"].as_str().unwrap();
        let expected_sig = expected_sign["sig"].as_str().unwrap();

        assert_eq!(expected_payload, obj["payload"].as_str().unwrap(), "Payloads are not compitiible");
        assert_eq!(expected_owner, obj["sign"]["owner"].as_str().unwrap(), "Owners are not compitiible");
        assert_eq!(expected_sig, obj["sign"]["sig"].as_str().unwrap(), "Signatures are not compitiible");
        assert_eq!(expected_signed_object, obj.clone(), "Signed objects are not compitiible");

    }
}
