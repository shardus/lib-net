use crate::headers::header_types::Header;
use crate::headers::header_v1::HeaderV1;

pub fn wrap_serialized_header(version: u8, mut serialized_header: Vec<u8>) -> Vec<u8> {
    let mut buffer = Vec::new();
    buffer.push(1); // indicate that the header system is in use
    buffer.push(version); // indicate the version of the header
    buffer.append(&mut serialized_header);
    buffer
}

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

pub fn header_deserialize_factory(version: u8, serialized_header: Vec<u8>) -> Option<Header> {
    match version {
        1 => {
            let deserialized = HeaderV1::deserialize(serialized_header)?;
            Some(Header::V1(deserialized))
        }
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::headers::header_v1::HeaderV1;
    use uuid::Uuid;

    #[test]
    fn test_wrap_unwrap() {
        let serialized_header = vec![1, 2, 3];
        let version = 1;
        let wrapped = wrap_serialized_header(version, serialized_header.clone());
        let unwrapped = unwrap_serialized_header(wrapped).unwrap();

        assert_eq!(unwrapped.0, version);
        assert_eq!(unwrapped.1, serialized_header);
    }

    #[test]
    fn test_header_deserialize_factory() {
        let header = HeaderV1 {
            sender_address: [1; 32],
            uuid: Uuid::new_v4(),
            message_type: 42,
            message_length: 100,
            authorization_data: vec![1, 2, 3],
        };

        let serialized = header.serialize();
        let wrapped = wrap_serialized_header(1, serialized.clone());
        let unwrapped = unwrap_serialized_header(wrapped).unwrap();
        let deserialized = header_deserialize_factory(unwrapped.0, unwrapped.1).unwrap();

        match deserialized {
            Header::V1(deserialized_header) => {
                assert_eq!(header.sender_address, deserialized_header.sender_address);
                assert_eq!(header.uuid, deserialized_header.uuid);
                assert_eq!(header.message_type, deserialized_header.message_type);
                assert_eq!(header.message_length, deserialized_header.message_length);
                assert_eq!(header.authorization_data, deserialized_header.authorization_data);
            }
        }
    }
}
