import { test, expect } from './fixtures';
import { myWorkspaces } from '../mocks/fixtures';

test.describe('app smoke', () => {
  test('redirects an unauthenticated visitor to the signin page', async ({ page }) => {
    // /dashboard is not in auth.global.ts's ALLOW_ANONYMOUS set, so an
    // unauthenticated visit bounces to /signin.
    await page.goto('/dashboard');

    await expect(page).toHaveURL(/\/signin/);
    await expect(page.getByRole('heading', { name: 'Welcome!' })).toBeVisible();
    await expect(page.getByLabel('TDEI Username')).toBeVisible();
  });

  // Proves the shared-fixture stubbing is wired through page.route: the browser
  // hits the (dummy) API host and gets our canned data instead of a real call.
  // This is the seam your authenticated flow tests build on.
  test('serves stubbed API responses from the shared fixtures', async ({ page }) => {
    await page.goto('/signin');

    const workspaces = await page.evaluate(async () => {
      const res = await fetch('http://api.test/workspaces/mine');
      return res.json();
    });

    expect(workspaces).toHaveLength(myWorkspaces.length);
    expect(workspaces[0].title).toBe('Seattle Sidewalks');
  });
});
