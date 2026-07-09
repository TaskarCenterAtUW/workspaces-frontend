import { test, expect, seedAuthenticatedSession } from './fixtures';
import { recordContract } from './contract';
import { aWorkspace, projectGroups } from '../mocks/fixtures';

// Generated from the @test outline in pages/workspace/[id]/export/index.vue.
//
// The export landing page (/workspace/1/export) does a top-level
// `await workspacesClient.getWorkspace(id)` = GET workspaces/{id}, so that MUST
// be stubbed (use `aWorkspace`) or the page 500s. It shows two cards:
//   - "Upload to TDEI" with a "Start" <nuxt-link to="./export/tdei">.
//   - "Download" with a "Start Preparing File for Download" <button> that builds
//     a client-side archive, then swaps to a "Save" <a download> link.
//
// The Download flow goes through workspacesClient.exportWorkspaceArchive(workspace),
// which branches on workspace.type:
//   - pathways: osmClient.getWorkspaceData(id) = GET new-api/workspaces/{id}/bbox
//               then GET osm/.../map.json?bbox=... -> {elements:[]} -> buildPathwaysCsvArchive
//               (pure client-side zip; NO tdei host, NO polling).
//   - osw:      osm export XML + tdeiClient.convertDataset (4s job polling).
// The download tests below use a pathways-typed workspace so the flow is fast and
// hits only the OSM host (ignored by the Swagger contract recorder).
//
// CONVENTION: tests are written to the @test comments (intended behavior). Where
// the code diverges, the test is left to FAIL (red) and the divergence is noted.

const EXPORT_URL = '/workspace/1/export';

// GET workspaces/1 -> a WorkspaceResponse. `aWorkspace` is osw-typed and conforms
// to the OpenAPI WorkspaceResponse schema.
async function stubGetWorkspace(page: import('@playwright/test').Page, overrides: object = {}) {
  await page.route('**/api.test/workspaces/1', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ json: { ...aWorkspace, ...overrides } });
    }
    return route.continue();
  });
}

// Stubs the calls the pathways download flow makes:
//   GET new-api/workspaces/{id}/bbox -> a bbox, then GET osm/.../map.json -> elements.
// `gate` (if provided) holds the map.json response open so the loading state can
// be observed before the archive is built.
async function stubPathwaysDownloadOk(
  page: import('@playwright/test').Page,
  gate?: Promise<void>
) {
  await page.route('**/workspaces/1/bbox', route =>
    route.fulfill({ json: { min_lon: -122.4, min_lat: 47.6, max_lon: -122.3, max_lat: 47.7 } })
  );
  await page.route('**/osm/**/map.json**', async (route) => {
    if (gate) {
      await gate;
    }
    return route.fulfill({ json: { elements: [] } });
  });
}

