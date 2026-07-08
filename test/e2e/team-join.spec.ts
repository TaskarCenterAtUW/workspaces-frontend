import { test, expect, seedAuthenticatedSession } from './fixtures';
import { aWorkspace, USER_ID, TEST_API_BASE } from '../mocks/fixtures';

// Generated from the @test outline in pages/workspace/[id]/teams/[teamId].vue
// (the "Join Team" page).
//
// The page top-level `await`s a Promise.all of three new-API calls, so all
// three MUST be stubbed or the page 500s:
//   - workspacesClient.getWorkspace(id)            -> GET  workspaces/{id}
//   - workspacesClient.getTeam(id, teamId)         -> GET  workspaces/{id}/teams/{teamId}
//   - workspacesClient.getTeamMembers(id, teamId)  -> GET  workspaces/{id}/teams/{teamId}/members
//
// "user is not a member" is derived from whether any member's auth_uid equals
// the logged-in subject (USER_ID, from seedAuthenticatedSession): when no member
// matches, the Join Team button shows; clicking it POSTs
//   workspacesClient.joinTeam(id, teamId) -> POST workspaces/{id}/teams/{teamId}/members
// which returns the joining User, appended to the member list.

type Page = import('@playwright/test').Page;

const WORKSPACE_ID = 1;
const TEAM_ID = 5;

// WorkspaceTeamItem: { name, id, member_count } (all required per openapi.json).
const team = {
  name: 'Survey Crew',
  id: TEAM_ID,
  member_count: 2
};

// Existing members — none of these is the logged-in user (no USER_ID auth_uid),
// so the page should consider the user "not a member" and show the Join button.
const otherMembers = [
  {
    id: 101,
    auth_uid: 'aaaa-aaaa',
    email: 'ada@example.com',
    display_name: 'Ada Lovelace'
  },
  {
    id: 102,
    auth_uid: 'bbbb-bbbb',
    email: 'grace@example.com',
    display_name: 'Grace Hopper'
  }
];

// The User returned by joinTeam — auth_uid === USER_ID so the page recognizes
// the logged-in user as now joined.
const joinedUser = {
  id: 103,
  auth_uid: USER_ID,
  email: 'tester@example.com',
  display_name: 'Tester'
};

// Stub the three top-level awaits. `members` controls join state.
async function stubPageLoad(page: Page, members: object[]) {
  await page.route(`${TEST_API_BASE}workspaces/${WORKSPACE_ID}`, route =>
    route.fulfill({ json: aWorkspace })
  );
  await page.route(`${TEST_API_BASE}workspaces/${WORKSPACE_ID}/teams/${TEAM_ID}`, route =>
    route.fulfill({ json: team })
  );
  // GET lists members; POST (joinTeam) returns the joining User. Same URL.
  await page.route(`${TEST_API_BASE}workspaces/${WORKSPACE_ID}/teams/${TEAM_ID}/members`, (route) => {
    if (route.request().method() === 'POST') {
      return route.fulfill({ json: joinedUser });
    }
    return route.fulfill({ json: members });
  });
}

const pagePath = `/workspace/${WORKSPACE_ID}/teams/${TEAM_ID}`;

const joinButton = (page: Page) =>
  page.getByRole('button', { name: /join team/i });

// @test e2e: the page shows a button to join the team if the user is not a member, and clicking it adds the user to the team (playwright snapshot this)
test('shows a Join Team button when the user is not a member and clicking it adds the user to the team', async ({ page }) => {
  await seedAuthenticatedSession(page);
  // No member matches the logged-in subject -> user is not a member.
  await stubPageLoad(page, otherMembers);

  await page.goto(pagePath);

  // The Join Team button is shown to a non-member.
  const join = joinButton(page);
  await expect(join).toBeVisible();

  await expect(page.locator('.card').first()).toMatchAriaSnapshot();

  // Clicking Join adds the user to the team: the member list gains the user and
  // the page reflects the joined state (the Leave Team button replaces Join).
  await join.click();

  await expect(joinButton(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: /leave team/i })).toBeVisible();
  // Scope the member assertion to the "On the team" member-list card so it does
  // not collide with the navbar user menu (which also renders "Tester").
  const memberCard = page.locator('.card').filter({ hasText: /on the team/i });
  await expect(memberCard.getByText(joinedUser.display_name)).toBeVisible();
});

// @test e2e: the page has other elements about the team, including a list of members and a QR code to invite others to join the team (playwright snapshot this)
test('shows team details including a member list and a QR code to invite others', async ({ page }) => {
  await seedAuthenticatedSession(page);
  await stubPageLoad(page, otherMembers);

  await page.goto(pagePath);

  // The team name is shown.
  await expect(page.getByText(team.name).first()).toBeVisible();

  // The member list shows each member's display name.
  for (const member of otherMembers) {
    await expect(page.getByText(member.display_name)).toBeVisible();
  }

  // A QR code to invite others is rendered (teams-qr-code -> vue-qrcode emits a
  // canvas/img with the join link). Scope to the invite card to avoid matching
  // any chrome imagery elsewhere on the page.
  const inviteCard = page.locator('.card').filter({ hasText: /invite more teammates/i });
  await expect(inviteCard.locator('canvas, img')).toBeVisible();

  await expect(page.getByRole('main')).toMatchAriaSnapshot();
});
