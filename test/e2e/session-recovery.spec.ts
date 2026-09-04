import {
  expect,
  seedAuthenticatedSession,
  seedExpiredSession,
  seedRefreshableExpiredSession,
  test,
} from './fixtures';

test('shows session recovery before loading a protected page', async ({ page }) => {
  await seedExpiredSession(page);
  await page.route('**/sso-logout**', route => route.abort());

  await page.goto('/dashboard');

  await expect.poll(() => new URL(page.url()).pathname).toBe('/session-expired');
  expect(new URL(page.url()).searchParams.get('returnTo')).toBe('/dashboard');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Session Expired' })).toBeVisible();

  const logoutRequest = page.waitForRequest('**/sso-logout**');
  await page.getByRole('button', { name: 'Logout' }).click({ noWaitAfter: true });

  const logoutUrl = new URL((await logoutRequest).url());
  expect(logoutUrl.searchParams.get('redirect_uri'))
    .toBe('http://localhost:3000/logout/callback');
});

test('shows session recovery when the server rejects the refresh token', async ({ page }) => {
  await seedRefreshableExpiredSession(page);
  await page.route('**/refresh-token', route => route.fulfill({
    status: 401,
    body: 'Unauthorized'
  }));

  await page.goto('/dashboard');

  await expect.poll(() => new URL(page.url()).pathname).toBe('/session-expired');
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('starts SSO recovery and preserves the protected return route', async ({ page }) => {
  await seedExpiredSession(page);
  await page.route('**/sso-redirect**', route => route.abort());

  await page.goto('/dashboard');
  await expect(page.getByRole('dialog')).toBeVisible();

  const ssoRequest = page.waitForRequest('**/sso-redirect**');
  await page.getByRole('button', { name: 'TDEI Login' }).click({ noWaitAfter: true });

  const requestUrl = new URL((await ssoRequest).url());
  expect(requestUrl.searchParams.get('redirect_uri'))
    .toBe('http://localhost:3000/auth/callback');
  expect(await page.evaluate(() => sessionStorage.getItem('tdei-sso-return-to')))
    .toBe('/dashboard');
});

test('synchronizes logout across open tabs', async ({ page, context }) => {
  await seedAuthenticatedSession(page);
  const otherPage = await context.newPage();
  await seedAuthenticatedSession(otherPage);

  await page.goto('/help');
  await otherPage.goto('/help');
  await expect(otherPage.locator('.user-profile')).toContainText('Tester');
  await page.route('**/sso-logout**', route => route.abort());

  await page.locator('.user-profile').click();
  await page.locator('.user-dropdown .dropdown-item')
    .filter({ hasText: 'Logout' })
    .click({ noWaitAfter: true });

  await expect(otherPage).toHaveURL(/\/signin$/);
  await expect(otherPage.locator('.user-profile')).toHaveCount(0);
});

test('redirects an open sign-in tab after another tab signs in', async ({ page, context }) => {
  const otherPage = await context.newPage();
  await otherPage.route('**/workspaces/mine', route => route.fulfill({ json: [] }));
  await otherPage.route('**/project-group-roles/**', route => route.fulfill({ json: [] }));

  await page.goto('/signin');
  await otherPage.goto('/signin');

  await page.evaluate(() => {
    localStorage.setItem('tdei-auth', JSON.stringify({
      username: 'tester',
      subject: '22222222-2222-2222-2222-222222222222',
      email: 'tester@example.com',
      displayName: 'Tester',
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      refreshExpiresAt: new Date(Date.now() + 7_200_000).toISOString()
    }));
  });

  await expect(otherPage).toHaveURL(/\/dashboard$/);
  await expect(otherPage.locator('.user-profile')).toContainText('Tester');
  await expect(otherPage.getByRole('button', { name: 'TDEI Login' })).toHaveCount(0);
});

test('synchronizes renewed credentials and recoverable expiry across open tabs', async ({ page, context }) => {
  await seedAuthenticatedSession(page);
  const otherPage = await context.newPage();
  await seedAuthenticatedSession(otherPage);

  await page.goto('/help');
  await otherPage.goto('/workspace/create');

  await page.evaluate(() => {
    localStorage.setItem('tdei-auth', JSON.stringify({ username: 'tester' }));
  });

  await expect(otherPage).toHaveURL(/\/session-expired\?returnTo=\/workspace\/create$/);
  await expect(otherPage.getByRole('dialog', { name: 'Session Expired' })).toBeVisible();

  await page.evaluate(() => {
    localStorage.setItem('tdei-auth', JSON.stringify({
      username: 'tester',
      subject: '22222222-2222-2222-2222-222222222222',
      email: 'tester@example.com',
      displayName: 'Renewed Tester',
      accessToken: 'renewed-access-token',
      refreshToken: 'renewed-refresh-token',
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      refreshExpiresAt: new Date(Date.now() + 7_200_000).toISOString()
    }));
  });

  await expect(otherPage).toHaveURL(/\/workspace\/create$/);
  await expect(otherPage.getByRole('dialog', { name: 'Session Expired' })).toBeHidden();
  await expect(otherPage.locator('.user-profile')).toContainText('Renewed Tester');
});
