import * as uuid from 'uuid/v1'
import validate from './opts'
import { NewNumberHistogram } from './util/Histogram'
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
  //sendTime : timestamp of when we receive the TX

  //not certain we have a great way to connect these yet 
  //receivedTime: timestamp of then we got the message
  //responseTime:  if this is a response we can log when did we send the response

  //should have on option to log aug data for every incoming and outgoing message
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

//TODO_HEADERS we the ability to change if sending with headers is enabled.
//new nodes will rotate in with the ability to do so, but we will need to let shardeum
//migration control when this feature becomes active. 
//basically needs some an exposed method to allow setting this flag
//receiving either type of message is non breaking if we do it right.


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

  //TODO_HEADERS create a new _sendWithHeaders function that can send data with a header object.
  //We will use versioned binary headers but that will be handled in rust.
  //The data passed in for the message should be a json object.  initially this will still use
  //JSON, but some messages will get converted to binary most likely on the rust side of things for
  //performance reasons, but we will need to test this. 


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

        //we can do some timestamp work here for better logging.

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

  const stats = () => _net.stats()

  const returnVal = { send, listen, stopListening, stats, evictSocket }

  return returnVal
}
