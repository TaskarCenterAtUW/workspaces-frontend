import { test, expect, seedAuthenticatedSession } from './fixtures';
import { recordContract } from './contract';
import { aWorkspace } from '../mocks/fixtures';

// Real e2e spec generated from the @test outline in pages/workspace/[id]/settings.vue.
//
// Routing: there is exactly one settings child route — pages/.../settings/index.vue —
// and it renders ALL FOUR panels stacked together:
//   <settings-panel-general/> <settings-panel-apps/> <settings-panel-imagery/> <settings-panel-delete/>
// (the Nav links — General "", Members "/members", Teams "/teams" — only point at
// those, and General has no sub-path; Apps/Imagery/Delete are not separate routes).
// So every test below navigates to /workspace/1/settings and scopes to the panel
// card it cares about.
//
// settings.vue does a top-level `await workspacesClient.getWorkspace(1)` and
// provide('workspace', ...). The panels additionally fetch on load:
//   - Apps.vue: await getLongFormQuestSettings(1)  -> GET workspaces/1/quests/long/settings
//   - Imagery.vue: onMounted getImagerySettings(1) -> GET workspaces/1/imagery/settings
// All of these must be stubbed or the page 500s.
//
// CONVENTION: tests are written to the @test outline (intended behavior), not to
// the current code. Where the implementation diverges the test is left to FAIL
// (red), documenting the bug. Divergences are called out at each test.

type Page = import('@playwright/test').Page;

// A WorkspaceImagery (the GET imagery/settings response) with no custom list yet.
const emptyImagerySettings = {
  workspace_id: 1,
  definition: null,
  modifiedAt: '2026-01-15T12:00:00.000Z',
  modifiedBy: aWorkspace.createdBy,
  modifiedByName: 'Ada Lovelace'
};

// A QuestSettingsResponse (GET quests/long/settings) with nothing configured.
const emptyQuestSettings = {
  workspace_id: 1,
  type: 'NONE',
  definition: null,
  url: null,
  modified_at: '2026-01-15T12:00:00.000Z',
  modified_by: aWorkspace.createdBy,
  modified_by_name: 'Ada Lovelace'
};

// A minimal JSON Schema served at VITE_IMAGERY_SCHEMA (http://api.test/imagery-schema.json).
// util/schema.validateJson fetches this URL and compiles it with ajv. We control
// its content here; the sample below validates against it.
const imagerySchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'array',
  items: {
    type: 'object',
    required: ['id', 'name', 'type', 'url'],
    properties: {
      id: { type: 'string' },
      name: { type: 'string' },
      type: { type: 'string', enum: ['tms', 'wmts', 'xyz'] },
      url: { type: 'string' }
    }
  }
};

// A valid imagery definition (an array, matching ImagerySettingsPatch.definition).
const validImageryDef = [
  {
    id: 'example-source',
    name: 'Example Source',
    type: 'tms',
    url: 'https://tiles.example.com/{z}/{x}/{y}.png'
  }
];

// Stub everything the settings page touches on load so it renders without 500s.
async function stubSettings(page: Page) {
  await page.route('**/workspaces/1', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ json: aWorkspace });
    }
    return route.fallback();
  });
  await page.route('**/workspaces/1/quests/long/settings', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ json: emptyQuestSettings });
    }
    return route.fallback();
  });
  await page.route('**/workspaces/1/imagery/settings', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ json: emptyImagerySettings });
    }
    return route.fallback();
  });
  await page.route('**/imagery-schema.json', route =>
    route.fulfill({ json: imagerySchema })
  );
}

// vue3-toastify renders each toast as role="alert" with a variant class.
function successToast(page: Page) {
  return page.locator('.Toastify__toast--success');
}
function errorToast(page: Page) {
  return page.locator('.Toastify__toast--error');
}

