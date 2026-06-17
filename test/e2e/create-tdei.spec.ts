import { test, expect, seedAuthenticatedSession } from './fixtures';
import { recordContract } from './contract';
import { projectGroups, PROJECT_GROUP_ID } from '../mocks/fixtures';
import type { Page, Route } from '@playwright/test';

// Generated from the @test outline in pages/workspace/create/tdei.vue.
//
// The page sets a workspace title + picks a TDEI dataset, then submits. On
// submit it runs the TdeiImporter chain (POST new-API /workspaces, PUT
// osm/workspaces/{id}, download+unzip the TDEI dataset, create+upload an OSM
// changeset) while showing a loading/status state, and on success redirects to
// /dashboard?workspace={id}. API errors surface an error message + a "Try
// again" button that resets the form.

// The spec requires uuid format for tdeiRecordId / tdeiServiceId / project
// group id, and the contract validator checks the POST body — so the canned
// dataset uses real UUIDs.
const DATASET_ID = '33333333-3333-3333-3333-333333333333';
const SERVICE_ID = '44444444-4444-4444-4444-444444444444';
const NEW_WORKSPACE_ID = 4242;

const TDEI_DATASET = {
  tdei_dataset_id: DATASET_ID,
  data_type: 'osw',
  status: 'Publish',
  project_group: {
    tdei_project_group_id: PROJECT_GROUP_ID,
    name: 'Puget Sound'
  },
  service: {
    tdei_service_id: SERVICE_ID,
    service_name: 'Seattle Service'
  },
  metadata: {
    dataset_detail: {
      name: 'Downtown Sidewalks',
      version: 'v1.0',
      description: 'Sidewalk network for downtown',
      collected_by: 'Survey Crew',
      collection_date: '2026-01-01',
      publication_date: '2026-02-01',
      schema_version: 'v0.2'
    }
  }
};

// --- Minimal stored (uncompressed) ZIP builder -------------------------------
// The importer downloads the TDEI dataset as a zip and extracts the first
// non-changeset .xml entry, then converts it to an OSC. A minimal <osm/>
// document is enough to drive the whole chain to completion.

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i]!;
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(n: number): number[] {
  return [n & 0xff, (n >>> 8) & 0xff];
}

function u32(n: number): number[] {
  return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
}

function buildDatasetZip(): Buffer {
  const name = 'dataset.xml';
  const nameBytes = Array.from(Buffer.from(name, 'utf8'));
  const content = Buffer.from('<osm version="0.6"></osm>', 'utf8');
  const data = Array.from(content);
  const crc = crc32(content);
  const size = content.length;

  const localHeader = [
    ...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
    ...u32(crc), ...u32(size), ...u32(size), ...u16(nameBytes.length), ...u16(0),
    ...nameBytes
  ];
  const localOffset = 0;
  const localRecord = [...localHeader, ...data];

  const centralHeader = [
    ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(0),
    ...u16(0), ...u32(crc), ...u32(size), ...u32(size), ...u16(nameBytes.length),
    ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(localOffset),
    ...nameBytes
  ];

  const centralOffset = localRecord.length;
  const endRecord = [
    ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(1), ...u16(1),
    ...u32(centralHeader.length), ...u32(centralOffset), ...u16(0)
  ];

  return Buffer.from([...localRecord, ...centralHeader, ...endRecord]);
}

const DATASET_ZIP = buildDatasetZip();

// --- Route stubbing ----------------------------------------------------------

// Stubs every endpoint the page hits to *succeed*. Pass an `override` map keyed
// by a short label to fail a specific call with a 500 for the error-path tests.
async function stubHappyPath(page: Page, override: { workspace?: boolean } = {}) {
  // ProjectGroupPicker -> TDEI user API.
  await page.route('**/tdei-user/project-group-roles/**', (route: Route) =>
    route.fulfill({ json: projectGroups })
  );

  // DatasetPicker list + getDatasetInfo both hit /tdei/datasets; one dataset
  // satisfies both (list maps name/version, getDatasetInfo takes [0]).
  await page.route('**/tdei/datasets**', (route: Route) =>
    route.fulfill({ json: [TDEI_DATASET] })
  );

  // New-API create. 201 with { workspaceId } per the OpenAPI spec.
  await page.route('**/workspaces', (route: Route) => {
    if (route.request().method() !== 'POST') return route.continue();
    if (override.workspace) {
      return route.fulfill({ status: 500, body: 'workspace create failed' });
    }
    return route.fulfill({ status: 201, json: { workspaceId: NEW_WORKSPACE_ID } });
  });

  // OSM provisioning + changeset chain (createWorkspace -> PUT, createChangeset
  // -> PUT, uploadChangeset -> POST). The OSM API base is
  // http://api.test/osm/api/0.6/, so the globs must include api/0.6/.
  await page.route(`**/osm/api/0.6/workspaces/${NEW_WORKSPACE_ID}`, (route: Route) =>
    route.fulfill({ status: 200, body: '' })
  );
  await page.route('**/osm/api/0.6/changeset/create', (route: Route) =>
    route.fulfill({ status: 200, body: '777' })
  );
  await page.route('**/osm/api/0.6/changeset/*/upload', (route: Route) =>
    route.fulfill({ status: 200, body: '' })
  );

  // TDEI dataset download (osw, format=osm) -> a real (tiny) zip blob.
  await page.route('**/tdei/osw/**', (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/zip',
      body: DATASET_ZIP
    })
  );

  // Anything else on the dashboard we land on after success.
  await page.route('**/workspaces/mine', (route: Route) => route.fulfill({ json: [] }));
}

