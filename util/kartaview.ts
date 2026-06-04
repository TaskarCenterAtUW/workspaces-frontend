import type { OsmTags } from '~/types/osm';

export const KARTAVIEW_URL_TAG = 'ext:kartaview_url';

/**
 * Extracts a KartaView image URL from an element's tags if present.
 */
export function kartaViewImageUrl(tags: OsmTags | undefined): string | undefined {
  const value = tags?.[KARTAVIEW_URL_TAG]?.trim();
  return value || undefined;
}

/**
 * Upgrades a KartaView large-thumbnail URL to the full-resolution processed version.
 * KartaView stores thumbnails at .../lth/... and full-res at .../proc/...
 * Returns the original URL unchanged if the /lth/ segment is not present.
 */
export function kartaViewFullResUrl(url: string): string {
  return url.replace('/lth/', '/proc/');
}
