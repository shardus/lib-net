use crypto::ShardusCrypto;
use std::sync::{Arc, Mutex, Once};

static INIT: Once = Once::new();
static SHARDUS_CRYPTO_INSTANCE: Mutex<Option<Arc<ShardusCrypto>>> = Mutex::new(None);

pub fn initialize_shardus_crypto_instance(hex_key: &str) {
    INIT.call_once(|| {
        let mut instance = SHARDUS_CRYPTO_INSTANCE.lock().unwrap();
        if instance.is_none() {
            let crypto = ShardusCrypto::new(hex_key);
            *instance = Some(Arc::new(crypto));
        } else {
            panic!("ShardusCrypto instance already initialized");
        }
    });
}

pub fn get_shardus_crypto_instance() -> Arc<ShardusCrypto> {
    let instance = SHARDUS_CRYPTO_INSTANCE.lock().unwrap();
    match instance.as_ref() {
        Some(crypto_instance) => Arc::clone(crypto_instance),
        None => panic!("ShardusCrypto instance not initialized"),
    }
}
