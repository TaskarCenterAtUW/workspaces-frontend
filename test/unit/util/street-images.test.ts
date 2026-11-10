import { describe, expect, it } from 'vitest';
import { resolveStreetImageUrl, streetImageUrl } from '~/util/street-images';

describe('streetImageUrl', () => {
  it('extracts trimmed ext:street_images tag value', () => {
    expect(streetImageUrl({ 'ext:street_images': '  https://panoramax.example.com/api/pictures/1/hd.jpg  ' }))
      .toBe('https://panoramax.example.com/api/pictures/1/hd.jpg');
  });

  it('extracts trimmed ext:kartaview_url tag value', () => {
    expect(streetImageUrl({ 'ext:kartaview_url': '  https://example.com/img.jpg  ' }))
      .toBe('https://example.com/img.jpg');
  });

  it('returns undefined when tag is missing or empty', () => {
    expect(streetImageUrl(undefined)).toBeUndefined();
    expect(streetImageUrl({})).toBeUndefined();
    expect(streetImageUrl({ 'ext:street_images': '   ' })).toBeUndefined();
    expect(streetImageUrl({ 'ext:kartaview_url': '   ' })).toBeUndefined();
  });
});

describe('resolveStreetImageUrl', () => {
  it('returns self-hosted Panoramax URLs unchanged', () => {
    const panoramaxUrl = 'https://panoramax-dev-faaadghgcfgwcchk.westus2-01.azurewebsites.net/api/pictures/018ce3ad-d8ed-4c50-846b-a255f6af64ae/hd.jpg';
    expect(resolveStreetImageUrl(panoramaxUrl)).toBe(panoramaxUrl);
  });

  it('returns existing KartaView CDN URLs unchanged', () => {
    const cdnUrl = 'https://cdn.kartaview.org/pr:sharp/aHR0cHM6Ly9zdG9yYWdlMTMub3BlbnN0cmVldGNhbS5vcmcvZmlsZXMvcGhvdG8vMS5qcGc';
    expect(resolveStreetImageUrl(cdnUrl)).toBe(cdnUrl);
  });

  it('converts legacy OpenStreetCam and KartaView storage URLs to CDN-proxied base64 URLs', () => {
    const legacyOscUrl = 'https://storage13.openstreetcam.org/files/photo/1.jpg';
    expect(resolveStreetImageUrl(legacyOscUrl)).toBe(
      'https://cdn.kartaview.org/pr:sharp/aHR0cHM6Ly9zdG9yYWdlMTMub3BlbnN0cmVldGNhbS5vcmcvZmlsZXMvcGhvdG8vMS5qcGc'
    );

    const legacyKvUrl = 'https://storage.kartaview.org/files/photo/2.jpg';
    expect(resolveStreetImageUrl(legacyKvUrl)).toBe(
      'https://cdn.kartaview.org/pr:sharp/aHR0cHM6Ly9zdG9yYWdlLmthcnRhdmlldy5vcmcvZmlsZXMvcGhvdG8vMi5qcGc'
    );
  });
});
