// create a struct with the fields listed below:
// header_version: u8,
// sender_address: [u8; 32],
// uuid: uuid::Uuid,
// app_data: Vec<u8>,
// message_type: u32,
// message_length: u32,

use uuid::Uuid;

pub struct Header {
    header_version: u8, //version 1 will use same json payloads
    sender_address: [u8; 32],
    uuid: Uuid,                  //this may be come a sequence number between a given pair of nodes
    authorization_data: Vec<u8>, //needs better name
    message_type: u32,           //maybe u16?
    message_length: u32,
    // some other field   .. could be in future header versions
    //messaageEncoding: //TBD enum or byte
}

// string json payload
