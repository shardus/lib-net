const Sn = require('../src/index')

const address = '127.0.0.1'
const port = 5001

const sn = Sn({
  address,
  port
})

const main = async () => {
  await sn.listen(async (data) => {
    console.log(data.payload.length)
  })
  console.log(`Server listening on port ${port}...`)
}

main()
