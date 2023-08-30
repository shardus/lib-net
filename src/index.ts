import * as uuid from 'uuid/v1'
import validate from './opts'
import { NewNumberHistogram } from './util/Histogram'
import { TTLMap } from './util/TTLMap'
import { Headers } from './headers'
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

  //here are some timestamps we can add to learn more about the time it takes for a TX
  //to move through the system

  /** timestamp of when we receive the TX */
  sendTime: number
  /** timestamp of then we got the message */
  receivedTime: number
  /** if this is a response we can log when did we send the response */
  replyTime: number
  /** the time when we receive a response */
  replyReceivedTime: number

  /**
   *  this will show if the message is a ask, tell, or resp
   *  in shardus net we call send() in two locations.  the ask will use a callback and timeout handler
   *  that it will resolve
   *  The one way send will not set these handlers.
   *  if we are listening and need to reply to a message then we use _sendAug (with no callback)
   *  do we need to put the message type in aug data? that could help in cases where the uuid is gone.
   */
  msgDir: 'ask' | 'tell' | 'resp'
}

/**
 * long info and timers for our message
 * @param augData
 * @param stringifiedData
 * @param sending
 * @param receivedTime
 */
function logMessageInfo(
  augData: AugmentedData,
  stringifiedData: string,
  sending: boolean = true,
  receivedTime: number = 0
) {
  //first 50 chars of the message
  let logData = stringifiedData.slice(0, 50)
  let sendingStr = sending ? 'sending' : 'receiving'
  let logMsg = `netmsglog: ${sendingStr} ${augData.msgDir}: ${logData} UUID: ${augData.UUID} PORT: ${augData.PORT} ADDRESS: ${augData.ADDRESS}`

  if (augData.msgDir === 'tell') {
    if (augData.sendTime != null) {
      //log timestamps for sendTime
      logMsg += ` sendTime:${augData.sendTime}`
      if (sending === false) {
        logMsg += ` recvTime:${receivedTime} recvDelta:${receivedTime - augData.sendTime}`
      }
    }
  } else if (augData.msgDir === 'ask') {
    if (augData.sendTime != null) {
      logMsg += ` sendTime:${augData.sendTime}`
      if (sending === false) {
        logMsg += ` recvTime:${receivedTime} recvDelta:${receivedTime - augData.sendTime}`
      }
    }
  } else if (augData.msgDir === 'resp') {
    if (augData.sendTime != null) {
      //reply delta is interesting as it is the time needed for the software to get the reply ready
      logMsg += ` sendTime:${augData.sendTime} replyTime:${augData.replyTime} replyDelta:${
        augData.replyTime - augData.receivedTime
      } `
      if (sending === false) {
        // note the ask is how long it took for the original ask to get a reply, not the same as recvDelta, same code but but run at a different time/state
        logMsg += ` recvTime:${receivedTime} askDelta:${receivedTime - augData.sendTime}`
        logMsg += ` replyRecvTime:${augData.replyReceivedTime} replyRecvDelta:${
          receivedTime - augData.replyReceivedTime
        }`
      }
    }
  }

  console.log(logMsg)
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
  headerOpts?: {
    sendWithHeaders: boolean
    sendHeaderVersion: number
  }
  customStringifier?: (val: any) => string
}