test.describe('workspace export landing page', () => {
  // @test e2e: this page shows two boxes: "Upload to TDEI" and "Download", with buttons for
  //            each option (playwright snapshot this and assert() the buttons are present)
  test('shows the "Upload to TDEI" and "Download" boxes with their buttons (snapshot)', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await stubGetWorkspace(page);

    await page.goto(EXPORT_URL);

    await expect(page.getByRole('heading', { name: 'Export Workspace' })).toBeVisible();

    // Both boxes present.
    await expect(page.getByRole('heading', { name: 'Upload to TDEI' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Download' })).toBeVisible();

    // Explicit assertions that each box's button is present.
    const startTdei = page.getByRole('link').filter({ hasText: 'Start' });
    await expect(startTdei).toBeVisible();
    await expect(page.getByRole('button', { name: /Start Preparing File for Download/ })).toBeVisible();

    // ARIA snapshot of the two-card grid (stable structure, no images).
    await expect(page.locator('.row.row-cols-1')).toMatchAriaSnapshot();
  });

  // @test e2e: clicking the "Start" button under "Upload to TDEI" brings you to the Export
  //            Workspace to TDEI page (playwright snapshot this)
  test('the "Start" button under "Upload to TDEI" navigates to the Export-to-TDEI page (snapshot)', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await stubGetWorkspace(page);
    // The TDEI export page top-level-awaits getMyProjectGroups (TDEI user API).
    await page.route('**/tdei-user/project-group-roles/**', route =>
      route.fulfill({ json: projectGroups })
    );

    await page.goto(EXPORT_URL);
    await page.getByRole('link').filter({ hasText: 'Start' }).click();

    await expect(page).toHaveURL(/\/workspace\/1\/export\/tdei$/);
    await expect(page.getByRole('heading', { name: 'Export Workspace to the TDEI' })).toBeVisible();

    // ARIA snapshot of the destination page's main column.
    await expect(page.locator('.row.row-cols-1')).toMatchAriaSnapshot();
  });

  // @test e2e: clicking the "Start Preparing File for Download" button under "Download" shows a
  //            loading state, then shows a "Save" button when the file is ready, and clicking the
  //            "Save" button downloads the file to your device (playwright snapshot each change in state)
  test('the Download flow shows a loading state, then a "Save" button, and clicking Save downloads the file (snapshots)', async ({ page }) => {
    await seedAuthenticatedSession(page);
    // Use a pathways workspace so the archive is built purely client-side from
    // the OSM map data (no TDEI conversion job / polling).
    await stubGetWorkspace(page, { type: 'pathways' });

    // Hold map.json open so the "Preparing Download..." loading state is observable.
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    await stubPathwaysDownloadOk(page, gate);

    await page.goto(EXPORT_URL);

    const prepare = page.getByRole('button', { name: /Start Preparing File for Download/ });
    await expect(prepare).toBeVisible();
    // Snapshot the initial (idle) Download card footer.
    await expect(page.locator('.col').filter({ hasText: 'Download' }).locator('.card-footer')).toMatchAriaSnapshot();

    await prepare.click();

    // Loading state: button shows the spinner + "Preparing Download..." text.
    await expect(page.getByText('Preparing Download...')).toBeVisible();
    await expect(page.locator('.spinner-border, [role="status"]')).toBeVisible();
    await expect(page.locator('.col').filter({ hasText: 'Download' }).locator('.card-footer')).toMatchAriaSnapshot();

    release();

    // Ready state: the button is replaced by a "Save" link. Assert the stable
    // link text/visibility only — its href is a volatile blob: URL, so we don't
    // ARIA-snapshot it (file-based aria snapshots capture the blob URL exactly).
    const save = page.getByRole('link', { name: /Save/ });
    await expect(save).toBeVisible();

    // Clicking "Save" downloads the file to the device (don't assert the bytes,
    // just that a download is triggered).
    const downloadPromise = page.waitForEvent('download');
    await save.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('workspace-1-pathways-export.zip');
  });

  // @test e2e: if an error occurs when preparing the download, an error message is shown in a
  //            toast (playwright snapshot this)
  test('shows an error toast when preparing the download fails (snapshot)', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await stubGetWorkspace(page, { type: 'pathways' });

    // Fail the first call in the download flow so exportWorkspaceArchive throws.
    // The bbox lookup now hits the new API; the map fetch stays on the OSM base.
    await page.route('**/workspaces/1/bbox', route =>
      route.fulfill({ status: 500, body: 'boom' })
    );
    await page.route('**/osm/**/map.json**', route =>
      route.fulfill({ status: 500, body: 'boom' })
    );

    await page.goto(EXPORT_URL);

    await page.getByRole('button', { name: /Start Preparing File for Download/ }).click();

    // An error toast is shown when the download prep fails. (The toast itself is
    // transient/animated, so we assert its text rather than snapshotting it.)
    const toast = page.locator('.Toastify').getByText(/Error preparing download/i);
    await expect(toast).toBeVisible();
  });

  // @test e2e: validate that all the API calls used on this page match the Swagger spec
  //            (https://new-api.workspaces-stage.sidewalks.washington.edu/openapi.json)
  test('makes only Swagger-conformant new-API calls during the export + download flow', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await stubGetWorkspace(page, { type: 'pathways' });
    await stubPathwaysDownloadOk(page);

    const contract = recordContract(page);

    await page.goto(EXPORT_URL);
    // Drive the download flow (the only new-API call is GET workspaces/1; the OSM
    // calls are on the /osm host and are ignored by the contract recorder).
    await page.getByRole('button', { name: /Start Preparing File for Download/ }).click();
    await expect(page.getByRole('link', { name: /Save/ })).toBeVisible();

    expect(contract.violations()).toEqual([]);
  });
});
