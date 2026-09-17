import { test, expect, seedAuthenticatedSession, seedProjectGroupSelection } from './fixtures';
import { recordContract } from './contract';
import {
  aWorkspace,
  myWorkspaces,
  projectGroups,
  PROJECT_GROUP_ID,
  TEST_API_BASE,
  USER_ID
} from '../mocks/fixtures';

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
  test.describe('workspace ID in workspace information', () => {
    const workspaces = [
      {
        ...aWorkspace,
        id: 1926,
        title: 'LA-OSW Workspace',
        tdeiMetadata: JSON.stringify({
          metadata: { dataset_detail: { version: '1.2' } }
        })
      },
      {
        ...aWorkspace,
        id: 2207,
        title: 'Seattle Review Workspace',
        tdeiMetadata: null
      }
    ];

    test.beforeEach(async ({ page }) => {
      await seedAuthenticatedSession(page);
      await seedProjectGroupSelection(page, { id: PROJECT_GROUP_ID, name: 'Puget Sound' });
      await page.route(`${TEST_API_BASE}workspaces/mine`, route => route.fulfill({ json: workspaces }));
      await page.route(`${TEST_API_BASE}tdei-user/project-group-roles/**`, route => route.fulfill({ json: projectGroups }));
      // Empty map data keeps these metadata tests independent of WebGL.
      await page.route(`${TEST_API_BASE}workspaces/{1926,2207}/bbox{,?*}`, route =>
        route.fulfill({ status: 204 })
      );
    });

    test('redirects a dashboard workspace URL to the selected workspace', async ({ page }) => {
      await page.goto('/dashboard/workspace/1926');

      await expect(page).toHaveURL('/dashboard?workspace=1926');
    });

    test('displays the selected workspace ID in the same row as TDEI Dataset Version', async ({ page }) => {
      await page.goto('/dashboard?workspace=1926');

      const primaryRow = page.locator('.workspace-info-primary-section');
      const workspaceId = primaryRow.locator('.workspace-information-id');
      const datasetVersion = primaryRow.locator('.workspace-information-version:not(.workspace-information-id)');

      await expect(workspaceId.getByText('Workspace ID', { exact: true })).toBeVisible();
      await expect(workspaceId.locator('strong')).toHaveText('1926');
      await expect(datasetVersion.getByText('TDEI Dataset Version', { exact: true })).toBeVisible();
      await expect(datasetVersion.locator('strong')).toHaveText('1.2');

      const idBounds = await workspaceId.boundingBox();
      const versionBounds = await datasetVersion.boundingBox();
      expect(idBounds).not.toBeNull();
      expect(versionBounds).not.toBeNull();
      expect(Math.abs(
        (idBounds!.y + idBounds!.height / 2)
        - (versionBounds!.y + versionBounds!.height / 2)
      )).toBeLessThanOrEqual(2);
      expect(idBounds!.x).toBeGreaterThanOrEqual(versionBounds!.x + versionBounds!.width);
    });

    test('updates the workspace ID when a different workspace is selected', async ({ page }) => {
      await page.goto('/dashboard?workspace=1926');

      const workspaceId = page.locator('.workspace-information-id strong');
      await expect(workspaceId).toHaveText('1926');

      await page.getByRole('button', {
        name: 'Select workspace Seattle Review Workspace, ID 2207',
        exact: true
      }).click();

      await expect(workspaceId).toHaveText('2207');

      await page.getByRole('button', {
        name: 'Select workspace LA-OSW Workspace, ID 1926',
        exact: true
      }).click();

      await expect(workspaceId).toHaveText('1926');
    });

    test('displays the workspace ID even when TDEI Dataset Version is unavailable', async ({ page }) => {
      await page.goto('/dashboard?workspace=2207');

      const primaryRow = page.locator('.workspace-info-primary-section');
      await expect(primaryRow.locator('.workspace-information-id strong')).toHaveText('2207');
      await expect(primaryRow.locator('.workspace-information-version:not(.workspace-information-id) strong'))
        .toHaveText('N/A');
    });
  });

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

    await expect(page.getByLabel('Project Group')).toHaveValue('Puget Sound');
    await expect(page.getByText('No workspaces exist in the selected project group.')).toBeVisible();
  });

  test('selection keeps list order while explicit pins persist in a prominent section', async ({ page }) => {
    const otherGroupId = '33333333-3333-3333-3333-333333333333';
    const dashboardWorkspaces = [
      {
        ...myWorkspaces[0],
        id: 1,
        title: 'Old Workspace',
        createdAt: '2026-01-01T00:00:00.000Z'
      },
      {
        ...myWorkspaces[0],
        id: 2,
        title: 'New Workspace',
        createdAt: '2026-03-01T00:00:00.000Z'
      },
      {
        ...myWorkspaces[0],
        id: 3,
        title: 'Middle Workspace',
        createdAt: '2026-02-01T00:00:00.000Z',
        importStatus: 'in-progress'
      },
      {
        ...myWorkspaces[0],
        id: 4,
        title: 'Other Group Workspace',
        tdeiProjectGroupId: otherGroupId
      }
    ];

    await seedAuthenticatedSession(page);
    await seedProjectGroupSelection(page, { id: PROJECT_GROUP_ID, name: 'Puget Sound' });
    await page.route('**/workspaces/mine', route => route.fulfill({ json: dashboardWorkspaces }));
    await page.route('**/project-group-roles/**', route => route.fulfill({ json: [
      ...projectGroups,
      { ...projectGroups[0], tdei_project_group_id: otherGroupId, project_group_name: 'Other Group' }
    ] }));
    await page.route('**/workspaces/*/bbox', route => route.fulfill({ status: 204 }));

    await page.goto('/dashboard');

    const visibleWorkspaceTitles = page.locator('.dashboard-workspace-list .workspace-card-copy strong');
    await expect(visibleWorkspaceTitles).toHaveText([
      'New Workspace',
      'Middle Workspace',
      'Old Workspace'
    ]);

    const importingCard = page.locator('.workspace-card-container').filter({
      hasText: 'Middle Workspace'
    });
    const statusBounds = await importingCard.locator('.workspace-import-status-badge').boundingBox();
    const pinBounds = await importingCard.locator('.workspace-card-pin').boundingBox();
    expect(statusBounds).not.toBeNull();
    expect(pinBounds).not.toBeNull();
    expect(statusBounds!.x + statusBounds!.width).toBeLessThanOrEqual(pinBounds!.x);

    await page.getByRole('button', { name: /Select workspace Old Workspace/ }).click();
    await expect(visibleWorkspaceTitles).toHaveText([
      'New Workspace',
      'Middle Workspace',
      'Old Workspace'
    ]);

    await page.getByRole('button', { name: 'Pin workspace Old Workspace' }).click();
    await expect(page.getByRole('heading', { name: 'Pinned Workspace', exact: true })).toBeVisible();
    await expect(
      page.locator('.dashboard-pinned-workspaces .workspace-card-copy strong')
    ).toHaveText('Old Workspace');
    await expect(page.getByRole('heading', { name: 'All Workspaces' })).toBeVisible();
    await expect.poll(() => page.evaluate(
      key => localStorage.getItem(key),
      `tdei-pinned-workspaces:${USER_ID}`
    )).toBe('[1]');

    await page.getByRole('button', { name: 'Pin workspace New Workspace' }).click();
    await expect(
      page.locator('.dashboard-pinned-workspaces .workspace-card-copy strong')
    ).toHaveText('New Workspace');
    await expect(page.getByRole('button', { name: 'Pin workspace Old Workspace' })).toBeVisible();
    await expect.poll(() => page.evaluate(
      key => localStorage.getItem(key),
      `tdei-pinned-workspaces:${USER_ID}`
    )).toBe('[2]');

    await page.reload();
    await expect(
      page.locator('.dashboard-pinned-workspaces .workspace-card-copy strong')
    ).toHaveText('New Workspace');

    const groupPicker = page.getByLabel('Project Group');
    await groupPicker.click();
    await page.locator('.pg-dropdown li').filter({ hasText: 'Other Group' }).click();
    await page.getByRole('button', { name: 'Pin workspace Other Group Workspace', exact: true }).click();
    await expect(page.locator('.dashboard-pinned-workspaces .workspace-card-copy strong'))
      .toHaveText('Other Group Workspace');

    await page.reload();
    await groupPicker.click();
    await page.locator('.pg-dropdown li').filter({ hasText: 'Other Group' }).click();
    await expect(page.locator('.dashboard-pinned-workspaces .workspace-card-copy strong'))
      .toHaveText('Other Group Workspace');
    await groupPicker.click();
    await page.locator('.pg-dropdown li').filter({ hasText: 'Puget Sound' }).click();
    await expect(page.locator('.dashboard-pinned-workspaces .workspace-card-copy strong'))
      .toHaveText('New Workspace');
    await page.getByRole('button', { name: 'Unpin workspace New Workspace', exact: true }).click();
    await expect(page.locator('.dashboard-pinned-workspaces')).toBeHidden();
    await groupPicker.click();
    await page.locator('.pg-dropdown li').filter({ hasText: 'Other Group' }).click();
    await expect(page.locator('.dashboard-pinned-workspaces .workspace-card-copy strong'))
      .toHaveText('Other Group Workspace');
  });

  test('shows empty-workspace and missing-dataset-area notices', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await seedProjectGroupSelection(page, { id: PROJECT_GROUP_ID, name: 'Puget Sound' });
    await page.route('**/workspaces/mine', route =>
      route.fulfill({ json: [{ ...aWorkspace, tdeiMetadata: null }] })
    );
    await page.route('**/project-group-roles/**', route => route.fulfill({ json: projectGroups }));
    await page.route('**/workspaces/1/bbox', route => route.fulfill({ status: 204 }));

    await page.goto('/dashboard');

    await expect(page.getByText('This workspace is empty.')).toBeVisible();
    await expect(page.getByText('No dataset area has been set for this workspace.')).toBeVisible();
  });

  test('shows the empty-workspace notice when bbox returns HTTP 200 with null coordinates', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await seedProjectGroupSelection(page, { id: PROJECT_GROUP_ID, name: 'Puget Sound' });
    await page.route('**/workspaces/mine', route =>
      route.fulfill({ json: [{ ...aWorkspace, tdeiMetadata: null }] })
    );
    await page.route('**/project-group-roles/**', route => route.fulfill({ json: projectGroups }));
    await page.route('**/workspaces/1/bbox', route => route.fulfill({
      status: 200,
      json: { max_lat: null, max_lon: null, min_lat: null, min_lon: null }
    }));

    await page.goto('/dashboard');

    await expect(page.getByText('This workspace is empty.', { exact: true })).toBeVisible();
    await expect(page.locator('.workspace-map-surface')).toBeHidden();
    await expect(page.getByText('The map preview could not be loaded.', { exact: true })).toBeHidden();
    await expect(page.getByText('No dataset area has been set for this workspace.', { exact: true }))
      .toBeVisible();
  });

  test('clicking a failed import status loads the latest job and shows its failure response', async ({ page }) => {
    const failedWorkspace = {
      id: 1769,
      type: 'osw',
      title: 'Failed import',
      description: null,
      tdeiProjectGroupId: PROJECT_GROUP_ID,
      tdeiRecordId: null,
      tdeiServiceId: null,
      tdeiMetadata: null,
      createdAt: '2026-08-14T05:44:15.816029Z',
      updatedAt: '2026-08-14T10:02:42.972197Z',
      createdBy: '22222222-2222-2222-2222-222222222222',
      createdByName: 'Tester',
      externalAppAccess: 0,
      kartaViewToken: null,
      role: 'lead',
      importStatus: 'failed'
    };
    const failureMessage = 'Step \'Create Changeset\' failed: no input file was found';
    let jobsRequestCount = 0;

    await seedAuthenticatedSession(page);
    await seedProjectGroupSelection(page, { id: PROJECT_GROUP_ID, name: 'Puget Sound' });
    await page.route('**/workspaces/mine', route => route.fulfill({ json: [failedWorkspace] }));
    await page.route('**/project-group-roles/**', route => route.fulfill({ json: projectGroups }));
    await page.route('**/workspaces/1769/bbox', route => route.fulfill({ status: 204 }));
    await page.route('**/workspaces/1769/jobs', (route) => {
      jobsRequestCount++;
      return route.fulfill({
        json: [{
          id: 2,
          workspace_id: 1769,
          job_type: 'workspace-import',
          request: { tdei_token: 'must-not-be-rendered' },
          current_task: 'Create Changeset',
          response: {
            message: failureMessage,
            success: false,
            messageCode: 'STEP_EXECUTION_FAILED'
          },
          created_at: '2026-08-14T05:44:15.816029',
          updated_at: '2026-08-14T10:02:42.972197',
          status: 'completed',
          current_task_status: null
        }]
      });
    });

    await page.goto('/dashboard');
    await expect(page.locator('.workspace-card-updated')).toContainText('Updated');
    await expect(page.locator('.dashboard-workspace-updated')).toContainText('Updated');
    await expect(page.getByText('Updated At', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'View import failure details' }).click();

    const dialog = page.getByRole('dialog', { name: 'Workspace import failed' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(failureMessage);
    await expect(dialog).toContainText('STEP_EXECUTION_FAILED');
    await expect(dialog).toContainText('Create Changeset');
    await expect(dialog).not.toContainText('must-not-be-rendered');
    expect(jobsRequestCount).toBe(1);
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
