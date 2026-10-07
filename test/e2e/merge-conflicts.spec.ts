import { test, expect, seedAuthenticatedSession } from './fixtures';
import { recordContract } from './contract';
import { mergeWorkspaceA, mergeWorkspaceB, projectGroups } from '../mocks/fixtures';

import type { Page } from '@playwright/test';

// Generated from the @test outline in pages/workspace/[id]/merge/conflicts.vue.
//
// This page has no route of its own into a populated state: the MergeResult is
// held in shared state by `useMergeResult`, set by the merge page. So every test
// that needs conflicts drives through /workspace/1/merge and clicks Merge, which
// means the OSM stubs below have to produce a real conflict.
//
// The merge reads, per workspace: GET workspaces/{id}/bbox then
// GET osm/.../map.json?bbox=..., plus GET osm/.../changesets.json and the
// ancestor's osmChange for workspace A. The ancestor must be non-empty or the
// merge refuses (an empty ancestor would make every element look new and would
// silently duplicate both workspaces).
//
// CONVENTION: tests are written to the @test comments (intended behavior). Where
// the code diverges, the test is left to FAIL (red) and the divergence is noted.

const MERGE_URL = '/workspace/1/merge';
const CONFLICTS_URL = '/workspace/1/merge/conflicts';

const BBOX = { min_lon: -122.4, min_lat: 47.6, max_lon: -122.3, max_lat: 47.7 };

// Version 2 marks an element edited since the import, which is version 1. The
// three-way merge treats a version-1 element as untouched on that side.
function editedNode(id: number, lat: number, tags: Record<string, string> = {}) {
  return {
    id,
    type: 'node',
    lat,
    lon: -122.35,
    version: 2,
    changeset: 1,
    timestamp: '2026-01-01T00:00:00Z',
    user: 'tester',
    uid: 7,
    tags
  };
}

// The import both workspaces descend from: workspace A's first changeset.
const ANCESTOR_OSC = `<osmChange version="0.6"><create>
  <node id="1" lat="47.60" lon="-122.35" version="1" changeset="1"
        timestamp="2026-01-01T00:00:00Z" user="tester" uid="7">
    <tag k="highway" v="footway"/>
  </node>
</create></osmChange>`;

async function stubConflictingMerge(page: Page) {
  await page.route('**/api.test/workspaces/1', route =>
    route.fulfill({ json: mergeWorkspaceA })
  );

  await page.route('**/api.test/workspaces/mine', route =>
    route.fulfill({ json: [mergeWorkspaceA, mergeWorkspaceB] })
  );
  await page.route('**/tdei-user/project-group-roles/**', route =>
    route.fulfill({ json: projectGroups })
  );
  await page.route('**/api.test/workspaces/check', route =>
    route.fulfill({ json: { available: true } })
  );
  await page.route('**/workspaces/*/bbox', route => route.fulfill({ json: BBOX }));

  // Both sides moved node 1 away from the ancestor's 47.60, and to different
  // places: one geometry conflict. Only A added `surface`, and neither side
  // touched `highway`, so there is no tag conflict and both tags must survive
  // either choice.
  await page.route('**/osm/**/map.json**', (route) => {
    const inB = route.request().headers()['x-workspace'] === '2';
    const node = inB
      ? editedNode(1, 47.70, { highway: 'footway' })
      : editedNode(1, 47.65, { highway: 'footway', surface: 'asphalt' });

    return route.fulfill({ json: { elements: [node] } });
  });

  await page.route('**/osm/**/changesets.json**', route =>
    route.fulfill({
      json: {
        changesets: [
          { id: 1, created_at: '2026-01-01T00:00:00Z', closed_at: '2026-01-01T00:01:00Z' }
        ]
      }
    })
  );

  await page.route('**/osm/**/changeset/1/download**', route =>
    route.fulfill({ body: ANCESTOR_OSC, contentType: 'application/xml' })
  );
}

