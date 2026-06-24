import { test, expect, seedAuthenticatedSession, seedProjectGroupSelection } from './fixtures';
import { recordContract } from './contract';
import { projectGroups, PROJECT_GROUP_ID, myWorkspaces } from '../mocks/fixtures';

// Generated from the @test outline in pages/workspace/create/file.vue.
//
// The "create from file" form sets a title, project group, dataset type, and
// uploads a file; submitting drives services/import/file.ts → FileImporter:
//   1. (osw only) TDEI convert job  2. new-API POST /workspaces
//   3. OSM PUT /workspaces/{id}     4. OSM PUT changeset/create
//   5. OSM POST changeset/{id}/upload
// then navigates to /dashboard?workspace={id}.
//
// We test the PATHWAYS (GTFS) path for the happy case because it skips the TDEI
// convert+poll loop (status polling with 4s sleeps would make the e2e flaky/slow)
// and parses the uploaded zip entirely client-side. A minimal valid (empty) zip
// yields an empty changeset that still exercises the full create→upload→navigate
// chain.

// A valid, empty ZIP archive: just the End-Of-Central-Directory record (22 bytes).
// zip.js reads zero entries from it, so openTdeiPathwaysArchive() returns an empty
// dataset and pathways2osc() builds an empty (but valid) changeset.
const EMPTY_ZIP = Buffer.from([
  0x50, 0x4b, 0x05, 0x06,
  0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00,
  0x00, 0x00
]);

const VALID_ZIP_FILE = { name: 'pathways.zip', mimeType: 'application/zip', buffer: EMPTY_ZIP };
const INVALID_FILE = { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('not a dataset') };

const NEW_WORKSPACE_ID = 123;

// Stubs every endpoint the create-from-file pathways flow hits so nothing 500s.
// `opts.failCreate` forces the new-API POST /workspaces to 500 for the error path.
async function stubCreateFlow(page: import('@playwright/test').Page, opts: { failCreate?: boolean } = {}) {
  // Project group picker (TDEI user API).
  await page.route('**/project-group-roles/**', route =>
    route.fulfill({ json: projectGroups })
  );

  // new-API: create the workspace row. Spec: 201 with { <name>: <integer> }.
  await page.route('**/workspaces', (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    if (opts.failCreate) {
      return route.fulfill({ status: 500, contentType: 'text/plain', body: 'boom' });
    }
    return route.fulfill({ status: 201, json: { workspaceId: NEW_WORKSPACE_ID } });
  });

  // OSM API (base http://api.test/osm/api/0.6/): provision the workspace,
  // open a changeset (returns its numeric id as text), then accept the upload.
  await page.route('**/osm/api/0.6/workspaces/**', route =>
    route.fulfill({ status: 200, contentType: 'text/plain', body: '' })
  );
  await page.route('**/osm/api/0.6/changeset/create', route =>
    route.fulfill({ status: 200, contentType: 'text/plain', body: '987' })
  );
  await page.route('**/osm/api/0.6/changeset/*/upload', route =>
    route.fulfill({ status: 200, contentType: 'application/xml', body: '<diffResult/>' })
  );

  // Dashboard (post-create destination) reads workspaces/mine + project groups.
  await page.route('**/workspaces/mine', route => route.fulfill({ json: myWorkspaces }));
}

// Fills every required field on the form with valid pathways values + the given file.
async function fillForm(page: import('@playwright/test').Page, file: typeof VALID_ZIP_FILE | typeof INVALID_FILE) {
  await page.getByLabel('Workspace Title').fill('My File Workspace');

  // Project group picker: open, wait for the seeded option, select it.
  await page.locator('#create_file_project_group').click();
  await page.getByText('Puget Sound').click();

  // Dataset type radio: GTFS Pathways skips the TDEI convert step.
  // DatasetTypeRadio uses Bootstrap's .btn-check pattern (visually-hidden input
  // + adjacent visible label); click the label rather than .check() the input.
  await page.getByText('GTFS Pathways').click();

  await page.locator('input[type="file"]').setInputFiles(file);
}

