import { getSenderAddress } from '../.'
import { Transaction, TransactionType, TransactionFactory } from '@ethereumjs/tx'
import { toBytes } from '@ethereumjs/util'

let raw_tx =
  '0x01f90129821f9205832dc6c0832dc6c0946b92bdc43874fc19ead67ac7e37f2e126667b30780b844a9059cbb000000000000000000000000cd21d146980570e2dfb5f65a5881efbfdd882ab2000000000000000000000000000000000000000000000000016345785d8a0000f87cf87a946b92bdc43874fc19ead67ac7e37f2e126667b307f863a04d6102e88f63713248aa95286e545e26b440b909136464216b41036801218d26a0216d8091b2612eb7def258a018b1f2bdc6633976c86e5206357ff8385135f664a08066a4dac9c48b171b3aec8bfb10db23409617b8d8cc77acd57d766f7cc4f40080a0131cc2e628e7312f6f8ba901e83c75df0c780f99f588b3cd1d88d2d546140126a008e7e60fe3996a4601e4378d8a10c99ec30887d0dabdd6d8944b8c5a0c04caab'
let expected_addr_str = '0x384913564a4b0b6f54adcac3c5fc627d69f9fe41'

console.log(getSenderAddress(raw_tx))
console.log('Is address consistent?:', getSenderAddress(raw_tx) === expected_addr_str)

function getTransactionObj(
  tx
): Transaction[TransactionType.Legacy] | Transaction[TransactionType.AccessListEIP2930] {
  if (!tx.raw) throw Error('fail')
  let transactionObj
  const serializedInput = toBytes(tx.raw)
  try {
    transactionObj = TransactionFactory.fromSerializedData<TransactionType.Legacy>(serializedInput)
  } catch (e) {
    // if (ShardeumFlags.VerboseLogs) console.log('Unable to get legacy transaction obj', e)
  }
  if (!transactionObj) {
    try {
      transactionObj =
        TransactionFactory.fromSerializedData<TransactionType.AccessListEIP2930>(serializedInput)
    } catch (e) {
      throw Error('fail')
    }
  }

  if (transactionObj) {
    return transactionObj
  } else throw Error('tx obj fail')
}

let totalExecutionTime = 0
const numberOfRuns = 10000

// warmup
for (let i = 0; i < numberOfRuns; i++) {
  getSenderAddress(raw_tx)
}

for (let i = 0; i < numberOfRuns; i++) {
  const start = performance.now()

  getSenderAddress(raw_tx)

  const end = performance.now()
  totalExecutionTime += end - start
}

const averageExecutionTime = totalExecutionTime / numberOfRuns
console.log(`Average execution time for rust getSenderAddress: ${averageExecutionTime} ms`)

let totalExecutionTime2 = 0
for (let i = 0; i < numberOfRuns; i++) {
  const start = performance.now()

  const tx = getTransactionObj({ raw: raw_tx })
  tx.getSenderAddress()

  const end = performance.now()
  totalExecutionTime2 += end - start
}
const averageExecutionTime2 = totalExecutionTime2 / numberOfRuns
console.log(`Average execution time for js getSenderAddress: ${averageExecutionTime2} ms`)
