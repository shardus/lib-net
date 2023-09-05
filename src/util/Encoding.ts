export const isObject = (val) => {
  if (val === null) {
    return false
  }
  if (Array.isArray(val)) {
    return false
  }
  return typeof val === 'function' || typeof val === 'object'
}

export function base64BufferReviver(key: string, value: any) {
  const originalObject = value
  if (
    isObject(originalObject) &&
    originalObject.hasOwnProperty('dataType') &&
    originalObject.dataType &&
    originalObject.dataType == 'bh'
  ) {
    return Buffer.from(originalObject.data, 'base64')
  } else {
    return value
  }
}

export const stringifyData = <T>(data: T, customStringifier?: (data: T) => string): string => {
  return customStringifier ? customStringifier(data) : JSON.stringify(data)
}
