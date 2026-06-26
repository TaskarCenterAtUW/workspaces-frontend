import { test, expect, seedAuthenticatedSession, seedProjectGroupSelection } from './fixtures';
import { recordContract } from './contract';
import { projectGroups, PROJECT_GROUP_ID, TEST_API_BASE } from '../mocks/fixtures';

// Generated from the @test outline in pages/dashboard.vue.
//
// dashboard.vue does a top-level `await` on getMyWorkspaces() +
// getMyProjectGroups(), so BOTH must be stubbed or the page 500s. The two
// empty-state tests below are fully implemented. The remaining outlines need a
// selected-workspace render path (toolbar + maplibre map + details table) and
// are scaffolded as test.fixme with the specific blocker noted — flip each to a
// real test as the supporting stubs are built.

const EMPTY = (route: import('@playwright/test').Route) => route.fulfill({ json: [] });

test.describe('dashboard', () => {
  // @test e2e: validate that all the API calls used on this page match the Swagger spec
  // Use the empty case so no workspace is auto-selected and the maplibre map
  // never mounts (WebGL is unreliable headless). The recorder still sees the
  // new-API call (GET workspaces/mine) and validates its response shape.
  // (The populated WorkspaceResponse shape is also asserted at the unit level.)
  test('makes no new-API calls that violate the OpenAPI spec', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await page.route(`${TEST_API_BASE}workspaces/mine`, EMPTY);
    await page.route(`${TEST_API_BASE}tdei-user/project-group-roles/**`, EMPTY);

    const contract = recordContract(page);
    await page.goto('/dashboard');
    await expect(page.getByText('No workspaces exist in the selected project group.')).toBeVisible();

    expect(contract.violations()).toEqual([]);
  });

  // @test e2e: the page renders with a simulated API response with no project groups
  test('shows the empty notice when the user has no project groups', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await page.route(`${TEST_API_BASE}workspaces/mine`, EMPTY);
    await page.route(`${TEST_API_BASE}tdei-user/project-group-roles/**`, EMPTY);

    await page.goto('/dashboard');

    await expect(page.getByText('No workspaces exist in the selected project group.')).toBeVisible();
  });

  // @test e2e: the page renders with a simulated API response with no datasets in a project group
  test('shows the empty notice when the selected project group has no workspaces', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await seedProjectGroupSelection(page, { id: PROJECT_GROUP_ID, name: 'Puget Sound' });
    await page.route(`${TEST_API_BASE}workspaces/mine`, EMPTY); // group exists, but no workspaces in it
    await page.route(`${TEST_API_BASE}tdei-user/project-group-roles/**`, route => route.fulfill({ json: projectGroups }));

    await page.goto('/dashboard');

    await expect(page.getByText('No workspaces exist in the selected project group.')).toBeVisible();
  });

  // @test e2e: clicking on a dataset updates the metadata panel on the right and shows the data extent in the map
  // BLOCKED: needs the details panel + maplibre map to render. The map calls
  // getWorkspaceBbox (OSM API) and inits maplibre-gl, which requires WebGL in
  // the headless browser. Stub the bbox empty to skip map init, or run with a
  // GPU-enabled context, before implementing.
  test.fixme('selecting a dataset updates the metadata panel and map extent', async () => {});

  // @test e2e: clicking the edit button redirects to the RapID editor
  // BLOCKED: edit navigates to an EXTERNAL RapID URL (VITE_RAPID_URL). Intercept
  // the navigation (page.on('popup') / route the external host) to assert it.
  test.fixme('clicking edit redirects to the RapID editor', async () => {});

  // @test e2e: the edit button shows two RapID editor versions in a dropdown (playwright snapshot this)
  // BLOCKED: requires a selected workspace (see map blocker) and rapid3Manager
  // configured so the split dropdown renders. Then snapshot the open dropdown.
  test.fixme('edit split-button shows Rapid 2 / Rapid 3 options (snapshot)', async () => {});

  // @test e2e: the "review" button opens the changeset editor, with simulated API responses (playwright snapshot this)
  // BLOCKED: review opens the changeset editor (own maplibre + changeset/adiff
  // API calls). Needs the changeset fixtures + map handling before snapshotting.
  test.fixme('review button opens the changeset editor (snapshot)', async () => {});

  // @test e2e: the "export" button opens the export screen
  // BLOCKED: needs a selected workspace rendered (map blocker) so the toolbar is
  // present; then assert navigation to /workspace/{id}/export.
  test.fixme('export button opens the export screen', async () => {});

  // @test e2e: the "settings" button opens the settings screen
  // BLOCKED: same selected-workspace requirement; assert navigation to
  // /workspace/{id}/settings.
  test.fixme('settings button opens the settings screen', async () => {});
});