test.describe('create workspace from file', () => {
  // @test e2e: the "from file" button takes you to a form that allows you to set a title, workspace type,
  //            project group, and upload a file, and submitting creates a new workspace and takes you to
  //            the dashboard with the new workspace selected (playwright snapshot the form and loading state)
  test('from-file button reaches the form; submitting creates a workspace and navigates to the dashboard', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await seedProjectGroupSelection(page, { id: PROJECT_GROUP_ID, name: 'Puget Sound' });
    await stubCreateFlow(page);

    // The "From File" card on the create hub links to the form.
    await page.goto('/workspace/create');
    await page.locator('.card', { hasText: 'From File' }).getByRole('link').click();
    await expect(page).toHaveURL(/\/workspace\/create\/file$/);

    // The form exposes title, project group, dataset type, and file inputs.
    await expect(page.getByRole('heading', { name: 'Create a Workspace from a File' })).toBeVisible();
    await expect(page.getByLabel('Workspace Title')).toBeVisible();
    await expect(page.locator('#create_file_project_group')).toBeVisible();
    await expect(page.getByLabel('OpenSidewalks')).toBeVisible();
    await expect(page.getByLabel('GTFS Pathways')).toBeVisible();
    await expect(page.locator('input[type="file"]')).toBeVisible();

    // Snapshot the empty form (card body), before any values are entered.
    await expect(page.locator('.card')).toMatchAriaSnapshot();

    await fillForm(page, VALID_ZIP_FILE);

    const create = page.getByRole('button', { name: 'Create Workspace' });
    await expect(create).toBeEnabled();
    await create.click();

    // Submitting lands on the dashboard with the new workspace selected.
    await expect(page).toHaveURL(new RegExp('/dashboard\\?workspace=' + NEW_WORKSPACE_ID));
  });

  // @test e2e: test that both a valid file upload and an invalid file upload (e.g. wrong file type) are
  //            handled correctly, with the valid file successfully creating a workspace and the invalid
  //            file showing an error message (playwright snapshot both scenarios)
  test('a valid zip creates a workspace', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await seedProjectGroupSelection(page, { id: PROJECT_GROUP_ID, name: 'Puget Sound' });
    await stubCreateFlow(page);

    await page.goto('/workspace/create/file');
    await fillForm(page, VALID_ZIP_FILE);

    const create = page.getByRole('button', { name: 'Create Workspace' });
    await expect(create).toBeEnabled();
    await create.click();

    await expect(page).toHaveURL(new RegExp('/dashboard\\?workspace=' + NEW_WORKSPACE_ID));
  });

  test('an invalid file type is rejected and surfaces an error', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await seedProjectGroupSelection(page, { id: PROJECT_GROUP_ID, name: 'Puget Sound' });
    await stubCreateFlow(page);

    await page.goto('/workspace/create/file');
    await fillForm(page, INVALID_FILE);

    // The outline requires invalid files to be "handled correctly ... showing an
    // error message". A non-.zip selection triggers a vue3-toastify error toast
    // and is cleared, so the Create button stays disabled.
    const errorToast = page.locator('.Toastify__toast--error');
    await expect(errorToast).toBeVisible();
    await expect(errorToast).toContainText(/\.zip/);

    const create = page.getByRole('button', { name: 'Create Workspace' });
    await expect(create).toBeDisabled();

    // Snapshot the rejected-file state of the card (the toast is volatile and
    // lives outside the card, so it isn't captured here).
    await expect(page.locator('.card')).toMatchAriaSnapshot();
  });

  // @test e2e: validate that all the API calls used on this page match the Swagger spec
  //            (https://new-api.workspaces-stage.sidewalks.washington.edu/openapi.json)
  test('all new-API calls match the OpenAPI spec', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await seedProjectGroupSelection(page, { id: PROJECT_GROUP_ID, name: 'Puget Sound' });
    await stubCreateFlow(page);

    const contract = recordContract(page);

    await page.goto('/workspace/create/file');
    await fillForm(page, VALID_ZIP_FILE);
    await page.getByRole('button', { name: 'Create Workspace' }).click();

    await expect(page).toHaveURL(new RegExp('/dashboard\\?workspace=' + NEW_WORKSPACE_ID));

    expect(contract.violations()).toEqual([]);
  });

  // @test e2e: if an API error occurs when creating a workspace from either form, an error message is shown
  test('shows an error message on a creation API error', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await seedProjectGroupSelection(page, { id: PROJECT_GROUP_ID, name: 'Puget Sound' });
    await stubCreateFlow(page, { failCreate: true });

    await page.goto('/workspace/create/file');
    await fillForm(page, VALID_ZIP_FILE);
    await page.getByRole('button', { name: 'Create Workspace' }).click();

    // An error message is shown (the file form renders the importer error alert).
    const alert = page.getByRole('alert');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText(/error/i);
  });
});
