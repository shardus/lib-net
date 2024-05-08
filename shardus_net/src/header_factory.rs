use std::io::Cursor;

use crate::header::header_types::Header;
use crate::header::header_v1::HeaderV1;

pub fn wrap_serialized_message(serialized_message: &mut Vec<u8>) {
    serialized_message.insert(0, 1); // Prepend the byte directly to the original vector
}

pub fn header_deserialize_factory(version: u8, serialized_header_cursor: &mut Cursor<Vec<u8>>) -> Option<Header> {
    match version {
        1 => {
            let deserialized = HeaderV1::deserialize(serialized_header_cursor)?;
            Some(Header::V1(deserialized))
        }
        _ => None,
    }
}

pub fn header_serialize_factory(header_version: u8, header: Header) -> Option<Vec<u8>> {
    match header_version {
        1 => match header {
            Header::V1(header_v1) => Some(header_v1.serialize()),
        },
        _ => None,
    }
}

pub fn header_from_json_string(json_str: &str, version: &u8) -> Option<Header> {
    match version {
        1 => HeaderV1::from_json_string(json_str).map(Header::V1),
        _ => None,
    }
}
