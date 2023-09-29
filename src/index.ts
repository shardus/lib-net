import * as uuid from 'uuid/v1'
import {
  AppHeaders,
  AugmentedData,
  CombinedHeaders,
  CompressionTechnique,
  ListenerResponder,
  NewAugData,
  RemoteSender,
  ResponseCallback,
  SnOpts,
  TimeoutCallback,
  validateSnOpts,
} from './types'
import { base64BufferReviver, stringifyData } from './util/Encoding'
import { NewNumberHistogram } from './util/Histogram'
import { logMessageInfo } from './util/Log'
import { TTLMap } from './util/TTLMap'
const net = require('../../shardus-net.node')

const DEFAULT_ADDRESS = '0.0.0.0'

const COMPRESSION_TECHNIQUE: CompressionTechnique = 'Gzip'

const noop = () => {}

export const Sn = (opts: SnOpts) => {
  validateSnOpts(opts)

  const PORT = opts.port
  const ADDRESS = opts.address || DEFAULT_ADDRESS
  const USE_LRU_CACHE = (opts.senderOpts && opts.senderOpts.useLruCache) || false
  const LRU_SIZE = (opts.senderOpts && opts.senderOpts.lruSize) || 1028
  const SIGNING_SECRET_KEY_HEX = opts.signingSecretKeyHex

  const HEADER_OPTS = opts.headerOpts || {
    sendHeaderVersion: 0,
    enableDataCompression: true,
  }

  const _net = net.Sn(PORT, ADDRESS, USE_LRU_CACHE, LRU_SIZE, SIGNING_SECRET_KEY_HEX)

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
    onTimeout: TimeoutCallback,
    optionalHeader?: {
      version: number
      headerData: CombinedHeaders
    }
  ) => {
    const stringifiedData = stringifyData(augData, opts.customStringifier)
    const stringifiedHeader = optionalHeader
      ? stringifyData(optionalHeader.headerData, opts.customStringifier)
      : null

    logMessageInfo(augData, stringifiedData)

    return new Promise<void>((resolve, reject) => {
      const sendCallback = (error) => {
        if (error) {
          reject(error)
        } else {
          resolve()
        }
      }
      if (optionalHeader && stringifiedHeader !== null) {
        console.log('sending with headers')
        _net.send_with_headers(
          port,
          address,
          optionalHeader.version,
          stringifiedHeader,
          stringifiedData,
          sendCallback
        )
      } else {
        console.log('sending without headers')
        _net.send(port, address, stringifiedData, sendCallback)
      }

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
    headers: AppHeaders,
    timeout = 0,
    onResponse: ResponseCallback = noop,
    onTimeout: TimeoutCallback = noop
  ) => {
    const UUID = uuid()

    let msgDir: 'ask' | 'tell' = 'ask'
    if (onResponse === noop) {
      msgDir = 'tell'
    }

    const augData: AugmentedData = NewAugData(data, UUID, PORT, ADDRESS, timeout, msgDir)

    const combinedHeaders: CombinedHeaders = {
      uuid: UUID,
      message_type: headers.message_type,
      sender_id: headers.sender_id,
    }

    if (HEADER_OPTS.enableDataCompression) {
      combinedHeaders.compression = COMPRESSION_TECHNIQUE
    }

    return _sendAug(port, address, augData, timeout, onResponse, onTimeout, {
      version: HEADER_OPTS.sendHeaderVersion,
      headerData: combinedHeaders,
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

    let msgDir: 'ask' | 'tell' = 'ask'
    if (onResponse === noop) {
      msgDir = 'tell'
    }

    const augData: AugmentedData = NewAugData(data, UUID, PORT, ADDRESS, timeout, msgDir)

    return _sendAug(port, address, augData, timeout, onResponse, onTimeout)
  }

  const listen = async (
    handleData: (
      data: unknown,
      remote: RemoteSender,
      respond: ListenerResponder,
      headers?: AppHeaders
    ) => void
  ) => {
    // This is a wrapped form of the 'handleData' callback the user supplied.
    // Its job is to determine if the incoming data is a response to a request
    // the user sent. It does this by referencing the UUID map object.
    const extractUUIDHandleData = (augDataStr: string, remote: RemoteSender, headers?: AppHeaders) => {
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
      const respond: ListenerResponder = (data?: unknown, headers?: AppHeaders) => {
        //we can do some timestamp work here for better logging.
        const replyTime = Date.now()
        if (replyTime > augData.sendTime + augData.timeout) {
          /* prettier-ignore */ console.log(`listen: extractUUIDHandleData: request id ${UUID}: reply time ${replyTime} is greater than timeout ${augData.sendTime + augData.timeout}. ignoring respond call`)
          return
        }
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

        const combinedHeaders: CombinedHeaders = {
          uuid: UUID,
        }
        if (headers) {
          combinedHeaders.message_type = headers.message_type
          combinedHeaders.sender_id = headers.sender_id
        }
        if (HEADER_OPTS.enableDataCompression) {
          combinedHeaders.compression = COMPRESSION_TECHNIQUE
        }

        //@ts-ignore TODO: FIX THISSSSSS (Remove the ignore flag and make typescript not complain about address being possibly undefined)
        // @TODO: This error should be properly propagated and logged.
        return _sendAug(PORT, address, sendData, 0, noop, noop, {
          version: HEADER_OPTS.sendHeaderVersion,
          headerData: combinedHeaders,
        }).catch(console.error)
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
          /* prettier-ignore */ console.log(`listen: extractUUIDHandleData: request id ${UUID}: incoming message was found in timedOutUUIDMapping, timed out at ${entry.timedOutAt}, request created at ${entry.requestCreatedAt}, response received at ${Date.now()}`)
          /* prettier-ignore */ console.log(`listen: extractUUIDHandleData: request id ${UUID}: actual time taken for operation ${Date.now() - entry.requestCreatedAt}ms`)
          histogram.logData((Date.now() - entry.requestCreatedAt) / 1000)
          timedOutUUIDMapping.delete(UUID)
        }
      }

      // Clear the respond mechanism.
      delete responseUUIDMapping[UUID]

      return handle(data, remote, respond, headers)
    }

    // OLD comment from initial implementation:
    // TODO these should be spun up in parallel, but that convolutes code
    // and doesn't save hardly any startup time, so skipping for now.
    // const server = await _net.listen(PORT, ADDRESS, extractUUIDHandleData)
    const server = await _net.listen((data, remoteIp, remotePort, headerVersion?, headerData?) => {
      if (headerVersion !== null && headerData !== null) {
        console.log(`received with headers version: ${headerVersion}`)
        const headers: AppHeaders = JSON.parse(headerData)
        extractUUIDHandleData(
          data,
          {
            address: remoteIp,
            port: remotePort,
          },
          headers
        )
        return
      }

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

  const updateHeaderOpts = (opts: { sendHeaderVersion: number; enableDataCompression: boolean }) => {
    HEADER_OPTS.sendHeaderVersion = opts.sendHeaderVersion
    HEADER_OPTS.enableDataCompression = opts.enableDataCompression
  }

  const stats = () => _net.stats()

  const returnVal = { send, sendWithHeaders, listen, stopListening, stats, evictSocket, updateHeaderOpts }

  return returnVal
}
