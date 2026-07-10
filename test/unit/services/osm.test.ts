import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { OsmApiClient } from '~/services/osm';
import { server } from '../../mocks/server';

import type { TdeiClient } from '~/services/tdei';

// getOsmChange only needs its tdei collaborator for auth: a no-op refresh and an
// `auth` object whose `complete` flag gates the Authorization header. The real
// BaseHttpClient runs end to end — MSW intercepts at fetch, so URL building and
// the async XML parse are exercised.
const tdeiClient = {
  tryRefreshAuth: async () => {},
  auth: { complete: false, accessToken: '' }
} as unknown as TdeiClient;

const OSM_WEB_BASE = 'http://api.test/osm/';
const OSM_API_BASE = 'http://api.test/osm/api/0.6/';

// A minimal but real osmChange document: one created node carrying a tag and a
// timestamp, so we can assert both the parsed structure and the Date coercion.
const OSM_CHANGE_XML = `<osmChange version="0.6">
  <create>
    <node id="1" lat="47.6" lon="-122.3" version="1" changeset="42" timestamp="2026-07-01T00:00:00Z" user="tester" uid="9">
      <tag k="highway" v="crossing"/>
    </node>
  </create>
</osmChange>`;

function makeClient() {
  return new OsmApiClient(OSM_WEB_BASE, OSM_API_BASE, tdeiClient);
}

function stubDownload(xml: string = OSM_CHANGE_XML) {
  server.use(
    http.get(`${OSM_API_BASE}changeset/:id/download`, () =>
      HttpResponse.text(xml, { headers: { 'Content-Type': 'application/xml' } })
    )
  );
}

describe('OsmApiClient.getOsmChange', () => {
  // Regression: parseOsmChangeXml is async (it resolves a Promise once the
  // streaming sax parse completes). Using it without `await` left a Promise
  // here, which JSON.stringify's to "{}" — the bug that made the exported
  // changesets/{id}.json empty even when the .osc had content.
  it('parses the downloaded osmChange XML into a populated object', async () => {
    stubDownload();

    const osmChange = await makeClient().getOsmChange(1, 777);

    expect(JSON.stringify(osmChange)).not.toBe('{}');
    expect(osmChange.create).toHaveLength(1);

    const element = osmChange.create![0]!;
    expect(element.type).toBe('node');
    expect(element.tags).toEqual({ highway: 'crossing' });
  });

  // The same missing `await` also silently skipped getOsmChange's normalization
  // loop (it iterated the Promise, not the elements), so timestamps stayed raw
  // strings. With the await, each element.timestamp is coerced to a Date.
  it('normalizes each element timestamp into a Date', async () => {
    stubDownload();

    const osmChange = await makeClient().getOsmChange(1, 777);

    const element = osmChange.create![0]!;
    expect(element.timestamp).toBeInstanceOf(Date);
    expect(element.timestamp.toISOString()).toBe('2026-07-01T00:00:00.000Z');
  });
});

describe('OsmApiClient.postNoteComment', () => {
  // Regression: the review Discussion panel fired NO request when commenting on
  // a note — there was no client method and send() ignored notes entirely. This
  // posts the text to the OSM note-comment endpoint and returns the updated note.
  it('posts the comment text and parses the returned note', async () => {
    let requestUrl: string | undefined;

    server.use(
      http.post(`${OSM_API_BASE}notes/:id/comment.json`, ({ request }) => {
        requestUrl = request.url;
        return HttpResponse.json({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [-122.3, 47.6] },
          properties: {
            id: 555,
            status: 'open',
            date_created: '2026-07-01T00:00:00Z',
            comments: [
              { date: '2026-07-01T00:00:00Z', user: 'tester', text: 'the note', action: 'opened', html: '' },
              { date: '2026-07-02T00:00:00Z', user: 'tester', text: 'a reply', action: 'commented', html: '' }
            ]
          }
        });
      })
    );

    const note = await makeClient().postNoteComment(1, 555, 'a reply');

    expect(requestUrl).toContain('notes/555/comment.json');
    expect(new URL(requestUrl!).searchParams.get('text')).toBe('a reply');
    expect(note?.id).toBe(555);
    expect(note?.comments).toHaveLength(2);
    // Comment dates are coerced from strings to Date objects.
    expect(note?.comments[1]?.date).toBeInstanceOf(Date);
    expect(note?.comments[1]?.text).toBe('a reply');
  });
});
