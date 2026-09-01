import {
  expect,
  seedAuthenticatedSession,
  seedExpiredSession,
  seedRefreshableExpiredSession,
  test,
} from './fixtures';

function accessToken(): string {
  const body = Buffer.from(JSON.stringify({
    sub: '22222222-2222-2222-2222-222222222222',
    name: 'Tester',
    email: 'tester@example.com'
  })).toString('base64');

  return `header.${body}.signature`;
}

test('shows session recovery before loading a protected page', async ({ page }) => {
  await seedExpiredSession(page);

  await page.goto('/dashboard');

  await expect.poll(() => new URL(page.url()).pathname).toBe('/session-expired');
  expect(new URL(page.url()).searchParams.get('returnTo')).toBe('/dashboard');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Session Expired' })).toBeVisible();

  await page.getByRole('button', { name: 'Logout' }).click();

  await expect(page).toHaveURL(/\/signin/);
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

test('allows a password retry and returns to the protected page', async ({ page }) => {
  await seedExpiredSession(page);
  let authenticationAttempts = 0;
  await page.route('**/authenticate', (route) => {
    authenticationAttempts += 1;

    if (authenticationAttempts === 1) {
      return route.fulfill({ status: 401, body: 'Unauthorized' });
    }

    return route.fulfill({
      json: {
        access_token: accessToken(),
        refresh_token: 'new-refresh-token',
        expires_in: 3_600,
        refresh_expires_in: 7_200
      }
    });
  });
  await page.route('**/workspaces/mine', route => route.fulfill({ json: [] }));
  await page.route('**/project-group-roles/**', route => route.fulfill({ json: [] }));

  await page.goto('/dashboard');
  const password = page.getByRole('textbox', { name: 'Password', exact: true });

  await password.fill('wrong-password');
  await page.getByRole('button', { name: 'Re-Login' }).click();
  await expect(page.getByRole('alert')).toHaveText('Incorrect password. Please try again.');
  await expect(page.getByRole('dialog')).toBeVisible();

  await password.fill('correct-password');
  await page.getByRole('button', { name: 'Re-Login' }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText('No workspaces exist in the selected project group.')).toBeVisible();
  await expect(page.getByRole('dialog')).toBeHidden();
  expect(authenticationAttempts).toBe(2);
});

test('synchronizes logout across open tabs', async ({ page, context }) => {
  await seedAuthenticatedSession(page);
  const otherPage = await context.newPage();
  await seedAuthenticatedSession(otherPage);

  await page.goto('/help');
  await otherPage.goto('/help');
  await expect(otherPage.locator('.user-profile')).toContainText('Tester');

  await page.locator('.user-profile').click();
  await page.locator('.user-dropdown .dropdown-item').filter({ hasText: 'Logout' }).click();

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
  await expect(otherPage.getByRole('button', { name: 'Sign In' })).toHaveCount(0);
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