export const Sn = (opts: SnOpts) => {
  validate(opts)

  const PORT = opts.port
  const ADDRESS = opts.address || DEFAULT_ADDRESS
  const USE_LRU_CACHE = (opts.senderOpts && opts.senderOpts.useLruCache) || false
  const LRU_SIZE = (opts.senderOpts && opts.senderOpts.lruSize) || 1028

  const HEADER_OPTS = opts.headerOpts || {
    sendWithHeaders: false,
    sendHeaderVersion: 0,
  }

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

  const histogram = NewNumberHistogram(
    '[stats] Shardus net request times - histogram (seconds)',
    [0, 5, 10, 20, 40, 60]
  )

  const retainTimedOutEntriesForMillis = 1000 * 60

  /**
   * This sends our data the that is wrapped in an augData structure
   * a new function will be added similar to this one to send data with headers
   * @param port
   * @param address
   * @param augData
   * @param timeout
   * @param onResponse
   * @param onTimeout
   * @returns
   */
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

    logMessageInfo(augData, stringifiedData)

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
            retainTimedOutEntriesForMillis,
            (key, value) => {
              /* prettier-ignore */ console.log(`_sendAug: request id ${key}: expired from timedOutUUIDMapping at ${value.timedOutAt}, request created at ${value.requestCreatedAt}}`)
              histogram.logData((Date.now() - value.requestCreatedAt) / 1000)
            }
          )
          /* prettier-ignore */ console.log(`_sendAug: request id ${augData.UUID}: timed out after ${Date.now() - mapping.timestamp}ms`)
          /* prettier-ignore */ console.log(`_sendAug: request id ${augData.UUID}: detailed aug data: ${JSON.stringify(augData)}`)

          //should we clear the request socket here?
          //should be be logging better at this level
          //maybe a counter service could be passed to this library?

          delete responseUUIDMapping[augData.UUID]
          onTimeout()
        }, timeout)

        // this is where we bind the response callback to the UUID
        // later extractUUIDHandleData will call this callback if it
        // finds a UUID match.
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

  const sendWithHeaders = async (
    port: number,
    address: string,
    data: unknown,
    timeout = 0,
    headers: Headers = {},
    onResponse: ResponseCallback = noop,
    onTimeout: TimeoutCallback = noop
  ) => {
    const UUID = uuid()

    let msgDir: 'ask' | 'tell' = 'ask'
    if (onResponse === noop) {
      msgDir = 'tell'
    }

    const augData: AugmentedData = {
      data, // the user's data
      UUID, // the ID we'll use to determine whether requests were "responded to"
      PORT, // the listening port,    so the library knows to whom to send "responses" to
      ADDRESS, // the listening address, although the library will use the address it got from the network

      sendTime: Date.now(),
      receivedTime: 0,
      replyTime: 0,
      replyReceivedTime: 0,
      msgDir,
    }

    return _sendAug(port, address, augData, timeout, onResponse, onTimeout)
  }

  // TODO_HEADERS I think we may need to send asks in the future with a node ID as well if we want to check
  // for an already existing socket connection
  // need to sort out the security though or else a node may be able to fake owning an ID unless we actually verify one
  // signature from it. maybe the first header needs a signature? or maybe we need some way to ask shardus core
  // if an incoming message from a certain public key is valid. This is a bit complex
  const send = async (
    port: number,
    address: string,
    data: unknown,
    timeout = 0,
    onResponse: ResponseCallback = noop,
    onTimeout: TimeoutCallback = noop
  ) => {
    const UUID = uuid()

    //TODO_HEADERS sending a port and address seems wrong here!! the response should come back over the existing socket
    //seems like this was written as if we are udp

    let msgDir: 'ask' | 'tell' = 'ask'
    if (onResponse === noop) {
      msgDir = 'tell'
    }

    // Under the hood, sn needs to pass around some extra data for its own internal usage.
    const augData: AugmentedData = {
      data, // the user's data
      UUID, // the ID we'll use to determine whether requests were "responded to"
      PORT, // the listening port,    so the library knows to whom to send "responses" to
      ADDRESS, // the listening address, although the library will use the address it got from the network

      sendTime: Date.now(),
      receivedTime: 0,
      replyTime: 0,
      replyReceivedTime: 0,
      msgDir,
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

      //here we will log the received message.  note we exploit an aspect of augData
      //that the data part is the first value and will be close enough to the start ot the string
      //to save us from an expensive re-stringify just to get log data of the message
      logMessageInfo(augData, augDataStr, false, Date.now())

      const { PORT, UUID, data } = augData
      const address = remote.address

      const receivedTime = Date.now()
      // This is the return send function. A user will call this if they want
      // to "reply" or "respond" to an incoming message.
      const respond: ResponseCallback = (data: unknown) => {
        //we can do some timestamp work here for better logging.
        const replyTime = Date.now()
        const sendData = {
          data,
          UUID,
          PORT,
          ADDRESS: undefined,
          sendTime: augData.sendTime,
          receivedTime,
          replyTime,
          replyReceivedTime: 0,
          msgDir: 'resp',
        }

        //this is a "response"

        //@ts-ignore TODO: FIX THISSSSSS (Remove the ignore flag and make typescript not complain about address being possibly undefined)
        // @TODO: This error should be properly propagated and logged.
        return _sendAug(PORT, address, sendData, 0, noop, noop).catch(console.error)
      }

      // If we are expecting a response, go through the respond mechanism.
      // Otherwise, it's a normal incoming message.
      const handle = responseUUIDMapping[UUID] ? responseUUIDMapping[UUID].callback : handleData

      if (responseUUIDMapping[UUID] !== undefined) {
        /* prettier-ignore */ console.log(`listen: extractUUIDHandleData: request id ${UUID}: incoming message found in responseUUIDMapping`)
        /* prettier-ignore */ console.log(`listen: extractUUIDHandleData: request id ${UUID}: actual time taken for operation ${Date.now() - responseUUIDMapping[UUID].timestamp}ms`)
        histogram.logData((Date.now() - responseUUIDMapping[UUID].timestamp) / 1000)
      } else {
        /* prettier-ignore */ console.log(`listen: extractUUIDHandleData: request id ${UUID}: incoming message not found in responseUUIDMapping`)
        const entry = timedOutUUIDMapping.get(UUID)
        if (entry != undefined) {
          /* prettier-ignore */ console.log(`listen: extractUUIDHandleData: request id ${UUID}: incoming message was found in timedOutUUIDMapping`)
          if (entry != undefined) {
            /* prettier-ignore */ console.log(`listen: extractUUIDHandleData: request id ${UUID}: incoming message was found in timedOutUUIDMapping, timed out at ${entry.timedOutAt}, request created at ${entry.requestCreatedAt}, response received at ${Date.now()}`)
            /* prettier-ignore */ console.log(`listen: extractUUIDHandleData: request id ${UUID}: actual time taken for operation ${Date.now() - entry.requestCreatedAt}ms`)
          }
          histogram.logData((Date.now() - entry.requestCreatedAt) / 1000)
          timedOutUUIDMapping.delete(UUID)
        }
      }

      // Clear the respond mechanism.
      delete responseUUIDMapping[UUID]

      return handle(data, remote, respond)
    }

    // OLD comment from initial implementation:
    // TODO these should be spun up in parallel, but that convolutes code
    // and doesn't save hardly any startup time, so skipping for now.
    // const server = await _net.listen(PORT, ADDRESS, extractUUIDHandleData)

    //args to the callback function in listen
    //let args: [Handle<JsValue>; 3] = [message.upcast(), remote_ip.upcast(), remote_port.upcast()];

    // TODO_HEADERS: extractUUIDHandleData will will have to be swapped with something a step up
    // that can check the first byte and determine if we use the old json protocol or a new protocol
    // with headers
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

  const updateHeaderOpts = (opts: { sendWithHeaders: boolean; sendHeaderVersion: number }) => {
    HEADER_OPTS.sendWithHeaders = opts.sendWithHeaders
    HEADER_OPTS.sendHeaderVersion = opts.sendHeaderVersion
  }

  const stats = () => _net.stats()

  const returnVal = { send, listen, stopListening, stats, evictSocket, updateHeaderOpts }

  return returnVal
}
