import { test, expect, seedAuthenticatedSession } from './fixtures';
import { recordContract } from './contract';
import { aWorkspace, PROJECT_GROUP_ID } from '../mocks/fixtures';

// Generated from the @test outline in pages/workspace/[id]/export/tdei.vue.
//
// The page (pages/workspace/[id]/export/tdei.vue) top-level `await`s
//   - workspacesClient.getWorkspace(id)        -> GET workspaces/{id}        (new API)
//   - tdeiUserClient.getMyProjectGroups(...)   -> GET tdei-user/project-group-roles/{subject}
// so BOTH must be stubbed or the page 500s.
//
// Export permission is derived from the project-group roles returned by the TDEI
// user API: the user may export only when at least one project group grants
// `poc` or `<type>_data_generator` (here `osw_data_generator`, since aWorkspace
// is an osw workspace). When no group is eligible, `canExport` is false: the
// page shows the permission notice and renders NEITHER the project-group nor the
// service picker.
//
// The service picker (components/ServicePicker.vue) fetches its options from
//   GET tdei-user/service?tdei_project_group_id=...&service_type=osw
// so the service `<option>`s shown must match that simulated response.
//
// The upload flow (services/export/tdei.ts, osw branch) runs:
//   OSM  GET workspaces/{id}/bbox.json   (dataset_area not in metadata)
//   OSM  GET map?bbox=...                 (export workspace xml)
//   TDEI POST osw/convert -> jobId; poll TDEI GET jobs?job_id=... until COMPLETED;
//        TDEI GET job/download/{jobId}
//   TDEI GET datasets?...                 (_filterNonexistentDataset)
//   TDEI POST osw/upload/{pg}/{service}   (the actual publish)
// The publish (osw/upload) is the call whose error surfaces in the footer:
// on failure context.status === 'upload', so the message is
// "TDEI rejected the upload: <response text>".

type Page = import('@playwright/test').Page;

const TDEI_PG_ID = PROJECT_GROUP_ID;

// A project group the user can export to (grants the osw data-generator role).
const eligibleProjectGroup = {
  tdei_project_group_id: TDEI_PG_ID,
  project_group_name: 'Puget Sound',
  roles: ['osw_data_generator']
};

// A project group the user CANNOT export to (only a non-export role).
const ineligibleProjectGroup = {
  tdei_project_group_id: TDEI_PG_ID,
  project_group_name: 'Puget Sound',
  roles: ['workspace_admin']
};

// Services returned by the simulated TDEI API for the chosen project group.
const services = [
  { tdei_service_id: 'svc-a', service_name: 'Downtown Sidewalks' },
  { tdei_service_id: 'svc-b', service_name: 'Campus Walkways' }
];

// Stub the two top-level awaits the page makes, parameterized by the roles the
// user holds so each test controls export permission.
async function stubPageLoad(page: Page, projectGroupRoles: object[]) {
  await page.route('**/workspaces/1', route => route.fulfill({ json: aWorkspace }));
  await page.route('**/project-group-roles/**', route =>
    route.fulfill({ json: projectGroupRoles })
  );
}

// Stub the service picker's option fetch.
async function stubServices(page: Page) {
  await page.route('**/service?**', route => route.fulfill({ json: services }));
}

const datasetNameInput = (page: Page) =>
  page.getByLabel('Dataset Name');
const datasetVersionInput = (page: Page) =>
  page.getByLabel('Dataset Version');
const projectGroupInput = (page: Page) =>
  page.locator('#export_tdei_project_group');
const serviceSelect = (page: Page) =>
  page.getByRole('combobox', { name: 'Service Selection' });
const uploadButton = (page: Page) =>
  page.getByRole('button', { name: /upload/i });

// @test e2e: this page shows a Dataset Name that is editable, and asks the user to choose a project group and
//            service returned from the TDEI API, as well as dataset version box (playwright snapshot this)
test('shows an editable Dataset Name, project-group + service pickers, and a Dataset Version box', async ({ page }) => {
  await seedAuthenticatedSession(page);
  await stubPageLoad(page, [eligibleProjectGroup]);
  await stubServices(page);

  await page.goto('/workspace/1/export/tdei');

  // Dataset Name is editable and seeded from the workspace title.
  const name = datasetNameInput(page);
  await expect(name).toBeVisible();
  await expect(name).toHaveValue(aWorkspace.title);
  await name.fill('Edited Dataset Name');
  await expect(name).toHaveValue('Edited Dataset Name');

  // Project group + service pickers are present, plus a dataset version box.
  await expect(projectGroupInput(page)).toBeVisible();
  await expect(serviceSelect(page)).toBeVisible();
  await expect(datasetVersionInput(page)).toBeVisible();

  await expect(page.locator('form.card')).toMatchAriaSnapshot();
});

