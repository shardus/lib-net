const { Sn } = require('../.')
const receipt = require('./applie_receipt.json')

const address = '127.0.0.1'

const target = {
  address,
  port: 5001
}

const sn = Sn(target)

const main = async () => {
  const data = JSON.stringify(receipt);
  const promises = []
  for (let i = 0; i < 1000; i++) {
    promises.push(sn.send(target.port, target.address, data))
  }
  console.log(promises)
  await Promise.all(promises)
}

main()
