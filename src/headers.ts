export interface Headers {
  [key: string]: any;
}

export interface HeaderV1 {
  uuid: string;
  messageType: number;
  messageLength: number;
}