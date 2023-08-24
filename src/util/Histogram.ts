import { randomUUID } from 'crypto'

export class Histogram<T> {
  private buckets: Map<string, number>

  constructor(
    private bucketRanges: number[],
    private comparator: (value: T, rangeStart: number, rangeEnd: number) => boolean
  ) {
    this.buckets = new Map()
    this.initializeBuckets()
  }

  private initializeBuckets() {
    for (let i = 0; i < this.bucketRanges.length; i++) {
      const rangeStart = this.bucketRanges[i]
      const rangeEnd = this.bucketRanges[i + 1] || Number.POSITIVE_INFINITY
      this.buckets.set(`${rangeStart}-${rangeEnd}`, 0)
    }
  }

  logData(value: T) {
    for (const [bucket, count] of this.buckets.entries()) {
      const [rangeStart, rangeEnd] = bucket.split('-').map(Number)
      if (this.comparator(value, rangeStart, rangeEnd)) {
        this.buckets.set(bucket, count + 1)
        break
      }
    }
  }

  clearHistogram() {
    for (const bucket of this.buckets.keys()) {
      this.buckets.set(bucket, 0)
    }
  }

  printHistogram(name = 'Histogram') {
    const printId = randomUUID()
    console.log(`\n${name} - ${printId}`)
    for (const [bucket, count] of this.buckets.entries()) {
      console.log(`\t- ${bucket}: ${count} (${printId})})`)
    }
  }
}

export const NewNumberHistogram = (name: string, bucketRanges: number[]) => {
  const histogram = new Histogram<number>(bucketRanges, (value, rangeStart, rangeEnd) => {
    return value >= rangeStart && value < rangeEnd
  })

  setInterval(() => {
    histogram.printHistogram(name)
    histogram.clearHistogram()
  }, 2 * 60 * 1000)

  return histogram
}
