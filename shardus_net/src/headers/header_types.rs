use crate::compression::compression::Compression;

use super::header_v1::HeaderV1;

pub enum Header {
    V1(HeaderV1),
}

impl Header {
    pub fn to_json_string(&self) -> Option<String> {
        match self {
            Header::V1(header_v1) => header_v1.to_json_string(),
        }
    }

    pub fn validate(&self, message: Vec<u8>) -> bool {
        match self {
            Header::V1(header_v1) => header_v1.validate(message),
        }
    }

    pub fn set_message_length(&mut self, message_length: u32) {
        match self {
            Header::V1(header_v1) => header_v1.message_length = message_length,
        }
    }

    pub fn set_compression(&mut self, compression: Compression) {
        match self {
            Header::V1(header_v1) => header_v1.compression = compression,
        }
    }

    pub fn compress(&self, message: Vec<u8>) -> Vec<u8> {
        match self {
            Header::V1(header_v1) => header_v1.compression.compress(&message),
        }
    }

    pub fn decompress(&self, message: &[u8]) -> Option<Vec<u8>> {
        match self {
            Header::V1(header_v1) => header_v1.compression.decompress(message),
        }
    }
}

pub struct WrappedHeader {
    pub version: u8,
    pub header_json_string: String,
}
