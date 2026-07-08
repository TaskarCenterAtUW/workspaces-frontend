import { test, expect, seedAuthenticatedSession } from './fixtures';
import { recordContract } from './contract';
import { aWorkspace, PROJECT_GROUP_ID } from '../mocks/fixtures';

// Real e2e spec generated from the @test outline in
// pages/workspace/[id]/settings/members.vue.
//
// Routing: this is a CHILD of pages/workspace/[id]/settings.vue, which does a
// top-level `await workspacesClient.getWorkspace(1)` and provide('workspace', ...).
// So GET workspaces/1 must ALWAYS be stubbed (use aWorkspace) or the page 500s.
// The members child route is /workspace/1/settings/members.
//
// On load the page calls (services/tdei.ts + services/workspaces.ts):
//   - tdeiUserClient.getProjectGroupUsers(workspace.tdeiProjectGroupId)
//       -> GET tdei-user/project-group/{pgId}/users?page_no=1&page_size=10000
//          (the "TDEI/KeyCloak" source). Returns TdeiUserItem[].
//          A 403 here flips the page into its `accessDenied` state.
//   - IF the injected workspace.role === 'lead' (useWorkspaceRole().isLead):
//       workspacesClient.getWorkspaceMembers(1) -> GET workspaces/1/users
//          (new API). Returns WorkspaceUserRoleItem[] (id, auth_uid,
//          display_name, role). Used to seed each member's local workspace role.
//   - Role writes from the owner dropdown:
//       assignRole -> PUT workspaces/1/users/{auth_uid}/role  (SetRoleRequest)
//       removeRole -> DELETE workspaces/1/users/{auth_uid}
//
// In E2E all hosts are http://api.test/. The TDEI user API base is
// http://api.test/tdei-user/ and the new API base is http://api.test/. Every
// endpoint a flow reaches must be stubbed or the page 500s. New-API response
// bodies must be spec-conformant (the contract validator checks them); the
// TDEI/KeyCloak response only needs to match what the page consumes.
//
// How the page joins the two sources: the workspace-member local role is keyed
// by the OSM member's `auth_uid`, looked up by the TDEI user's `user_id`. So a
// TDEI user_id must equal the workspace member auth_uid for the role to attach.
//
// Access control (outline #1): the page has NO workspace.role gate of its own.
// Authorization is purely the TDEI getProjectGroupUsers call — 403 => the
// "You need a TDEI POC role..." alert; 200 => the member lists render. The
// owner ROLE dropdown is additionally gated on isLead (workspace.role==='lead').
//
// Role labels (outline #5, util/roles.ts ROLE_LABELS): lead->Owner,
// validator->Validator, contributor->Member. The page maps an undefined local
// role to "Member" (contributor) as the default.
//
// CONVENTION: tests are written to the @test outline (intended behavior), not to
// the current code. Where the implementation diverges the test is left to FAIL
// (red), documenting the bug. Divergences are called out at each test.

type Page = import('@playwright/test').Page;

// A "lead"/owner workspace (role gates the per-member dropdown + the member fetch).
const leadWorkspace = { ...aWorkspace, role: 'lead' };
// A non-privileged member workspace role (no owner dropdown; read-only badges).
const memberWorkspace = { ...aWorkspace, role: 'contributor' };

// --- TDEI/KeyCloak project-group users (TdeiUserItem[]) -----------------------
// Names/roles here are the "simulated API response" outlines #2/#3/#4 assert the
// UI shows EXACTLY. The page renders `${first_name} ${last_name}`.
//   - Petra Poc: a POC (roles include 'poc').
//   - Gabriela Generator: a data generator (role ends with '_data_generator';
//     the badge shows the prefix before the first '_', i.e. "osw").
//   - Owen Owner / Vera Validator / Mona Member: plain members (no 'poc').
//     Their workspace role badge/label comes from GET workspaces/1/users.
const POC_UID = 'uid-poc';
const GEN_UID = 'uid-gen';
const OWNER_UID = 'uid-owner';
const VALIDATOR_UID = 'uid-validator';
const MEMBER_UID = 'uid-member';

function tdeiUser(overrides: Partial<{
  user_id: string; first_name: string; last_name: string; roles: string[];
}>) {
  return {
    user_id: overrides.user_id ?? 'uid',
    first_name: overrides.first_name ?? 'First',
    last_name: overrides.last_name ?? 'Last',
    email: `${overrides.user_id ?? 'uid'}@example.com`,
    username: overrides.user_id ?? 'uid',
    phone: '555-0000',
    roles: overrides.roles ?? []
  };
}

