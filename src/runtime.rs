use once_cell::sync::Lazy;
use tokio::runtime::Runtime;

pub(crate) static RUNTIME: Lazy<Runtime> =
    Lazy::new(|| Runtime::new().expect("Failed to initialize tokio runtime"));
