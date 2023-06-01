import { Sn } from '../build/src'

// Test constants

const NUMBER_OF_SOCKET_CLIENTS = 1024 // Unique socket clients to be used for the bombardment
const STARTING_PORT = 49153
const NUMBER_OF_BOMBS: number = -1 // Number of socket bombs to be sent per socket client (-1 for infinite)
const TARGET_SOCKET_HOST = '127.0.0.1' // Internal host of the validator to be bombarded
const TARGET_SOCKET_PORT = 49152 // Internal port of the validator to be bombarded
const MESSAGE_JSON = { route: 'bombardment-test', payload: 'Hello, world!' } // Message to be sent to the validator
const RAMP_UP_STRATEGY: 'linear' | 'none' = 'none' // Ramp up strategy to be used for the bombardment
const RAMP_UP_EVERY_X_BOMBS = 10 // Number of bombs to be sent before ramping up the number of socket clients

// Test variables

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const socketClients: any[] = []
let metrics = {
  successfulSends: 0,
  failedSends: 0,
}

// Setup helpers

function setupSocketClients() {
  for (let i = 0; i < NUMBER_OF_SOCKET_CLIENTS; i++) {
    const port = STARTING_PORT + i
    socketClients.push(Sn({ port }))
  }
  console.log(`Socket clients created: ${socketClients.length}`)
}

// Test helpers

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Tests

async function socketBombardment() {
  setupSocketClients()
  await delay(3000)

  for (let i = 0; i < NUMBER_OF_BOMBS || NUMBER_OF_BOMBS === -1; i++) {
    const promises: Promise<void>[] = []
    const baseSocketClients = Math.floor(NUMBER_OF_SOCKET_CLIENTS / RAMP_UP_EVERY_X_BOMBS)
    console.log(`Bombardment ${i + 1} of ${NUMBER_OF_BOMBS === -1 ? 'infinite' : NUMBER_OF_BOMBS}`)
    let socketClientsToUse = NUMBER_OF_SOCKET_CLIENTS
    if (RAMP_UP_STRATEGY === 'linear' && i % RAMP_UP_EVERY_X_BOMBS === 0) {
      console.log(`Ramping up socket clients from ${socketClientsToUse} to ${baseSocketClients * Math.floor(i / RAMP_UP_EVERY_X_BOMBS)}`)
      socketClientsToUse = baseSocketClients * Math.floor(i / RAMP_UP_EVERY_X_BOMBS)
      if (socketClientsToUse > NUMBER_OF_SOCKET_CLIENTS)
        socketClientsToUse = NUMBER_OF_SOCKET_CLIENTS
    }
    for (let j = 0; j < socketClientsToUse; j++) {
      // console.log(`Sending message ${j + 1} of ${NUMBER_OF_SOCKET_CLIENTS}`)
      // eslint-disable-next-line security/detect-object-injection
      promises.push(
        socketClients[j]
          .send(TARGET_SOCKET_PORT, TARGET_SOCKET_HOST, MESSAGE_JSON)
          .catch((err) => console.error(`Bombardment ${i + 1} of ${NUMBER_OF_BOMBS} failed. Error: ${err}`))
      )
    }
    await Promise.all(promises)
  }
}

async function socketBombardmentWithLimitedActiveSockets(numberOfActiveSockets: number) {
  setupSocketClients()
  await delay(3000)

  for (let i = 0; i < NUMBER_OF_BOMBS || NUMBER_OF_BOMBS === -1; i++) {
    const promises: Promise<void>[] = []
    console.log(`Bombardment ${i + 1} of ${NUMBER_OF_BOMBS === -1 ? 'infinite' : NUMBER_OF_BOMBS}`)
    let socketClientsToUse = NUMBER_OF_SOCKET_CLIENTS
    if (i != 0)
      socketClientsToUse = numberOfActiveSockets
    for (let j = 0; j < socketClientsToUse; j++) {
      // eslint-disable-next-line security/detect-object-injection
      promises.push(
        socketClients[j]
          .send(TARGET_SOCKET_PORT, TARGET_SOCKET_HOST, MESSAGE_JSON)
          .catch((err) => console.error(`Bombardment ${i + 1} of ${NUMBER_OF_BOMBS} failed. Error: ${err}`))
      )
    }
    await Promise.all(promises)
  }
}

async function socketBombardmentWithInRandomOrder() {

}

// console.log('Starting socket bombardment: socketBombardment')
// socketBombardment()
//   .then(() => {
//     console.log('Socket bombardment complete')
//     process.exit(0)
//   })
//   .catch((err) => {
//     console.log(err)
//     process.exit(1)
//   })

console.log('Starting socket bombardment: socketBombardmentWithLimitedActiveSockets')
socketBombardmentWithLimitedActiveSockets(128)
  .then(() => {
    console.log('Socket bombardment complete')
    process.exit(0)
  })
  .catch((err) => {
    console.log(err)
    process.exit(1)
  })