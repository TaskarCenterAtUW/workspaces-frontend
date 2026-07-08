// Test outline → generated in test/unit/util/url.test.ts
// @test unit: isHttpUrl is true for http(s) URLs, false for other protocols and garbage
export function isHttpUrl(input: any): boolean {
  let url: URL;

  try {
    url = new URL(input);
  } catch {
    return false;
  }

  return url.protocol === 'http:' || url.protocol === 'https:';
}

export function normalizeUrl(input: string): string {
  return new URL(input).href
}
