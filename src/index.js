const uuid = require('uuid/v1')

const net = require('./net')
const optsHelper = require('./opts')

const DEFAULT_ADDRESS = '0.0.0.0'

const noop = () => {}

// We have to generate a closure so,
// 1) We can test simulated from two isolated environments, and
// 2) Users can use two distinct copies if they want to, for whatever
//    reason.
//
// We need to pass in the port and address to the whole closure so that
// the `send` function can augment its sent data with the port the `listen`
// function will be listening on. This is necessary to simulate "responding"
// to a "request".
const generateContext = (opts) => {
  optsHelper.validate(opts)

  const PORT = opts.port
  const ADDRESS = opts.address || DEFAULT_ADDRESS

  // we're going to keep track of response IDs here
  let responseUUIDMapping = {}

  const _sendAug = async (port, address, augData, timeout, onResponse, onTimeout) => {
    const stringifiedData = JSON.stringify(augData)

    let promise = net.send(port, address, stringifiedData)

    // a timeout of 0 means no return message is expected.
    if (timeout !== 0) {
      const timer = setTimeout(() => {
        delete responseUUIDMapping[augData.UUID]
        onTimeout()
      }, timeout)

      responseUUIDMapping[augData.UUID] = (...args) => {
        clearTimeout(timer)
        onResponse(...args)
      }
    }
    return promise
  }

  const send = async (port, address, data, timeout = 0, onResponse = noop, onTimeout = noop) => {
    const UUID = uuid()

    // Under the hood, snq needs to pass around some extra data for its own internal usage.
    const augData = {
      data: data, // the user's data
      UUID: UUID, // the ID we'll use to determine whether requests were "responded to"
      PORT: PORT, // the listening port,    so the library knows to whom to send "responses" to
      ADDRESS: ADDRESS // the listening address, although the library will use the address it got from the network
    }

    return _sendAug(port, address, augData, timeout, onResponse, onTimeout)
  }

  const listen = async (handleData) => {
    // This is a wrapped form of the 'handleData' callback the user supplied.
    // Its job is to determine if the incoming data is a response to a request
    // the user sent. It does this by referencing the UUID map object.
    const extractUUIDHandleData = (augData, remote) => {
      augData = JSON.parse(augData)

      const { PORT, UUID, data } = augData
      const address = remote.address

      // This is the return send function. A user will call this if they want
      // to "reply" or "respond" to an incoming message.
      const respond = (response) => {
        const sendData = { data: response, UUID, PORT }
        return _sendAug(PORT, address, sendData, 0, noop, noop)
      }

      // If we are expecting a response, go through the respond mechanism.
      // Otherwise, it's a normal incoming message.
      let handle
      if (responseUUIDMapping[UUID]) handle = responseUUIDMapping[UUID]
      else handle = handleData

      // Clear the respond mechanism.
      delete responseUUIDMapping[UUID]

      return handle(data, remote, respond)
    }

    // TODO these should be spun up in parallel, but that convolutes code
    // and doesn't save hardly any startup time, so skipping for now.
    const server = await net.listen(PORT, ADDRESS, extractUUIDHandleData)

    return server
  }

  const stopListening = (server) => {
    return net.stopListening(server)
  }

  const returnVal = { send, listen, stopListening }

  return returnVal
}

module.exports = generateContext
