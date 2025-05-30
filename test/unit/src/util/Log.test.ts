import { logMessageInfo } from '../../../../src/util/Log'
import { AugmentedData, NewAugData } from '../../../../src/types'

// Mock console.log to capture output
const originalConsoleLog = console.log
let consoleOutput: string[] = []

describe('Log', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    consoleOutput = []
    console.log = jest.fn((...args) => {
      consoleOutput.push(args.join(' '))
    })
  })

  afterEach(() => {
    console.log = originalConsoleLog
  })

  describe('logMessageInfo', () => {
    describe('happy path', () => {
      test('should log basic message info when sending', () => {
        const augData = NewAugData(
          { message: 'test data' },
          'test-uuid-123',
          3000,
          '192.168.1.1',
          5000,
          'tell'
        )
        const stringifiedData = JSON.stringify(augData)

        logMessageInfo(augData, stringifiedData)

        expect(consoleOutput.length).toBe(1)
        expect(consoleOutput[0]).toContain('netmsglog: sending tell:')
        expect(consoleOutput[0]).toContain('UUID: test-uuid-123')
        expect(consoleOutput[0]).toContain('PORT: 3000')
        expect(consoleOutput[0]).toContain('ADDRESS: 192.168.1.1')
      })

      test('should log basic message info when receiving', () => {
        const augData = NewAugData(
          { message: 'test data' },
          'test-uuid-456',
          4000,
          '10.0.0.1',
          5000,
          'ask'
        )
        const stringifiedData = JSON.stringify(augData)

        logMessageInfo(augData, stringifiedData, false, Date.now())

        expect(consoleOutput.length).toBe(1)
        expect(consoleOutput[0]).toContain('netmsglog: receiving ask:')
        expect(consoleOutput[0]).toContain('UUID: test-uuid-456')
        expect(consoleOutput[0]).toContain('PORT: 4000')
        expect(consoleOutput[0]).toContain('ADDRESS: 10.0.0.1')
      })

      test('should truncate long messages to 50 characters', () => {
        const augData = NewAugData(
          { message: 'This is a very long message that should be truncated after fifty characters' },
          'test-uuid',
          3000,
          'localhost',
          5000,
          'tell'
        )
        const stringifiedData = 'A'.repeat(100) // 100 character string

        logMessageInfo(augData, stringifiedData)

        expect(consoleOutput[0]).toContain('A'.repeat(50))
        expect(consoleOutput[0]).not.toContain('A'.repeat(51))
      })
    })

    describe('message direction handling', () => {
      test('should log tell message with timestamps when sending', () => {
        const sendTime = Date.now()
        const augData: AugmentedData = {
          data: { test: 'data' },
          UUID: 'uuid-tell',
          PORT: 3000,
          ADDRESS: 'localhost',
          sendTime,
          receivedTime: 0,
          replyTime: 0,
          replyReceivedTime: 0,
          timeout: 5000,
          msgDir: 'tell'
        }

        logMessageInfo(augData, 'test message', true)

        expect(consoleOutput[0]).toContain(`sendTime:${sendTime}`)
        expect(consoleOutput[0]).not.toContain('recvTime:')
        expect(consoleOutput[0]).not.toContain('recvDelta:')
      })

      test('should log tell message with receive info when receiving', () => {
        const sendTime = Date.now() - 100
        const receivedTime = Date.now()
        const augData: AugmentedData = {
          data: { test: 'data' },
          UUID: 'uuid-tell',
          PORT: 3000,
          ADDRESS: 'localhost',
          sendTime,
          receivedTime: 0,
          replyTime: 0,
          replyReceivedTime: 0,
          timeout: 5000,
          msgDir: 'tell'
        }

        logMessageInfo(augData, 'test message', false, receivedTime)

        expect(consoleOutput[0]).toContain(`sendTime:${sendTime}`)
        expect(consoleOutput[0]).toContain(`recvTime:${receivedTime}`)
        expect(consoleOutput[0]).toContain(`recvDelta:${receivedTime - sendTime}`)
      })

      test('should log ask message with timestamps when sending', () => {
        const sendTime = Date.now()
        const augData: AugmentedData = {
          data: { test: 'data' },
          UUID: 'uuid-ask',
          PORT: 3000,
          ADDRESS: 'localhost',
          sendTime,
          receivedTime: 0,
          replyTime: 0,
          replyReceivedTime: 0,
          timeout: 5000,
          msgDir: 'ask'
        }

        logMessageInfo(augData, 'test message', true)

        expect(consoleOutput[0]).toContain(`sendTime:${sendTime}`)
        expect(consoleOutput[0]).not.toContain('recvTime:')
      })

      test('should log ask message with receive info when receiving', () => {
        const sendTime = Date.now() - 150
        const receivedTime = Date.now()
        const augData: AugmentedData = {
          data: { test: 'data' },
          UUID: 'uuid-ask',
          PORT: 3000,
          ADDRESS: 'localhost',
          sendTime,
          receivedTime: 0,
          replyTime: 0,
          replyReceivedTime: 0,
          timeout: 5000,
          msgDir: 'ask'
        }

        logMessageInfo(augData, 'test message', false, receivedTime)

        expect(consoleOutput[0]).toContain(`sendTime:${sendTime}`)
        expect(consoleOutput[0]).toContain(`recvTime:${receivedTime}`)
        expect(consoleOutput[0]).toContain(`recvDelta:${receivedTime - sendTime}`)
      })

      test('should log resp message with full timing info when sending', () => {
        const sendTime = Date.now() - 200
        const receivedTime = sendTime + 50
        const replyTime = receivedTime + 30
        const augData: AugmentedData = {
          data: { test: 'response' },
          UUID: 'uuid-resp',
          PORT: 3000,
          ADDRESS: 'localhost',
          sendTime,
          receivedTime,
          replyTime,
          replyReceivedTime: 0,
          timeout: 5000,
          msgDir: 'resp'
        }

        logMessageInfo(augData, 'test response', true)

        expect(consoleOutput[0]).toContain(`sendTime:${sendTime}`)
        expect(consoleOutput[0]).toContain(`replyTime:${replyTime}`)
        expect(consoleOutput[0]).toContain(`replyDelta:${replyTime - receivedTime}`)
        expect(consoleOutput[0]).not.toContain('askDelta:')
      })

      test('should log resp message with complete timing info when receiving', () => {
        const sendTime = Date.now() - 300
        const receivedTime = sendTime + 50
        const replyTime = receivedTime + 30
        const replyReceivedTime = replyTime + 40
        const currentTime = Date.now()
        const augData: AugmentedData = {
          data: { test: 'response' },
          UUID: 'uuid-resp',
          PORT: 3000,
          ADDRESS: 'localhost',
          sendTime,
          receivedTime,
          replyTime,
          replyReceivedTime,
          timeout: 5000,
          msgDir: 'resp'
        }

        logMessageInfo(augData, 'test response', false, currentTime)

        expect(consoleOutput[0]).toContain(`sendTime:${sendTime}`)
        expect(consoleOutput[0]).toContain(`replyTime:${replyTime}`)
        expect(consoleOutput[0]).toContain(`replyDelta:${replyTime - receivedTime}`)
        expect(consoleOutput[0]).toContain(`recvTime:${currentTime}`)
        expect(consoleOutput[0]).toContain(`askDelta:${currentTime - sendTime}`)
        expect(consoleOutput[0]).toContain(`replyRecvTime:${replyReceivedTime}`)
        expect(consoleOutput[0]).toContain(`replyRecvDelta:${currentTime - replyReceivedTime}`)
      })
    })

    describe('edge cases', () => {
      test('should handle empty stringified data', () => {
        const augData = NewAugData({}, 'uuid', 3000, 'localhost', 5000, 'tell')
        
        logMessageInfo(augData, '')

        expect(consoleOutput[0]).toContain('netmsglog: sending tell:  UUID:')
      })

      test('should handle undefined ADDRESS', () => {
        const augData: AugmentedData = {
          data: {},
          UUID: 'uuid',
          PORT: 3000,
          ADDRESS: undefined,
          sendTime: Date.now(),
          receivedTime: 0,
          replyTime: 0,
          replyReceivedTime: 0,
          timeout: 5000,
          msgDir: 'tell'
        }

        logMessageInfo(augData, 'test')

        expect(consoleOutput[0]).toContain('ADDRESS: undefined')
      })

      test('should handle null sendTime', () => {
        const augData: AugmentedData = {
          data: {},
          UUID: 'uuid',
          PORT: 3000,
          ADDRESS: 'localhost',
          sendTime: null as any,
          receivedTime: 0,
          replyTime: 0,
          replyReceivedTime: 0,
          timeout: 5000,
          msgDir: 'tell'
        }

        logMessageInfo(augData, 'test')

        expect(consoleOutput[0]).not.toContain('sendTime:')
      })

      test('should use default values for optional parameters', () => {
        const augData = NewAugData({}, 'uuid', 3000, 'localhost', 5000, 'tell')

        logMessageInfo(augData, 'test')

        expect(consoleOutput[0]).toContain('netmsglog: sending tell:')
      })

      test('should handle very short stringified data', () => {
        const augData = NewAugData({}, 'uuid', 3000, 'localhost', 5000, 'ask')

        logMessageInfo(augData, 'ab')

        expect(consoleOutput[0]).toContain('netmsglog: sending ask: ab UUID:')
      })
    })

    describe('formatting and output', () => {
      test('should format log message correctly with all fields', () => {
        const augData = NewAugData(
          { test: 'data' },
          'uuid-12345',
          8080,
          '192.168.1.100',
          10000,
          'ask'
        )
        const stringifiedData = '{"test":"data with some content"}'

        logMessageInfo(augData, stringifiedData)

        const log = consoleOutput[0]
        expect(log).toMatch(/^netmsglog: sending ask: .+ UUID: uuid-12345 PORT: 8080 ADDRESS: 192\.168\.1\.100/)
      })

      test('should handle special characters in stringified data', () => {
        const augData = NewAugData({}, 'uuid', 3000, 'localhost', 5000, 'tell')
        const stringifiedData = 'Test\nwith\nnewlines\tand\ttabs'

        logMessageInfo(augData, stringifiedData)

        expect(consoleOutput[0]).toContain('Test\nwith\nnewlines\tand\ttabs')
      })

      test('should handle unicode in stringified data', () => {
        const augData = NewAugData({}, 'uuid', 3000, 'localhost', 5000, 'tell')
        const stringifiedData = '{"emoji":"😀","chinese":"你好","arabic":"مرحبا"}'

        logMessageInfo(augData, stringifiedData)

        expect(consoleOutput[0]).toContain('{"emoji":"😀","chinese":"你好","arabic":"مرحبا"}')
      })
    })

    describe('performance considerations', () => {
      test('should handle very large PORT numbers', () => {
        const augData = NewAugData({}, 'uuid', 65535, 'localhost', 5000, 'tell')

        logMessageInfo(augData, 'test')

        expect(consoleOutput[0]).toContain('PORT: 65535')
      })

      test('should handle zero receivedTime gracefully', () => {
        const sendTime = Date.now()
        const augData: AugmentedData = {
          data: {},
          UUID: 'uuid',
          PORT: 3000,
          ADDRESS: 'localhost',
          sendTime,
          receivedTime: 0,
          replyTime: 0,
          replyReceivedTime: 0,
          timeout: 5000,
          msgDir: 'tell'
        }

        logMessageInfo(augData, 'test', false, 0)

        expect(consoleOutput[0]).toContain('recvTime:0')
        expect(consoleOutput[0]).toContain(`recvDelta:${0 - sendTime}`)
      })
    })
  })
})