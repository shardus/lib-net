// create a struct with the fields listed below:
// header_version: u8,
// sender_address: [u8; 32],
// uuid: uuid::Uuid,
// app_data: Vec<u8>,
// message_type: u32,
// message_length: u32,

use uuid::Uuid;

pub struct Header {
    header_version: u8,
    sender_address: [u8; 32],
    uuid: Uuid,
    app_data: Vec<u8>,
    message_type: u32,
    message_length: u32,
}