const projectGroupUsers = [
  tdeiUser({ user_id: POC_UID, first_name: 'Petra', last_name: 'Poc', roles: ['poc'] }),
  tdeiUser({ user_id: GEN_UID, first_name: 'Gabriela', last_name: 'Generator', roles: ['osw_data_generator'] }),
  tdeiUser({ user_id: OWNER_UID, first_name: 'Owen', last_name: 'Owner', roles: [] }),
  tdeiUser({ user_id: VALIDATOR_UID, first_name: 'Vera', last_name: 'Validator', roles: [] }),
  tdeiUser({ user_id: MEMBER_UID, first_name: 'Mona', last_name: 'Member', roles: [] })
];

// --- New API workspace members (WorkspaceUserRoleItem[]) ----------------------
// Spec-conformant: { id, auth_uid, display_name, role }. auth_uid must match the
// TDEI user_id so the role attaches to the right person on the page.
const workspaceMembers = [
  { id: 1, auth_uid: OWNER_UID, display_name: 'Owen Owner', role: 'lead' },
  { id: 2, auth_uid: VALIDATOR_UID, display_name: 'Vera Validator', role: 'validator' }
  // Mona Member is intentionally absent => undefined local role => "Member".
];

// Stub the parent settings.vue load (GET workspaces/1) and both data sources the
// members page reads. `workspace` controls role-gating; pass leadWorkspace for
// the owner view, memberWorkspace for the read-only view.
async function stubMembersPage(page: Page, options: {
  workspace?: object;
  pgUsersStatus?: number;
  pgUsers?: object[];
  members?: object[];
} = {}) {
  const workspace = options.workspace ?? leadWorkspace;
  const pgUsersStatus = options.pgUsersStatus ?? 200;
  const pgUsers = options.pgUsers ?? projectGroupUsers;
  const members = options.members ?? workspaceMembers;

  await page.route('**/workspaces/1', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ json: workspace });
    }
    return route.fallback();
  });

  // TDEI/KeyCloak project-group users.
  await page.route(`**/tdei-user/project-group/${PROJECT_GROUP_ID}/users**`, (route) => {
    if (route.request().method() === 'GET') {
      if (pgUsersStatus !== 200) {
        return route.fulfill({ status: pgUsersStatus, body: '' });
      }
      return route.fulfill({ json: pgUsers });
    }
    return route.fallback();
  });

  // New-API privileged workspace members (only fetched when isLead).
  await page.route('**/workspaces/1/users', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ json: members });
    }
    return route.fallback();
  });
}

