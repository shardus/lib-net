use once_cell::sync::Lazy;
use crypto::ShardusCrypto;

static SHARDUS_CRYPTO_INSTANCE: Lazy<ShardusCrypto> = Lazy::new(|| {
    ShardusCrypto::new("64f152869ca2d473e4ba64ab53f49ccdb2edae22da192c126850970e788af347")
});

pub fn get_shardus_crypto_instance() -> &'static ShardusCrypto {
    &SHARDUS_CRYPTO_INSTANCE
}
