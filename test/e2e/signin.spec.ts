import { test, expect, seedAuthenticatedSession } from './fixtures';
import { recordContract } from './contract';

// @test e2e: validate that all the API calls used on this page match the Swagger spec
test('makes no new-API calls that violate the OpenAPI spec', async ({ page }) => {
  const contract = recordContract(page);
  await page.goto('/signin');
  await expect(page.getByRole('heading', { name: 'Welcome!' })).toBeVisible();
  expect(contract.violations()).toEqual([]);
});

// --- from pages/signin.vue --------------------------------------------------
// @test e2e: an already-authenticated visitor is redirected from /signin to /dashboard
test('redirects an already-authenticated visitor from /signin to /dashboard', async ({ page }) => {
  await seedAuthenticatedSession(page);

  await page.goto('/signin');

  await expect(page).toHaveURL(/\/dashboard/);
});

// @test e2e: an unauthenticated user is shown the sign-in form when visiting /signin
//            -- with a playwright snapshot of the form
test('shows the sign-in form to an unauthenticated visitor', async ({ page }) => {
  await page.goto('/signin');

  const form = page.locator('.signin-card');
  await expect(form).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Welcome!' })).toBeVisible();

  // Snapshot just the form card (full-page would include the background image /
  // fonts and be needlessly brittle). ARIA snapshot (text-based) so the baseline
  // is cross-platform stable; regenerate with `--update-snapshots`. Pixel
  // screenshots need a per-OS baseline and break on Linux CI.
  await expect(form).toMatchAriaSnapshot();
});

// @test e2e: the toolbar doesn't show a username when the user is not logged in,
//            and does when the user is logged in
test('shows the username in the toolbar only when logged in', async ({ page }) => {
  // Logged out: the navbar's user menu (AppNavbar.vue, v-if="auth.ok") is absent.
  await page.goto('/signin');
  await expect(page.locator('.user-profile')).toHaveCount(0);

  // Logged in: seed a session, then the user menu shows the display name. We
  // land on /help (not /dashboard) because the navbar renders on every page and
  // /help makes no API calls — so this test isn't coupled to stubbing the whole
  // dashboard. A dashboard flow test would stub those endpoints in fixtures.ts.
  await seedAuthenticatedSession(page);
  await page.goto('/help');

  const userMenu = page.locator('.user-profile');
  await expect(userMenu).toBeVisible();
  await expect(userMenu).toContainText('Tester');
});

// --- from components/SigninForm.vue -----------------------------------------
test.describe('signin form', () => {
  // @test e2e: an unauthenticated user starts TDEI SSO from the TDEI Login button
  test('starts TDEI SSO from the TDEI Login button', async ({ page }) => {
    await page.route('**/tdei/sso-redirect**', route => route.abort());
    await page.goto('/signin');

    await expect(page.getByLabel('TDEI Username')).toHaveCount(0);
    await expect(page.locator('#password')).toHaveCount(0);

    const ssoRequest = page.waitForRequest('**/tdei/sso-redirect**');
    await page.getByRole('button', { name: 'TDEI Login' }).click({ noWaitAfter: true });

    const requestUrl = new URL((await ssoRequest).url());
    expect(requestUrl.pathname).toBe('/tdei/sso-redirect');
    expect(requestUrl.searchParams.get('redirect_uri'))
      .toBe('http://localhost:3000/auth/callback');
  });

  // @test e2e: registration and password recovery link back to the configured TDEI Portal pages
  test('links to the TDEI Portal account pages', async ({ page }) => {
    await page.goto('/signin');

    await expect(page.getByRole('link', { name: 'Register Now', exact: true }))
      .toHaveAttribute('href', 'https://portal.test/register');
    await expect(page.getByRole('link', { name: 'Forgot Password?', exact: true }))
      .toHaveAttribute('href', 'https://portal.test/ForgotPassword');
  });
});
