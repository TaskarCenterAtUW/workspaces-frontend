import { test, expect } from './fixtures';
import { myWorkspaces } from '../mocks/fixtures';

test.describe('app smoke', () => {
  test('starts SSO for an unauthenticated protected route', async ({ page }) => {
    await page.route('**/tdei/sso-redirect**', route => route.abort());
    const ssoRequest = page.waitForRequest('**/tdei/sso-redirect**');

    await page.goto('/dashboard').catch(() => undefined);

    const requestUrl = new URL((await ssoRequest).url());
    expect(requestUrl.searchParams.get('redirect_uri'))
      .toBe('http://localhost:3000/auth/callback');
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
