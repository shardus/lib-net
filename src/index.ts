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

export const isObject = (val) => {
  if (val === null) {
    return false
  }
  if (Array.isArray(val)) {
    return false
  }
  return typeof val === 'function' || typeof val === 'object'
}

function base64BufferReviver(key: string, value: any) {
  const originalObject = value
  if (
    isObject(originalObject) &&
    originalObject.hasOwnProperty('dataType') &&
    originalObject.dataType &&
    originalObject.dataType == 'bh'
  ) {
    return Buffer.from(originalObject.data, 'base64')
  } else {
    return value
  }
}

export type ListenCallback = (data: unknown, remote: RemoteSender, respond: ResponseCallback) => void

const noop = () => {}

export type SnOpts = {
  port: number
  address?: string
  senderOpts?: {
    useLruCache?: boolean
    lruSize: number
  }
  customStringifier?: (val: any) => string
}

// We have to generate a closure so,
// 1) We can test simulated from two isolated environments, and
// 2) Users can use two distinct copies if they want to, for whatever
//    reason.
//
// We need to pass in the port and address to the whole closure so that
// the `send` function can augment its sent data with the port the `listen`
// function will be listening on. This is necessary to simulate "responding"
// to a "request".
export const Sn = (opts: SnOpts) => {
  validate(opts)

  const PORT = opts.port
  const ADDRESS = opts.address || DEFAULT_ADDRESS
  const USE_LRU_CACHE = (opts.senderOpts && opts.senderOpts.useLruCache) || false
  const LRU_SIZE = (opts.senderOpts && opts.senderOpts.lruSize) || 1028

  const _net = net.Sn(PORT, ADDRESS, USE_LRU_CACHE, LRU_SIZE)

  // we're going to keep track of response IDs here
  const responseUUIDMapping: {
    [uuid: string]: {
      callback: (data: unknown) => void
      timestamp: number
    }
  } = {}

  const timedOutUUIDMapping = new TTLMap<{
    timedOutAt: number
    requestCreatedAt: number
  }>()

  const retainTimedOutEntriesFor = 1000 * 60

  const _sendAug = async (
    port: number,
    address: string,
    augData: AugmentedData,
    timeout: number,
    onResponse: ResponseCallback,
    onTimeout: TimeoutCallback
  ) => {
    let stringifiedData: string
    if (opts.customStringifier) {
      stringifiedData = opts.customStringifier(augData)
    } else {
      stringifiedData = JSON.stringify(augData)
    }
    return new Promise<void>((resolve, reject) => {
      _net.send(port, address, stringifiedData, (error) => {
        if (error) {
          reject(error)
        } else {
          resolve()
        }
      })

      // a timeout of 0 means no return message is expected.
      if (timeout !== 0) {
        const timer = setTimeout(() => {
          const mapping = responseUUIDMapping[augData.UUID]
          timedOutUUIDMapping.set(
            augData.UUID,
            {
              timedOutAt: Date.now(),
              requestCreatedAt: mapping !== undefined ? mapping.timestamp : 0,
            },
            retainTimedOutEntriesFor
          )
          /* prettier-ignore */ console.log(`_sendAug: request id ${augData.UUID}: timed out after ${Date.now() - mapping.timestamp}ms`)
          /* prettier-ignore */ console.log(`_sendAug: request id ${augData.UUID}: detailed aug data: ${JSON.stringify(augData)}`)
          delete responseUUIDMapping[augData.UUID]
          onTimeout()
        }, timeout)

        responseUUIDMapping[augData.UUID] = {
          callback: (data: unknown) => {
            clearTimeout(timer)
            onResponse(data)
          },
          timestamp: Date.now(),
        }
      }
    })
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
    handleData: (data: unknown, remote: RemoteSender, respond: ResponseCallback) => void
  ) => {
    // This is a wrapped form of the 'handleData' callback the user supplied.
    // Its job is to determine if the incoming data is a response to a request
    // the user sent. It does this by referencing the UUID map object.
    const extractUUIDHandleData = (augDataStr: string, remote: RemoteSender) => {
      // [TODO] Secure this with validation
      let augData: AugmentedData = JSON.parse(augDataStr, base64BufferReviver)
      const { PORT, UUID, data } = augData
      const address = remote.address

      // This is the return send function. A user will call this if they want
      // to "reply" or "respond" to an incoming message.
      const respond: ResponseCallback = (data: unknown) => {
        const sendData = { data, UUID, PORT }
        //@ts-ignore TODO: FIX THISSSSSS (Remove the ignore flag and make typescript not complain about address being possibly undefined)
        // @TODO: This error should be properly propagated and logged.
        return _sendAug(PORT, address, sendData, 0, noop, noop).catch(console.error)
      }

      // If we are expecting a response, go through the respond mechanism.
      // Otherwise, it's a normal incoming message.
      const handle = responseUUIDMapping[UUID] ? responseUUIDMapping[UUID].callback : handleData

      if (responseUUIDMapping[UUID]) {
        /* prettier-ignore */ console.log(`listen: extractUUIDHandleData: request id ${UUID}: incoming message found in responseUUIDMapping`)
        /* prettier-ignore */ console.log(`listen: extractUUIDHandleData: request id ${UUID}: actual time take for operation ${Date.now() - responseUUIDMapping[UUID].timestamp}ms`)
      } else {
        /* prettier-ignore */ console.log(`listen: extractUUIDHandleData: request id ${UUID}: incoming message not found in responseUUIDMapping`)
        if (timedOutUUIDMapping.get(UUID)) {
          /* prettier-ignore */ console.log(`listen: extractUUIDHandleData: request id ${UUID}: incoming message was found in timedOutUUIDMapping`)
          const entry = timedOutUUIDMapping.get(UUID)
          if (entry != undefined) {
            /* prettier-ignore */ console.log(`listen: extractUUIDHandleData: request id ${UUID}: incoming message was found in timedOutUUIDMapping, timed out at ${entry.timedOutAt}, request created at ${entry.requestCreatedAt}, response received at ${Date.now()}`)
            /* prettier-ignore */ console.log(`listen: extractUUIDHandleData: request id ${UUID}: actual time taken for operation ${Date.now() - entry.requestCreatedAt}ms`)
          }
        }
      }

      // Clear the respond mechanism.
      delete responseUUIDMapping[UUID]

      return handle(data, remote, respond)
    }

    // TODO these should be spun up in parallel, but that convolutes code
    // and doesn't save hardly any startup time, so skipping for now.
    // const server = await _net.listen(PORT, ADDRESS, extractUUIDHandleData)
    const server = await _net.listen((data, remoteIp, remotePort) => {
      extractUUIDHandleData(data, {
        address: remoteIp,
        port: remotePort,
      })
    })

    return server
  }

  const evictSocket = (port: number, address: string) => {
    return _net.evict_socket(port, address)
  }

  const stopListening = (server: any) => {
    return _net.stopListening(server)
  }

  const stats = () => _net.stats()

  const returnVal = { send, listen, stopListening, stats, evictSocket }

  return returnVal
}
