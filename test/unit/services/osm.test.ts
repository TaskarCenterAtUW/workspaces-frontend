import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { BaseHttpClientError } from '~/services/http';
import { OsmApiClient, OsmApiClientError } from '~/services/osm';
import { server } from '../../mocks/server';

import type { TdeiClient } from '~/services/tdei';

// Run protected requests with a test token while keeping the real HTTP client.
const tdeiClient = {
  sendProtectedRequest: async (
    request: (accessToken: string) => Promise<Response>
  ) => await request('test-access-token'),
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
  // here, which JSON.stringify's to "{}", the bug that made the exported
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
  // multipart body. The OSM API only reads params[:text] from the query, and
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
      // postNoteComment hits the `.json` endpoint and parses the returned
      // GeoJSON Feature, so the stub must respond with a valid note feature.
      http.post(`${OSM_API_BASE}notes/9/comment.json`, ({ request }) => {
        urls.push(request.url);
        return HttpResponse.json({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [-122.3, 47.6] },
          properties: {
            id: 9,
            status: 'open',
            date_created: '2026-07-01T00:00:00Z',
            comments: [
              { text: 'thanks for flagging', user: 'tester', date: '2026-07-01T00:30:00Z' }
            ]
          }
        });
      })
    );

    await makeClient().postNoteComment(1, 9, 'thanks for flagging');

    // URLSearchParams encodes the space as `+`, not `%20`.
    expect(urls.some(u => u.includes('text=thanks+for+flagging'))).toBe(true);
  });
});

describe('OsmApiClient.getWorkspaceData', () => {
  // The API reports no bounding box for a workspace that has never held a
  // node, and the archive export reads such a workspace legitimately, so this
  // must not throw.
  it('reads an empty workspace as no elements rather than failing', async () => {
    const client = makeClient();

    vi.spyOn(client, 'getExportBbox').mockResolvedValue(undefined);

    await expect(client.getWorkspaceData(1)).resolves.toEqual([]);
  });

  it('exports an empty workspace as an empty document rather than failing', async () => {
    const client = makeClient();

    vi.spyOn(client, 'getExportBbox').mockResolvedValue(undefined);

    const blob = await client.exportWorkspaceXml(1);

    expect(await blob.text()).toContain('<osm version="0.6"');
  });

  it('does not request map data when there is no bounding box', async () => {
    const client = makeClient();
    let requested = false;

    server.use(
      http.get(`${OSM_API_BASE}map.json`, () => {
        requested = true;

        return HttpResponse.json({ elements: [] });
      })
    );

    vi.spyOn(client, 'getExportBbox').mockResolvedValue(undefined);

    await client.getWorkspaceData(1);

    expect(requested).toBe(false);
  });
});

describe('OsmApiClient errors', () => {
  it('reports a failed OSM request as an OSM API error', async () => {
    server.use(
      http.delete(`${OSM_API_BASE}workspaces/7`, () => new HttpResponse(null, { status: 500 }))
    );

    const error = await makeClient().deleteWorkspace(7).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(OsmApiClientError);
    expect((error as OsmApiClientError).response.status).toBe(500);
  });

  it('passes a failed session refresh through rather than as the OSM server\'s answer', async () => {
    // The refresh fails before the OSM request is sent, so nothing here came
    // from the OSM server.
    const refreshFailure = new BaseHttpClientError(new Response(null, { status: 503 }));
    const client = new OsmApiClient(OSM_WEB_BASE, OSM_API_BASE, {
      sendProtectedRequest: async () => {
        throw refreshFailure;
      }
    } as unknown as TdeiClient);

    await expect(client.deleteWorkspace(7)).rejects.toBe(refreshFailure);
  });

  it('passes through a refresh that fails after the OSM server answered 401', async () => {
    // The OSM 401 has already been recorded by then, so only telling the two
    // errors apart, not merely noticing that a request was sent, keeps the
    // refresh failure from being reported as the OSM server's answer.
    server.use(
      http.delete(`${OSM_API_BASE}workspaces/7`, () => new HttpResponse(null, { status: 401 }))
    );

    const refreshFailure = new BaseHttpClientError(new Response(null, { status: 503 }));
    const client = new OsmApiClient(OSM_WEB_BASE, OSM_API_BASE, {
      sendProtectedRequest: async (send: (accessToken: string) => Promise<Response>) => {
        await send('expired-token').catch(() => undefined);
        throw refreshFailure;
      }
    } as unknown as TdeiClient);

    await expect(client.deleteWorkspace(7)).rejects.toBe(refreshFailure);
  });
});
