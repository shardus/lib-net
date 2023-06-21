import { Sn } from '../.'
import { Command } from 'commander'

const setupLruSender = (port: number, lruSize: number) => {
  return Sn({
    port,
    address: '127.0.0.1',
    senderOpts: {
      useLruCache: true,
      lruSize: lruSize,
    },
  })
}

const main = async () => {
  /*
    create a cli with the following options:
      -p, --port < port > Port to listen on
      -c, --cache < size > Size of the LRU cache
    
    the cli should create a sender with the following options:
      - lruSize: <size>
      - port: <port>

    on running the cli a listener should be started and sending of message with input from terminal should be allowed
  */

  console.log('Starting cli...')

  const program = new Command()
  program.requiredOption('-p, --port <port>', 'Port to listen on')
  program.option('-c, --cache <size>', 'Size of the LRU cache', '2')
  program.parse(process.argv)

  const port = program.getOptionValue('port').toString()
  const cacheSize = program.getOptionValue('cache').toString()

  console.log(`Starting listener on port ${port} with cache size ${cacheSize}`)

  const sn = setupLruSender(+port, +cacheSize)

  const input = process.stdin
  input.addListener('data', async (data: Buffer) => {
    const inputs = data.toString().trim().split(' ')
    if (inputs.length === 3) {
      const message = inputs[2]
      await sn.send(+inputs[1], '127.0.0.1', { message, fromPort: +port })
      console.log('Message sent')
    } else if (inputs.length === 2) {
      await sn.evictSocket(+inputs[1], '127.0.0.1')
      console.log('Cache cleared')
    } else {
      console.log('=> send <port> <message>')
      console.log('=> clear <port>')
    }
  })

  sn.listen((data: any, remote, respond) => {
    if (data && data.message === 'ping') {
      console.log('Received ping from:', data.fromPort)
      return respond({ message: 'pong', fromPort: +port })
    }
    if (data && data.message === 'pong') {
      console.log('Received pong from:', data.fromPort)
    }
  })
}

main().catch((err) => console.log('ERROR: ', err))
