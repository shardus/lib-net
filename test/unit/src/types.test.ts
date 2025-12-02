import { NewAugData, validateSnOpts, AugmentedData, SnOpts } from '../../../src/types'

describe('types', () => {
  describe('NewAugData', () => {
    let mockDateNow: jest.SpyInstance

    beforeEach(() => {
      mockDateNow = jest.spyOn(Date, 'now').mockReturnValue(1234567890)
    })

    afterEach(() => {
      mockDateNow.mockRestore()
    })

    describe('happy path', () => {
      test('should create AugmentedData with ask direction', () => {
        const data = { message: 'test' }
        const result = NewAugData(data, 'uuid-123', 3000, '192.168.1.1', 5000, 'ask')

        expect(result).toEqual({
          data,
          UUID: 'uuid-123',
          PORT: 3000,
          ADDRESS: '192.168.1.1',
          sendTime: 1234567890,
          receivedTime: 0,
          replyTime: 0,
          replyReceivedTime: 0,
          timeout: 5000,
          msgDir: 'ask'
        })
      })

      test('should create AugmentedData with tell direction', () => {
        const data = { type: 'notification' }
        const result = NewAugData(data, 'uuid-456', 8080, 'localhost', 10000, 'tell')

        expect(result).toEqual({
          data,
          UUID: 'uuid-456',
          PORT: 8080,
          ADDRESS: 'localhost',
          sendTime: 1234567890,
          receivedTime: 0,
          replyTime: 0,
          replyReceivedTime: 0,
          timeout: 10000,
          msgDir: 'tell'
        })
      })

      test('should create AugmentedData with resp direction', () => {
        const data = { response: 'success' }
        const result = NewAugData(data, 'uuid-789', 443, '10.0.0.1', 2000, 'resp')

        expect(result).toEqual({
          data,
          UUID: 'uuid-789',
          PORT: 443,
          ADDRESS: '10.0.0.1',
          sendTime: 1234567890,
          receivedTime: 0,
          replyTime: 0,
          replyReceivedTime: 0,
          timeout: 2000,
          msgDir: 'resp'
        })
      })
    })

    describe('edge cases', () => {
      test('should handle null data', () => {
        const result = NewAugData(null, 'uuid', 3000, 'localhost', 5000, 'tell')
        expect(result.data).toBeNull()
      })

      test('should handle undefined data', () => {
        const result = NewAugData(undefined, 'uuid', 3000, 'localhost', 5000, 'tell')
        expect(result.data).toBeUndefined()
      })

      test('should handle empty string UUID', () => {
        const result = NewAugData({}, '', 3000, 'localhost', 5000, 'tell')
        expect(result.UUID).toBe('')
      })

      test('should handle empty string address', () => {
        const result = NewAugData({}, 'uuid', 3000, '', 5000, 'tell')
        expect(result.ADDRESS).toBe('')
      })

      test('should handle zero port', () => {
        const result = NewAugData({}, 'uuid', 0, 'localhost', 5000, 'tell')
        expect(result.PORT).toBe(0)
      })

      test('should handle zero timeout', () => {
        const result = NewAugData({}, 'uuid', 3000, 'localhost', 0, 'tell')
        expect(result.timeout).toBe(0)
      })

      test('should handle maximum port number', () => {
        const result = NewAugData({}, 'uuid', 65535, 'localhost', 5000, 'tell')
        expect(result.PORT).toBe(65535)
      })

      test('should handle complex data objects', () => {
        const complexData = {
          nested: {
            array: [1, 2, 3],
            object: { key: 'value' }
          },
          buffer: Buffer.from('test'),
          date: new Date()
        }
        const result = NewAugData(complexData, 'uuid', 3000, 'localhost', 5000, 'ask')
        expect(result.data).toBe(complexData)
      })
    })

    describe('timestamp behavior', () => {
      test('should use current timestamp for sendTime', () => {
        NewAugData({}, 'uuid', 3000, 'localhost', 5000, 'tell')
        expect(mockDateNow).toHaveBeenCalled()
      })

      test('should initialize other time fields to 0', () => {
        const result = NewAugData({}, 'uuid', 3000, 'localhost', 5000, 'tell')
        expect(result.receivedTime).toBe(0)
        expect(result.replyTime).toBe(0)
        expect(result.replyReceivedTime).toBe(0)
      })
    })
  })

  describe('validateSnOpts', () => {
    const validOpts: SnOpts = {
      port: 3000,
      crypto: {
        hashKey: 'test-hash-key',
        signingSecretKeyHex: 'test-signing-key'
      }
    }

    describe('happy path', () => {
      test('should validate minimal valid options', () => {
        expect(() => validateSnOpts(validOpts)).not.toThrow()
      })

      test('should validate options with all optional fields', () => {
        const fullOpts: SnOpts = {
          ...validOpts,
          address: '127.0.0.1',
          senderOpts: {
            useLruCache: true,
            lruSize: 1024
          },
          headerOpts: {
            sendHeaderVersion: 1
          },
          customStringifier: (val) => JSON.stringify(val),
          customJsonParser: (val) => JSON.parse(val),
          payloadOpts: {
            payloadSizeLimitInBytes: 1024 * 1024,
            headerSizeLimitInBytes: 1024
          }
        }

        expect(() => validateSnOpts(fullOpts)).not.toThrow()
      })

      test('should validate options with LRU cache disabled', () => {
        const opts: SnOpts = {
          ...validOpts,
          senderOpts: {
            useLruCache: false,
            lruSize: 0
          }
        }

        expect(() => validateSnOpts(opts)).not.toThrow()
      })
    })

    describe('error cases', () => {
      test('should throw error when opts is null', () => {
        expect(() => validateSnOpts(null as any)).toThrow('snq: must supply options')
      })

      test('should throw error when opts is undefined', () => {
        expect(() => validateSnOpts(undefined as any)).toThrow('snq: must supply options')
      })

      test('should throw error when port is missing', () => {
        const opts = { ...validOpts, port: undefined } as any
        expect(() => validateSnOpts(opts)).toThrow('snq: must supply port')
      })

      test('should throw error when port is not a number', () => {
        const opts = { ...validOpts, port: '3000' } as any
        expect(() => validateSnOpts(opts)).toThrow('snq: must supply port')
      })

      test('should throw error when crypto is missing', () => {
        const opts = { port: 3000 } as any
        expect(() => validateSnOpts(opts)).toThrow()
      })

      test('should throw error when hashKey is missing', () => {
        const opts: SnOpts = {
          port: 3000,
          crypto: {
            hashKey: '',
            signingSecretKeyHex: 'test'
          }
        }
        expect(() => validateSnOpts(opts)).toThrow('snq: must supply hashKey')
      })

      test('should throw error when hashKey is not a string', () => {
        const opts = {
          port: 3000,
          crypto: {
            hashKey: 123,
            signingSecretKeyHex: 'test'
          }
        } as any
        expect(() => validateSnOpts(opts)).toThrow('snq: must supply hashKey')
      })

      test('should throw error when useLruCache is true but lruSize is missing', () => {
        const opts: SnOpts = {
          ...validOpts,
          senderOpts: {
            useLruCache: true,
            lruSize: undefined as any
          }
        }
        expect(() => validateSnOpts(opts)).toThrow('snq: must supply lruSize when using lruCache')
      })

      test('should throw error when payloadSizeLimitInBytes is not a number', () => {
        const opts: SnOpts = {
          ...validOpts,
          payloadOpts: {
            payloadSizeLimitInBytes: '1024' as any
          }
        }
        expect(() => validateSnOpts(opts)).toThrow('snq: payloadSizeLimitInBytes must be a number')
      })

      test('should throw error when headerSizeLimitInBytes is not a number', () => {
        const opts: SnOpts = {
          ...validOpts,
          payloadOpts: {
            headerSizeLimitInBytes: '1024' as any
          }
        }
        expect(() => validateSnOpts(opts)).toThrow('snq: headerSizeLimitInBytes must be a number')
      })
    })

    describe('edge cases', () => {
      test('should not accept zero as valid port', () => {
        // Zero port is falsy and will fail validation
        const opts: SnOpts = {
          ...validOpts,
          port: 0
        }
        expect(() => validateSnOpts(opts)).toThrow('snq: must supply port')
      })

      test('should accept negative port number', () => {
        const opts: SnOpts = {
          ...validOpts,
          port: -1
        }
        expect(() => validateSnOpts(opts)).not.toThrow()
      })

      test('should accept empty object for crypto if it has required fields', () => {
        const opts: SnOpts = {
          port: 3000,
          crypto: {
            hashKey: 'key',
            signingSecretKeyHex: 'hex'
          }
        }
        expect(() => validateSnOpts(opts)).not.toThrow()
      })

      test('should not throw when payloadOpts is defined but limits are undefined', () => {
        const opts: SnOpts = {
          ...validOpts,
          payloadOpts: {}
        }
        expect(() => validateSnOpts(opts)).not.toThrow()
      })

      test('should accept zero for payload limits', () => {
        const opts: SnOpts = {
          ...validOpts,
          payloadOpts: {
            payloadSizeLimitInBytes: 0,
            headerSizeLimitInBytes: 0
          }
        }
        expect(() => validateSnOpts(opts)).not.toThrow()
      })

      test('should handle missing crypto object gracefully', () => {
        const opts = { port: 3000 } as any
        // The validation will fail when trying to access crypto.hashKey
        expect(() => validateSnOpts(opts)).toThrow()
      })
    })
  })

  describe('Type definitions', () => {
    test('AugmentedData should have correct structure', () => {
      const augData: AugmentedData = {
        data: { test: 'data' },
        UUID: 'uuid',
        PORT: 3000,
        ADDRESS: 'localhost',
        sendTime: Date.now(),
        receivedTime: 0,
        replyTime: 0,
        replyReceivedTime: 0,
        timeout: 5000,
        msgDir: 'ask'
      }

      expect(augData).toBeDefined()
      expect(augData.msgDir).toMatch(/^(ask|tell|resp)$/)
    })

    test('ADDRESS should be optional in AugmentedData', () => {
      const augData: AugmentedData = {
        data: {},
        UUID: 'uuid',
        PORT: 3000,
        sendTime: Date.now(),
        receivedTime: 0,
        replyTime: 0,
        replyReceivedTime: 0,
        timeout: 5000,
        msgDir: 'tell'
      }

      expect(augData.ADDRESS).toBeUndefined()
    })
  })
})