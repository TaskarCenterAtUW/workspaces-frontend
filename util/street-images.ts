import type { OsmTags } from '~/types/osm';

export const STREET_IMAGES_TAG = 'ext:street_images';
export const KARTAVIEW_URL_TAG = 'ext:kartaview_url';

const KARTAVIEW_CDN_PREFIX = 'https://cdn.kartaview.org/pr:sharp/';
const LEGACY_KARTAVIEW_HOSTS = ['kartaview.org', 'openstreetcam.org'];

function isLegacyKartaViewUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return LEGACY_KARTAVIEW_HOSTS.some(
      domain => hostname === domain || hostname.endsWith(`.${domain}`)
    );
  }
  catch {
    return false;
  }
}

/**
 * Extracts a street-level image URL from an element's tags (`ext:street_images`
 * or `ext:kartaview_url`) if present.
 */
export function streetImageUrl(tags: OsmTags | undefined): string | undefined {
  const value = tags?.[STREET_IMAGES_TAG]?.trim() || tags?.[KARTAVIEW_URL_TAG]?.trim();
  return value || undefined;
}

/**
 * Resolves a street-level image URL for display. Returns standard image URLs
 * (such as self-hosted Panoramax URLs or KartaView CDN URLs) unchanged, and
 * converts legacy KartaView/OpenStreetCam storage URLs to the CDN-proxied form.
 */
export function resolveStreetImageUrl(url: string): string {
  const cleanUrl = url.trim();
  if (cleanUrl.startsWith(KARTAVIEW_CDN_PREFIX) || !isLegacyKartaViewUrl(cleanUrl)) {
    return cleanUrl;
  }
  const bytes = new TextEncoder().encode(cleanUrl);
  const binaryStr = Array.from(bytes, b => String.fromCharCode(b)).join('');
  const base64 = btoa(binaryStr).replace(/=+$/, '');
  return `${KARTAVIEW_CDN_PREFIX}${base64}`;
}
