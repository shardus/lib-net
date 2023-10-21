use brotli::{CompressorReader, Decompressor};
use flate2::{read::GzDecoder, read::GzEncoder, Compression as GzipCompression};
use log::info;
use serde::Deserialize;
use std::io::Read;

#[derive(Deserialize, Clone, Copy, Debug, PartialEq)]
pub enum Compression {
    None,
    Gzip,
    Brotli,
}

impl Compression {
    pub fn from_u32(val: u32) -> Option<Self> {
        match val {
            0 => Some(Compression::None),
            1 => Some(Compression::Gzip),
            2 => Some(Compression::Brotli),
            _ => None,
        }
    }

    pub fn to_u32(&self) -> u32 {
        match *self {
            Compression::None => 0,
            Compression::Gzip => 1,
            Compression::Brotli => 2,
        }
    }

    pub fn default() -> Self {
        Compression::None
    }

    pub fn compress(&self, data: &[u8]) -> Vec<u8> {
        match *self {
            Compression::None => data.to_vec(),
            Compression::Gzip => {
                info!("Compressing data with Gzip");
                let e = GzEncoder::new(data, GzipCompression::default());
                e.bytes().collect::<Result<Vec<u8>, _>>().unwrap()
            }
            Compression::Brotli => {
                info!("Compressing data with Brotli");
                let mut result = Vec::new();
                let mut compressor = CompressorReader::new(data, 4096, 5, 22);
                compressor.read_to_end(&mut result).unwrap();
                result
            }
        }
    }

    pub fn decompress(&self, data: &[u8]) -> Option<Vec<u8>> {
        match *self {
            Compression::None => Some(data.to_vec()),
            Compression::Gzip => {
                let mut d = GzDecoder::new(data);
                let mut buf = Vec::new();
                if d.read_to_end(&mut buf).is_ok() {
                    Some(buf)
                } else {
                    None
                }
            }
            Compression::Brotli => {
                let mut result = Vec::new();
                let mut decompressor = Decompressor::new(data, 4096);
                if decompressor.read_to_end(&mut result).is_ok() {
                    Some(result)
                } else {
                    None
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_none_compression() {
        let data = b"Hello, World!";
        let compression = Compression::None;

        let compressed = compression.compress(data);
        let decompressed = compression.decompress(&compressed).unwrap();

        assert_eq!(data.to_vec(), compressed);
        assert_eq!(data.to_vec(), decompressed);
    }

    #[test]
    fn test_gzip_compression() {
        let data = b"Hello, World!";
        let compression = Compression::Gzip;

        let compressed = compression.compress(data);
        let decompressed = compression.decompress(&compressed).unwrap();

        assert_ne!(data.to_vec(), compressed);
        assert_eq!(data.to_vec(), decompressed);
    }

    #[test]
    fn test_brotli_compression() {
        let data = b"Hello, World!";
        let compression = Compression::Brotli;

        let compressed = compression.compress(data);
        let decompressed = compression.decompress(&compressed).unwrap();

        assert_ne!(data.to_vec(), compressed);
        assert_eq!(data.to_vec(), decompressed);
    }

    #[test]
    fn test_invalid_decompression() {
        let data = b"Invalid compressed data";
        let compression = Compression::Gzip;

        let decompressed = compression.decompress(data);
        assert!(decompressed.is_none());

        let compression_brotli = Compression::Brotli;
        let decompressed_brotli = compression_brotli.decompress(data);
        assert!(decompressed_brotli.is_none());
    }
}
