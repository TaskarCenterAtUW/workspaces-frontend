import { test, expect, seedAuthenticatedSession } from './fixtures';
import { recordContract } from './contract';

// Generated from the @test outline in pages/index.vue.
test.describe('home page', () => {
  // @test e2e: validate that all the API calls used on this page match the Swagger spec
  test('makes no new-API calls that violate the OpenAPI spec', async ({ page }) => {
    const contract = recordContract(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'TDEI Workspaces' })).toBeVisible();
    expect(contract.violations()).toEqual([]);
  });

  // @test e2e: an unauthenticated user is shown the hero image with a sign-in link -- snapshot this
  test('shows the hero with a Sign In link for an unauthenticated visitor', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'TDEI Workspaces' })).toBeVisible();
    const cta = page.getByRole('link', { name: 'Sign In' });
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute('href', '/signin');

    // Snapshot the hero copy block (not the full page) to avoid the background
    // image. ARIA snapshot (text-based) so the baseline is cross-platform stable
    // — pixel screenshots need a per-OS baseline and break on Linux CI.
    await expect(page.locator('.hero-copy')).toMatchAriaSnapshot();
  });

  // @test e2e: an already-authenticated visitor is shown the hero, but the CTA points to the
  //            dashboard and the header shows the user is logged in.
  // NOTE: the outline flags a possible "sign-in link" bug (FIXME?) — actual behavior is a
  //       "Go to Dashboard" link, which is what this test asserts.
  test('shows a Go to Dashboard CTA and the username for an authenticated visitor', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await page.goto('/');

    const cta = page.getByRole('link', { name: 'Go to Dashboard' });
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute('href', '/dashboard');

    await expect(page.locator('.user-profile')).toContainText('Tester');
  });

  // @test e2e: the toolbar doesn't show a username when logged out, and does when logged in
  test('shows the username in the toolbar only when logged in', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.user-profile')).toHaveCount(0);

    await seedAuthenticatedSession(page);
    await page.goto('/');
    await expect(page.locator('.user-profile')).toBeVisible();
    await expect(page.locator('.user-profile')).toContainText('Tester');
  });
});
