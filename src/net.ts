import * as net from 'net'

export type Address = string

export type Port = number

// Host = `${Address}:${Port}`
export type Host = string

export interface RemoteSender {
  address: string | undefined
  port: number | undefined
}

export type LowLevelListener = (
  augDataStr: string,
  remote: RemoteSender
) => void

// Map of port and address to the socket for this IP
// Format: ${address}:${port}
const _socketMap: { [host: string]: net.Socket } = {}

function _fetchSocket(
  port: Port,
  address: Address,
  errHandler: { (err: Error): void }
) {
  const host: Host = `${address}:${port}`
  if (!_socketMap[host]) {
    const socket = new net.Socket()
    socket.connect(port, address)
    socket.on('error', errHandler)
    const destroySocket = () => {
      socket.destroy()
      delete _socketMap[host]
    }
    socket.on('end', () => destroySocket())
    socket.on('close', () => destroySocket())
    // TODO: Implement handling data on client side and passing it back up to higher level data handler
    // socket.on('data', data => {})
    _socketMap[host] = socket
  }
  return _socketMap[host]
}

export function send(
  port: Port,
  address: Address,
  dataString: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = _fetchSocket(port, address, reject)
    let msgBuffer = Buffer.from(dataString)
    const msgLength = msgBuffer.length
    const msgLengthBytes = Buffer.allocUnsafe(4)
    msgLengthBytes.writeUInt32BE(msgLength, 0)
    msgBuffer = Buffer.concat([msgLengthBytes, msgBuffer])
    socket.write(msgBuffer, () => {
      resolve()
    })
  })
}

export async function listen(
  port: Port,
  address: Address,
  handleData: LowLevelListener
) {
  return new Promise((resolve, reject) => {
    // This will get called on every incoming connection/message
    const onNewSocket = (socket: net.Socket) => {
      socket.on('error', reject)

      let streamBuffer: Buffer
      let msgBuffer: Buffer | null
      let msgLength = 0
      let newMsg = true

      const readNBytes = (targetBuffer: Buffer, n: number) => {
        // Check if we have enough bytes in the stream buffer to actually read n bytes
        if (n > streamBuffer.length) {
          return false
        }

        // Copy n bytes into the target buffer
        streamBuffer.copy(targetBuffer, 0, 0, n)

        // Calculate the new length of the stream buffer after subtracting the n bytes
        // and allocate a new buffer of that size
        const newLength = streamBuffer.length - n
        const newStreamBuffer = Buffer.allocUnsafe(newLength)

        // Copy the remaining bytes in stream buffer to the new stream buffer
        // and then set streamBuffer to point to the new buffer
        streamBuffer.copy(newStreamBuffer, 0, n, streamBuffer.length)
        streamBuffer = newStreamBuffer
        return true
      }

      const finishMessage = () => {
        const remote = {
          address: socket.remoteAddress,
          port: socket.remotePort,
        }
        // TODO: Give handleData a socket handle so we can write back to the server if we choose to do so
        if (!msgBuffer) {
          throw new Error(
            'Failed to finishMessage: msgBuffer became falsy before converting to string'
          )
        }
        handleData(msgBuffer.toString(), remote)
        newMsg = true
        msgBuffer = null
        parseStream()
      }

      const parseStream = () => {
        if (streamBuffer.length < 1) {
          // console.log('No bytes left')
          return
        }
        if (newMsg) {
          const msgLengthBytes = Buffer.allocUnsafe(4)
          const read = readNBytes(msgLengthBytes, 4)
          if (!read) {
            throw new Error(
              'Unable to read message length while parsing stream.'
            )
          }
          msgLength = msgLengthBytes.readUInt32BE(0)
          newMsg = false
        }
        if (!msgBuffer) {
          msgBuffer = Buffer.allocUnsafe(msgLength)
        }
        const read = readNBytes(msgBuffer, msgLength)
        if (!read)  return
        finishMessage()
      }

      socket.on('data', (data: Buffer) => {
        if (!streamBuffer) streamBuffer = data
        else streamBuffer = Buffer.concat([streamBuffer, data])
        try {
          parseStream()
        } catch (e) {
          // TODO: Add proper error handling
          console.log(e)
        }
      })
    }

    const server = net.createServer()

    server.on('connection', onNewSocket)
    server.on('listening', () => resolve(server))
    server.on('error', reject)

    server.listen(port, address)
  })
}

export async function stopListening(server: {
  close: (arg0: (e: any) => void) => void
}) {
  return new Promise((resolve, reject) => {
    for (const socket of Object.values(_socketMap)) {
      socket.end()
    }
    server.close((e: any) => {
      if (e) return reject(e)
      else return resolve()
    })
  })
}

export default { listen, send, stopListening }
