const net = require('../build/src/net')

const address = '127.0.0.1'

const target = {
  address,
  port: 5001
}

const main = async () => {
  const longMsg = '0'.repeat(100000);
  const promises = []
  for (let i = 0; i < 1000; i++) {
    promises.push(net.send(target.port, target.address, longMsg))
  }
  await Promise.all(promises)
}

main()
