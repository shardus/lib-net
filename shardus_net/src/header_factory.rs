use std::io::Cursor;

use crate::headers::header_types::Header;
use crate::headers::header_v1::HeaderV1;

pub fn wrap_serialized_header(version: u8, mut serialized_header: Vec<u8>) -> Vec<u8> {
    let mut buffer = Vec::new();
    buffer.push(1); // indicate that the header system is in use
    buffer.push(version); // indicate the version of the header
    buffer.append(&mut serialized_header);
    buffer
}

#[allow(dead_code)]
pub fn unwrap_serialized_header(mut serialized_header: Vec<u8>) -> Option<(u8, Vec<u8>)> {
    if serialized_header.len() < 2 {
        return None;
    }
    if serialized_header[0] != 1 {
        return None;
    }
    let version = serialized_header[1];
    serialized_header.drain(0..2);
    Some((version, serialized_header))
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

#[allow(dead_code)]
pub fn vec_to_hex_string(data: Vec<u8>) -> String {
    data.iter().map(|byte| format!("{:02x}", byte)).collect::<Vec<String>>().join("")
}

pub fn header_from_json_string(json_str: &str, version: &u8) -> Option<Header> {
    match version {
        1 => HeaderV1::from_json_string(json_str).map(Header::V1),
        _ => None,
    }
}
