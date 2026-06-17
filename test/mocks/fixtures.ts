// Canned API data — the single source of truth shared by both the Vitest MSW
// handlers (node) and the Playwright route stubs (browser). Shapes are kept
// conformant with the vendored OpenAPI spec (test/contract/openapi.json) so the
// contract tests flag real app/spec divergences, not stub mistakes.

export const TEST_API_BASE = 'http://api.test/';

// Stable UUIDs used across fixtures (the spec requires uuid format for these).
export const PROJECT_GROUP_ID = '11111111-1111-1111-1111-111111111111';
export const USER_ID = '22222222-2222-2222-2222-222222222222';

// WorkspaceResponse[] — `GET /api/v1/workspaces/mine`. Note the spec uses
// integer `id` and `title` (not `name`), and requires type/externalAppAccess/role.
export const myWorkspaces = [
  {
    id: 1,
    type: 'osw',
    title: 'Seattle Sidewalks',
    description: null,
    tdeiProjectGroupId: PROJECT_GROUP_ID,
    tdeiRecordId: null,
    tdeiServiceId: null,
    tdeiMetadata: null,
    createdAt: '2026-01-15T12:00:00.000Z',
    createdBy: USER_ID,
    createdByName: 'Ada Lovelace',
    externalAppAccess: 2,
    kartaViewToken: null,
    role: 'lead'
  },
  {
    id: 2,
    type: 'pathways',
    title: 'Tacoma Pathways',
    description: null,
    tdeiProjectGroupId: PROJECT_GROUP_ID,
    tdeiRecordId: null,
    tdeiServiceId: null,
    tdeiMetadata: null,
    createdAt: '2026-02-20T09:30:00.000Z',
    createdBy: USER_ID,
    createdByName: 'Ada Lovelace',
    externalAppAccess: 0,
    kartaViewToken: null,
    role: 'lead'
  }
];

// A single WorkspaceResponse for `GET /api/v1/workspaces/{id}` (settings/edit/etc).
export const aWorkspace = myWorkspaces[0];

// Shape mirrors `GET project-group-roles/{subject}` (the TDEI user API — not in
// the new-API OpenAPI spec). The client maps `project_group_name` → `name`.
export const projectGroups = [
  {
    tdei_project_group_id: PROJECT_GROUP_ID,
    project_group_name: 'Puget Sound',
    roles: ['workspace_admin']
  }
];
