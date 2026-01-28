export function isHttpUrl(input: unknown): boolean {
  let url: URL

  try {
    url = new URL(input as string)
  }
  catch {
    return false
  }

  return url.protocol === 'http:' || url.protocol === 'https:'
}

export function normalizeUrl(input: string): string {
  return new URL(input).href
}
