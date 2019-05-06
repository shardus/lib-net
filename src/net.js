const net = require('net')

// Map of port and address to the socket for this IP
// Format: ${address}:${port}
const _socketMap = {}

const _fetchSocket = (port, address, errHandler) => {
  if (!address || !port) {
    throw Error('No address or port given for request.')
  }
  const host = `${address}:${port}`
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

const send = async (port, address, dataString) => {
  return new Promise((resolve, reject) => {
    const socket = _fetchSocket(port, address, reject)
    let msgBuffer = Buffer.from(dataString)
    const msgLength = msgBuffer.length
    const msgLengthBytes = Buffer.allocUnsafe(4)
    msgLengthBytes.writeUInt32BE(msgLength)
    msgBuffer = Buffer.concat([msgLengthBytes, msgBuffer])
    socket.write(msgBuffer, () => {
      resolve()
    })
  })
}

const listen = async (port, address, handleData) => {
  return new Promise((resolve, reject) => {
    // This will get called on every incoming connection/message
    const onNewSocket = socket => {
      socket.on('error', reject)

      let streamBuffer
      let msgBuffer
      let msgLength = 0
      let newMsg = true

      const readNBytes = (targetBuffer, n) => {
        // Check if we have enough bytes in the stream buffer to actually read n bytes
        if (n > streamBuffer.length) {
          // throw new Error(`Unable to read ${n} bytes. Stream buffer only contains ${streamBuffer.length} bytes.`)
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
          port: socket.remotePort,
          address: socket.remoteAddress
        }
        // TODO: Give handleData a socket handle so we can write back to the server if we choose to do so
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
          try {
            let msgLengthBytes = Buffer.allocUnsafe(4)
            const read = readNBytes(msgLengthBytes, 4)
            if (!read) throw new Error('Unable to read message length while parsing stream.')
            msgLength = msgLengthBytes.readUInt32BE(0)
          } catch (e) {
            throw e
          }
          newMsg = false
        }
        if (!msgBuffer) {
          msgBuffer = Buffer.allocUnsafe(msgLength)
        }
        try {
          const read = readNBytes(msgBuffer, msgLength)
          if (!read) return
        } catch (e) {
          throw e
        }
        finishMessage()
      }

      socket.on('data', data => {
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

    server.listen(port, address, e => {
      if (e) return reject(e)
      else return resolve(server)
    })

    server.on('connection', onNewSocket)
  })
}

const stopListening = async (server) => {
  return new Promise((resolve, reject) => {
    for (const socket of Object.values(_socketMap)) {
      socket.end()
    }
    server.close(e => {
      if (e) return reject(e)
      else return resolve()
    })
  })
}

module.exports = { listen, send, stopListening }
