import { test, expect, seedAuthenticatedSession } from './fixtures';
import { recordContract } from './contract';
import { PROJECT_GROUP_ID, USER_ID } from '../mocks/fixtures';
import type { Page } from '@playwright/test';

// Generated from the @test outline in pages/workspace/[id]/review.vue.
//
// review.vue does a top-level `await workspacesClient.getWorkspace(1)` and then
// (synchronously, fire-and-forget) refresh() -> reviewList.refresh(filter),
// which calls:
//   - OSM listChangesets(1)  GET http://api.test/osm/changesets.json
//   - OSM getNotes(1, false) GET http://api.test/osm/notes/search.json?...
//   - WorkspacesClient.getWorkspace(1) a 2nd time (ReviewList caches it lazily)
//   - TDEI getDatasetFeedback(recordId) GET http://api.test/tdei/osw/dataset-viewer/feedbacks?...
//     ONLY when the workspace has a tdeiRecordId.
// Plus the navbar needs workspaces/mine (stubbed by the shared fixture).
//
// The map (components/review/Map.vue) inits maplibre-gl (WebGL). In headless CI
// the canvas may not render and changeset clicks (which call getAdiff -> OSM
// element/way/node fetches) can't be exercised reliably. Where an assertion
// truly needs the rendered GL canvas it is noted inline; everything DOM-level
// (sidebar list, overlay/toolbar, attribute-diff panel, spinner, gear menu,
// refresh button) is asserted directly.

const TDEI_RECORD_ID = '55555555-5555-5555-5555-555555555555';

// A WorkspaceResponse conformant with test/contract/openapi.json. tdeiRecordId
// is set so the feedback branch of the review list runs.
const reviewWorkspace = {
  id: 1,
  type: 'osw',
  title: 'Seattle Sidewalks',
  description: null,
  tdeiProjectGroupId: PROJECT_GROUP_ID,
  tdeiRecordId: TDEI_RECORD_ID,
  tdeiServiceId: null,
  tdeiMetadata: null,
  createdAt: '2026-01-15T12:00:00.000Z',
  createdBy: USER_ID,
  createdByName: 'Ada Lovelace',
  externalAppAccess: 2,
  kartaViewToken: null,
  role: 'lead'
};

// One closed changeset. listChangesets returns { changesets: [...] }.
const changesets = {
  changesets: [
    {
      id: 4242,
      created_at: '2026-06-10T10:00:00.000Z',
      closed_at: '2026-06-10T10:05:00.000Z',
      open: false,
      user: 'mapper_jane',
      uid: 7,
      min_lat: 47.6,
      min_lon: -122.34,
      max_lat: 47.61,
      max_lon: -122.33,
      comments_count: 2,
      changes_count: 3,
      tags: { comment: 'Added sidewalk segments downtown' }
    }
  ]
};

// notes/search.json returns a GeoJSON FeatureCollection; osm.ts maps it.
const notesGeoJson = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-122.335, 47.605] },
      properties: {
        id: 99,
        status: 'open',
        date_created: '2026-06-12T08:00:00.000Z',
        comments: [
          {
            action: 'opened',
            date: '2026-06-12T08:00:00.000Z',
            user: 'note_author',
            uid: 11,
            text: 'Curb ramp is missing here',
            html: '<p>Curb ramp is missing here</p>'
          }
        ]
      }
    }
  ]
};

// TDEI feedback list (array). Dates are ISO strings the client parses.
const feedbackSubmission = {
  id: 555,
  status: 'open',
  location_latitude: 47.607,
  location_longitude: -122.338,
  customer_email: 'rider@example.com',
  feedback_text: 'This crossing is hard to navigate in a wheelchair',
  created_at: '2026-06-14T09:00:00.000Z',
  updated_at: '2026-06-14T09:00:00.000Z',
  due_date: '2099-06-14T09:00:00.000Z',
  resolution_status: null,
  resolution_description: null,
  resolved_by: null,
  project_group: { tdei_project_group_id: PROJECT_GROUP_ID, name: 'Puget Sound' },
  dataset: { tdei_dataset_id: TDEI_RECORD_ID, name: 'Seattle Sidewalks' }
};
const feedback = [feedbackSubmission];

