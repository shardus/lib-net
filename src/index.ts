import * as uuid from 'uuid/v1'
import validate from './opts'
const net = require('../../shardus-net.node')

const DEFAULT_ADDRESS = '0.0.0.0'

export type Address = string

export type Port = number

export interface RemoteSender {
  address: string | undefined
  port: number | undefined
}

export interface AugmentedData {
  data: unknown
  UUID: string
  PORT: Port
  ADDRESS?: Address
}

export interface RemoteSender {
  port: number | undefined
  address: string | undefined
}

export type ResponseCallback = (data?: unknown) => void

export type TimeoutCallback = () => void

export type ListenCallback = (
  data: unknown,
  remote: RemoteSender,
  respond: ResponseCallback
) => void

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
export const Sn = (opts: { port: number; address?: string }) => {
  validate(opts)

  const PORT = opts.port
  const ADDRESS = opts.address || DEFAULT_ADDRESS

  const _net = net.Sn(opts);

  // we're going to keep track of response IDs here
  const responseUUIDMapping: { [uuid: string]: (data: unknown) => void } = {}

  const _sendAug = async (
    port: number,
    address: string,
    augData: AugmentedData,
    timeout: number,
    onResponse: ResponseCallback,
    onTimeout: TimeoutCallback
  ) => {
    const stringifiedData = JSON.stringify(augData)

    const promise = _net.send(port, address, stringifiedData)

    // a timeout of 0 means no return message is expected.
    if (timeout !== 0) {
      const timer = setTimeout(() => {
        delete responseUUIDMapping[augData.UUID]
        onTimeout()
      }, timeout)

      responseUUIDMapping[augData.UUID] = (data: unknown) => {
        clearTimeout(timer)
        onResponse(data)
      }
    }
    return promise
  }

  const send = async (
    port: number,
    address: string,
    data: unknown,
    timeout = 0,
    onResponse: ResponseCallback = noop,
    onTimeout: TimeoutCallback = noop
  ) => {
    const UUID = uuid()

    // Under the hood, sn needs to pass around some extra data for its own internal usage.
    const augData: AugmentedData = {
      data, // the user's data
      UUID, // the ID we'll use to determine whether requests were "responded to"
      PORT, // the listening port,    so the library knows to whom to send "responses" to
      ADDRESS, // the listening address, although the library will use the address it got from the network
    }

    return _sendAug(port, address, augData, timeout, onResponse, onTimeout)
  }

  const listen = async (
    handleData: (
      data: unknown,
      remote: RemoteSender,
      respond: ResponseCallback
    ) => void
  ) => {
    // This is a wrapped form of the 'handleData' callback the user supplied.
    // Its job is to determine if the incoming data is a response to a request
    // the user sent. It does this by referencing the UUID map object.
    const extractUUIDHandleData = (
      augDataStr: string,
      remote: RemoteSender
    ) => {
      // [TODO] Secure this with validation
      const augData: AugmentedData = JSON.parse(augDataStr)

      const { PORT, UUID, data } = augData
      const address = remote.address

      // This is the return send function. A user will call this if they want
      // to "reply" or "respond" to an incoming message.
      const respond: ResponseCallback = (response: unknown) => {
        const sendData = { data: response, UUID, PORT }
        //@ts-ignore TODO: FIX THISSSSSS (Remove the ignore flag and make typescript not complain about address being possibly undefined)
        return _sendAug(PORT, address, sendData, 0, noop, noop)
      }

      // If we are expecting a response, go through the respond mechanism.
      // Otherwise, it's a normal incoming message.
      const handle = responseUUIDMapping[UUID]
        ? responseUUIDMapping[UUID]
        : handleData

      // Clear the respond mechanism.
      delete responseUUIDMapping[UUID]

      return handle(data, remote, respond)
    }

    // TODO these should be spun up in parallel, but that convolutes code
    // and doesn't save hardly any startup time, so skipping for now.
    // const server = await _net.listen(PORT, ADDRESS, extractUUIDHandleData)
    const server = await _net.listen((data) => {
        extractUUIDHandleData(data)
    })

    return server
  }

  const stopListening = (server: any) => {
    return _net.stopListening(server)
  }

  const returnVal = { send, listen, stopListening }

  return returnVal
}
