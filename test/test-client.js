const Sn = require('../src/index')

const address = '127.0.0.1'
const port = 5002

const sn = Sn({
  address,
  port
})

const target = {
  address,
  port: 5001
}

const main = async () => {
  await sn.listen(async (data) => {
    console.log(data.payload.length)
  })

  const longMsg = {
    payload: '0'.repeat(100000)
  }
  const promises = []
  for (let i = 0; i < 1000; i++) {
    promises.push(sn.send(target.port, target.address, longMsg))
  }
  await Promise.all(promises)
}

main()
