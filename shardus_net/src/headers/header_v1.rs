use std::io::{Cursor, Read, Write};
use uuid::Uuid;

pub struct HeaderV1 {
    pub sender_address: [u8; 32],
    pub uuid: Uuid,
    pub message_type: u32,
    pub message_length: u32,
    pub authorization_data: Vec<u8>,
}

impl HeaderV1 {
    // Serialize the struct into a Vec<u8>
    pub fn serialize(&self) -> Vec<u8> {
        let mut buffer = Vec::new();

        // Serialize sender_address (32 bytes)
        buffer.write_all(&self.sender_address).unwrap();

        // Serialize uuid (16 bytes)
        buffer.write_all(self.uuid.as_bytes()).unwrap();

        // Serialize message_type (4 bytes)
        buffer.write_all(&self.message_type.to_le_bytes()).unwrap();

        // Serialize message_length (4 bytes)
        buffer.write_all(&self.message_length.to_le_bytes()).unwrap();

        // Serialize the length of authorization_data (4 bytes)
        buffer.write_all(&(self.authorization_data.len() as u32).to_le_bytes()).unwrap();

        // Serialize authorization_data
        buffer.write_all(&self.authorization_data).unwrap();

        buffer
    }

    // Deserialize a Vec<u8> into a HeaderV1 struct
    pub fn deserialize(data: Vec<u8>) -> Option<Self> {
        let mut cursor = Cursor::new(data);

        // Deserialize sender_address
        let mut sender_address = [0u8; 32];
        cursor.read_exact(&mut sender_address).ok()?;

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

        // Deserialize the length of authorization_data
        let mut auth_data_length_bytes = [0u8; 4];
        cursor.read_exact(&mut auth_data_length_bytes).ok()?;
        let auth_data_length = u32::from_le_bytes(auth_data_length_bytes) as usize;

        // Deserialize authorization_data
        let mut authorization_data = vec![0u8; auth_data_length];
        cursor.read_exact(&mut authorization_data).ok()?;

        Some(Self {
            sender_address,
            uuid,
            message_type,
            message_length,
            authorization_data,
        })
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
    use uuid::Uuid;

    #[test]
    fn test_serialize_deserialize_header_v1() {
        let header = HeaderV1 {
            sender_address: [1; 32],
            uuid: Uuid::new_v4(),
            message_type: 42,
            message_length: 100,
            authorization_data: vec![1, 2, 3],
        };

        let serialized = header.serialize();
        let deserialized = HeaderV1::deserialize(serialized).unwrap();

        assert_eq!(header.sender_address, deserialized.sender_address);
        assert_eq!(header.uuid, deserialized.uuid);
        assert_eq!(header.message_type, deserialized.message_type);
        assert_eq!(header.message_length, deserialized.message_length);
        assert_eq!(header.authorization_data, deserialized.authorization_data);
    }
}
