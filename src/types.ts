export type Address = string

export type Port = number

/**
 * Represents augmented data that includes metadata such as timestamps and message direction to be sent over the network.
 */
export interface AugmentedData {
  data: unknown
  UUID: string
  PORT: Port
  ADDRESS?: Address

  // Metadata
  sendTime: number // timestamp of when the message was sent
  receivedTime: number // timestamp of when the message was received
  replyTime: number // timestamp of when the reply was received
  replyReceivedTime: number // timestamp of when the reply was received
  msgDir: 'ask' | 'tell' | 'resp' // direction and intent of the message
}

export const NewAugData = (
  data: unknown,
  UUID: string,
  port: number,
  address: string,
  msgDir: 'ask' | 'tell' | 'resp'
): AugmentedData => {
  // Under the hood, sn needs to pass around some extra data for its own internal usage.
  return {
    data,
    UUID,
    PORT: port,
    ADDRESS: address,

    sendTime: Date.now(),
    receivedTime: 0,
    replyTime: 0,
    replyReceivedTime: 0,
    msgDir,
  }
}

export type SnOpts = {
  port: number
  address?: string
  senderOpts?: {
    useLruCache?: boolean
    lruSize: number
  }
  headerOpts?: {
    sendWithHeaders: boolean
    sendHeaderVersion: number
  }
  customStringifier?: (val: any) => string
}

/**
 * Validates the provided options object for the SnOpts type.
 * @param opts - The options object to validate.
 * @throws An error if the options object is not valid.
 */
export const validateSnOpts = (opts: SnOpts) => {
  if (!opts) throw new Error('snq: must supply options')

  if (!opts.port || typeof opts.port !== 'number') throw new Error('snq: must supply port')

  if (opts.senderOpts && opts.senderOpts.useLruCache && !opts.senderOpts.lruSize)
    throw new Error('snq: must supply lruSize when using lruCache')
}

export interface RemoteSender {
  address: string | undefined
  port: number | undefined
}

export type ResponseCallback = (data?: unknown) => void

export type TimeoutCallback = () => void

export type ListenCallback = (data: unknown, remote: RemoteSender, respond: ResponseCallback) => void

export interface Headers {
  uuid?: string
  sender_address?: string
  sender_port?: number
  message_type: number
  [key: string]: any
}
