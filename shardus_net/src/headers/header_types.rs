use super::header_v1::HeaderV1;

pub enum Header {
    V1(HeaderV1),
}

impl Header {
    pub fn validate(&self, message: Vec<u8>) -> bool {
        match self {
            Header::V1(header_v1) => header_v1.validate(message),
        }
    }

    pub fn to_json_string(&self) -> Option<String> {
        match self {
            Header::V1(header_v1) => header_v1.to_json_string(),
        }
    }
}

pub struct WrappedHeader {
    pub version: u8,
    pub header_json_string: String,
}