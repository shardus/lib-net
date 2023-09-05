use std::io::{Cursor, Read, Write};
use uuid::Uuid;
extern crate serde;
extern crate serde_json;

use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
pub struct HeaderV1 {
    pub uuid: Uuid,
    pub message_type: u32,
    #[serde(default)]
    pub message_length: u32,
}

impl HeaderV1 {
    // Serialize the struct into a Vec<u8>
    pub fn serialize(&self) -> Vec<u8> {
        let mut buffer = Vec::new();

        // Serialize uuid (16 bytes)
        buffer.write_all(self.uuid.as_bytes()).unwrap();

        // Serialize message_type (4 bytes)
        buffer.write_all(&self.message_type.to_le_bytes()).unwrap();

        // Serialize message_length (4 bytes)
        buffer.write_all(&self.message_length.to_le_bytes()).unwrap();

        buffer
    }

    // Deserialize a Vec<u8> cursor into a HeaderV1 struct
    pub fn deserialize(cursor: &mut Cursor<Vec<u8>>) -> Option<Self> {
        // Deserialize uuid
        let mut uuid_bytes = [0u8; 16];
        cursor.read_exact(&mut uuid_bytes).ok()?;
        let uuid = Uuid::from_bytes(uuid_bytes);

        // Deserialize message_type
        let mut message_type_bytes = [0u8; 4];
        cursor.read_exact(&mut message_type_bytes).ok()?;
        let message_type = u32::from_le_bytes(message_type_bytes);

        // Deserialize message_length
        let mut message_length_bytes = [0u8; 4];
        cursor.read_exact(&mut message_length_bytes).ok()?;
        let message_length = u32::from_le_bytes(message_length_bytes);

        Some(Self { uuid, message_type, message_length })
    }

    pub fn from_json_string(json_str: &str) -> Option<Self> {
        serde_json::from_str(json_str).ok()
    }

    pub fn to_json_string(&self) -> Option<String> {
        serde_json::to_string(self).ok()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    #[test]
    fn test_serialize_deserialize_header_v1() {
        let header = HeaderV1 {
            uuid: Uuid::new_v4(),
            message_type: 42,
            message_length: 100,
        };

        let serialized = header.serialize();
        let mut cursor = Cursor::new(serialized);
        let deserialized = HeaderV1::deserialize(&mut cursor).unwrap();

        assert_eq!(header.uuid, deserialized.uuid);
        assert_eq!(header.message_type, deserialized.message_type);
        assert_eq!(header.message_length, deserialized.message_length);
    }
}
