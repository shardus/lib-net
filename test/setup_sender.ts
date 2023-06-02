import { Sn } from '../build/src'

const RESPONSE_DELAY_MILLIS = 500
const USE_LRU_CACHE = true

const setupLruSender = () => {
  const port = 49152
  if (USE_LRU_CACHE) {
    console.log("Using LRU cache")
    return Sn({
      port, senderOpts: {
        useLruCache: true,
        lruSize: 5,
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
  let counter = 0
  await sn.listen((data: unknown, remote, respond) => {
    console.log(`${data}`)
    console.log(`Received: ${JSON.stringify(data)} from ${JSON.stringify(remote)}`);

    setTimeout(() => {
      respond("Response message");
    }, RESPONSE_DELAY_MILLIS);

    if (counter++ % 1000 === 0)
      console.log(sn.stats());
  })
}

main().catch((err) => console.log("ERROR: ", err))