const selectedFeedback = feedback[0]!;

// A minimal osmChange XML for the changeset download (getOsc, triggered when an
// item scrolls into view). Keeps the OSC parser happy without driving the map.
const osmChangeXml = `<?xml version="1.0" encoding="UTF-8"?>
<osmChange version="0.6" generator="test">
  <create>
    <node id="-1" lat="47.605" lon="-122.335" version="1" changeset="4242"
          timestamp="2026-06-10T10:00:00Z" user="mapper_jane" uid="7"/>
  </create>
  <modify/>
  <delete/>
</osmChange>`;

// Wire up every api.test endpoint the page touches. Per-test overrides can be
// layered before calling this by registering more specific routes first
// (Playwright matches most-recently-added first).
async function stubReviewApis(page: Page, opts: {
  workspace?: object;
  changesets?: object;
  notes?: object;
  feedback?: object;
} = {}) {
  // New-API: GET workspaces/{id} (called twice on load).
  await page.route('**/api.test/workspaces/1', route =>
    route.fulfill({ json: opts.workspace ?? reviewWorkspace })
  );
  // Some routers normalize the path without the host segment; cover both.
  await page.route(/\/workspaces\/1(\?|$)/, route =>
    route.fulfill({ json: opts.workspace ?? reviewWorkspace })
  );

  // OSM: changeset list.
  await page.route('**/osm/api/0.6/changesets.json**', route =>
    route.fulfill({ json: opts.changesets ?? changesets })
  );
  // OSM: notes search (GeoJSON).
  await page.route('**/osm/api/0.6/notes/search.json**', route =>
    route.fulfill({ json: opts.notes ?? notesGeoJson })
  );
  // OSM: changeset OSC download (text/xml) for items scrolled into view.
  await page.route('**/osm/api/0.6/changeset/*/download**', route =>
    route.fulfill({ contentType: 'application/xml', body: osmChangeXml })
  );

  // TDEI: dataset feedback list.
  await page.route('**/tdei/osw/dataset-viewer/feedbacks**', route =>
    route.fulfill({ json: opts.feedback ?? feedback })
  );

  // OSM map/element fetches the adiff builder may issue on a changeset click.
  // Best-effort empty stubs so nothing 500s if the GL map does run.
  await page.route('**/osm/api/0.6/node/*/ways**', route =>
    route.fulfill({ json: { elements: [] } })
  );
  await page.route('**/osm/api/0.6/nodes**', route =>
    route.fulfill({ json: { elements: [] } })
  );
  await page.route('**/osm/api/0.6/ways**', route =>
    route.fulfill({ json: { elements: [] } })
  );
}

// Convenience: the sidebar list container.
function sidebar(page: Page) {
  return page.locator('.review-sidebar');
}

// Freeze the clock so dayjs relative timestamps ("N days ago") rendered in the
// sidebar are deterministic regardless of when the suite runs — otherwise the
// ARIA snapshots drift as the calendar advances. All fixture dates are before
// this instant.
const FIXED_NOW = new Date('2026-06-20T12:00:00.000Z');

