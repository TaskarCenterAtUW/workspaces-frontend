import { test, expect, seedAuthenticatedSession } from './fixtures';
import { projectGroups, TEST_API_BASE } from '../mocks/fixtures';

// Generated from the @test outline in error.vue (the app's error page).
//
// The workspace pages load their workspace through `loadWorkspace`, which turns
// the API's 404 (no such workspace, or one in a project group the user is not
// in) into a fatal "Workspace not found" error that error.vue renders.
//
// Stubs: every API call answers 404 (the workspace isn't there), except the
// TDEI project groups some pages load alongside the workspace, and
// `workspaces/mine`, which the dashboard needs when the user leaves the error.

type Page = import('@playwright/test').Page;

const MISSING_ID = 999;
const NOT_FOUND_TEXT = 'This workspace does not exist or you do not have permission to access it.';

async function stubMissingWorkspace(page: Page) {
  await page.route(`${TEST_API_BASE}**`, route =>
    route.fulfill({ status: 404, json: { detail: `Workspace with id ${MISSING_ID} not found` } })
  );
  await page.route('**/tdei-user/project-group-roles/**', route =>
    route.fulfill({ json: projectGroups })
  );
}

const notFoundHeading = (page: Page) =>
  page.getByRole('heading', { level: 1, name: 'Workspace not found' });

test.describe('Workspace not found', () => {
  const workspacePages = [
    'settings',
    'review',
    'export',
    'export/tdei',
    'merge',
    'projects',
    'projects/5',
    'projects/create'
  ];

  for (const subpath of workspacePages) {
    test(`/workspace/{id}/${subpath} of a workspace the API answers 404 to shows "Workspace not found", not a 500`, async ({ page }) => {
      await seedAuthenticatedSession(page);
      await stubMissingWorkspace(page);

      await page.goto(`/workspace/${MISSING_ID}/${subpath}`);

      await expect(notFoundHeading(page)).toBeVisible();
      await expect(page.getByRole('alert')).toContainText(NOT_FOUND_TEXT);
      // Inside the app's layout, so the navbar is still there to get around.
      await expect(page.getByRole('navigation').first()).toBeVisible();
      await expect(page.getByText('500')).toHaveCount(0);
      await expect(page.getByText(/Internal Server Error/i)).toHaveCount(0);
    });
  }

  test('ARIA snapshot of the "Workspace not found" state', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await stubMissingWorkspace(page);

    await page.goto(`/workspace/${MISSING_ID}/settings`);

    await expect(notFoundHeading(page)).toBeVisible();
    await expect(page.getByRole('alert')).toMatchAriaSnapshot();
  });

  test('a workspace id that is not a number also shows "Workspace not found"', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await stubMissingWorkspace(page);

    await page.goto('/workspace/abc/settings');

    await expect(notFoundHeading(page)).toBeVisible();
    await expect(page.getByRole('alert')).toContainText(NOT_FOUND_TEXT);
  });

  test('"View my workspaces" leaves the error page for the dashboard, which loads the workspaces again', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await stubMissingWorkspace(page);
    // An empty list keeps the dashboard on its empty state, so it mounts no
    // map (maplibre needs WebGL, unreliable headless).
    let workspaceListLoads = 0;
    await page.route(`${TEST_API_BASE}workspaces/mine`, (route) => {
      workspaceListLoads += 1;
      return route.fulfill({ json: [] });
    });

    await page.goto(`/workspace/${MISSING_ID}/settings`);
    await expect(notFoundHeading(page)).toBeVisible();
    const loadsBefore = workspaceListLoads;

    await page.getByRole('link', { name: 'View my workspaces' }).click();

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(notFoundHeading(page)).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'No workspaces yet' })).toBeVisible();
    expect(workspaceListLoads).toBeGreaterThan(loadsBefore);
  });
});

test('an address with no page shows "Page not found"', async ({ page }) => {
  await seedAuthenticatedSession(page);
  await stubMissingWorkspace(page);

  await page.goto('/no-such-page');

  await expect(page.getByRole('heading', { level: 1, name: /Page not found/i })).toBeVisible();
  await expect(page.getByRole('link', { name: 'View my workspaces' })).toBeVisible();
});
