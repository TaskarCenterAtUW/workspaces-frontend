import { test, expect, seedAuthenticatedSession } from './fixtures';
import { recordContract } from './contract';
import { projectGroups } from '../mocks/fixtures';

// Generated from the @test outline in pages/workspace/create/index.vue.
//
// The create landing page (/workspace/create) is a static set of three cards,
// each linking to a create form. These tests assert the landing page itself and
// that each "Start" link navigates to the right form, then assert what the
// outline says each destination form must contain. Auth is required for every
// flow (seedAuthenticatedSession FIRST).
//
// Stubs the forms need:
//   - GET tdei-user/project-group-roles/{subject}  -> projectGroups (ProjectGroupPicker)
//   - POST workspaces                              -> { workspaceId: <int> } (createWorkspace)
//   - PUT osm/workspaces/{id}                      -> 200 (osmClient.createWorkspace)
//   - PUT osm/changeset/create                     -> changeset id (file flow only)
//   - POST osm/changeset/{id}/upload               -> 200 (file flow only)

// Fulfils GET project-group-roles with the canned project groups so the
// ProjectGroupPicker mounts, auto-selects "Puget Sound", and shows its name.
async function stubProjectGroups(page: import('@playwright/test').Page) {
  await page.route('**/tdei-user/project-group-roles/**', route =>
    route.fulfill({ json: projectGroups })
  );
}

// POST /workspaces returns an object whose `workspaceId` the client reads; the
// OpenAPI 201 schema is "object with integer values", so {workspaceId: 123}
// conforms.
async function stubCreateWorkspaceOk(page: import('@playwright/test').Page, id = 123) {
  await page.route('**/api.test/workspaces', (route) => {
    if (route.request().method() === 'POST') {
      return route.fulfill({ status: 201, json: { workspaceId: id } });
    }
    return route.continue();
  });
}

