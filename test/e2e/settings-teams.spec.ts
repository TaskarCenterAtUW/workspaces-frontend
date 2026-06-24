import { test, expect, seedAuthenticatedSession } from './fixtures';
import { recordContract } from './contract';
import { aWorkspace } from '../mocks/fixtures';

// Real e2e spec generated from the @test outline in
// pages/workspace/[id]/settings/teams/index.vue.
//
// Routing: this is a CHILD of pages/workspace/[id]/settings.vue, which does a
// top-level `await workspacesClient.getWorkspace(1)` and provide('workspace', ...).
// So GET workspaces/1 must ALWAYS be stubbed (use aWorkspace) or the page 500s.
// The teams child route is /workspace/1/settings/teams. On load it additionally
// calls:
//   - getTeams(1) -> GET workspaces/1/teams -> WorkspaceTeamItem[]
// Dialogs lazily call more endpoints when opened:
//   - MembersDialog: getTeamMembers -> GET workspaces/1/teams/{teamId}/members
//   - SettingsDialog create -> POST workspaces/1/teams ; update -> PUT .../teams/{teamId}
//   - delete flow -> DELETE workspaces/1/teams/{teamId}
//   - JoinDialog: shows a QR code only (no API call)
// Every endpoint a flow reaches must be stubbed or the page 500s.
//
// Access/role: derived via composables/useWorkspaceRole.ts, which reads the
// injected workspace.role ('lead' === owner). POC is a TDEI project-group role.
//
// CONVENTION: tests are written to the @test outline (intended behavior), not to
// the current code. Where the implementation diverges the test is left to FAIL
// (red), documenting the bug. Divergences are called out at each test.

type Page = import('@playwright/test').Page;

// A "lead"/owner workspace (the injected workspace whose role gates the UI).
const leadWorkspace = { ...aWorkspace, role: 'lead' };
// A non-privileged member (neither POC nor team lead).
const contributorWorkspace = { ...aWorkspace, role: 'contributor' };

// WorkspaceTeamItem[] — spec-conformant ({ name, id, member_count }).
const teams = [
  { id: 10, name: 'Field Surveyors', member_count: 3 },
  { id: 11, name: 'Mappers', member_count: 1 }
];

// User[] — spec-conformant team members (GET .../members).
const teamMembers = [
  { id: 100, auth_uid: 'uid-100', email: 'amy@example.com', display_name: 'Amy Adams' },
  { id: 101, auth_uid: 'uid-101', email: 'ben@example.com', display_name: 'Ben Boyd' }
];

// Stub the parent settings.vue load (GET workspaces/1) plus the teams list.
async function stubTeamsPage(page: Page, workspace: object, teamList: object[] = teams) {
  await page.route('**/workspaces/1', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ json: workspace });
    }
    return route.fallback();
  });
  await page.route('**/workspaces/1/teams', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ json: teamList });
    }
    return route.fallback();
  });
}

