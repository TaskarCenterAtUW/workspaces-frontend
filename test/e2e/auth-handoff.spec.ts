import type { Page, Route } from '@playwright/test';
import { expect, test } from './fixtures';

const DATASET_ID = '55555555-5555-5555-5555-555555555555';
const USER_A_ID = '66666666-6666-6666-6666-666666666666';
const USER_B_ID = '77777777-7777-7777-7777-777777777777';

function jwt(payload: Record<string, unknown>) {
  const encode = (value: object) => Buffer.from(JSON.stringify(value))
    .toString('base64url');

  return `${encode({ alg: 'none' })}.${encode(payload)}.`;
}

function userToken(subject: string, name: string) {
  return jwt({
    sub: subject,
    name,
    email: `${subject}@example.com`,
    preferred_username: subject,
  });
}

async function seedWorkspacesUser(
  page: Page,
  options: { refreshExpired?: boolean } = {},
) {
  await page.addInitScript(({ accessToken, refreshExpired }) => {
    const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    localStorage.setItem('tdei-auth', JSON.stringify({
      username: 'user-a',
      subject: '66666666-6666-6666-6666-666666666666',
      email: 'user-a@example.com',
      displayName: 'User A',
      accessToken,
      refreshToken: 'user-a-refresh-token',
      expiresAt: oneHourFromNow,
      refreshExpiresAt: refreshExpired
        ? '2000-01-01T00:00:00.000Z'
        : oneHourFromNow,
    }));
  }, {
    accessToken: userToken(USER_A_ID, 'User A'),
    refreshExpired: options.refreshExpired ?? false,
  });
}

async function stubDatasetPage(page: Page, accessToken: string) {
  let datasetAuthorization = '';

  await page.route(`**/osm/api/0.6/user/${USER_A_ID}`, route =>
    route.fulfill({ status: 200, body: '' }));
  await page.route(`**/osm/api/0.6/user/${USER_B_ID}`, route =>
    route.fulfill({ status: 200, body: '' }));
  await page.route('**/tdei-user/project-group-roles/**', route =>
    route.fulfill({ json: [] }));
  await page.route('**/tdei/datasets**', (route) => {
    datasetAuthorization = route.request().headers().authorization ?? '';
    return route.fulfill({
      json: [{
        tdei_dataset_id: DATASET_ID,
        data_type: 'osw',
        status: 'Publish',
        metadata: { dataset_detail: { name: 'Bellevue City' } },
        project_group: {
          name: 'Bellevue',
          tdei_project_group_id: '11111111-1111-1111-1111-111111111111',
        },
        service: { name: 'Sidewalks', tdei_service_id: 'service-1' },
      }],
    });
  });

  return async () => expect.poll(() => datasetAuthorization).toBe(`Bearer ${accessToken}`);
}

async function stubSuccessfulExchange(
  page: Page,
  subject = USER_B_ID,
  name = 'User B',
) {
  const accessToken = userToken(subject, name);
  let suppliedRefreshToken = '';

  await page.route('**/tdei/refresh-token', async (route: Route) => {
    suppliedRefreshToken = JSON.parse(route.request().postData() ?? '""');
    return route.fulfill({
      json: {
        access_token: accessToken,
        refresh_token: `${subject}-rotated-refresh-token`,
        expires_in: 300,
        refresh_expires_in: 3600,
      },
    });
  });

  return { accessToken, suppliedRefreshToken: () => suppliedRefreshToken };
}

function handoffUrl(refreshToken: string) {
  const fragment = new URLSearchParams({ refreshToken });
  return `/workspace/create/tdei?tdeiRecordId=${DATASET_ID}#${fragment}`;
}