test.describe('create landing page', () => {
  // @test e2e: there are three buttons on this screen--blank workspace, from tdei and from file (playwright snapshot this)
  test('shows the three create cards with links to each form (snapshot)', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await page.goto('/workspace/create');

    await expect(page.getByRole('heading', { name: 'Create a Workspace' })).toBeVisible();

    const blank = page.getByRole('link').filter({ hasText: 'Start' }).nth(0);
    const tdei = page.getByRole('link').filter({ hasText: 'Start' }).nth(1);
    const file = page.getByRole('link').filter({ hasText: 'Start' }).nth(2);

    await expect(page.getByText('Blank Workspace')).toBeVisible();
    await expect(page.getByText('From TDEI')).toBeVisible();
    await expect(page.getByText('From File')).toBeVisible();

    await expect(blank).toHaveAttribute('href', '/workspace/create/blank');
    await expect(tdei).toHaveAttribute('href', '/workspace/create/tdei');
    await expect(file).toHaveAttribute('href', '/workspace/create/file');

    // ARIA snapshot of the three-card grid (stable structure, no images).
    await expect(page.locator('.row.row-cols-1')).toMatchAriaSnapshot();
  });

  // @test e2e: clicking the "from tdei" button takes the user to a form that allows one to set a title and pick a dataset
  //            from a project group in the TDEI. The available values should match the simulated API response
  test('the "from tdei" button opens the TDEI import form with title + project group from the API', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await stubProjectGroups(page);

    await page.goto('/workspace/create');
    await page.getByRole('link').filter({ hasText: 'Start' }).nth(1).click();

    await expect(page).toHaveURL(/\/workspace\/create\/tdei$/);
    await expect(page.getByRole('heading', { name: 'Create a Workspace from the TDEI' })).toBeVisible();

    // Title field present.
    await expect(page.getByText('Workspace Title')).toBeVisible();
    // Dataset picker present (no preselected tdeiRecordId in the query).
    await expect(page.getByLabel('Dataset Selection')).toBeVisible();

    // Project group picker auto-selects the first (and only) group from the
    // simulated API response: "Puget Sound".
    const pgInput = page.locator('#create_tdei_project_group');
    await expect(pgInput).toHaveValue('Puget Sound');
  });

  // @test e2e: the "from blank workspace" button takes you to a form that allows you to set the title, workspace type and
  //            project group, and submitting creates a new workspace and takes you to the dashboard with the new workspace
  //            selected (playwright snapshot the form and loading state)
  test('the "from blank workspace" button opens the blank form, creates a workspace, and redirects to the dashboard (snapshot)', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await stubProjectGroups(page);
    await stubCreateWorkspaceOk(page, 123);
    // osmClient.createWorkspace(id) after the POST.
    await page.route('**/osm/api/0.6/workspaces/**', route => route.fulfill({ status: 200, body: '' }));

    await page.goto('/workspace/create');
    await page.getByRole('link').filter({ hasText: 'Start' }).nth(0).click();

    await expect(page).toHaveURL(/\/workspace\/create\/blank$/);
    await expect(page.getByRole('heading', { name: 'Create a Blank Workspace' })).toBeVisible();

    // Form fields: title, project group, dataset type radios.
    await expect(page.getByText('Workspace Title')).toBeVisible();
    await expect(page.locator('#create_blank_project_group')).toHaveValue('Puget Sound');
    await expect(page.getByRole('radio', { name: 'OpenSidewalks' })).toBeVisible();
    await expect(page.getByRole('radio', { name: 'GTFS Pathways' })).toBeVisible();

    const submit = page.getByRole('button', { name: 'Create Workspace' });
    // Snapshot the completed form before submitting.
    await expect(page.locator('.create-blank-page .card')).toMatchAriaSnapshot();

    await page.getByLabel('Workspace Title').fill('My Blank Workspace');
    await expect(submit).toBeEnabled();

    // Hold the POST open to capture the loading (spinner) state.
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    await page.route('**/api.test/workspaces', async (route) => {
      if (route.request().method() === 'POST') {
        await gate;
        return route.fulfill({ status: 201, json: { workspaceId: 123 } });
      }
      return route.continue();
    });

    await submit.click();
    // Loading state: spinner shown inside the submit button.
    await expect(page.locator('.create-blank-page .spinner-border, .create-blank-page [role="status"]')).toBeVisible();
    await expect(page.locator('.create-blank-page .card-footer')).toMatchAriaSnapshot();

    release();
    // Redirects to the dashboard with the new workspace selected.
    await expect(page).toHaveURL(/\/dashboard/);
  });

  // @test e2e: the "from file" button takes you to a form that allows you to set a title, workspace type, project group, and upload a file,
  //            and submitting creates a new workspace and takes you to the dashboard with the new workspace selected (playwright
  //            snapshot the form and loading state)
  test('the "from file" button opens the file form, uploads + creates a workspace, and redirects to the dashboard (snapshot)', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await stubProjectGroups(page);
    await page.route('**/osm/api/0.6/workspaces/**', route => route.fulfill({ status: 200, body: '' }));
    await page.route('**/osm/api/0.6/changeset/create', route => route.fulfill({ status: 200, body: '1' }));
    await page.route('**/osm/api/0.6/changeset/*/upload', route => route.fulfill({ status: 200, body: '' }));

    await page.goto('/workspace/create');
    await page.getByRole('link').filter({ hasText: 'Start' }).nth(2).click();

    await expect(page).toHaveURL(/\/workspace\/create\/file$/);
    await expect(page.getByRole('heading', { name: 'Create a Workspace from a File' })).toBeVisible();

    // Form fields: title, project group, dataset type, file upload.
    await expect(page.getByText('Workspace Title')).toBeVisible();
    await expect(page.locator('#create_file_project_group')).toHaveValue('Puget Sound');
    await expect(page.getByText('Dataset Type')).toBeVisible();
    await expect(page.getByText('Dataset File')).toBeVisible();

    // Snapshot the empty form.
    await expect(page.locator('.create-file-page .card')).toMatchAriaSnapshot();

    await page.getByLabel('Workspace Title').fill('My File Workspace');
    // Use the pathways type so the import path skips the TDEI OSW conversion job.
    await page.getByText('GTFS Pathways').click();
    // The pathways import parses the uploaded zip client-side via zip.js, so the
    // upload must be a structurally valid archive. A bare End-Of-Central-Directory
    // record (22 bytes) is the minimal empty-but-valid ZIP; a junk buffer makes
    // ZipReader.getEntries() throw and the create never completes (no redirect).
    await page.getByLabel('Dataset File').setInputFiles({
      name: 'data.zip',
      mimeType: 'application/zip',
      buffer: Buffer.from([
        0x50, 0x4b, 0x05, 0x06,
        0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00,
        0x00, 0x00
      ])
    });

    const submit = page.getByRole('button', { name: 'Create Workspace' });
    await expect(submit).toBeEnabled();

    // Hold the POST open to capture the loading state.
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    await page.route('**/api.test/workspaces', async (route) => {
      if (route.request().method() === 'POST') {
        await gate;
        return route.fulfill({ status: 201, json: { workspaceId: 456 } });
      }
      return route.continue();
    });

    await submit.click();
    // Loading state: spinner + status text in the footer.
    await expect(page.locator('.create-file-page .spinner-border, .create-file-page [role="status"]')).toBeVisible();
    await expect(page.locator('.create-file-page .card-footer')).toMatchAriaSnapshot();

    release();
    await expect(page).toHaveURL(/\/dashboard/);
  });

  // @test e2e: if an API error occurs when creating a workspace from either form, an error message and "try again" button are shown, and clicking the "try again"
  //            button resets the form (playwright snapshot the error state)
  test('the file form shows an error + "Try again" on API failure, and "Try again" resets the form (snapshot)', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await stubProjectGroups(page);
    // Fail the workspace creation.
    await page.route('**/api.test/workspaces', (route) => {
      if (route.request().method() === 'POST') {
        return route.fulfill({ status: 500, body: 'boom' });
      }
      return route.continue();
    });

    await page.goto('/workspace/create/file');
    await expect(page.getByRole('heading', { name: 'Create a Workspace from a File' })).toBeVisible();

    await page.getByLabel('Workspace Title').fill('Will Fail');
    await page.getByText('GTFS Pathways').click();
    await page.getByLabel('Dataset File').setInputFiles({
      name: 'data.zip',
      mimeType: 'application/zip',
      buffer: Buffer.from('PK not-a-real-zip')
    });

    await page.getByRole('button', { name: 'Create Workspace' }).click();

    // Error UI: alert + "Try again".
    const alert = page.getByRole('alert');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText('An error occurred:');
    const tryAgain = page.getByRole('button', { name: 'Try again' });
    await expect(tryAgain).toBeVisible();

    // Snapshot the error state.
    await expect(page.locator('.create-file-page .card-footer')).toMatchAriaSnapshot();

    // Clicking "Try again" resets the form back to the editable Create button.
    await tryAgain.click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Create Workspace' })).toBeVisible();
  });

  // @test e2e (blank form): the same create-from-either-form outline applies to the blank
  //            form too; assert its error + reset path independently.
  test('the blank form shows an error + "Try again" on API failure, and "Try again" resets the form (snapshot)', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await stubProjectGroups(page);
    await page.route('**/api.test/workspaces', (route) => {
      if (route.request().method() === 'POST') {
        return route.fulfill({ status: 500, body: 'boom' });
      }
      return route.continue();
    });

    await page.goto('/workspace/create/blank');
    await expect(page.getByRole('heading', { name: 'Create a Blank Workspace' })).toBeVisible();

    await page.getByLabel('Workspace Title').fill('Will Fail');
    await page.getByRole('button', { name: 'Create Workspace' }).click();

    // The blank form must show an error message + "Try again" button on failure.
    const alert = page.getByRole('alert');
    await expect(alert).toBeVisible();
    const tryAgain = page.getByRole('button', { name: 'Try again' });
    await expect(tryAgain).toBeVisible();

    await expect(page.locator('.create-blank-page .card-footer')).toMatchAriaSnapshot();

    await tryAgain.click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Create Workspace' })).toBeVisible();
  });

  // @test e2e: validate that all the API calls used on this page (the blank create flow) match the Swagger spec.
  test('the blank create flow makes only Swagger-conformant new-API calls', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await stubProjectGroups(page);
    await stubCreateWorkspaceOk(page, 123);
    await page.route('**/osm/api/0.6/workspaces/**', route => route.fulfill({ status: 200, body: '' }));

    const contract = recordContract(page);

    await page.goto('/workspace/create/blank');
    await page.getByLabel('Workspace Title').fill('Contract Check');
    await page.getByRole('button', { name: 'Create Workspace' }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    expect(contract.violations()).toEqual([]);
  });
});
