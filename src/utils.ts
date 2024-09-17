export function extractError(e: any | Error) {
  return Object.fromEntries(
    Object.getOwnPropertyNames(e).map((key) => [key, e[key]])
  )
}
