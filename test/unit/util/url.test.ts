import { describe, expect, it } from 'vitest';
import { isHttpUrl } from '~/util/url';

// Generated from the @test outline in util/url.ts:
// "isHttpUrl is true for http(s) URLs, false for other protocols and garbage"
describe('isHttpUrl', () => {
  it('is true for http and https URLs', () => {
    expect(isHttpUrl('http://example.com')).toBe(true);
    expect(isHttpUrl('https://example.com/path?q=1')).toBe(true);
  });

  it('is false for non-http protocols', () => {
    expect(isHttpUrl('ftp://example.com')).toBe(false);
    expect(isHttpUrl('mailto:a@b.com')).toBe(false);
  });

  it('is false for non-URL input', () => {
    expect(isHttpUrl('not a url')).toBe(false);
    expect(isHttpUrl('')).toBe(false);
    expect(isHttpUrl(null)).toBe(false);
  });
});
