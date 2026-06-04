import type { OsmTags } from '~/types/osm';

export const KARTAVIEW_URL_TAG = 'ext:kartaview_url';
const KARTAVIEW_CDN_PREFIX = 'https://cdn.kartaview.org/pr:sharp/';

/**
 * Extracts a KartaView image URL from an element's tags if present.
 */
export function kartaViewImageUrl(tags: OsmTags | undefined): string | undefined {
  const value = tags?.[KARTAVIEW_URL_TAG]?.trim();
  return value || undefined;
}

/**
 * Converts a legacy KartaView/OpenStreetCam storage URL to the new CDN-proxied
 * form. Returns CDN URLs already in the new form unchanged.
 */
export function convertKartaViewUrl(url: string): string {
  if (url.startsWith(KARTAVIEW_CDN_PREFIX)) {
    return url;
  }
  const cleanUrl = url.trim();
  const bytes = new TextEncoder().encode(cleanUrl);
  const binaryStr = Array.from(bytes, b => String.fromCharCode(b)).join('');
  const base64 = btoa(binaryStr).replace(/=+$/, '');
  return `${KARTAVIEW_CDN_PREFIX}${base64}`;
}