async function driveMerge(page: Page) {
  await page.goto(MERGE_URL);
  await page.getByLabel(/Merge workspace/).selectOption({ index: 0 });
  await page.getByRole('button', { name: /Merge/ }).click();
  await expect(page).toHaveURL(/\/workspace\/1\/merge\/conflicts$/);
}

// Stubs a successful commit into workspace 99. `upload` resolves with the
// uploaded osmChange once it is sent.
async function stubCommit(page: Page): Promise<{ upload: Promise<string> }> {
  let resolveUpload: (body: string) => void;
  const upload = new Promise<string>((resolve) => {
    resolveUpload = resolve;
  });

  await page.route('**/api.test/workspaces', route =>
    route.fulfill({ status: 201, json: { workspaceId: 99 } })
  );
  await page.route('**/osm/**/workspaces/99', route => route.fulfill({ status: 200, body: '' }));
  await page.route('**/osm/**/changeset/create**', route =>
    route.fulfill({ status: 200, body: '777' })
  );
  await page.route('**/osm/**/changeset/777/upload**', (route) => {
    resolveUpload(route.request().postData() ?? '');
    return route.fulfill({ status: 200, body: '<diffResult/>' });
  });
  await page.route('**/osm/**/changeset/777/close**', route =>
    route.fulfill({ status: 200, body: '' })
  );

  return { upload };
}

async function startMergeWithConflict(page: Page) {
  await stubConflictingMerge(page);
  await driveMerge(page);
}