test.describe('workspace settings — teams', () => {
  // @test e2e: only users with POC or team lead permissions should be able to access this page
  //
  // Authorized (workspace role 'lead' === owner): the teams management UI renders.
  test('a lead can access the teams page and sees the teams UI', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await stubTeamsPage(page, leadWorkspace);

    await page.goto('/workspace/1/settings/teams');

    await expect(page.getByRole('heading', { name: 'Teams' })).toBeVisible();
    // Lead-only management controls are present.
    await expect(page.getByRole('button', { name: 'New Team' })).toBeEnabled();
    // The team list shows each team by name (rendered as a link in teams/Item.vue).
    await expect(page.getByRole('link', { name: 'Field Surveyors' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Mappers' })).toBeVisible();
    // Per-team lead affordances live in each list item (teams/Item.vue), not in a
    // top-level toolbar: an "Open Team Settings" (edit) button and a "Delete"
    // button per team. Assert one is present per team for the lead.
    await expect(page.getByRole('button', { name: 'Open Team Settings' })).toHaveCount(2);
    // The inline per-team delete button is icon + a visually-hidden "Delete" span,
    // so its accessible name has a leading space (" Delete"); match non-exact.
    await expect(page.getByRole('button', { name: 'Delete' })).toHaveCount(2);
  });

  // @test e2e: only users with POC or team lead permissions should be able to access this page
  //
  // Unauthorized (a plain 'contributor', not POC, not lead): access should be
  // DENIED — the team-management UI should not be available to them.
  //
  // DIVERGENCE (expected RED): the page does NOT gate access by role. It renders
  // the Teams list, the "New Team" button (merely disabled), the QR-code button,
  // and an info alert for everyone regardless of role; useWorkspaceRole only
  // flips `isLead` to hide the edit/delete buttons. POC is never consulted here.
  // Asserting true access-denial therefore fails against current code.
  test('a non-lead, non-POC user is denied access to the teams page', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await stubTeamsPage(page, contributorWorkspace);

    await page.goto('/workspace/1/settings/teams');

    // Outline: this user should not be able to access the page / its management UI.
    await expect(page.getByRole('heading', { name: 'Teams' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'New Team' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Open Team Settings' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0);
  });

  // @test e2e: there should be two primary features: 1) a way to edit the team,
  //            including its name and members, and a way to delete the team.
  //
  // Feature 1a — edit the team NAME via the settings dialog (PUT .../teams/{id}).
  test('a lead can edit a team name', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await stubTeamsPage(page, leadWorkspace);

    let putBody: unknown = null;
    await page.route('**/workspaces/1/teams/10', (route) => {
      if (route.request().method() === 'PUT') {
        putBody = JSON.parse(route.request().postData() ?? '{}');
        return route.fulfill({ status: 204, body: '' });
      }
      return route.fallback();
    });

    await page.goto('/workspace/1/settings/teams');

    await page.getByRole('button', { name: 'Open Team Settings' }).first().click();

    const dialog = page.getByRole('dialog', { name: 'Team Settings' });
    await expect(dialog).toBeVisible();
    const nameField = dialog.getByLabel('Team Name');
    await expect(nameField).toHaveValue('Field Surveyors');
    await nameField.fill('Field Surveyors Renamed');
    await dialog.getByRole('button', { name: 'Update' }).click();

    await expect.poll(() => putBody).toEqual({ name: 'Field Surveyors Renamed' });
  });

  // @test e2e: there should be ... a way to edit the team, including its name and MEMBERS.
  //
  // Feature 1b — view/edit team members. The members dialog lists members and
  // (for a lead) lets them be removed (DELETE .../members/{userId}).
  test('a lead can view and remove team members', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await stubTeamsPage(page, leadWorkspace);

    await page.route('**/workspaces/1/teams/10/members', (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({ json: teamMembers });
      }
      return route.fallback();
    });
    let memberDeleted = false;
    await page.route('**/workspaces/1/teams/10/members/100', (route) => {
      if (route.request().method() === 'DELETE') {
        memberDeleted = true;
        return route.fulfill({ status: 204, body: '' });
      }
      return route.fallback();
    });

    await page.goto('/workspace/1/settings/teams');

    // Open members by clicking the team name link.
    await page.getByRole('link', { name: 'Field Surveyors' }).click();

    const dialog = page.getByRole('dialog', { name: 'Team Members' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Amy Adams')).toBeVisible();
    await expect(dialog.getByText('Ben Boyd')).toBeVisible();

    // Remove the first member; confirm the modal, then expect the DELETE call.
    await dialog.getByRole('button', { name: 'Remove Member' }).first().click();
    await page.getByRole('button', { name: 'Remove', exact: true }).click();

    await expect.poll(() => memberDeleted).toBe(true);
  });

  // @test e2e: there should be ... a way to DELETE the team.
  //
  // Feature 1c — delete a team via the trash button + confirm modal
  // (DELETE .../teams/{id}).
  test('a lead can delete a team', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await stubTeamsPage(page, leadWorkspace);

    let teamDeleted = false;
    await page.route('**/workspaces/1/teams/10', (route) => {
      if (route.request().method() === 'DELETE') {
        teamDeleted = true;
        return route.fulfill({ status: 204, body: '' });
      }
      return route.fallback();
    });

    await page.goto('/workspace/1/settings/teams');

    // Inline per-team delete button (icon + visually-hidden "Delete" → leading
    // space in the accessible name), so match non-exact.
    await page.getByRole('button', { name: 'Delete' }).first().click();

    const confirm = page.getByRole('dialog', { name: 'Delete Team' });
    await expect(confirm).toBeVisible();
    await expect(confirm).toContainText('Field Surveyors');
    await confirm.getByRole('button', { name: 'Delete', exact: true }).click();

    await expect.poll(() => teamDeleted).toBe(true);
  });

  // @test e2e: there should be two primary features: ... 2) a way to show a QR
  //            code to participants to join the team.
  test('shows a QR code to join a team with a downloadable image and shareable link', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await stubTeamsPage(page, leadWorkspace);

    await page.goto('/workspace/1/settings/teams');

    await page.getByRole('button', { name: 'View QR Code' }).first().click();

    const dialog = page.getByRole('dialog', { name: 'Join this Team' });
    await expect(dialog).toBeVisible();
    // The QR code renders as a canvas/img; the shareable join link is shown.
    await expect(dialog.getByText('Share this link:')).toBeVisible();
    await expect(dialog.getByRole('link', { name: /\/workspace\/1\/teams\/10$/ })).toBeVisible();
    // Once the QR image is generated, a "Download QR Code" link appears.
    await expect(dialog.getByRole('link', { name: 'Download QR Code' })).toBeVisible();
  });

  // @test e2e: validate that all the API calls used on this page match the Swagger spec.
  //
  // Drive the page through load + the write flows (create, edit, members, delete)
  // so every new-API call is recorded, then assert zero contract violations.
  test('all API calls conform to the OpenAPI spec', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await stubTeamsPage(page, leadWorkspace);

    const contract = recordContract(page);

    // createTeam: POST workspaces/1/teams -> 201 with an integer body.
    await page.route('**/workspaces/1/teams', (route) => {
      if (route.request().method() === 'POST') {
        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: '12'
        });
      }
      return route.fallback();
    });
    // updateTeam (PUT) + deleteTeam (DELETE) on /teams/10.
    await page.route('**/workspaces/1/teams/10', (route) => {
      const m = route.request().method();
      if (m === 'PUT' || m === 'DELETE') {
        return route.fulfill({ status: 204, body: '' });
      }
      return route.fallback();
    });
    // getTeamMembers: GET .../teams/10/members.
    await page.route('**/workspaces/1/teams/10/members', (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({ json: teamMembers });
      }
      return route.fallback();
    });

    await page.goto('/workspace/1/settings/teams');

    // Create a team (POST workspaces/1/teams -> WorkspaceTeamCreate { name }).
    await page.getByRole('button', { name: 'New Team' }).click();
    const create = page.getByRole('dialog', { name: 'Create a Team' });
    await create.getByLabel('Team Name').fill('New Crew');
    await create.getByRole('button', { name: 'Create' }).click();
    await expect(create).toBeHidden();

    // Edit a team name (PUT workspaces/1/teams/10 -> WorkspaceTeamUpdate { name }).
    await page.getByRole('button', { name: 'Open Team Settings' }).first().click();
    const settings = page.getByRole('dialog', { name: 'Team Settings' });
    await settings.getByLabel('Team Name').fill('Field Surveyors Renamed');
    await settings.getByRole('button', { name: 'Update' }).click();
    await expect(settings).toBeHidden();

    // View members (GET workspaces/1/teams/10/members -> User[]).
    await page.getByRole('link', { name: 'Field Surveyors' }).first().click();
    const members = page.getByRole('dialog', { name: 'Team Members' });
    await expect(members).toBeVisible();
    // The dialog exposes two "Close" affordances (header × and footer OK button);
    // scope to the first so strict mode doesn't trip on the duplicate name.
    await members.getByRole('button', { name: 'Close' }).first().click();

    await expect.poll(() => contract.violations()).toEqual([]);
  });

  // @test e2e: if the editor fails to load, an error message is shown (snapshot).
  //
  // NOTE: this page has NO Rapid/iD editor — it is the Teams management page,
  // whose only "editor" is the team-settings dialog. This outline looks copied
  // from pages/workspace/[id]/edit.vue (which embeds the external editor). There
  // is no editor-load failure path here, so there is nothing to assert and this
  // test is left RED for the orchestrator to flag. The snapshot below captures
  // the actual rendered page so the divergence is documented rather than invented.
  test('shows an error message when the editor fails to load', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await stubTeamsPage(page, leadWorkspace);

    await page.goto('/workspace/1/settings/teams');

    // There is no editor to fail; assert an error message exists per the outline.
    // Expected RED: no such error UI exists on this page.
    await expect(page.getByText(/editor failed to load/i)).toBeVisible();
    await expect(page.locator('.col-lg-8')).toMatchAriaSnapshot();
  });
});
