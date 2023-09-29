use std::io::{Cursor, Read, Write};
use uuid::Uuid;
extern crate serde;
extern crate serde_json;

use crate::compression::compression::Compression;
use serde::Deserialize;

#[derive(Deserialize)]
pub struct HeaderV1 {
    pub uuid: Uuid,
    #[serde(default)]
    pub message_type: u32,
    #[serde(default)]
    pub message_length: u32,
    #[serde(default)]
    pub sender_id: String,
    #[serde(default = "Compression::default")]
    pub compression: Compression,
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

        // Serialize sender_id as bytes and then its length (4 bytes)
        let sender_id_bytes = self.sender_id.as_bytes();
        let sender_id_len = sender_id_bytes.len() as u32;
        buffer.write_all(&sender_id_len.to_le_bytes()).unwrap();
        buffer.write_all(sender_id_bytes).unwrap();

        // Serialize compression (4 bytes)
        buffer.write_all(&self.compression.to_u32().to_le_bytes()).unwrap();

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

        // Deserialize sender_id
        let mut sender_id_len_bytes = [0u8; 4];
        cursor.read_exact(&mut sender_id_len_bytes).ok()?;
        let sender_id_len = u32::from_le_bytes(sender_id_len_bytes);

        let mut sender_id_bytes = vec![0u8; sender_id_len as usize];
        cursor.read_exact(&mut sender_id_bytes).ok()?;
        let sender_id = String::from_utf8(sender_id_bytes).ok()?;

        // Deserialize compression
        let mut compression_bytes = [0u8; 4];
        cursor.read_exact(&mut compression_bytes).ok()?;
        let compression = Compression::from_u32(u32::from_le_bytes(compression_bytes))?;

        Some(Self {
            uuid,
            message_type,
            message_length,
            sender_id: sender_id,
            compression,
        })
    }

    pub fn from_json_string(json_str: &str) -> Option<Self> {
        serde_json::from_str(json_str).ok()
    }

    pub fn to_json_string(&self) -> Option<String> {
        Some(format!(
            r#"{{"uuid": "{}", "message_type": {}, "message_length": {}, "sender_id": "{}"}}"#,
            self.uuid, self.message_type, self.message_length, self.sender_id
        ))
    }

    pub fn validate(&self, message: Vec<u8>) -> bool {
        if message.len() != self.message_length as usize {
            return false;
        }
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    #[test]
    fn test_serialize_and_deserialize() {
        let header = HeaderV1 {
            uuid: Uuid::new_v4(),
            message_type: 1,
            message_length: 42,
            sender_id: "127.0.0.1".to_string(),
            compression: Compression::None,
        };

        let serialized = header.serialize();
        let mut cursor = Cursor::new(serialized);
        let deserialized = HeaderV1::deserialize(&mut cursor).unwrap();

        assert_eq!(header.uuid, deserialized.uuid);
        assert_eq!(header.message_type, deserialized.message_type);
        assert_eq!(header.message_length, deserialized.message_length);
        assert_eq!(header.sender_id, deserialized.sender_id);
        assert_eq!(header.compression, deserialized.compression); // New line for compression check
    }

    #[test]
    fn test_from_json_string() {
        let json_str = r#"{
            "uuid": "550e8400-e29b-41d4-a716-446655440000",
            "message_type": 1,
            "message_length": 42,
            "sender_id": "127.0.0.1",
            "compression": "Gzip"
        }"#;

        let header = HeaderV1::from_json_string(json_str).unwrap();
        assert_eq!(header.uuid, Uuid::parse_str("550e8400-e29b-41d4-a716-446655440000").unwrap());
        assert_eq!(header.message_type, 1);
        assert_eq!(header.message_length, 42);
        assert_eq!(header.sender_id, "127.0.0.1");
        assert_eq!(header.compression, Compression::Gzip);
    }

    #[test]
    fn test_to_json_string() {
        let header = HeaderV1 {
            uuid: Uuid::parse_str("550e8400-e29b-41d4-a716-446655440000").unwrap(),
            message_type: 1,
            message_length: 42,
            sender_id: "127.0.0.1".to_string(),
            compression: Compression::None,
        };

        let json_str = header.to_json_string().unwrap();
        assert_eq!(
            json_str,
            r#"{"uuid": "550e8400-e29b-41d4-a716-446655440000", "message_type": 1, "message_length": 42, "sender_id": "127.0.0.1"}"#
        );
    }
}
