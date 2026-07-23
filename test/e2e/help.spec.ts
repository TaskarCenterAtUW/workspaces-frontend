import { test, expect } from './fixtures';

// Generated from the @test outline in pages/help.vue.
// NOTE: app-icon renders material-icon *ligature text* (e.g. "menu_book") into
// the accessible name, so we match headings by regex and target the action
// links by their href rather than by exact accessible name.
test.describe('help page', () => {
  // @test e2e: the page renders with two sections that have buttons to off-site resources
  test('renders two resource sections, each with a button', async ({ page }) => {
    await page.goto('/help');

    await expect(page.getByRole('heading', { name: /Documentation/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Contact Support/ })).toBeVisible();

    await expect(page.locator('.card a.btn')).toHaveCount(2);
  });

  // @test e2e: the two buttons on this page link to offsite resources and/or a mailto:// link
  test('buttons link to the external guide (new tab) and a mailto address', async ({ page }) => {
    await page.goto('/help');

    const guide = page.locator('a[href="https://taskarcenteratuw.github.io/tcat-wiki/workspaces/"]');
    await expect(guide).toBeVisible();
    await expect(guide).toHaveAttribute('target', '_blank');

    const support = page.locator('a[href="mailto:helpdesk@tdei.us"]');
    await expect(support).toBeVisible();
  });
});
