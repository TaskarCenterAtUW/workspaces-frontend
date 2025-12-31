export function isHttpUrl(input: any): boolean {
  let url: URL

  try {
    url = new URL(input)
  }
  catch {
    return false
  }

  return url.protocol === 'http:' || url.protocol === 'https:'
}

export function normalizeUrl(input: string): string {
  return new URL(input).href
}