test.describe('workspace settings', () => {
  // @test e2e: the workspace can be renamed with the "Workspace Title" field, then clicking "Rename";
  //            on success a success toast appears (snapshot the success state).
  test('renames the workspace and shows a success toast', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await stubSettings(page);

    let patchBody: unknown = null;
    await page.route('**/workspaces/1', (route) => {
      const req = route.request();
      if (req.method() === 'PATCH') {
        patchBody = JSON.parse(req.postData() ?? '{}');
        return route.fulfill({ status: 204, body: '' });
      }
      return route.fallback();
    });

    await page.goto('/workspace/1/settings');

    const general = page.locator('section.card').first();
    const titleField = general.getByLabel('Workspace Title');
    await expect(titleField).toHaveValue(aWorkspace.title);
    await titleField.fill('Renamed Workspace');
    await general.getByRole('button', { name: 'Rename' }).click();

    await expect(successToast(page)).toBeVisible();
    await expect(successToast(page)).toContainText('Workspace renamed successfully.');
    expect(patchBody).toEqual({ title: 'Renamed Workspace' });
  });

  // @test e2e: on error an error toast appears (snapshot the error state). [General form]
  test('shows an error toast when renaming fails', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await stubSettings(page);

    await page.route('**/workspaces/1', (route) => {
      if (route.request().method() === 'PATCH') {
        return route.fulfill({ status: 500, body: 'boom' });
      }
      return route.fallback();
    });

    await page.goto('/workspace/1/settings');

    const general = page.locator('section.card').first();
    await general.getByLabel('Workspace Title').fill('Renamed Workspace');
    await general.getByRole('button', { name: 'Rename' }).click();

    await expect(errorToast(page)).toBeVisible();
    await expect(errorToast(page)).toContainText(/Rename failed/i);
  });

  // @test e2e: Under "External Apps", turning OFF "Publish this workspace" disables the other
  //            buttons and when clicking "Save" shows a confirmation and sends the proper API call.
  test('unpublishing disables app controls, saves, and confirms', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await stubSettings(page);

    let patchBody: unknown = null;
    await page.route('**/workspaces/1', (route) => {
      const req = route.request();
      if (req.method() === 'GET') {
        // Apps.vue binds the checkbox with :true-value="1"; seed externalAppAccess
        // as 1 (published) so it renders checked, matching the true-value.
        return route.fulfill({ json: { ...aWorkspace, externalAppAccess: 1 } });
      }
      if (req.method() === 'PATCH') {
        patchBody = JSON.parse(req.postData() ?? '{}');
        return route.fulfill({ status: 204, body: '' });
      }
      return route.fallback();
    });
    await page.route('**/workspaces/1/quests/long/settings', (route) => {
      if (route.request().method() === 'PATCH') {
        return route.fulfill({ status: 204, body: '' });
      }
      return route.fallback();
    });

    await page.goto('/workspace/1/settings');

    const apps = page.locator('form.card', { hasText: 'External Apps' });
    const publish = apps.getByLabel(/Publish this workspace/i);
    // externalAppAccess === 1 (published, matching true-value), so it starts checked.
    await expect(publish).toBeChecked();

    await publish.uncheck();

    // Outline: turning OFF disables the other (quest-definition) controls.
    await expect(apps.getByLabel('Define quests in Workspaces')).toBeDisabled();
    await expect(apps.getByLabel('Load quest definitions from an external URL')).toBeDisabled();

    await apps.getByRole('button', { name: 'Save' }).click();

    // Outline: a confirmation is shown (the page renders a success toast).
    await expect(successToast(page)).toBeVisible();
    // Proper API call: PATCH workspaces/1 with externalAppAccess set to 0 (off).
    expect(patchBody).toEqual({ externalAppAccess: 0 });
  });

  // @test e2e: Under "External Apps", turning ON "Publish this workspace" enables the other
  //            buttons and when clicking "Save" shows a confirmation and sends the proper API call.
  test('publishing enables app controls, saves, and confirms', async ({ page }) => {
    await seedAuthenticatedSession(page);
    let patchBody: unknown = null;
    // Start from an UNpublished workspace so we can toggle it on.
    await page.route('**/workspaces/1', (route) => {
      const req = route.request();
      if (req.method() === 'GET') {
        return route.fulfill({ json: { ...aWorkspace, externalAppAccess: 0 } });
      }
      if (req.method() === 'PATCH') {
        patchBody = JSON.parse(req.postData() ?? '{}');
        return route.fulfill({ status: 204, body: '' });
      }
      return route.fallback();
    });
    await page.route('**/workspaces/1/quests/long/settings', (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({ json: emptyQuestSettings });
      }
      return route.fulfill({ status: 204, body: '' });
    });
    await page.route('**/workspaces/1/imagery/settings', route =>
      route.fulfill({ json: emptyImagerySettings })
    );
    await page.route('**/imagery-schema.json', route =>
      route.fulfill({ json: imagerySchema })
    );

    await page.goto('/workspace/1/settings');

    const apps = page.locator('form.card', { hasText: 'External Apps' });
    const publish = apps.getByLabel(/Publish this workspace/i);
    await expect(publish).not.toBeChecked();

    await publish.check();

    // Outline: turning ON enables the other controls.
    await expect(apps.getByLabel('Define quests in Workspaces')).toBeEnabled();
    await expect(apps.getByLabel('Load quest definitions from an external URL')).toBeEnabled();

    await apps.getByRole('button', { name: 'Save' }).click();

    await expect(successToast(page)).toBeVisible();
    // Proper API call: externalAppAccess turned on (enabled === 1).
    expect(patchBody).toEqual({ externalAppAccess: 1 });
  });

  // @test e2e: the "Custom Imagery" box is validated against the JSON schema, and a toast shown
  //            when it passes and the API call to set its value is successful on the backend.
  test('validates custom imagery JSON and toasts on success', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await stubSettings(page);

    let imageryPatch: unknown = null;
    await page.route('**/workspaces/1/imagery/settings', (route) => {
      const req = route.request();
      if (req.method() === 'GET') {
        return route.fulfill({ json: emptyImagerySettings });
      }
      if (req.method() === 'PATCH') {
        imageryPatch = JSON.parse(req.postData() ?? '{}');
        return route.fulfill({ status: 204, body: '' });
      }
      return route.fallback();
    });

    await page.goto('/workspace/1/settings');

    const imagery = page.locator('form.card', { hasText: 'Custom Imagery' });
    await imagery.getByLabel('Imagery JSON Definition').fill(JSON.stringify(validImageryDef));
    await imagery.getByRole('button', { name: 'Save' }).click();

    // Outline: a toast is shown when validation passes and the save succeeds.
    await expect(successToast(page)).toBeVisible();
    // Proper API call: PATCH imagery/settings with the parsed definition array.
    expect(imageryPatch).toEqual({ definition: validImageryDef });
  });

  // @test e2e: Clicking "I understand and want to delete this workspace" shows a modal that
  //            requires the user to type "delete" to confirm, and when confirmed sends the
  //            proper API call and redirects to the dashboard.
  test('deletes the workspace after typing "delete" and redirects', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await stubSettings(page);

    let deleteCalled = false;
    await page.route('**/workspaces/1', (route) => {
      if (route.request().method() === 'DELETE') {
        deleteCalled = true;
        return route.fulfill({ status: 204, body: '' });
      }
      return route.fallback();
    });
    // deleteWorkspace also calls the OSM API (osmClient.deleteWorkspace).
    await page.route('**/osm/**', route => route.fulfill({ status: 204, body: '' }));

    await page.goto('/workspace/1/settings');

    const del = page.locator('div.card', { hasText: 'Delete Workspace' });
    await del.getByRole('button', { name: /^I understand/ }).click();

    // The confirmation requires typing the literal word "delete".
    const confirmField = del.getByRole('textbox');
    await confirmField.fill('delete');
    await del.getByRole('button', { name: 'Delete this workspace', exact: true }).click();

    await expect.poll(() => deleteCalled).toBe(true);
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  // @test e2e: validate that all the API calls used on this page match the Swagger spec and that
  //            success and error states are handled properly with toasts (snapshot these).
  test('all API calls conform to the OpenAPI spec', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await stubSettings(page);

    const contract = recordContract(page);

    // Drive the page through the write flows so their requests are recorded too.
    await page.route('**/workspaces/1', (route) => {
      const m = route.request().method();
      if (m === 'PATCH') {
        return route.fulfill({ status: 204, body: '' });
      }
      if (m === 'DELETE') {
        return route.fulfill({ status: 204, body: '' });
      }
      return route.fallback();
    });
    await page.route('**/workspaces/1/imagery/settings', (route) => {
      if (route.request().method() === 'PATCH') {
        return route.fulfill({ status: 204, body: '' });
      }
      return route.fallback();
    });
    await page.route('**/workspaces/1/quests/long/settings', (route) => {
      if (route.request().method() === 'PATCH') {
        return route.fulfill({ status: 204, body: '' });
      }
      return route.fallback();
    });

    await page.goto('/workspace/1/settings');

    // Rename (PATCH workspaces/1 -> WorkspacePatch { title }).
    const general = page.locator('section.card').first();
    await general.getByLabel('Workspace Title').fill('Renamed Workspace');
    await general.getByRole('button', { name: 'Rename' }).click();
    await expect(successToast(page)).toBeVisible();

    // External apps save (PATCH workspaces/1 + PATCH quests/long/settings).
    const apps = page.locator('form.card', { hasText: 'External Apps' });
    await apps.getByLabel(/Publish this workspace/i).uncheck();
    await apps.getByRole('button', { name: 'Save' }).click();

    // Imagery save (PATCH imagery/settings -> ImagerySettingsPatch { definition }).
    const imagery = page.locator('form.card', { hasText: 'Custom Imagery' });
    await imagery.getByLabel('Imagery JSON Definition').fill(JSON.stringify(validImageryDef));
    await imagery.getByRole('button', { name: 'Save' }).click();

    await expect.poll(() => contract.violations()).toEqual([]);
  });
});
