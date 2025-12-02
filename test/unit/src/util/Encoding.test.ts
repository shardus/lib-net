import { jsonStringify, jsonParse } from '../../../../src/util/Encoding'

describe('Encoding', () => {
  describe('jsonStringify', () => {
    describe('happy path', () => {
      test('should stringify a simple object', () => {
        const data = { name: 'John', age: 30 }
        const result = jsonStringify(data)
        expect(result).toBe('{"name":"John","age":30}')
      })

      test('should stringify an array', () => {
        const data = [1, 2, 3, 'test']
        const result = jsonStringify(data)
        expect(result).toBe('[1,2,3,"test"]')
      })

      test('should stringify primitive values', () => {
        expect(jsonStringify('hello')).toBe('"hello"')
        expect(jsonStringify(123)).toBe('123')
        expect(jsonStringify(true)).toBe('true')
        expect(jsonStringify(null)).toBe('null')
      })

      test('should use custom stringifier when provided', () => {
        const data = { value: 42 }
        const customStringify = (obj: typeof data) => `custom:${obj.value}`
        const result = jsonStringify(data, customStringify)
        expect(result).toBe('custom:42')
      })

      test('should handle nested objects', () => {
        const data = {
          user: {
            name: 'Alice',
            address: {
              city: 'New York',
              zip: '10001'
            }
          }
        }
        const result = jsonStringify(data)
        expect(result).toBe('{"user":{"name":"Alice","address":{"city":"New York","zip":"10001"}}}')
      })
    })

    describe('edge cases', () => {
      test('should handle empty object', () => {
        const result = jsonStringify({})
        expect(result).toBe('{}')
      })

      test('should handle empty array', () => {
        const result = jsonStringify([])
        expect(result).toBe('[]')
      })

      test('should handle undefined', () => {
        const result = jsonStringify(undefined)
        expect(result).toBe(undefined)
      })

      test('should handle objects with undefined values', () => {
        const data = { a: 1, b: undefined, c: 3 }
        const result = jsonStringify(data)
        expect(result).toBe('{"a":1,"c":3}')
      })

      test('should handle special characters in strings', () => {
        const data = { text: 'Line 1\nLine 2\t"quoted"' }
        const result = jsonStringify(data)
        expect(result).toBe('{"text":"Line 1\\nLine 2\\t\\"quoted\\""}')
      })

      test('should handle Date objects', () => {
        const date = new Date('2023-01-01T00:00:00.000Z')
        const result = jsonStringify({ date })
        expect(result).toBe('{"date":"2023-01-01T00:00:00.000Z"}')
      })
    })

    describe('negative tests', () => {
      test('should throw error for circular references', () => {
        const obj: any = { a: 1 }
        obj.self = obj
        expect(() => jsonStringify(obj)).toThrow(TypeError)
      })

      test('should throw error when custom stringifier throws', () => {
        const data = { value: 42 }
        const customStringify = () => {
          throw new Error('Custom error')
        }
        expect(() => jsonStringify(data, customStringify)).toThrow('Custom error')
      })

      test('should handle BigInt with error', () => {
        const data = { bigNum: BigInt(9007199254740993) }
        expect(() => jsonStringify(data)).toThrow(TypeError)
      })
    })
  })

  describe('jsonParse', () => {
    describe('happy path', () => {
      test('should parse a simple object string', () => {
        const jsonStr = '{"name":"John","age":30}'
        const result = jsonParse(jsonStr)
        expect(result).toEqual({ name: 'John', age: 30 })
      })

      test('should parse an array string', () => {
        const jsonStr = '[1,2,3,"test"]'
        const result = jsonParse(jsonStr)
        expect(result).toEqual([1, 2, 3, 'test'])
      })

      test('should parse primitive value strings', () => {
        expect(jsonParse('"hello"')).toBe('hello')
        expect(jsonParse('123')).toBe(123)
        expect(jsonParse('true')).toBe(true)
        expect(jsonParse('null')).toBe(null)
      })

      test('should use custom parser when provided', () => {
        const jsonStr = 'custom:42'
        const customParser = (str: string) => {
          const value = str.split(':')[1]
          return { value: parseInt(value) }
        }
        const result = jsonParse(jsonStr, customParser)
        expect(result).toEqual({ value: 42 })
      })

      test('should handle nested objects', () => {
        const jsonStr = '{"user":{"name":"Alice","address":{"city":"New York","zip":"10001"}}}'
        const result = jsonParse(jsonStr)
        expect(result).toEqual({
          user: {
            name: 'Alice',
            address: {
              city: 'New York',
              zip: '10001'
            }
          }
        })
      })

      test('should parse with type parameter', () => {
        interface User {
          name: string
          age: number
        }
        const jsonStr = '{"name":"Bob","age":25}'
        const result = jsonParse<User>(jsonStr)
        expect(result.name).toBe('Bob')
        expect(result.age).toBe(25)
      })
    })

    describe('edge cases', () => {
      test('should parse empty object string', () => {
        const result = jsonParse('{}')
        expect(result).toEqual({})
      })

      test('should parse empty array string', () => {
        const result = jsonParse('[]')
        expect(result).toEqual([])
      })

      test('should parse string with special characters', () => {
        const jsonStr = '{"text":"Line 1\\nLine 2\\t\\"quoted\\""}'
        const result = jsonParse(jsonStr)
        expect(result).toEqual({ text: 'Line 1\nLine 2\t"quoted"' })
      })

      test('should parse float numbers', () => {
        const jsonStr = '{"pi":3.14159,"negative":-42.5}'
        const result = jsonParse(jsonStr)
        expect(result).toEqual({ pi: 3.14159, negative: -42.5 })
      })

      test('should parse very large numbers', () => {
        const jsonStr = '{"large":1e+100,"small":1e-100}'
        const result = jsonParse(jsonStr)
        expect(result).toEqual({ large: 1e+100, small: 1e-100 })
      })
    })

    describe('negative tests', () => {
      test('should throw error for invalid JSON', () => {
        expect(() => jsonParse('{')).toThrow(SyntaxError)
        expect(() => jsonParse('invalid json')).toThrow(SyntaxError)
        expect(() => jsonParse('{key: value}')).toThrow(SyntaxError)
      })

      test('should throw error for empty string', () => {
        expect(() => jsonParse('')).toThrow(SyntaxError)
      })

      test('should throw error when custom parser throws', () => {
        const customParser = () => {
          throw new Error('Custom parse error')
        }
        expect(() => jsonParse('data', customParser)).toThrow('Custom parse error')
      })

      test('should throw error for undefined input', () => {
        expect(() => jsonParse(undefined as any)).toThrow()
      })

      test('should handle non-string input', () => {
        // JSON.parse actually converts numbers to strings first
        expect(jsonParse(123 as any)).toBe(123)
        // Objects will throw an error
        expect(() => jsonParse({} as any)).toThrow()
      })
    })
  })

  describe('integration tests', () => {
    test('should stringify and parse back to original', () => {
      const original = {
        string: 'test',
        number: 42,
        boolean: true,
        null: null,
        array: [1, 2, 3],
        nested: { a: 1, b: 2 }
      }
      const stringified = jsonStringify(original)
      const parsed = jsonParse(stringified)
      expect(parsed).toEqual(original)
    })

    test('should work with custom stringifier and parser', () => {
      const data = { id: 123, name: 'Test' }
      const customStringify = (obj: typeof data) => `ID:${obj.id}|NAME:${obj.name}`
      const customParser = (str: string) => {
        const parts = str.split('|')
        const id = parseInt(parts[0].split(':')[1])
        const name = parts[1].split(':')[1]
        return { id, name }
      }

      const stringified = jsonStringify(data, customStringify)
      expect(stringified).toBe('ID:123|NAME:Test')

      const parsed = jsonParse(stringified, customParser)
      expect(parsed).toEqual(data)
    })
  })
})