const { Sn } = require('../.')
const receipt = require('./applie_receipt.json')

const address = '127.0.0.1'

const listen = {
  address,
  port: 5002,
}

const target = {
  address,
  port: 5001,
}

const RESPONSE_TIMEOUT_MILLIS = 10000

const sn = Sn(listen)

sn.listen((data) => {
  console.log('Received Data:', data)
})

const main = async () => {
  let data = JSON.stringify(receipt)

  const promises = []
  for (let i = 0; i < 100; i++) {
    promises.push(
      sn
        .send(
          target.port,
          target.address,
          data,
          RESPONSE_TIMEOUT_MILLIS,
          (response) => {
            console.log('Received response:', response)
          },
          () => {
            console.log('Failed to receive response message in time.')
          }
        )
        .catch(console.error)
    )
  }
  console.log(promises)
  await Promise.all(promises).catch(console.error)
  console.log('Completed')

  console.log(sn.stats())
}

main()