test.describe('workspace member roles', () => {
  // @test e2e: only users with POC or team lead permissions should be able to access this page
  test('renders the member lists for an authorized (POC) user', async ({ page }) => {
    await seedAuthenticatedSession(page);
    // A 200 from getProjectGroupUsers means the caller has POC visibility.
    await stubMembersPage(page, { workspace: leadWorkspace });

    await page.goto('/workspace/1/settings/members');

    // No access-denied alert; the section headings render. The headings embed an
    // app-icon ligature (e.g. "local_police"), so match the heading text by an
    // anchored regex rather than relying on a brittle exact accessible name.
    await expect(page.getByText('You need a TDEI POC role')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: /^Project Group Admins/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: /^Workspace Members/ })).toBeVisible();
  });

  // @test e2e: only users with POC or team lead permissions should be able to access this page
  test('shows the access-denied alert for an unauthorized user', async ({ page }) => {
    await seedAuthenticatedSession(page);
    // 403 from getProjectGroupUsers => accessDenied.
    await stubMembersPage(page, { workspace: memberWorkspace, pgUsersStatus: 403 });

    await page.goto('/workspace/1/settings/members');

    await expect(
      page.getByText('You need a TDEI POC role in this project group')
    ).toBeVisible();
  });

  // @test e2e: POCs should be displayed on this page, matching the results of the
  //            simulated API response from the TDEI/KeyCloak.
  test('displays POCs matching the TDEI/KeyCloak response', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await stubMembersPage(page, { workspace: leadWorkspace });

    await page.goto('/workspace/1/settings/members');

    // The members content lives in the settings page's right-hand column
    // (b-col lg="8" => .col-lg-8); the settings sidebar nav ALSO uses a
    // `.list-group` class, so scope to the content column to exclude it. The
    // three section list-groups render in document order: [0] Project Group
    // Admins (POCs), [1] Data Generators, [2] Workspace Members. Scope each
    // assertion to its own list so a name that appears in more than one section
    // (a non-POC generator is also a workspace member) doesn't match twice.
    const content = page.locator('.col-lg-8');
    const pocList = content.locator('.list-group').nth(0);
    const pocItem = pocList.locator('.list-group-item', { hasText: 'Petra Poc' });
    await expect(pocItem).toBeVisible();
    await expect(pocItem).toContainText('poc');

    // Only the POC user appears in the POC list (the generator is not a POC).
    await expect(pocList.locator('.list-group-item', { hasText: 'Gabriela Generator' }))
      .toHaveCount(0);
  });

  // @test e2e: Data Generators should be displayed on this page, matching the results of
  //            the simulated API response from the TDEI/KeyCloak.
  test('displays Data Generators matching the TDEI/KeyCloak response', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await stubMembersPage(page, { workspace: leadWorkspace });

    await page.goto('/workspace/1/settings/members');

    const genHeading = page.getByRole('heading', { name: /^Data Generators/ });
    await expect(genHeading).toBeVisible();

    // The Data Generators list is the second of the three section list-groups
    // inside the content column (the settings nav also uses `.list-group`).
    // Gabriela Generator (osw_data_generator) is shown with the "osw" badge
    // (formatDataGeneratorRole strips the "_data_generator" suffix).
    const genList = page.locator('.col-lg-8').locator('.list-group').nth(1);
    const genItem = genList.locator('.list-group-item', { hasText: 'Gabriela Generator' });
    await expect(genItem).toBeVisible();
    await expect(genItem).toContainText('osw');
  });

  // @test e2e: Workspace Members, which includes Owners or Validators, should be displayed
  //            on this page, matching the results of the simulated API response from the
  //            TDEI/KeyCloak.
  test('displays Workspace Members (Owners/Validators) matching the API response', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await stubMembersPage(page, { workspace: leadWorkspace });

    await page.goto('/workspace/1/settings/members');

    const membersList = page.locator('.col-lg-8').locator('.list-group').last();

    // The non-POC project-group users appear as workspace members.
    await expect(membersList.locator('.list-group-item', { hasText: 'Owen Owner' })).toBeVisible();
    await expect(membersList.locator('.list-group-item', { hasText: 'Vera Validator' })).toBeVisible();
    await expect(membersList.locator('.list-group-item', { hasText: 'Mona Member' })).toBeVisible();

    // The POC must NOT be listed among the (non-POC) workspace members.
    await expect(membersList.locator('.list-group-item', { hasText: 'Petra Poc' })).toHaveCount(0);
  });

  // @test e2e: Workspace Members can have one of three permissions assigned to them which
  //            should match the response of the Workspaces API call to fetch permissions:
  //            "Member", "Owner" or "Validator".
  test('offers exactly the three permission options Member / Owner / Validator', async ({ page }) => {
    await seedAuthenticatedSession(page);
    // Owner view => each member exposes a role dropdown.
    await stubMembersPage(page, { workspace: leadWorkspace });

    await page.goto('/workspace/1/settings/members');

    const membersList = page.locator('.col-lg-8').locator('.list-group').last();

    // Owen Owner came back from GET workspaces/1/users with role 'lead' => "Owner".
    const owenRow = membersList.locator('.list-group-item', { hasText: 'Owen Owner' });
    await expect(owenRow.getByRole('button', { name: 'Owner' })).toBeVisible();

    // Vera Validator had role 'validator' => "Validator".
    const veraRow = membersList.locator('.list-group-item', { hasText: 'Vera Validator' });
    await expect(veraRow.getByRole('button', { name: 'Validator' })).toBeVisible();

    // Mona Member had no workspace role => default "Member".
    const monaRow = membersList.locator('.list-group-item', { hasText: 'Mona Member' });
    await expect(monaRow.getByRole('button', { name: 'Member' })).toBeVisible();

    // Opening a dropdown exposes exactly the three permission choices.
    await monaRow.getByRole('button', { name: 'Member' }).click();
    const menu = monaRow.getByRole('menu');
    await expect(menu.getByRole('menuitem', { name: 'Owner' })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'Validator' })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'Member' })).toBeVisible();
    await expect(menu.getByRole('menuitem')).toHaveCount(3);
  });

  // @test e2e: The permissions structure on this page should match the one described in
  //            CLAUDE.md
  // CLAUDE.md "Permission Structure": Project Group Admin (POC) / Lead-Owner-Workspace
  // Admin / Contributor-Data Generator / Validator / Viewer-Member-Everyone Else.
  // The page surfaces these as section headings + the member privilege legend.
  test('permission structure on the page matches CLAUDE.md', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await stubMembersPage(page, { workspace: leadWorkspace });

    await page.goto('/workspace/1/settings/members');

    // POC == Project Group Admin (CLAUDE.md "Project Group Admin (POC)").
    await expect(page.getByRole('heading', { name: 'Project Group Admins' })).toBeVisible();
    await expect(page.getByText('TDEI project group admins (POCs) have full control')).toBeVisible();

    // Contributor == Data Generator (CLAUDE.md "Contributor/Data Generator").
    await expect(page.getByRole('heading', { name: 'Data Generators' })).toBeVisible();

    // Workspace Members legend describes the Owner / Validator / Member privileges
    // (CLAUDE.md groups Lead/Owner, Validator, and Member as workspace-member tiers).
    // Scope to the legend text so we don't collide with role dropdowns or a member
    // who happens to be named "Owner".
    await expect(page.getByText('Owner can review changesets and modify workspace settings')).toBeVisible();
    await expect(page.getByText('Validator can review changesets', { exact: true })).toBeVisible();
  });

  // @test e2e: validate that each member has a badge or clear role via being listed
  //            under a header that names the role
  // Every person is rendered in one of three sections, each under a heading that
  // names their role/category (Project Group Admins / Data Generators / Workspace
  // Members), and every member row carries a role badge. Use the read-only
  // (non-lead) view so all three sections render badges — the lead view swaps the
  // Workspace Members badge for a role dropdown.
  test('every listed member has a role badge under a role-naming header', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await stubMembersPage(page, { workspace: memberWorkspace });

    await page.goto('/workspace/1/settings/members');

    const content = page.locator('.col-lg-8');

    // Each section heading names the role/category its members fall under.
    await expect(content.getByRole('heading', { name: /^Project Group Admins/ })).toBeVisible();
    await expect(content.getByRole('heading', { name: /^Data Generators/ })).toBeVisible();
    await expect(content.getByRole('heading', { name: /^Workspace Members/ })).toBeVisible();

    // POC section: Petra Poc carries a "poc" badge.
    const pocItem = content.locator('.list-group').nth(0)
      .locator('.list-group-item', { hasText: 'Petra Poc' });
    await expect(pocItem.locator('.badge')).toContainText('poc');

    // Data Generators section: Gabriela Generator carries her data-generator badge.
    const genItem = content.locator('.list-group').nth(1)
      .locator('.list-group-item', { hasText: 'Gabriela Generator' });
    await expect(genItem.locator('.badge')).toContainText('osw');

    // Workspace Members section: every member row carries a role badge. In the
    // read-only view the local role is unknown (no GET workspaces/1/users), so
    // each defaults to the "Member" label — the point is a badge is always shown.
    const membersList = content.locator('.list-group').last();
    const memberRows = membersList.locator('.list-group-item');
    const count = await memberRows.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      await expect(memberRows.nth(i).locator('.badge')).toBeVisible();
    }
  });

  // @test e2e: validate that all the API calls used on this page match the Swagger spec
  test('all API calls conform to the OpenAPI spec', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await stubMembersPage(page, { workspace: leadWorkspace });

    // Allow the role write flows so their requests are recorded + validated too.
    await page.route('**/workspaces/1/users/*/role', (route) => {
      if (route.request().method() === 'PUT') {
        return route.fulfill({ status: 204, body: '' });
      }
      return route.fallback();
    });
    await page.route('**/workspaces/1/users/*', (route) => {
      if (route.request().method() === 'DELETE') {
        return route.fulfill({ status: 204, body: '' });
      }
      return route.fallback();
    });

    const contract = recordContract(page);

    await page.goto('/workspace/1/settings/members');

    const membersList = page.locator('.col-lg-8').locator('.list-group').last();

    // Drive an assignRole (PUT users/{uid}/role -> SetRoleRequest): set Mona to Owner.
    const monaRow = membersList.locator('.list-group-item', { hasText: 'Mona Member' });
    await monaRow.getByRole('button', { name: 'Member' }).click();
    await monaRow.getByRole('menuitem', { name: 'Owner' }).click();
    await expect(monaRow.getByRole('button', { name: 'Owner' })).toBeVisible();

    // Drive a removeRole (DELETE users/{uid}): set Owen back to Member.
    const owenRow = membersList.locator('.list-group-item', { hasText: 'Owen Owner' });
    await owenRow.getByRole('button', { name: 'Owner' }).click();
    await owenRow.getByRole('menuitem', { name: 'Member' }).click();
    await expect(owenRow.getByRole('button', { name: 'Member' })).toBeVisible();

    await expect.poll(() => contract.violations()).toEqual([]);
  });
});
