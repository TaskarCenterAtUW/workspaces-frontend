import { test, expect, seedAuthenticatedSession } from './fixtures';
import { recordContract } from './contract';
import { projectGroups, PROJECT_GROUP_ID } from '../mocks/fixtures';
import type { Page, Route } from '@playwright/test';

// Generated from the @test outline in pages/workspace/create/tdei.vue.
//
// The page sets a workspace title + picks a TDEI dataset, then submits. On
// submit it initiates workspace creation through the new API. On success it
// shows a confirmation with a link to the dashboard, where the user can refresh
// to check the import status. API errors surface an error message + a "Try
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
async function stubHappyPath(
  page: Page,
  override: { workspace?: boolean; titleAvailable?: boolean; createCheckReason?: string } = {}
) {
  // ProjectGroupPicker -> TDEI user API.
  await page.route('**/tdei-user/project-group-roles/**', (route: Route) =>
    route.fulfill({ json: projectGroups })
  );

  await page.route('**/workspaces/check', (route: Route) =>
    route.fulfill({ status: 200, json: { available: override.titleAvailable ?? true } })
  );

  // Backend pre-flight: allowed unless the test supplies a denial reason.
  await page.route('**/workspaces/check-create', (route: Route) =>
    route.fulfill({
      status: 200,
      json: override.createCheckReason
        ? { canCreate: false, reason: override.createCheckReason }
        : { canCreate: true }
    })
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

  await page.getByRole('combobox', { name: 'Dataset Selection' }).click();
  await page.getByRole('option', { name: /Downtown Sidewalks/ }).click();

  await expect(page.getByRole('button', { name: 'Create Workspace' })).toBeEnabled();
}

test.describe('create workspace from TDEI', () => {
  test('dataset picker is accessible and requests all datasets', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await stubHappyPath(page);

    let listRequestUrl = '';
    await page.route('**/tdei/datasets**', (route) => {
      const url = new URL(route.request().url());
      if (!url.searchParams.has('tdei_dataset_id')) {
        listRequestUrl = url.toString();
      }
      return route.fulfill({ json: [TDEI_DATASET] });
    });

    await page.goto('/workspace/create/tdei');

    const datasetPicker = page.getByRole('combobox', { name: 'Dataset Selection' });
    await expect(datasetPicker).toHaveAttribute('required', '');
    await datasetPicker.click();
    await expect(page.getByRole('option', { name: /Downtown Sidewalks/ })).toBeVisible();
    await expect.poll(() => listRequestUrl
      ? new URL(listRequestUrl).searchParams.get('status')
      : null).toBe('All');

    await datasetPicker.press('ArrowDown');
    await expect(datasetPicker).toHaveAttribute('aria-activedescendant', /-option-0$/);
  });

  test('valid submit shows that workspace creation was initiated', async ({ page }) => {
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

    await expect(page.getByRole('button', { name: 'Initiating...' })).toBeDisabled();

    releaseCreate();

    const confirmation = page.getByRole('dialog');
    await expect(confirmation).toContainText('Workspace creation initiated');
    await expect(confirmation).toContainText('Use the Refresh button');
    await expect(page.getByRole('link', { name: 'Go to Dashboard' }))
      .toHaveAttribute('href', `/dashboard?workspace=${NEW_WORKSPACE_ID}`);
  });

  test('warns when the title already exists in the selected project group', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await stubHappyPath(page, { titleAvailable: false });

    await page.goto('/workspace/create/tdei');
    await fillForm(page);

    await expect(page.getByRole('alert')).toContainText(
      'A workspace with this title already exists in the selected project group.'
    );
    await expect(page.getByRole('button', { name: 'Create Workspace' })).toBeEnabled();
  });

  test('blocks creation and shows the reason when the backend pre-check says no', async ({ page }) => {
    await seedAuthenticatedSession(page);
    const reason = 'User does not have permissions to create a workspace of that type in that project group.';
    await stubHappyPath(page, { createCheckReason: reason });

    await page.goto('/workspace/create/tdei');
    const pgInput = page.locator('#create_tdei_project_group');
    await pgInput.click();
    await page.getByRole('listitem').filter({ hasText: 'Puget Sound' }).first().click();
    await page.getByRole('combobox', { name: 'Dataset Selection' }).click();
    await page.getByRole('option', { name: /Downtown Sidewalks/ }).click();

    await expect(page.getByRole('alert')).toContainText(reason);
    await expect(page.getByRole('button', { name: 'Create Workspace' })).toBeDisabled();
  });

  test('a failed backend pre-check does not block creation', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await stubHappyPath(page);
    await page.route('**/workspaces/check-create', (route: Route) =>
      route.fulfill({ status: 502, body: 'TDEI unreachable' })
    );

    await page.goto('/workspace/create/tdei');
    await fillForm(page);
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
    const contract = recordContract(page, { ignoredPaths: ['workspaces/check', 'workspaces/check-create'] });

    await page.goto('/workspace/create/tdei');
    await fillForm(page);
    await page.getByRole('button', { name: 'Create Workspace' }).click();

    await expect(page.getByRole('dialog')).toContainText('Workspace creation initiated');

    expect(contract.violations()).toEqual([]);
  });

  test('Case 1: blocks creation from unreleased dataset when user is not POC/DG in that project group', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await stubHappyPath(page);

    const PG_A = '11111111-1111-1111-1111-111111111111';
    const PG_B = '22222222-2222-2222-2222-222222222222';

    await page.route('**/tdei-user/project-group-roles/**', (route: Route) =>
      route.fulfill({
        json: [
          { tdei_project_group_id: PG_A, project_group_name: 'Group A', roles: ['member'] },
          { tdei_project_group_id: PG_B, project_group_name: 'Group B', roles: ['poc'] }
        ]
      })
    );

    const unreleasedDataset = {
      ...TDEI_DATASET,
      tdei_dataset_id: 'unreleased-dx',
      status: 'Pre-Release',
      project_group: { tdei_project_group_id: PG_A, name: 'Group A' }
    };

    await page.route('**/tdei/datasets**', (route: Route) =>
      route.fulfill({ json: [unreleasedDataset] })
    );

    await page.goto('/workspace/create/tdei?tdeiRecordId=unreleased-dx');

    await expect(page.getByRole('alert')).toContainText(
      'You do not have permission to create a workspace from an unreleased dataset in this project group.'
    );
    await expect(page.getByRole('button', { name: 'Create Workspace' })).toBeDisabled();
  });

  test('Case 2: redirects to dashboard when user has only member role across all project groups', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await stubHappyPath(page);

    await page.route('**/tdei-user/project-group-roles/**', (route: Route) =>
      route.fulfill({
        json: [
          { tdei_project_group_id: 'pg-1', project_group_name: 'Group 1', roles: ['member'] },
          { tdei_project_group_id: 'pg-2', project_group_name: 'Group 2', roles: ['member'] }
        ]
      })
    );

    await page.goto('/workspace/create/tdei');
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('Case 3: defaults to eligible project group when opening a released dataset', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await stubHappyPath(page);

    const PG_A = '11111111-1111-1111-1111-111111111111';
    const PG_B = '22222222-2222-2222-2222-222222222222';

    await page.route('**/tdei-user/project-group-roles/**', (route: Route) =>
      route.fulfill({
        json: [
          { tdei_project_group_id: PG_A, project_group_name: 'Group A', roles: ['member'] },
          { tdei_project_group_id: PG_B, project_group_name: 'Group B', roles: ['poc'] }
        ]
      })
    );

    const releasedDataset = {
      ...TDEI_DATASET,
      tdei_dataset_id: 'released-dy',
      status: 'Publish',
      project_group: { tdei_project_group_id: PG_A, name: 'Group A' }
    };

    await page.route('**/tdei/datasets**', (route: Route) =>
      route.fulfill({ json: [releasedDataset] })
    );

    await page.goto('/workspace/create/tdei?tdeiRecordId=released-dy');

    // Group B should be automatically selected because user is POC in Group B (only member in Group A)
    const pgInput = page.locator('#create_tdei_project_group');
    await expect(pgInput).toHaveValue('Group B');
    await expect(page.getByRole('button', { name: 'Create Workspace' })).toBeEnabled();
  });

  test('blocks creation when user only has data generator role for a different data type', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await stubHappyPath(page);

    const PG_A = '11111111-1111-1111-1111-111111111111';

    // User only has pathways_data_generator, but dataset is OSW
    await page.route('**/tdei-user/project-group-roles/**', (route: Route) =>
      route.fulfill({
        json: [
          { tdei_project_group_id: PG_A, project_group_name: 'Group A', roles: ['pathways_data_generator'] }
        ]
      })
    );

    const unreleasedOsw = {
      ...TDEI_DATASET,
      tdei_dataset_id: 'unreleased-osw',
      status: 'Draft',
      data_type: 'osw',
      project_group: { tdei_project_group_id: PG_A, name: 'Group A' }
    };

    await page.route('**/tdei/datasets**', (route: Route) =>
      route.fulfill({ json: [unreleasedOsw] })
    );

    await page.goto('/workspace/create/tdei?tdeiRecordId=unreleased-osw');

    await expect(
      page.getByText('You do not have permission to create a workspace from an unreleased dataset in this project group.')
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create Workspace' })).toBeDisabled();
  });
});
