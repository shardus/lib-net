import { AugmentedData } from '../types'

/**
 * long info and timers for our message
 * @param augData
 * @param stringifiedData
 * @param sending
 * @param receivedTime
 */
export function logMessageInfo(
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
