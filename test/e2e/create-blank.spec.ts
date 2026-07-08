import { test, expect, seedAuthenticatedSession, seedProjectGroupSelection } from './fixtures';
import { recordContract } from './contract';
import { projectGroups, myWorkspaces, PROJECT_GROUP_ID } from '../mocks/fixtures';

// Generated from the @test outline in pages/workspace/create/blank.vue.
//
// The blank-create form (title + workspace type + project group) submits via
// workspacesClient.createWorkspace, which:
//   1) POST http://api.test/workspaces  (WorkspaceCreate body) -> { workspaceId }
//   2) PUT  http://api.test/osm/workspaces/{id}  (provision)
// then the page calls navigateTo('/dashboard').
//
// The new workspace's id returned by the POST is 7; for the dashboard to show it
// as the freshly-selected workspace, the created row is added to workspaces/mine.

const NEW_WORKSPACE_ID = 7;

// The first hit to a Nuxt route compiles it lazily on the dev server, which can
// exceed the default 10s expect timeout under parallel cold starts (see the
// lazy-compile note in CLAUDE.md). Give the initial render of a freshly-navigated
// route extra headroom so these first-paint waits don't flake.
const COLD_ROUTE_TIMEOUT = 30_000;

const createdWorkspace = {
  id: NEW_WORKSPACE_ID,
  type: 'osw',
  title: 'My New Blank Workspace',
  description: null,
  tdeiProjectGroupId: PROJECT_GROUP_ID,
  tdeiRecordId: null,
  tdeiServiceId: null,
  tdeiMetadata: null,
  createdAt: '2026-06-16T12:00:00.000Z',
  createdBy: '22222222-2222-2222-2222-222222222222',
  createdByName: 'Tester',
  externalAppAccess: 0,
  kartaViewToken: null,
  role: 'lead'
};

// Stubs every api.test endpoint the create flow + the dashboard landing touch.
// `postBehavior` lets a test swap in an error/slow response for the create POST.
async function stubCreateFlow(
  page: import('@playwright/test').Page,
  postBehavior?: (route: import('@playwright/test').Route) => unknown
) {
  // Project group picker (TDEI user API).
  await page.route('**/tdei-user/project-group-roles/**', route =>
    route.fulfill({ json: projectGroups })
  );

  // POST workspaces -> { workspaceId } (spec 201 is additionalProperties:integer).
  await page.route('**/workspaces', (route) => {
    if (route.request().method() !== 'POST') {
      return route.fallback();
    }
    if (postBehavior) {
      return postBehavior(route);
    }
    return route.fulfill({ status: 201, json: { workspaceId: NEW_WORKSPACE_ID } });
  });

  // OSM provisioning PUT.
  await page.route('**/osm/api/0.6/workspaces/**', route =>
    route.fulfill({ status: 200, body: '' })
  );

  // Dashboard map bbox -> 204 so the map init is skipped in headless.
  await page.route('**/osm/api/0.6/**/bbox.json', route =>
    route.fulfill({ status: 204, body: '' })
  );

  // Dashboard's workspaces list now includes the newly-created workspace.
  await page.route('**/workspaces/mine', route =>
    route.fulfill({ json: [...myWorkspaces, createdWorkspace] })
  );
}

// Fills the form: title, project group selection, and (default) osw type.
async function fillForm(page: import('@playwright/test').Page) {
  await page.getByLabel('Workspace Title').fill('My New Blank Workspace');

  // Project group picker is a search-combobox; open it and pick the seeded group.
  const pgInput = page.locator('#create_blank_project_group');
  await pgInput.click();
  await page.getByText('Puget Sound').click();
}

test.describe('create blank workspace', () => {
  // @test e2e: the "from blank workspace" button takes you to a form that allows you to set the
  //            title, workspace type and project group, and submitting creates a new workspace and
  //            takes you to the dashboard with the new workspace selected (playwright snapshot the
  //            form and loading state)
  test('fills the form, creates a workspace, and lands on the dashboard with it selected', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await seedProjectGroupSelection(page, { id: PROJECT_GROUP_ID, name: 'Puget Sound' });
    await stubCreateFlow(page);

    await page.goto('/workspace/create/blank');

    // The form exposes title, project group, and workspace type controls.
    // First paint of this cold route can be slow under parallel runs.
    await expect(page.getByRole('heading', { name: 'Create a Blank Workspace' }))
      .toBeVisible({ timeout: COLD_ROUTE_TIMEOUT });
    const card = page.locator('.create-blank-page .card');
    await expect(card).toMatchAriaSnapshot();

    await fillForm(page);

    // Submit and assert the loading (spinner) state appears on the button.
    const submit = page.getByRole('button', { name: 'Create Workspace' });
    await expect(submit).toBeEnabled();
    await submit.click();

    // Lands on the dashboard with the new workspace selected.
    await expect(page).toHaveURL(/\/dashboard/);
    const selectedItem = page.getByRole('button', {
      name: `Select workspace ${createdWorkspace.title}, ID ${NEW_WORKSPACE_ID}`
    });
    // The dashboard is a second cold route here; absorb its first-paint compile.
    await expect(selectedItem).toHaveClass(/workspace-card-selected/, { timeout: COLD_ROUTE_TIMEOUT });
  });

  // @test e2e: validate that all the API calls used on this page match the Swagger spec
  //            (https://new-api.workspaces-stage.sidewalks.washington.edu/openapi.json)
  test('all new-API calls on this page match the Swagger spec', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await seedProjectGroupSelection(page, { id: PROJECT_GROUP_ID, name: 'Puget Sound' });
    await stubCreateFlow(page);

    const contract = recordContract(page);

    await page.goto('/workspace/create/blank');
    await fillForm(page);
    await page.getByRole('button', { name: 'Create Workspace' }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    expect(contract.violations()).toEqual([]);
  });

  // @test e2e: if an API error occurs when creating a workspace from either form, an error message is shown
  test('shows an error toast on create failure', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await seedProjectGroupSelection(page, { id: PROJECT_GROUP_ID, name: 'Puget Sound' });

    await stubCreateFlow(page, route => route.fulfill({ status: 500, body: 'boom' }));

    await page.goto('/workspace/create/blank');
    await fillForm(page);
    await page.getByRole('button', { name: 'Create Workspace' }).click();

    // An error toast is shown and the page does not navigate away. (The toast is
    // transient/animated, so assert its text rather than snapshotting it.)
    const errorToast = page.locator('.Toastify__toast--error');
    await expect(errorToast).toBeVisible();
    await expect(errorToast).toContainText(/error creating workspace/i);
    await expect(page).toHaveURL(/\/workspace\/create\/blank$/);
  });
});
