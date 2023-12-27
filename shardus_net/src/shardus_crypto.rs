use crypto::ShardusCrypto;
use std::sync::Once;

static INIT: Once = Once::new();

// TODO figure out optimal way to lock mutability of this static as soon as it's initialized once.
// - Mutex locks both read write access, will lock out all threads that want to read? #BAD
// - Can we use RwLock?
static mut SHARDUS_CRYPTO_INSTANCE: Option<ShardusCrypto> = None;

pub fn initialize_shardus_crypto_instance(hex_key: &str) {
    INIT.call_once(|| match unsafe { &SHARDUS_CRYPTO_INSTANCE } {
        Some(_) => {
            panic!("ShardusCrypto instance already initialized");
        }
        None => {
            let crypto = ShardusCrypto::new(hex_key);
            unsafe {
                SHARDUS_CRYPTO_INSTANCE = Some(crypto);
            }
        }
    });
}

pub fn get_shardus_crypto_instance() -> &'static ShardusCrypto {
    unsafe {
        match &SHARDUS_CRYPTO_INSTANCE {
            Some(instance) => instance,
            None => panic!("ShardusCrypto instance not initialized"),
        }
    }
}
