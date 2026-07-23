import { test as base, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { myWorkspaces, USER_ID, TEST_API_BASE } from '../mocks/fixtures';

// The display name shown in the navbar for the seeded session.
export const TEST_USER = { subject: USER_ID, displayName: 'Tester' };

// Seeds a valid TDEI session into localStorage before any app code runs, so
// services/index.ts constructs tdeiAuth in an authenticated state. Far-future
// expiries keep the token "valid" and avoid any auto-refresh network call.
export async function seedAuthenticatedSession(page: Page) {
  await page.addInitScript((user) => {
    localStorage.setItem('tdei-auth', JSON.stringify({
      username: 'tester',
      subject: user.subject,
      email: 'tester@example.com',
      displayName: user.displayName,
      accessToken: 'fake-access-token',
      refreshToken: 'fake-refresh-token',
      expiresAt: '2099-01-01T00:00:00.000Z',
      refreshExpiresAt: '2099-01-01T00:00:00.000Z'
    }));
  }, TEST_USER);
}

// Pre-selects a project group in sessionStorage so dashboard.vue's
// getLastProjectGroupId() restores it on load (the dashboard reads this
// synchronously during setup).
export async function seedProjectGroupSelection(page: Page, group: { id: string; name: string }) {
  await page.addInitScript((g) => {
    sessionStorage.setItem('tdei-selected-project-group', JSON.stringify(g));
  }, group);
}

// Playwright test fixture that stubs the API in the browser, reusing the same
// canned data as the Vitest MSW handlers (test/mocks/fixtures.ts). This keeps a
// single source of truth for response payloads across both test layers.
//
// We use page.route() rather than running MSW's browser worker so no test-only
// code has to ship in the app bundle. If you later want literal MSW handler
// reuse in the browser, add `playwright-msw` or start the MSW worker behind a
// test flag.
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.route(`${TEST_API_BASE}workspaces/mine`, route =>
      route.fulfill({ json: myWorkspaces })
    );

    // Add further stubs here as flows need them, e.g.:
    // await page.route(`${TEST_API_BASE}workspaces/ws-1`, route => route.fulfill({ json: ... }))

    await use(page);
  }
});

export { expect };
