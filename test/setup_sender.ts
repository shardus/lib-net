import { Sn } from '../build/src'

const RESPONSE_DELAY_MILLIS = 200
const USE_LRU_CACHE = false

const setupLruSender = () => {
  const port = 49152
  if (USE_LRU_CACHE) {
    console.log("Using LRU cache")
    return Sn({
      port, senderOpts: {
        useLruCache: false,
        lruSize: 128,
      }
    })
  } else {
    console.log("Using hash map cache")
    return Sn({
      port
    })
  }
}

const main = async () => {
  const sn = setupLruSender()
  await sn.listen((data: any, remote, respond) => {
    console.log(`Received: ${data.length} from ${JSON.stringify(remote)}`);

    setTimeout(() => {
      respond("Response message");
    }, RESPONSE_DELAY_MILLIS);

    console.log(sn.stats());
  })
}

main().catch((err) => console.log("ERROR: ", err))