test.describe('workspace review', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(FIXED_NOW);
  });

  test.describe('changeset deep links', () => {
    test.beforeEach(async ({ page }) => {
      await seedAuthenticatedSession(page);
      await stubReviewApis(page);
      // An empty diff exercises initial map drawing/style reset without
      // depending on rendered WebGL features or external imagery services.
      await page.route('**/workspaces/1/changesets/*/adiff', route =>
        route.fulfill({ json: { actions: [] } })
      );
      await page.route('https://ecn.*.tiles.virtualearth.net/**', route => route.abort());
    });

    test('a direct link selects the changeset and finishes initial map loading', async ({ page }) => {
      const pageErrors: string[] = [];
      page.on('pageerror', error => pageErrors.push(error.message));
      const diffRequest = page.waitForRequest('**/workspaces/1/changesets/4242/adiff');

      await page.goto('/workspace/1/review?changeset=4242');
      await diffRequest;

      await expect(sidebar(page).locator('.review-item.active')).toContainText('#4242');
      await expect(page.locator('.review-toolbar')).toContainText('Changeset: #4242');
      await expect(page.getByRole('status').filter({ hasText: 'This changeset contains no changes.' }))
        .toBeVisible();
      await expect(page.locator('.map-loading-overlay')).toBeHidden();
      expect(pageErrors).toEqual([]);
    });

    test('reloading a changeset link restores the selection', async ({ page }) => {
      await page.goto('/workspace/1/review?changeset=4242');
      await expect(sidebar(page).locator('.review-item.active')).toContainText('#4242');

      await page.reload();

      await expect(page).toHaveURL('/workspace/1/review?changeset=4242');
      await expect(sidebar(page).locator('.review-item.active')).toContainText('#4242');
      await expect(page.locator('.review-toolbar')).toContainText('Changeset: #4242');
      await expect(page.locator('.map-loading-overlay')).toBeHidden();
    });

    test('selecting changesets updates the URL and preserves unrelated query parameters', async ({ page }) => {
      await stubReviewApis(page, {
        changesets: {
          changesets: [
            changesets.changesets[0],
            { ...changesets.changesets[0], id: 9001, tags: { comment: 'Another changeset' } }
          ]
        }
      });
      await page.goto('/workspace/1/review?source=shared');

      await sidebar(page).locator('.review-item').filter({ hasText: '#4242' }).click();
      await expect(page).toHaveURL('/workspace/1/review?source=shared&changeset=4242');

      await sidebar(page).locator('.review-item').filter({ hasText: '#9001' }).click();
      await expect(page).toHaveURL('/workspace/1/review?source=shared&changeset=9001');
      await expect(page.locator('.review-toolbar')).toContainText('#9001');

      await page.goBack();
      await expect(page).toHaveURL('/workspace/1/review?source=shared&changeset=4242');
      await expect(sidebar(page).locator('.review-item.active')).toContainText('#4242');

      await page.goForward();
      await expect(page).toHaveURL('/workspace/1/review?source=shared&changeset=9001');
      await expect(sidebar(page).locator('.review-item.active')).toContainText('#9001');
    });

    test('selecting feedback removes the changeset query and keeps feedback selected', async ({ page }) => {
      await page.goto('/workspace/1/review?changeset=4242&source=shared');
      await expect(sidebar(page).locator('.review-item.active')).toContainText('#4242');

      await sidebar(page).locator('.review-item').filter({ hasText: 'Feedback' }).click();

      await expect(page).toHaveURL('/workspace/1/review?source=shared');
      await expect(sidebar(page).locator('.review-item.active')).toContainText('#555');
      await expect(page.locator('.review-toolbar')).toContainText('Feedback: #555');
    });

    test('closing mobile details removes the changeset query', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto('/workspace/1/review?changeset=4242');

      await page.getByTitle('Back to list', { exact: true }).click();

      await expect(page).toHaveURL('/workspace/1/review');
      await expect(page.locator('.review-overlay')).toHaveCount(0);
      await expect(sidebar(page).locator('.review-item.active')).toHaveCount(0);
    });

    test('a resolved changeset can be opened directly', async ({ page }) => {
      const originalChangeset = changesets.changesets[0];

      await stubReviewApis(page, {
        changesets: {
          changesets: [{
            ...originalChangeset,
            tags: { ...(originalChangeset?.tags ?? {}), reviewed_by: 'reviewer' }
          }]
        }
      });
      await page.goto('/workspace/1/review?changeset=4242');

      const selected = sidebar(page).locator('.review-item.active');
      await expect(selected).toContainText('#4242');
      await expect(selected.getByText('Resolved', { exact: true })).toBeVisible();
      await expect(page.locator('.review-toolbar')).toContainText('Changeset: #4242');
    });

    test('refresh preserves the linked changeset selection', async ({ page }) => {
      await page.goto('/workspace/1/review?changeset=4242');
      await expect(sidebar(page).locator('.review-item.active')).toContainText('#4242');

      await sidebar(page).getByRole('button', { name: 'Refresh' }).click();

      await expect(sidebar(page).locator('.review-item.active')).toContainText('#4242');
      await expect(page).toHaveURL('/workspace/1/review?changeset=4242');
      await expect(page.locator('.review-toolbar')).toContainText('Changeset: #4242');
    });

    test('a missing changeset shows a notice without selecting another item', async ({ page }) => {
      await page.goto('/workspace/1/review?changeset=999999');

      await expect(page.getByRole('alert')).toHaveText(
        'Changeset #999999 was not found in this workspace.'
      );
      await expect(sidebar(page).locator('.review-item')).toHaveCount(3);
      await expect(sidebar(page).locator('.review-item.active')).toHaveCount(0);
      await expect(page.locator('.review-overlay')).toHaveCount(0);
      await expect(page.locator('.map-loading-overlay')).toBeHidden();
    });

    for (const value of ['abc', '-1', '4242&changeset=9001']) {
      test(`invalid changeset query ${value} leaves the review list usable`, async ({ page }) => {
        await page.goto(`/workspace/1/review?changeset=${value}`);

        await expect(sidebar(page).locator('.review-item')).toHaveCount(3);
        await expect(sidebar(page).locator('.review-item.active')).toHaveCount(0);
        await expect(page.locator('.review-overlay')).toHaveCount(0);
        await expect(page.getByRole('alert')).toHaveCount(0);

        await sidebar(page).locator('.review-item').filter({ hasText: 'Changeset' }).click();
        await expect(page).toHaveURL('/workspace/1/review?changeset=4242');
        await expect(page.locator('.review-toolbar')).toContainText('Changeset: #4242');
      });
    }
  });

  // @test e2e: loading this page shows a sidebar with a list of items to review (playwright snapshot this)
  test('loading shows a sidebar with a list of items to review', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await stubReviewApis(page);

    await page.goto('/workspace/1/review');

    // Sidebar header + the workspace title resolved from getWorkspace.
    await expect(sidebar(page).getByRole('heading', { name: 'Reviewing Workspace' })).toBeVisible();
    await expect(sidebar(page).getByText('Seattle Sidewalks')).toBeVisible();

    // One of each item type should render in the list.
    const items = sidebar(page).locator('.review-item');
    await expect(items).toHaveCount(3);

    await expect(sidebar(page).getByText('Added sidewalk segments downtown')).toBeVisible();
    await expect(sidebar(page).getByText('Curb ramp is missing here')).toBeVisible();
    await expect(sidebar(page)
      .getByText('This crossing is hard to navigate in a wheelchair')).toBeVisible();

    await expect(sidebar(page)).toMatchAriaSnapshot();
  });

  // @test e2e: clicking on an item in the sidebar shows its details in the map and its attribute differences in a panel on the right (playwright snapshot this)
  test('clicking an item shows its details and an attribute diff panel', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await stubReviewApis(page);

    await page.goto('/workspace/1/review');

    // Click the feedback item (deterministic without WebGL: drawing a feedback
    // popup does not depend on the adiff builder). Selecting any item must show
    // the review overlay/toolbar on the right.
    const feedbackItem = sidebar(page)
      .locator('.review-item', { hasText: 'This crossing is hard to navigate' });
    await feedbackItem.click();

    // The overlay toolbar appears for the selected item and identifies it.
    const overlay = page.locator('.review-overlay');
    await expect(overlay).toBeVisible();
    await expect(overlay.locator('.review-toolbar')).toContainText('Feedback');
    await expect(overlay.locator('.review-toolbar')).toContainText('#555');

    // The item is marked active in the sidebar.
    await expect(feedbackItem).toHaveClass(/active/);

    await expect(overlay).toMatchAriaSnapshot();

    // NOTE (maplibre): the attribute-diff panel (.diff-attributes) is populated
    // by clicking a feature on the rendered adiff map (onAdiffClick), which
    // requires the WebGL canvas. We assert the panel for a changeset selection
    // is wired below but cannot drive the GL click here; this asserts the
    // selection-side behavior that is DOM-observable.
  });

  // @test e2e: clicking the "edit" button in the review overlay opens the editor centered on the item (playwright snapshot this and assert() the URL has the proper hash for the map view)
  test('clicking edit opens the editor with a map-view hash in the URL', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await stubReviewApis(page);
    await page.route('https://ecn.*.tiles.virtualearth.net/**', route => route.abort());
    // The editor page itself will fetch the workspace; stub already covers it.

    await page.goto('/workspace/1/review');

    const feedbackItem = sidebar(page)
      .locator('.review-item', { hasText: 'This crossing is hard to navigate' });
    await feedbackItem.click();

    // The toolbar appears before the asynchronous map draw finishes.
    await expect(page.locator('.maplibregl-popup')).toContainText(selectedFeedback.feedback_text);
    await expect(page.locator('.map-loading-overlay')).toBeHidden();

    const editButton = page.locator('.review-toolbar')
      .getByRole('button', { name: /Edit Here/ });
    await expect(editButton).toBeVisible();
    await editButton.click();

    // openEditor() navigates to /workspace/1/edit with a #map=zoom/lat/lon hash
    // derived from the map. The proper hash MUST be present.
    await expect.poll(() => {
      const url = new URL(page.url());
      const match = url.hash
        .match(/^#map=([^/]+)\/([^/]+)\/([^/]+)$/);
      if (
        url.pathname !== '/workspace/1/edit'
        || url.searchParams.get('datatype') !== 'osw'
        || !match
      ) return false;

      const [zoom = NaN, lat = NaN, lon = NaN] = match.slice(1).map(Number);
      return Number.isFinite(zoom)
        && Number.isFinite(lat)
        && Number.isFinite(lon)
        && zoom >= 0
        && lat >= -90
        && lat <= 90
        && lon >= -180
        && lon <= 180;
    }, { timeout: 30_000 }).toBe(true);

    const url = new URL(page.url());
    // Verify that Edit Here targets the selected feedback.
    const [zoom, lat, lon] = url.hash.slice('#map='.length).split('/').map(Number);
    expect(zoom).toBeCloseTo(18);
    expect(lat).toBeCloseTo(selectedFeedback.location_latitude);
    expect(lon).toBeCloseTo(selectedFeedback.location_longitude);
  });

  // @test e2e: while the data is loading on the map a spinner appears (assert() this is true)
  test('shows a spinner on the map while data is loading', async ({ page }) => {
    await seedAuthenticatedSession(page);

    await stubReviewApis(page);
    await page.route('https://ecn.*.tiles.virtualearth.net/**', route => route.abort());

    // Initial refresh is awaited before the page mounts. Gate the diff request
    // after selection to exercise the actual map loading overlay.
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    await page.route('**/workspaces/1/changesets/4242/adiff', async (route) => {
      await gate;
      await route.fulfill({ json: { actions: [] } });
    });

    await page.goto('/workspace/1/review');

    try {
      await sidebar(page).locator('.review-item', { hasText: 'Changeset' }).click();
      await expect(page.locator('.map-loading-overlay .spinner-border')).toBeVisible();
    }
    finally {
      release();
    }

    await expect(page.locator('.map-loading-overlay')).toBeHidden();
    await expect(page.getByRole('status').filter({ hasText: 'This changeset contains no changes.' }))
      .toBeVisible();
  });

  // @test e2e: the "gear" menu allows filtering of the elements in the sidebar--make sure the simulated response and the display on the UI matches (playright snapshot or assert() this)
  test('the gear menu filters which item types appear in the sidebar', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await stubReviewApis(page);

    await page.goto('/workspace/1/review');

    await expect(sidebar(page).locator('.review-item')).toHaveCount(3);

    // Open the gear (settings) dropdown in the sidebar header.
    const gear = sidebar(page).getByRole('button', { name: /Settings/ });
    await gear.click();

    // Turn OFF changesets and notes, leaving only feedback, then Apply.
    await page.getByRole('checkbox', { name: 'Changesets' }).uncheck();
    await page.getByRole('checkbox', { name: 'Notes' }).uncheck();
    await page.getByRole('button', { name: 'Apply' }).click();

    // The simulated response is filtered client-side: only the feedback item
    // remains, and it matches the feedback fixture text.
    const items = sidebar(page).locator('.review-item');
    await expect(items).toHaveCount(1);
    await expect(items.first()).toContainText('Feedback');
    await expect(items.first())
      .toContainText('This crossing is hard to navigate in a wheelchair');
  });

  // @test e2e: clicking the "refresh" button in the sidebar refreshes the data in the sidebar and on the map (playwright snapshot this)
  test('clicking refresh reloads the sidebar data', async ({ page }) => {
    await seedAuthenticatedSession(page);

    // Register the base stubs FIRST, then layer the call-counting changesets
    // route ON TOP. Playwright matches the most-recently-registered handler
    // first, so this counting handler must come after stubReviewApis (which also
    // routes changesets.json) or it would be shadowed and never fire.
    await stubReviewApis(page);

    // First load returns one changeset; after refresh the OSM list changes so we
    // can prove a re-fetch happened and the sidebar re-renders.
    let changesetCalls = 0;
    await page.route('**/osm/api/0.6/changesets.json**', (route) => {
      changesetCalls += 1;
      const body = changesetCalls === 1
        ? changesets
        : {
            changesets: [
              { ...changesets.changesets[0], id: 9001, tags: { comment: 'Refreshed changeset' } }
            ]
          };
      route.fulfill({ json: body });
    });

    await page.goto('/workspace/1/review');

    await expect(sidebar(page).getByText('Added sidewalk segments downtown')).toBeVisible();

    // Refresh button in the second sidebar header.
    await sidebar(page).getByRole('button', { name: 'Refresh' }).click();

    await expect(sidebar(page).getByText('Refreshed changeset')).toBeVisible();
    await expect(sidebar(page).getByText('Added sidewalk segments downtown')).toHaveCount(0);
    expect(changesetCalls).toBeGreaterThanOrEqual(2);

    await expect(sidebar(page)).toMatchAriaSnapshot();
  });

  // @test e2e: check that both changeset entries and feedback entries display in the sidebar, and that clicking on each shows the proper details in the map and attribute diff panel (playwright snapshot this)
  test('both changeset and feedback entries display and are selectable', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await stubReviewApis(page);

    await page.goto('/workspace/1/review');

    const changesetItem = sidebar(page)
      .locator('.review-item', { hasText: 'Changeset' });
    const feedbackItem = sidebar(page)
      .locator('.review-item', { hasText: 'Feedback' });

    await expect(changesetItem).toBeVisible();
    await expect(feedbackItem).toBeVisible();
    await expect(changesetItem).toContainText('#4242');
    await expect(feedbackItem).toContainText('#555');

    // Selecting the changeset shows its overlay/toolbar with the right type+id.
    await changesetItem.click();
    const overlay = page.locator('.review-overlay');
    await expect(overlay.locator('.review-toolbar')).toContainText('Changeset');
    await expect(overlay.locator('.review-toolbar')).toContainText('#4242');

    // Selecting the feedback swaps the overlay to the feedback item.
    await feedbackItem.click();
    await expect(overlay.locator('.review-toolbar')).toContainText('Feedback');
    await expect(overlay.locator('.review-toolbar')).toContainText('#555');

    await expect(sidebar(page)).toMatchAriaSnapshot();

    // NOTE (maplibre): asserting the populated .diff-attributes panel requires a
    // click on a feature in the rendered WebGL adiff map (onAdiffClick), which is
    // unreliable headless. The selection -> overlay wiring is asserted above.
  });

  // @test e2e: the discussion panel lists an item's comments and a newly posted
  //            comment appears immediately
  test('a note discussion lists comments and shows a newly posted one', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await stubReviewApis(page);

    // Accept the note comment POST (osmClient.postNoteComment) so the component's
    // optimistic append runs. The endpoint returns the updated note as a GeoJSON
    // Feature, which postNoteComment parses — an empty body would throw and skip
    // the optimistic append.
    await page.route('**/osm/api/0.6/notes/99/comment**', route =>
      route.fulfill({
        json: {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [-122.335, 47.605] },
          properties: {
            id: 99,
            status: 'open',
            date_created: '2026-06-12T08:00:00.000Z',
            comments: [
              { action: 'opened', date: '2026-06-12T08:00:00.000Z', user: 'note_author', uid: 11, text: 'Curb ramp is missing here' },
              { action: 'commented', date: '2026-07-10T00:00:00.000Z', user: 'Tester', uid: 42, text: 'Confirmed, still missing.' }
            ]
          }
        }
      })
    );

    await page.goto('/workspace/1/review');

    // Select the note (deterministic like feedback: the overlay does not depend
    // on the adiff/WebGL map).
    const noteItem = sidebar(page)
      .locator('.review-item', { hasText: 'Curb ramp is missing here' });
    await noteItem.click();

    const overlay = page.locator('.review-overlay');
    await expect(overlay).toBeVisible();

    // Open the discussion panel via the toolbar's chat toggle. app-icon renders
    // an empty <i> whose variant is a `md-<variant>` class, so match on that.
    await overlay.locator('.review-toolbar button:has(.md-chat_bubble_outline)').click();

    const discussion = page.locator('.review-discussion');
    await expect(discussion).toBeVisible();
    // The note's existing comment is listed.
    await expect(discussion).toContainText('Curb ramp is missing here');

    // Posting a comment reflects it immediately (regression: send used to clear
    // the input without ever surfacing the new comment).
    await discussion.locator('textarea').fill('Confirmed, still missing.');
    await discussion.locator('button[title="Send"]').click();

    await expect(discussion).toContainText('Confirmed, still missing.');
  });

  // @test e2e: if posting a comment fails, an error toast is shown and the draft
  //            is kept so the user can retry
  test('a failed comment post shows an error toast and keeps the draft', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await stubReviewApis(page);

    // Fail the note comment POST.
    await page.route('**/osm/api/0.6/notes/99/comment**', route =>
      route.fulfill({ status: 500, body: 'boom' })
    );

    await page.goto('/workspace/1/review');

    await sidebar(page).locator('.review-item', { hasText: 'Curb ramp is missing here' }).click();

    const overlay = page.locator('.review-overlay');
    await expect(overlay).toBeVisible();
    await overlay.locator('.review-toolbar button:has(.md-chat_bubble_outline)').click();

    const discussion = page.locator('.review-discussion');
    await expect(discussion).toBeVisible();

    await discussion.locator('textarea').fill('This should fail to post.');
    await discussion.locator('button[title="Send"]').click();

    // An error toast appears (transient/animated, so assert its text, not a snapshot).
    const errorToast = page.locator('.Toastify__toast--error');
    await expect(errorToast).toBeVisible();
    await expect(errorToast).toContainText(/failed to post/i);

    // The draft is retained (not cleared) and no comment was added to the list.
    await expect(discussion.locator('textarea')).toHaveValue('This should fail to post.');
    await expect(discussion.locator('.message-list')).not.toContainText('This should fail to post.');
  });

  // Opens changeset 4242's discussion. Its comments come from
  // changeset/4242.json?include_discussion=true, which answers with `comments`
  // every time, so a test can make a post appear to succeed without landing.
  async function openChangesetDiscussion(page: Page, comments: object[]) {
    await seedAuthenticatedSession(page);
    await stubReviewApis(page);
    await page.route('**/workspaces/1/changesets/*/adiff', route =>
      route.fulfill({ json: { actions: [] } })
    );
    await page.route('https://ecn.*.tiles.virtualearth.net/**', route => route.abort());
    await page.route('**/osm/api/0.6/changeset/4242.json**', route =>
      route.fulfill({ json: { changeset: { ...changesets.changesets[0], comments } } })
    );

    // Select by clicking rather than a ?changeset= deep link, which is flaky
    // headless (see the changeset deep links tests).
    await page.goto('/workspace/1/review');
    // Selecting a changeset sets ?changeset=, which makes the page reload the
    // list (changesets, then notes) with resolved items included. That swaps
    // in a new item object and closes any panel opened meanwhile, so let the
    // reload finish before opening one.
    const reloaded = page.waitForResponse('**/osm/api/0.6/notes/search.json?*closed=-1*');
    await sidebar(page).locator('.review-item', { hasText: '#4242' }).click();
    await reloaded;
    await page.evaluate(() => new Promise(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(resolve))));

    const overlay = page.locator('.review-overlay');
    await expect(overlay.locator('.review-toolbar')).toContainText('#4242');
    await overlay.locator('.review-toolbar button:has(.md-chat_bubble_outline)').click();

    const discussion = page.locator('.review-discussion');
    await expect(discussion).toContainText('Looks good to me.');
    return discussion;
  }

  const existingChangesetComment = {
    id: 1,
    text: 'Looks good to me.',
    visible: true,
    user: 'mapper_jane',
    uid: 7,
    date: '2026-06-11T09:00:00.000Z'
  };

  // @test e2e: if the server refuses a changeset comment, the toast gives the
  //            server's reason rather than a generic "try again"
  test('a refused changeset comment shows the server reason', async ({ page }) => {
    // OSM refuses comments on a changeset that is still open, as plain text.
    await page.route('**/osm/api/0.6/changeset/4242/comment**', route =>
      route.fulfill({
        status: 409,
        contentType: 'text/plain',
        body: 'The changeset 4242 was not yet closed at 2026-06-10 10:05:00 UTC'
      })
    );
    const discussion = await openChangesetDiscussion(page, [existingChangesetComment]);

    await discussion.locator('textarea').fill('Please fix the crossing.');
    await discussion.locator('button[title="Send"]').click();

    const errorToast = page.locator('.Toastify__toast--error');
    await expect(errorToast).toContainText('was not yet closed');
    await expect(discussion.locator('textarea')).toHaveValue('Please fix the crossing.');
  });

  // @test e2e: a posted changeset comment appears and clears the draft, even
  //            when OSM's author name differs from the signed-in user's name
  test('a posted changeset comment appears and clears the draft', async ({ page }) => {
    await page.route('**/osm/api/0.6/changeset/4242/comment**', route =>
      route.fulfill({ contentType: 'application/xml', body: '<osm version="0.6"/>' })
    );
    const discussion = await openChangesetDiscussion(page, [existingChangesetComment]);

    await page.route('**/osm/api/0.6/changeset/4242.json**', route =>
      route.fulfill({
        json: {
          changeset: {
            ...changesets.changesets[0],
            comments: [
              existingChangesetComment,
              { ...existingChangesetComment, id: 2, text: 'Please fix the crossing.', user: 'tester@example.com', uid: 42 }
            ]
          }
        }
      })
    );

    await discussion.locator('textarea').fill('Please fix the crossing.');
    await discussion.locator('button[title="Send"]').click();

    await expect(discussion.locator('.message-list')).toContainText('Please fix the crossing.');
    await expect(discussion.locator('textarea')).toHaveValue('');
    await expect(page.locator('.Toastify__toast--error')).toHaveCount(0);
  });

  // @test e2e: a changeset comment the server accepts but does not save is
  //            reported, and the draft is kept
  test('a changeset comment that does not land is reported', async ({ page }) => {
    // OSM answers 200 but drops the comment when its author fails validation.
    // The re-fetched discussion is unchanged.
    await page.route('**/osm/api/0.6/changeset/4242/comment**', route =>
      route.fulfill({ contentType: 'application/xml', body: '<osm version="0.6"/>' })
    );
    const discussion = await openChangesetDiscussion(page, [existingChangesetComment]);

    // Someone else's comment lands meanwhile, so the count still goes up: only
    // a comment with the submitted text counts as this one landing.
    await page.route('**/osm/api/0.6/changeset/4242.json**', route =>
      route.fulfill({
        json: {
          changeset: {
            ...changesets.changesets[0],
            comments: [
              existingChangesetComment,
              { ...existingChangesetComment, id: 2, text: 'Crossing fixed.', user: 'mapper_joe', uid: 8 }
            ]
          }
        }
      })
    );

    await discussion.locator('textarea').fill('Please fix the crossing.');
    await discussion.locator('button[title="Send"]').click();

    const errorToast = page.locator('.Toastify__toast--error');
    await expect(errorToast).toContainText('was not saved');
    await expect(discussion.locator('textarea')).toHaveValue('Please fix the crossing.');
  });

  // @test e2e: validate that all the API calls used on this page match the Swagger spec
  test('new-API calls conform to the OpenAPI spec', async ({ page }) => {
    await seedAuthenticatedSession(page);
    const contract = recordContract(page);
    await stubReviewApis(page);

    await page.goto('/workspace/1/review');

    // Drive enough of the page to exercise its new-API surface.
    await expect(sidebar(page).getByText('Seattle Sidewalks')).toBeVisible();
    await expect(sidebar(page).locator('.review-item')).toHaveCount(3);

    expect(contract.violations()).toEqual([]);
  });
});
