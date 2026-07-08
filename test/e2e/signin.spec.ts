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
  // @test e2e: the Sign In button is disabled until both username and password are entered
  test('keeps the Sign In button disabled until both fields are filled', async ({ page }) => {
    await page.goto('/signin');

    const submit = page.getByRole('button', { name: 'Sign In' });
    await expect(submit).toBeDisabled();

    await page.getByLabel('TDEI Username').fill('tester');
    await expect(submit).toBeDisabled();

    await page.locator('#password').fill('hunter2');
    await expect(submit).toBeEnabled();
  });

  // @test e2e: invalid credentials (401) surface "Incorrect TDEI username/password."
  test('shows an error message when credentials are rejected', async ({ page }) => {
    // The form POSTs to the TDEI gateway's `authenticate` endpoint; stub a 401.
    await page.route('**/authenticate', route => route.fulfill({ status: 401 }));

    await page.goto('/signin');
    await page.getByLabel('TDEI Username').fill('tester');
    await page.locator('#password').fill('wrong-password');
    await page.getByRole('button', { name: 'Sign In' }).click();

    await expect(page.getByText('Incorrect TDEI username/password.')).toBeVisible();
  });

  // @test e2e: the show/hide toggle switches the password field between hidden and visible text
  test('toggles password visibility', async ({ page }) => {
    await page.goto('/signin');

    const password = page.locator('#password');
    await expect(password).toHaveAttribute('type', 'password');

    await page.getByRole('button', { name: 'Show password' }).click();
    await expect(password).toHaveAttribute('type', 'text');

    await page.getByRole('button', { name: 'Hide password' }).click();
    await expect(password).toHaveAttribute('type', 'password');
  });
});
