import { Sn } from '../.'

const setupSender = (port: number, senderOpts: any, headerOpts: any) => {
  return Sn({
    port,
    address: '127.0.0.1',
    senderOpts,
    headerOpts,
  })
}

const main = async () => {
  console.log('Starting servers...')
  let failed = 0
  let passed = 0
  const result1 = await testWhenBothServersSupportHeaders()
  result1 === 'passed' ? passed++ : failed++
  const result2 = await testWhenReceiverSupportHeaders()
  result2 === 'passed' ? passed++ : failed++
  console.log(`Passed: ${passed}, Failed: ${failed}`)
  const result3 = await testWhenSenderSupportHeaders()
  result3 === 'passed' ? passed++ : failed++
  console.log(`Passed: ${passed}, Failed: ${failed}`)
}

const testWhenBothServersSupportHeaders = async (): Promise<string> => {
  let testResult = 'failed'

  // setup test servers
  const sn1 = setupSender(
    44444,
    { useLruCache: true, lruSize: 2 },
    { sendWithHeaders: true, sendHeaderVersion: 1 }
  )

  sn1.listen((data: any) => {
    console.log('Received message on 44444:', data)
    if (data && data.message === 'pong') {
      console.log('Received pong from 44444:', data.fromPort)
      testResult = 'passed'
    }
  })

  const sn2 = setupSender(
    44445,
    { useLruCache: true, lruSize: 2 },
    { sendWithHeaders: true, sendHeaderVersion: 1 }
  )
  sn2.listen((data: any, remote, respond, headers) => {
    console.log('Received message on 44445:', data)
    if (data && data.message === 'ping') {
      console.log('Received pong from 44445:', data.fromPort)
      testResult = 'passed'
    }
    console.log('Headers:', headers)
    return respond({ message: 'pong', fromPort: 44445 })
  })

  sn1.sendWithHeaders(
    44445,
    '127.0.0.1',
    { message: 'ping', fromPort: 44444 },
    {
      message_type: 1,
      sender_address: '0xabc',
    },
    1000
  )

  await sleep(2000)

  return testResult
}

const testWhenReceiverSupportHeaders = async (): Promise<string> => {
  let testResult = 'failed'

  // setup test servers
  const sn1 = setupSender(44446, { useLruCache: true, lruSize: 2 }, {})

  sn1.listen((data: any, remote, respond, headers) => {
    console.log('Received message on 44444:', data)
    if (data && data.message === 'pong') {
      console.log('Received pong from 44444:', data.fromPort)
      testResult = 'passed'
    }
  })

  const sn2 = setupSender(
    44447,
    { useLruCache: true, lruSize: 2 },
    { sendWithHeaders: true, sendHeaderVersion: 1 }
  )
  sn2.listen((data: any, remote, respond, headers) => {
    console.log('Received message on 44445:', data)
    if (data && data.message === 'ping') {
      console.log('Received pong from 44445:', data.fromPort)
      testResult = 'passed'
    }
    return respond({ message: 'pong', fromPort: 44445 })
  })

  sn1.send(44447, '127.0.0.1', { message: 'ping', fromPort: 44444 }, 1000)

  await sleep(2000)

  return testResult
}

const testWhenSenderSupportHeaders = async (): Promise<string> => {
  let testResult = 'failed'

  // setup test servers
  const sn1 = setupSender(
    44448,
    { useLruCache: true, lruSize: 2 },
    { sendWithHeaders: true, sendHeaderVersion: 1 }
  )

  sn1.listen((data: any, remote, respond, headers) => {
    console.log('Received message on 44444:', data)
    if (data && data.message === 'pong') {
      console.log('Received pong from 44444:', data.fromPort)
      testResult = 'passed'
    }
  })

  const sn2 = setupSender(44449, { useLruCache: true, lruSize: 2 }, {})
  sn2.listen((data: any, remote, respond, headers) => {
    console.log('Received message on 44445:', data)
    if (data && data.message === 'ping') {
      console.log('Received pong from 44445:', data.fromPort)
      testResult = 'passed'
    }
    return respond({ message: 'pong', fromPort: 44445 })
  })

  sn1.send(44449, '127.0.0.1', { message: 'ping', fromPort: 44444 }, 1000)

  await sleep(2000)

  return testResult
}

const sleep = (ms: number) => {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

main().catch((err) => console.error('ERROR: ', err))