// Fills the form: selects the project group, picks the dataset. After selection
// the page auto-fills the title from the dataset name; the Create button is then
// enabled.
async function fillForm(page: Page) {
  // Pick the project group via the typeahead picker.
  const pgInput = page.locator('#create_tdei_project_group');
  await pgInput.click();
  await page.getByRole('listitem').filter({ hasText: 'Puget Sound' }).first().click();

  // Choose the dataset; this fires getDatasetInfo which auto-fills the title.
  // DatasetPicker is a native <select> whose option values are dataset ids and
  // whose display text is "{name} (version {v})"; select the first real option
  // (index 1, after the disabled placeholder at index 0).
  await page.getByLabel('Dataset Selection').selectOption({ index: 1 });

  await expect(page.getByRole('button', { name: 'Create Workspace' })).toBeEnabled();
}

test.describe('create workspace from TDEI', () => {
  // @test e2e: submitting the form with valid values shows a loading state, then redirects to the dashboard with the
  //            new workspace selected (playwright snapshot the loading state)
  test('valid submit shows a loading state then redirects to the dashboard with the new workspace', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await stubHappyPath(page);

    // Hold the create POST open so the loading state is observable for the
    // snapshot, then release it to let the redirect happen.
    let releaseCreate: () => void = () => {};
    const createGate = new Promise<void>((resolve) => {
      releaseCreate = resolve;
    });
    await page.route('**/workspaces', async (route: Route) => {
      if (route.request().method() !== 'POST') return route.continue();
      await createGate;
      return route.fulfill({ status: 201, json: { workspaceId: NEW_WORKSPACE_ID } });
    });

    await page.goto('/workspace/create/tdei');
    await fillForm(page);

    await page.getByRole('button', { name: 'Create Workspace' }).click();

    // Loading/status state: the card footer shows a spinner + a status message.
    const statusRegion = page.locator('.card-footer');
    await expect(statusRegion.locator('.spinner-border, [role="status"], .spinner')).toBeVisible();
    await expect(statusRegion).toMatchAriaSnapshot();

    releaseCreate();

    await expect(page).toHaveURL(new RegExp(`/dashboard\\?workspace=${NEW_WORKSPACE_ID}`));
  });

  // @test e2e: submitting the form with an API error shows an error message and a "try again" button, and
  //            clicking the "try again" button resets the form (playwright snapshot the error state)
  // @test e2e: if an API error occurs when creating a workspace from either form, an error message and "try again"
  //            button are shown, and clicking the "try again" button resets the form (playwright snapshot the error state)
  test('an API error shows an error message and a "Try again" button that resets the form', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await stubHappyPath(page, { workspace: true });

    await page.goto('/workspace/create/tdei');
    await fillForm(page);

    await page.getByRole('button', { name: 'Create Workspace' }).click();

    // Error state: an alert with the message and a "Try again" button.
    const errorAlert = page.getByRole('alert').filter({ hasText: 'An error occurred' });
    await expect(errorAlert).toBeVisible();
    const tryAgain = page.getByRole('button', { name: 'Try again' });
    await expect(tryAgain).toBeVisible();
    await expect(errorAlert).toMatchAriaSnapshot();

    // Clicking "Try again" resets: error gone, the Create button (the form) is
    // back so the user can retry.
    await tryAgain.click();
    await expect(errorAlert).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Create Workspace' })).toBeVisible();
  });

  // @test e2e (contract): the create workspace POST conforms to the Swagger spec.
  test('the create-workspace API calls match the Swagger spec', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await stubHappyPath(page);
    const contract = recordContract(page);

    await page.goto('/workspace/create/tdei');
    await fillForm(page);
    await page.getByRole('button', { name: 'Create Workspace' }).click();

    await expect(page).toHaveURL(new RegExp(`/dashboard\\?workspace=${NEW_WORKSPACE_ID}`));

    expect(contract.violations()).toEqual([]);
  });
});
