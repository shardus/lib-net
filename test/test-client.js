const { Sn } = require('../.')
const receipt = require('./applie_receipt.json')

const address = '127.0.0.1'

const target = {
  address,
  port: 5001
}

const sn = Sn(target)

const main = async () => {
  let data = JSON.stringify(receipt);

  const promises = []
  for (let i = 0; i < 1000; i++) {
    promises.push(sn.send(target.port, target.address, data, 1000, (response) => {
      console.log("Responded with: ", response);
    }).catch((err) => console.error("ERROR: ", err)))
  }
  console.log(promises)
  await Promise.all(promises)
  console.log("Completed");
}

main()
