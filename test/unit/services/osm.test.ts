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

describe('OsmApiClient.getChangesetComments', () => {
  it('requests the changeset with the discussion and returns its comments', async () => {
    const urls: string[] = [];
    server.use(
      http.get(`${OSM_API_BASE}changeset/5.json`, ({ request }) => {
        urls.push(request.url);
        return HttpResponse.json({
          changeset: {
            id: 5,
            created_at: '2026-07-01T00:00:00Z',
            closed_at: '2026-07-01T01:00:00Z',
            comments: [
              { id: 1, text: 'looks good', user: 'alice', date: '2026-07-01T00:30:00Z' }
            ]
          }
        });
      })
    );

    const comments = await makeClient().getChangesetComments(1, 5);

    // The comments only come back when the changeset is fetched with the flag.
    expect(urls.some(u => u.includes('include_discussion=true'))).toBe(true);
    expect(comments).toHaveLength(1);
    expect(comments[0]!.text).toBe('looks good');
    expect(comments[0]!.date).toBeInstanceOf(Date);
  });

  // Regression: the review discussion used to gate the fetch on the list
  // payload's comments_count; getChangesetComments itself must simply return []
  // when the changeset carries no comments.
  it('returns an empty array when the changeset has no comments', async () => {
    server.use(
      http.get(`${OSM_API_BASE}changeset/5.json`, () =>
        HttpResponse.json({
          changeset: { id: 5, created_at: '2026-07-01T00:00:00Z', closed_at: '2026-07-01T01:00:00Z' }
        })
      )
    );

    await expect(makeClient().getChangesetComments(1, 5)).resolves.toEqual([]);
  });
});

describe('OsmApiClient comment posting', () => {
  // Regression: the comment text must be sent in the query string, not a
  // multipart body — the OSM API only reads params[:text] from the query, and
  // this backend 401s a write whose text it can't find.
  it('posts a changeset comment with the message text as a query parameter', async () => {
    const urls: string[] = [];
    server.use(
      http.post(`${OSM_API_BASE}changeset/5/comment`, ({ request }) => {
        urls.push(request.url);
        return new HttpResponse(null, { status: 200 });
      })
    );

    await makeClient().postChangesetComment(1, 5, 'nice work');

    expect(urls.some(u => u.includes('text=nice%20work'))).toBe(true);
  });

  it('posts a note comment to the notes endpoint with the message text as a query parameter', async () => {
    const urls: string[] = [];
    server.use(
      http.post(`${OSM_API_BASE}notes/9/comment`, ({ request }) => {
        urls.push(request.url);
        return new HttpResponse(null, { status: 200 });
      })
    );

    await makeClient().postNoteComment(1, 9, 'thanks for flagging');

    expect(urls.some(u => u.includes('text=thanks%20for%20flagging'))).toBe(true);
  });
});
