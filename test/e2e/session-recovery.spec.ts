import {
  expect,
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