// @test e2e: if the user doesn't have permissions to export to the TDEI, a message is shown indicating that and
//            the project group and service pickers are not shown (playwright snapshot this)
test('shows a permission message and hides the pickers when the user cannot export', async ({ page }) => {
  await seedAuthenticatedSession(page);
  await stubPageLoad(page, [ineligibleProjectGroup]);
  await stubServices(page);

  await page.goto('/workspace/1/export/tdei');

  // The permission notice is shown.
  await expect(page.getByText(/don't have permission to export/i)).toBeVisible();

  // Neither picker is rendered.
  await expect(projectGroupInput(page)).toHaveCount(0);
  await expect(serviceSelect(page)).toHaveCount(0);

  await expect(page.locator('.col')).toMatchAriaSnapshot();
});

// @test e2e: the service names and project groups shown should match the simulated TDEI API response.
test('the project groups and service names shown match the simulated TDEI API response', async ({ page }) => {
  await seedAuthenticatedSession(page);
  // Two eligible groups so we can assert the picker lists exactly these names.
  const groupB = {
    tdei_project_group_id: '33333333-3333-3333-3333-333333333333',
    project_group_name: 'Eastside Trails',
    roles: ['poc']
  };
  await stubPageLoad(page, [eligibleProjectGroup, groupB]);
  await stubServices(page);

  await page.goto('/workspace/1/export/tdei');

  // The service <select> lists exactly the simulated service names.
  await expect(serviceSelect(page).getByRole('option')).toHaveText([
    'Campus Walkways',
    'Downtown Sidewalks'
  ]);

  // The project-group picker dropdown lists exactly the simulated group names.
  await projectGroupInput(page).click();
  const pgItems = page.locator('.pg-list-wrap .list-group-item');
  await expect(pgItems).toHaveText(['Puget Sound', 'Eastside Trails']);
});

// @test e2e: submitting the form with valid values shows a loading state
test('submitting with valid values shows a loading state', async ({ page }) => {
  await seedAuthenticatedSession(page);
  await stubPageLoad(page, [eligibleProjectGroup]);
  await stubServices(page);

  // OSM bbox + xml export so the flow reaches the convert step. The OSM API base
  // is http://api.test/osm/api/0.6/, so the globs must include api/0.6/.
  await page.route('**/osm/api/0.6/workspaces/1/bbox.json', route =>
    route.fulfill({ json: { min_lat: 47.6, min_lon: -122.34, max_lat: 47.62, max_lon: -122.32 } })
  );
  await page.route('**/osm/api/0.6/map?**', route =>
    route.fulfill({ body: '<osm></osm>', contentType: 'application/xml' })
  );
  // Hold the convert POST pending so the page stays in its loading state.
  await page.route('**/osw/convert', () => { /* never fulfilled */ });

  await page.goto('/workspace/1/export/tdei');

  await datasetVersionInput(page).fill('1.0.0');
  await uploadButton(page).click();

  // The footer swaps to a spinner + status text while the export runs, and the
  // Upload button is gone.
  await expect(page.locator('.card-footer .spinner-border, .card-footer [role="status"]').first()).toBeVisible();
  await expect(uploadButton(page)).toHaveCount(0);
});

// @test e2e: submitting the form with a dataset version that already exists in the TDEI for that service shows an
//            error message, and allows the user to change the version and try again (playwright snapshot this)
test('a duplicate dataset version shows an error and lets the user change the version and retry', async ({ page }) => {
  await seedAuthenticatedSession(page);
  await stubPageLoad(page, [eligibleProjectGroup]);
  await stubServices(page);

  await page.route('**/osm/api/0.6/workspaces/1/bbox.json', route =>
    route.fulfill({ json: { min_lat: 47.6, min_lon: -122.34, max_lat: 47.62, max_lon: -122.32 } })
  );
  await page.route('**/osm/api/0.6/map?**', route =>
    route.fulfill({ body: '<osm></osm>', contentType: 'application/xml' })
  );
  await page.route('**/osw/convert', route => route.fulfill({ body: 'job-1', contentType: 'text/plain' }));
  await page.route('**/jobs?**', route =>
    route.fulfill({ json: [{ status: 'COMPLETED' }] })
  );
  await page.route('**/job/download/**', route =>
    route.fulfill({ body: 'osw-zip', contentType: 'application/zip' })
  );
  await page.route('**/datasets?**', route => route.fulfill({ json: [] }));

  // First upload attempt: version already exists -> TDEI returns a conflict.
  let uploadAttempts = 0;
  await page.route('**/osw/upload/**', (route) => {
    uploadAttempts++;
    if (uploadAttempts === 1) {
      return route.fulfill({
        status: 400,
        body: 'A dataset with version 1.0.0 already exists for this service.',
        contentType: 'text/plain'
      });
    }
    // Retry with a new version succeeds.
    return route.fulfill({ body: 'job-99', contentType: 'text/plain' });
  });

  await page.goto('/workspace/1/export/tdei');

  await datasetVersionInput(page).fill('1.0.0');
  await uploadButton(page).click();

  // The error explains the version already exists.
  const alert = page.getByRole('alert');
  await expect(alert).toBeVisible();
  await expect(alert).toContainText(/already exists/i);
  await expect(alert).toMatchAriaSnapshot();

  // The user can reset, change the version, and try again.
  await page.getByRole('button', { name: /try again/i }).click();

  const version = datasetVersionInput(page);
  await expect(version).toBeEditable();
  await version.fill('1.0.1');
  await uploadButton(page).click();

  // The retry submits a second upload (no error alert this time).
  await expect.poll(() => uploadAttempts).toBe(2);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

// @test e2e: submitting the form with an API error shows an error message and a "try again" button, and clicking
//            the "try again" button resets the form (playwright snapshot the error state)
test('an API error shows an error message and a Try again button that resets the form', async ({ page }) => {
  await seedAuthenticatedSession(page);
  await stubPageLoad(page, [eligibleProjectGroup]);
  await stubServices(page);

  await page.route('**/osm/workspaces/1/bbox.json', route =>
    route.fulfill({ json: { min_lat: 47.6, min_lon: -122.34, max_lat: 47.62, max_lon: -122.32 } })
  );
  await page.route('**/osm/map?**', route =>
    route.fulfill({ body: '<osm></osm>', contentType: 'application/xml' })
  );
  await page.route('**/osw/convert', route => route.fulfill({ body: 'job-1', contentType: 'text/plain' }));
  await page.route('**/jobs?**', route =>
    route.fulfill({ json: [{ status: 'COMPLETED' }] })
  );
  await page.route('**/job/download/**', route =>
    route.fulfill({ body: 'osw-zip', contentType: 'application/zip' })
  );
  await page.route('**/datasets?**', route => route.fulfill({ json: [] }));
  // The publish fails with a server error.
  await page.route('**/osw/upload/**', route =>
    route.fulfill({ status: 500, body: 'Internal server error', contentType: 'text/plain' })
  );

  await page.goto('/workspace/1/export/tdei');

  await datasetVersionInput(page).fill('2.0.0');
  await uploadButton(page).click();

  const alert = page.getByRole('alert');
  await expect(alert).toBeVisible();
  await expect(alert).toContainText(/error/i);
  await expect(page.getByRole('button', { name: /try again/i })).toBeVisible();
  await expect(alert).toMatchAriaSnapshot();

  // Clicking "Try again" resets the form back to the editable submit state.
  await page.getByRole('button', { name: /try again/i }).click();

  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(uploadButton(page)).toBeVisible();
  await expect(datasetVersionInput(page)).toBeEditable();
});

// @test e2e: if the user leaves any field blank and tries to submit, an error message is shown indicating that all
//            fields are required (playwright snapshot this)
test('submitting with a blank field shows an all-fields-required error', async ({ page }) => {
  await seedAuthenticatedSession(page);
  await stubPageLoad(page, [eligibleProjectGroup]);
  await stubServices(page);

  await page.goto('/workspace/1/export/tdei');

  // Clear required fields and submit.
  await datasetNameInput(page).fill('');
  await datasetVersionInput(page).fill('');
  await uploadButton(page).click();

  // A validation message indicates that all fields are required.
  const error = page.getByText(/all fields are required|required/i);
  await expect(error).toBeVisible();
  await expect(page.locator('form.card')).toMatchAriaSnapshot();
});

// @test e2e: validate that all the API calls used on this page match the Swagger spec
test('all API calls conform to the OpenAPI spec', async ({ page }) => {
  await seedAuthenticatedSession(page);
  const contract = recordContract(page);

  await stubPageLoad(page, [eligibleProjectGroup]);
  await stubServices(page);

  await page.goto('/workspace/1/export/tdei');
  await expect(datasetNameInput(page)).toBeVisible();
  await expect(projectGroupInput(page)).toBeVisible();

  expect(contract.violations()).toEqual([]);
});