test.describe('TDEI Portal authentication handoff', () => {
  test('signs in User B when Workspaces has no valid session', async ({ page }) => {
    const refreshToken = userToken(USER_B_ID, 'User B');
    const exchange = await stubSuccessfulExchange(page);
    const expectDatasetAuth = await stubDatasetPage(page, exchange.accessToken);

    await page.goto(handoffUrl(refreshToken));

    await expect(page.getByRole('heading', {
      name: 'Create a Workspace from the TDEI',
    })).toBeVisible();
    await expect(page).toHaveURL(
      new RegExp(`/workspace/create/tdei\\?tdeiRecordId=${DATASET_ID}$`),
    );
    expect(exchange.suppliedRefreshToken()).toBe(refreshToken);
    await expectDatasetAuth();
  });

  test('does not ask to switch when Workspaces and Portal contain the same user', async ({ page }) => {
    await seedWorkspacesUser(page);
    const refreshToken = userToken(USER_A_ID, 'User A');
    const exchange = await stubSuccessfulExchange(page, USER_A_ID, 'User A');
    await stubDatasetPage(page, exchange.accessToken);

    await page.goto(handoffUrl(refreshToken));

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('heading', {
      name: 'Create a Workspace from the TDEI',
    })).toBeVisible();
  });

  test('asks before replacing Workspaces User A with Portal User B', async ({ page }) => {
    await seedWorkspacesUser(page);
    const refreshToken = userToken(USER_B_ID, 'User B');
    const exchange = await stubSuccessfulExchange(page);
    await stubDatasetPage(page, exchange.accessToken);

    await page.goto(handoffUrl(refreshToken));

    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Workspaces is currently signed in as User A.');
    await expect(dialog).toContainText(
      'The TDEI Portal is signed in with a different account.',
    );
    await expect(dialog).not.toContainText('User B');
    await expect(dialog).not.toContainText(USER_B_ID);
    expect(exchange.suppliedRefreshToken()).toBe('');

    await dialog.getByRole('button', { name: 'Switch account' }).click();

    await expect(page.getByRole('heading', {
      name: 'Create a Workspace from the TDEI',
    })).toBeVisible();
    expect(exchange.suppliedRefreshToken()).toBe(refreshToken);
    expect(await page.evaluate(() =>
      JSON.parse(localStorage.getItem('tdei-auth') ?? '{}').subject)).toBe(USER_B_ID);
  });

  test('never displays the subject when the Portal token has no display name', async ({ page }) => {
    await seedWorkspacesUser(page);
    const refreshToken = jwt({ sub: USER_B_ID });
    await stubSuccessfulExchange(page);

    await page.goto(handoffUrl(refreshToken));

    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText(
      'The TDEI Portal is signed in with a different account.',
    );
    await expect(dialog).not.toContainText(USER_B_ID);
    await expect(dialog.getByRole('button', { name: 'Switch account' })).toBeVisible();
  });

  test('keeps User A and goes to the dashboard when account switching is declined', async ({ page }) => {
    await seedWorkspacesUser(page);
    const refreshToken = userToken(USER_B_ID, 'User B');
    const exchange = await stubSuccessfulExchange(page);
    await page.route('**/tdei-user/project-group-roles/**', route =>
      route.fulfill({ json: [] }));
    await page.route('**/workspaces/mine', route => route.fulfill({ json: [] }));

    await page.goto(handoffUrl(refreshToken));
    await page.getByRole('dialog').getByRole('button', {
      name: 'No, keep User A',
    }).click();

    await expect(page).toHaveURL(/\/dashboard$/);
    expect(exchange.suppliedRefreshToken()).toBe('');
    expect(await page.evaluate(() =>
      JSON.parse(localStorage.getItem('tdei-auth') ?? '{}').subject)).toBe(USER_A_ID);
    expect(await page.evaluate(() =>
      sessionStorage.getItem('tdei-pending-auth-handoff'))).toBeNull();
  });

  test('closing the account-switch dialog also keeps User A', async ({ page }) => {
    await seedWorkspacesUser(page);
    const refreshToken = userToken(USER_B_ID, 'User B');
    const exchange = await stubSuccessfulExchange(page);
    await page.route('**/tdei-user/project-group-roles/**', route =>
      route.fulfill({ json: [] }));
    await page.route('**/workspaces/mine', route => route.fulfill({ json: [] }));

    await page.goto(handoffUrl(refreshToken));
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Close dialog' }).click();

    await expect(dialog).toHaveCount(0);
    await expect(page).toHaveURL(/\/dashboard$/);
    expect(exchange.suppliedRefreshToken()).toBe('');
    expect(await page.evaluate(() =>
      JSON.parse(localStorage.getItem('tdei-auth') ?? '{}').subject)).toBe(USER_A_ID);
  });

  test('uses Portal User B when the stored Workspaces refresh token has expired', async ({ page }) => {
    await seedWorkspacesUser(page, { refreshExpired: true });
    const refreshToken = userToken(USER_B_ID, 'User B');
    const exchange = await stubSuccessfulExchange(page);
    await stubDatasetPage(page, exchange.accessToken);

    await page.goto(handoffUrl(refreshToken));

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('heading', {
      name: 'Create a Workspace from the TDEI',
    })).toBeVisible();
    expect(await page.evaluate(() =>
      JSON.parse(localStorage.getItem('tdei-auth') ?? '{}').subject)).toBe(USER_B_ID);
  });

  test('preserves User A when a structurally invalid handoff token is supplied', async ({ page }) => {
    await seedWorkspacesUser(page);
    await page.route('**/workspaces/mine', route => route.fulfill({ json: [] }));

    await page.goto(handoffUrl('manually-corrupted-token'));

    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText(
      'The TDEI Portal handoff was invalid. You are still signed in as User A.',
    );
    expect(page.url()).not.toContain('manually-corrupted-token');
    expect(await page.evaluate(() =>
      JSON.parse(localStorage.getItem('tdei-auth') ?? '{}').subject)).toBe(USER_A_ID);

    await dialog.getByRole('button', { name: 'Go to dashboard' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test('preserves User A when TDEI rejects User B token after confirmation', async ({ page }) => {
    await seedWorkspacesUser(page);
    await page.route('**/tdei/refresh-token', route =>
      route.fulfill({ status: 401, body: 'expired token' }));
    await page.route('**/workspaces/mine', route => route.fulfill({ json: [] }));

    await page.goto(handoffUrl(userToken(USER_B_ID, 'User B')));
    await page.getByRole('dialog').getByRole('button', {
      name: 'Switch account',
    }).click();

    await expect(page.getByRole('dialog')).toContainText(
      'The TDEI account switch could not be completed. You are still signed in as User A.',
    );
    expect(await page.evaluate(() =>
      JSON.parse(localStorage.getItem('tdei-auth') ?? '{}').subject)).toBe(USER_A_ID);
  });

  test('returns to manual sign-in when a token is rejected without an existing session', async ({ page }) => {
    await page.route('**/tdei/refresh-token', route =>
      route.fulfill({ status: 401, body: 'expired token' }));

    await page.goto(handoffUrl(userToken(USER_B_ID, 'User B')));

    await expect(page).toHaveURL(/\/signin$/);
    await expect(page.getByText(
      'Your TDEI session could not be transferred. Please sign in again.',
    )).toBeVisible();
    expect(page.url()).not.toContain('refreshToken');
    expect(await page.evaluate(() => localStorage.getItem('tdei-auth'))).toBeNull();
  });
});