test.describe('workspace merge conflicts page', () => {
  test.beforeEach(async ({ page }) => {
    await seedAuthenticatedSession(page);
  });

  // @test e2e: loading this page directly, with no merge in progress, redirects back to the
  //            merge page (assert() the URL and that the merge page renders)
  test('opening it with no merge in progress redirects to the merge page', async ({ page }) => {
    await stubConflictingMerge(page);
    await page.goto(CONFLICTS_URL);

    // The redirect fires on mount, and this is the only test that hard-loads
    // this route, so against the dev server it pays the lazy first compile and
    // needs a longer wait than the 10s default.
    await expect(page).toHaveURL(/\/workspace\/1\/merge$/, { timeout: 30_000 });

    // The URL changes before the merge page renders, so it alone would not
    // show that the page arrived.
    await expect(page.getByRole('heading', { name: 'Merge Workspace' })).toBeVisible();
  });

  // @test e2e: merging two workspaces with conflicts navigates to the conflicts page instead of
  //            committing (assert() the URL)
  // This is the merge page's outline item; it is the precondition for the rest.
  test('a merge with conflicts lands on this page', async ({ page }) => {
    // The title check is a POST but reads only, so match the calls a commit makes:
    const writes: string[] = [];
    page.on('request', (request) => {
      const url = request.url();

      if (/\/workspaces$|\/osm\/.*\/workspaces\/\d+$|\/changeset\//.test(url) && request.method() !== 'GET') {
        writes.push(`${request.method()} ${url}`);
      }
    });

    await startMergeWithConflict(page);

    await expect(page).toHaveURL(/\/workspace\/1\/merge\/conflicts$/);
    await expect(page.getByRole('button', { name: 'Commit Merge' })).toBeVisible();

    // Nothing may be created or uploaded until the conflicts are resolved:
    expect(writes).toEqual([]);
  });

  // @test e2e: leaving this page without its buttons (browser back, a header link) drops the
  //            merge, so coming back does not offer a merge computed from outdated data
  //            (assert() the redirect on return)
  test('leaving by the back button drops the merge', async ({ page }) => {
    await startMergeWithConflict(page);

    // The URL changes before the page finishes loading, and a page that never
    // rendered is never unmounted, so going back any sooner tests nothing:
    await expect(page.getByRole('button', { name: 'Commit Merge' })).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/\/workspace\/1\/merge$/);
    await expect(page.getByRole('heading', { name: 'Merge Workspace' })).toBeVisible();

    await page.goForward();

    await expect(page).toHaveURL(/\/workspace\/1\/merge$/);
    await expect(page.getByRole('button', { name: 'Commit Merge' })).toHaveCount(0);
  });

  // @test e2e: loading this page with a merge in progress lists every conflict in the sidebar
  //            with geometry/tags badges (playwright snapshot this)
  test('the sidebar lists each conflict with its badges', async ({ page }) => {
    await startMergeWithConflict(page);

    // The detail toolbar repeats the element name, so scope to the sidebar.
    const sidebar = page.locator('.conflicts-sidebar');

    await expect(sidebar.getByText('node 1')).toBeVisible();
    await expect(sidebar.getByText('geometry', { exact: true })).toBeVisible();
    await expect(page.getByText(/1 of 1 conflicts require resolution/)).toBeVisible();
    await expect(sidebar).toMatchAriaSnapshot();
  });

  // @test e2e: clicking a conflict in the sidebar shows its two versions on the map and its tag
  //            differences in the table below (playwright snapshot this)
  // BLOCKED: asserting the two versions needs the maplibre canvas, which requires WebGL in the
  // headless browser, and the fixture yields a single conflict so there is no second item to
  // click. Give the merge two conflicting elements and either run with a GPU-enabled context or
  // assert only the tag table, before implementing.
  test.fixme('clicking a conflict shows both versions and its tag differences', async () => {});

  // @test e2e: "Commit Merge" stays disabled until every conflict is resolved (assert() the
  //            disabled state)
  test('Commit Merge is disabled until every conflict is resolved', async ({ page }) => {
    await startMergeWithConflict(page);

    const commit = page.getByRole('button', { name: 'Commit Merge' });
    await expect(commit).toBeDisabled();

    await page.getByRole('button', { name: 'Keep A' }).click();

    await expect(page.getByText('All conflicts resolved.')).toBeVisible();
    await expect(commit).toBeEnabled();
  });

  // @test e2e: "Keep A" and "Keep B" resolve a conflict in one click and keep the tags the other
  //            side did not dispute (assert() the resolved count and the committed osmChange)
  for (const [side, lat] of [['A', '47.65'], ['B', '47.7']]) {
    test(`Keep ${side} resolves the conflict in one click and keeps the undisputed tags`, async ({ page }) => {
      await startMergeWithConflict(page);
      const { upload } = await stubCommit(page);

      await expect(page.getByText('1 of 1 conflicts require resolution.')).toBeVisible();

      await page.getByRole('button', { name: `Keep ${side}` }).click();

      await expect(page.getByText('All conflicts resolved.')).toBeVisible();

      // The tag table shows the undisputed tags as the merge computed them,
      // whatever Keep did, so the upload is what shows they were kept:
      await page.getByRole('button', { name: 'Commit Merge' }).click();
      const body = await upload;

      expect(body).toContain(`lat="${lat}"`);
      expect(body).toContain('<tag k="highway" v="footway"/>');
      expect(body).toContain('<tag k="surface" v="asphalt"/>');
    });
  }

  // @test e2e: a non-owner sees the commit controls disabled with an explanation (assert() the
  //            disabled state)
  test('a non-owner can review but not commit', async ({ page }) => {
    await stubConflictingMerge(page);

    // Only a lead can start the merge, since the merge page disables its Merge
    // button otherwise, and this page is only reachable through that merge. So the
    // first read, the merge page's, reports `lead`; every read after it reports
    // `contributor`, and this page's own read is the one the commit gate uses.
    let reads = 0;
    await page.route('**/api.test/workspaces/1', route =>
      route.fulfill({
        json: { ...mergeWorkspaceA, role: reads++ === 0 ? 'lead' : 'contributor' }
      })
    );

    await driveMerge(page);

    await expect(page.getByText('Only workspace owners can commit a merge.')).toBeVisible();

    await page.getByRole('button', { name: 'Keep A' }).click();

    // Assert the click landed first: Commit is also disabled while anything is
    // unresolved, so the disabled state alone would pass if Keep A did nothing.
    await expect(page.getByText('All conflicts resolved.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Commit Merge' })).toBeDisabled();
  });

  // @test e2e: committing creates the merged workspace and navigates to its editor, without the
  //            page saying no merge is in progress on the way out (assert() the URL and that
  //            the notice never appears)
  test('committing creates the merged workspace and opens its editor', async ({ page }) => {
    await startMergeWithConflict(page);

    // The notice can be on screen for only a few hundred milliseconds while the
    // page leaves, too briefly for a polling assertion, so record whether it
    // was ever added to the page:
    await page.evaluate(() => {
      const record = window as unknown as { sawNoMergeNotice: boolean };
      record.sawNoMergeNotice = false;

      new MutationObserver(() => {
        if (document.body.textContent?.includes('No merge is in progress')) {
          record.sawNoMergeNotice = true;
        }
      }).observe(document.body, { childList: true, subtree: true, characterData: true });
    });

    await stubCommit(page);

    await page.getByRole('button', { name: 'Keep A' }).click();
    await page.getByRole('button', { name: 'Commit Merge' }).click();

    // `datatype` decides which editor loads, and without it the Pathways
    // editor loads, so the path alone would not show the right editor opened.
    await expect(page).toHaveURL(/\/workspace\/99\/edit\?datatype=osw/);

    // The URL changes before the out-in transition removes this page, and the
    // notice could appear during that transition, so read the record only
    // once the page is gone:
    await expect(page.locator('.merge-conflicts-page')).toHaveCount(0);
    expect(await page.evaluate(() =>
      (window as unknown as { sawNoMergeNotice: boolean }).sawNoMergeNotice
    )).toBe(false);
  });

  // @test e2e: a failing commit shows an error toast and re-enables the button rather than
  //            failing silently (assert() the toast text)
  test('a failing commit surfaces an error instead of failing silently', async ({ page }) => {
    await startMergeWithConflict(page);

    // Creating the merged workspace is the first call the commit makes, so this
    // is the only failure the flow can report.
    await page.route('**/api.test/workspaces', route =>
      route.fulfill({ status: 500, json: { detail: 'could not create workspace' } })
    );

    await page.getByRole('button', { name: 'Keep A' }).click();
    await page.getByRole('button', { name: 'Commit Merge' }).click();

    await expect(page.locator('.Toastify__toast--error'))
      .toContainText('could not create workspace');
    await expect(page.getByRole('button', { name: 'Commit Merge' })).toBeEnabled();
  });

  // @test e2e: a delete-versus-edit conflict offers "Delete Element" instead of a plain A/B
  //            choice, and choosing it removes the element from the merge (assert() the
  //            button set)
  test('a delete-versus-edit conflict offers Delete Element', async ({ page }) => {
    await stubConflictingMerge(page);

    // Workspace A deleted node 1; workspace B edited it.
    await page.route('**/osm/**/map.json**', (route) => {
      const workspace = route.request().headers()['x-workspace'];
      const elements = workspace === '2' ? [editedNode(1, 47.60, { barrier: 'kerb' })] : [];

      return route.fulfill({ json: { elements } });
    });

    await driveMerge(page);

    await expect(page.getByRole('button', { name: 'Delete Element' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Keep A' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Keep B' })).toBeVisible();

    await page.getByRole('button', { name: 'Delete Element' }).click();

    await expect(page.getByText(/left out of the merged workspace/)).toBeVisible();
    await expect(page.getByText('All conflicts resolved.')).toBeVisible();
  });

  // @test e2e: validate that all the API calls used on this page match the Swagger spec
  test('the API calls match the Swagger spec', async ({ page }) => {
    // Reaching this page runs the merge page's title-availability check, which
    // is not in the vendored spec: it matches GET /workspaces/{workspace_id}
    // and reports a bogus method violation. The create specs ignore it too.
    const contract = recordContract(page, { ignoredPaths: ['workspaces/check'] });

    await startMergeWithConflict(page);
    await expect(page.getByText(/1 of 1 conflicts require resolution/)).toBeVisible();

    expect(contract.violations()).toEqual([]);
  });
});
