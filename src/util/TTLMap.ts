interface TTLMapValue<T> {
  value: T
  expiry: number
}

type OnExpiryCallback<T> = (key: string, value: T) => void

class TTLMap<T> {
  private readonly map: { [key: string]: TTLMapValue<T> } = {}

  public set(key: string, value: T, ttl: number, onExpiry?: OnExpiryCallback<T>): void {
    const expiry = Date.now() + ttl
    this.map[key] = { value, expiry }
    setTimeout(() => {
      if (onExpiry) {
        onExpiry(key, value)
      }
      delete this.map[key]
    }, ttl)
  }

  public get(key: string): T | undefined {
    const value = this.map[key]
    if (value && value.expiry > Date.now()) {
      return value.value
    }
    delete this.map[key]
    return undefined
  }

  public delete(key: string): void {
    delete this.map[key]
  }
}
