import { Histogram, NewNumberHistogram } from '../../../../src/util/Histogram'
import { logFlags } from '../../../../src/index'

// Mock dependencies
jest.mock('crypto', () => ({
  randomUUID: jest.fn(() => 'test-uuid-123')
}))

// Mock console.log to verify output
const originalConsoleLog = console.log
let consoleOutput: string[] = []

describe('Histogram', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.clearAllTimers()
    jest.useFakeTimers()
    consoleOutput = []
    console.log = jest.fn((...args) => {
      consoleOutput.push(args.join(' '))
    })
  })

  afterEach(() => {
    console.log = originalConsoleLog
    jest.useRealTimers()
  })

  describe('constructor and initialization', () => {
    test('should initialize with correct bucket ranges', () => {
      const bucketRanges = [0, 10, 20, 30]
      const comparator = (value: number, start: number, end: number) => 
        value >= start && value < end

      const histogram = new Histogram(bucketRanges, comparator)
      
      // Verify buckets are created
      histogram.printHistogram('Test')
      expect(consoleOutput).toContain('\nTest\n\t- 0-10: 0\n\t- 10-20: 0\n\t- 20-30: 0\n\t- 30-Infinity: 0\n')
    })

    test('should handle single bucket range', () => {
      const bucketRanges = [0]
      const comparator = (value: number, start: number, end: number) => 
        value >= start && value < end

      const histogram = new Histogram(bucketRanges, comparator)
      
      histogram.printHistogram('Single Bucket')
      expect(consoleOutput).toContain('\nSingle Bucket\n\t- 0-Infinity: 0\n')
    })

    test('should handle empty bucket ranges', () => {
      const bucketRanges: number[] = []
      const comparator = (value: number, start: number, end: number) => 
        value >= start && value < end

      const histogram = new Histogram(bucketRanges, comparator)
      
      histogram.printHistogram('Empty')
      expect(consoleOutput).toContain('\nEmpty\n')
    })
  })

  describe('logData', () => {
    test('should increment correct bucket for number values', () => {
      const bucketRanges = [0, 10, 20, 30]
      const comparator = (value: number, start: number, end: number) => 
        value >= start && value < end

      const histogram = new Histogram(bucketRanges, comparator)
      
      // Log values in different buckets
      histogram.logData(5)
      histogram.logData(15)
      histogram.logData(15)
      histogram.logData(25)
      histogram.logData(35)
      histogram.logData(35)
      histogram.logData(35)

      histogram.printHistogram('Number Test')
      expect(consoleOutput).toContain('\nNumber Test\n\t- 0-10: 1\n\t- 10-20: 2\n\t- 20-30: 1\n\t- 30-Infinity: 3\n')
    })

    test('should work with custom comparator for string lengths', () => {
      const bucketRanges = [0, 5, 10, 15]
      const comparator = (value: string, start: number, end: number) => 
        value.length >= start && value.length < end

      const histogram = new Histogram(bucketRanges, comparator)
      
      histogram.logData('hi')      // length 2
      histogram.logData('hello')   // length 5
      histogram.logData('hello world') // length 11
      histogram.logData('this is a long string') // length 21

      histogram.printHistogram('String Length Test')
      expect(consoleOutput).toContain('\nString Length Test\n\t- 0-5: 1\n\t- 5-10: 1\n\t- 10-15: 1\n\t- 15-Infinity: 1\n')
    })

    test('should handle edge values correctly', () => {
      const bucketRanges = [0, 10, 20]
      const comparator = (value: number, start: number, end: number) => 
        value >= start && value < end

      const histogram = new Histogram(bucketRanges, comparator)
      
      // Edge values should go to lower bucket
      histogram.logData(0)
      histogram.logData(10)
      histogram.logData(20)

      histogram.printHistogram('Edge Values')
      expect(consoleOutput).toContain('\nEdge Values\n\t- 0-10: 1\n\t- 10-20: 1\n\t- 20-Infinity: 1\n')
    })

    test('should handle positive values only due to split limitation', () => {
      // Note: The current implementation has a limitation with negative numbers
      // because bucket.split('-') doesn't work correctly with negative ranges
      // This test documents the actual behavior
      const bucketRanges = [0, 10, 20, 30]
      const comparator = (value: number, start: number, end: number) => 
        value >= start && value < end

      const histogram = new Histogram(bucketRanges, comparator)
      
      histogram.logData(5)
      histogram.logData(15)
      histogram.logData(25)
      histogram.logData(35)

      histogram.printHistogram('Positive Values')
      expect(consoleOutput).toContain('\nPositive Values\n\t- 0-10: 1\n\t- 10-20: 1\n\t- 20-30: 1\n\t- 30-Infinity: 1\n')
    })

    test('should only increment first matching bucket', () => {
      const bucketRanges = [0, 10, 20]
      // Custom comparator that could match multiple buckets
      const comparator = (value: number, start: number, end: number) => 
        value >= start

      const histogram = new Histogram(bucketRanges, comparator)
      
      histogram.logData(15) // Could match both 0-10 and 10-20, but should only increment first

      histogram.printHistogram('First Match Only')
      expect(consoleOutput).toContain('\nFirst Match Only\n\t- 0-10: 1\n\t- 10-20: 0\n\t- 20-Infinity: 0\n')
    })

    test('should handle values that match no buckets', () => {
      const bucketRanges = [0, 10, 20]
      const comparator = (value: number, start: number, end: number) => 
        false // Never matches

      const histogram = new Histogram(bucketRanges, comparator)
      
      histogram.logData(5)
      histogram.logData(15)
      histogram.logData(25)

      histogram.printHistogram('No Matches')
      expect(consoleOutput).toContain('\nNo Matches\n\t- 0-10: 0\n\t- 10-20: 0\n\t- 20-Infinity: 0\n')
    })
  })

  describe('clearHistogram', () => {
    test('should reset all buckets to zero', () => {
      const bucketRanges = [0, 10, 20]
      const comparator = (value: number, start: number, end: number) => 
        value >= start && value < end

      const histogram = new Histogram(bucketRanges, comparator)
      
      // Add some data
      histogram.logData(5)
      histogram.logData(15)
      histogram.logData(25)

      // Verify data was logged
      histogram.printHistogram('Before Clear')
      expect(consoleOutput).toContain('\nBefore Clear\n\t- 0-10: 1\n\t- 10-20: 1\n\t- 20-Infinity: 1\n')

      // Clear histogram
      consoleOutput = []
      histogram.clearHistogram()

      // Verify all buckets are zero
      histogram.printHistogram('After Clear')
      expect(consoleOutput).toContain('\nAfter Clear\n\t- 0-10: 0\n\t- 10-20: 0\n\t- 20-Infinity: 0\n')
    })

    test('should allow logging new data after clear', () => {
      const bucketRanges = [0, 10]
      const comparator = (value: number, start: number, end: number) => 
        value >= start && value < end

      const histogram = new Histogram(bucketRanges, comparator)
      
      histogram.logData(5)
      histogram.clearHistogram()
      histogram.logData(15)

      histogram.printHistogram('After Clear and New Data')
      expect(consoleOutput).toContain('\nAfter Clear and New Data\n\t- 0-10: 0\n\t- 10-Infinity: 1\n')
    })
  })

  describe('printHistogram', () => {
    test('should print histogram with custom name', () => {
      const histogram = new Histogram([0, 10], (v: number, s, e) => v >= s && v < e)
      
      histogram.printHistogram('Custom Name')
      expect(consoleOutput).toContain('\nCustom Name\n\t- 0-10: 0\n\t- 10-Infinity: 0\n')
    })

    test('should print histogram with default name', () => {
      const histogram = new Histogram([0, 10], (v: number, s, e) => v >= s && v < e)
      
      histogram.printHistogram()
      expect(consoleOutput).toContain('\nHistogram\n\t- 0-10: 0\n\t- 10-Infinity: 0\n')
    })

    test('should format output correctly with various counts', () => {
      const histogram = new Histogram([0, 100, 1000], (v: number, s, e) => v >= s && v < e)
      
      // Add different amounts to each bucket
      for (let i = 0; i < 5; i++) histogram.logData(50)
      for (let i = 0; i < 123; i++) histogram.logData(500)
      for (let i = 0; i < 9999; i++) histogram.logData(5000)

      histogram.printHistogram('Large Counts')
      expect(consoleOutput).toContain('\nLarge Counts\n\t- 0-100: 5\n\t- 100-1000: 123\n\t- 1000-Infinity: 9999\n')
    })
  })

  describe('NewNumberHistogram', () => {
    test('should create a number histogram with correct comparator', () => {
      const histogram = NewNumberHistogram('Test Number Histogram', [0, 5, 10])
      
      histogram.logData(3)
      histogram.logData(7)
      histogram.logData(12)

      logFlags.net_stats = true
      histogram.printHistogram('Manual Print')
      logFlags.net_stats = false
      
      expect(consoleOutput).toContain('\nManual Print\n\t- 0-5: 1\n\t- 5-10: 1\n\t- 10-Infinity: 1\n')
    })

    test('should set up interval for automatic printing when net_stats is true', () => {
      const setIntervalSpy = jest.spyOn(global, 'setInterval')
      
      NewNumberHistogram('Auto Print Test', [0, 10, 20])
      
      expect(setIntervalSpy).toHaveBeenCalledWith(
        expect.any(Function),
        10 * 60 * 1000 // 10 minutes
      )
    })

    test('should print and clear histogram on interval when net_stats is true', () => {
      logFlags.net_stats = true
      
      const histogram = NewNumberHistogram('Interval Test', [0, 10])
      histogram.logData(5)
      histogram.logData(15)
      
      // Fast forward time to trigger interval
      jest.advanceTimersByTime(10 * 60 * 1000)
      
      // Should have printed the histogram
      expect(consoleOutput.some(output => output.includes('Interval Test'))).toBe(true)
      expect(consoleOutput.some(output => output.includes('0-10: 1'))).toBe(true)
      expect(consoleOutput.some(output => output.includes('10-Infinity: 1'))).toBe(true)
      
      // Verify histogram was cleared by logging new data and checking
      consoleOutput = []
      histogram.printHistogram('After Interval')
      expect(consoleOutput).toContain('\nAfter Interval\n\t- 0-10: 0\n\t- 10-Infinity: 0\n')
      
      logFlags.net_stats = false
    })

    test('should not print on interval when net_stats is false', () => {
      logFlags.net_stats = false
      
      const histogram = NewNumberHistogram('No Print Test', [0, 10])
      histogram.logData(5)
      
      consoleOutput = []
      jest.advanceTimersByTime(10 * 60 * 1000)
      
      // Should not have printed anything
      expect(consoleOutput.length).toBe(0)
    })

    test('should handle boundary values correctly', () => {
      const histogram = NewNumberHistogram('Boundary Test', [0, 10, 20])
      
      // Test exact boundary values
      histogram.logData(0)   // Should go to 0-10
      histogram.logData(10)  // Should go to 10-20
      histogram.logData(20)  // Should go to 20-Infinity
      histogram.logData(9.999) // Should go to 0-10
      histogram.logData(10.001) // Should go to 10-20

      logFlags.net_stats = true
      histogram.printHistogram('Boundaries')
      logFlags.net_stats = false
      
      expect(consoleOutput).toContain('\nBoundaries\n\t- 0-10: 2\n\t- 10-20: 2\n\t- 20-Infinity: 1\n')
    })

    test('should work with positive numbers', () => {
      // Note: Due to the split('-') implementation, negative numbers don't work correctly
      // This test uses positive numbers only
      const histogram = NewNumberHistogram('Positive Test', [0, 10, 20])
      
      histogram.logData(5)
      histogram.logData(15)
      histogram.logData(25)

      logFlags.net_stats = true
      histogram.printHistogram('Positives')
      logFlags.net_stats = false
      
      expect(consoleOutput).toContain('\nPositives\n\t- 0-10: 1\n\t- 10-20: 1\n\t- 20-Infinity: 1\n')
    })
  })

  describe('edge cases', () => {
    test('should handle float bucket ranges', () => {
      const histogram = NewNumberHistogram('Float Buckets', [0.0, 0.5, 1.0, 1.5])
      
      histogram.logData(0.3)
      histogram.logData(0.7)
      histogram.logData(1.2)
      histogram.logData(2.0)

      logFlags.net_stats = true
      histogram.printHistogram('Float Test')
      logFlags.net_stats = false
      
      expect(consoleOutput).toContain('\nFloat Test\n\t- 0-0.5: 1\n\t- 0.5-1: 1\n\t- 1-1.5: 1\n\t- 1.5-Infinity: 1\n')
    })

    test('should handle very large numbers', () => {
      const histogram = NewNumberHistogram('Large Numbers', [0, 1e6, 1e9])
      
      histogram.logData(500000)
      histogram.logData(5000000)
      histogram.logData(5000000000)

      logFlags.net_stats = true
      histogram.printHistogram('Large')
      logFlags.net_stats = false
      
      expect(consoleOutput).toContain('\nLarge\n\t- 0-1000000: 1\n\t- 1000000-1000000000: 1\n\t- 1000000000-Infinity: 1\n')
    })

    test('should handle custom type with object comparator', () => {
      interface DataPoint {
        value: number
        category: string
      }

      const bucketRanges = [0, 50, 100]
      const comparator = (data: DataPoint, start: number, end: number) => 
        data.value >= start && data.value < end

      const histogram = new Histogram<DataPoint>(bucketRanges, comparator)
      
      histogram.logData({ value: 25, category: 'A' })
      histogram.logData({ value: 75, category: 'B' })
      histogram.logData({ value: 125, category: 'C' })

      histogram.printHistogram('Object Data')
      expect(consoleOutput).toContain('\nObject Data\n\t- 0-50: 1\n\t- 50-100: 1\n\t- 100-Infinity: 1\n')
    })
  })
})