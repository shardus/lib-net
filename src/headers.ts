export interface Headers {
  [key: string]: string;
}
export interface HeaderV1 {
  senderAddress: Uint8Array;  // Using Uint8Array for [u8; 32]
  uuid: string;  // Assuming we will convert Uuid to a string representation
  messageType: number;
  messageLength: number;
  authorizationData: Uint8Array;  // Using Uint8Array for Vec<u8>
}