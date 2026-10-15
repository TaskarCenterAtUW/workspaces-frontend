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
    updatedAt: '2026-02-18T05:10:00.583822Z',
    createdBy: USER_ID,
    createdByName: 'Ada Lovelace',
    externalAppAccess: 2,
    kartaViewToken: null,
    role: 'lead',
    importStatus: 'completed'
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
    updatedAt: '2026-02-21T09:30:00.000Z',
    createdBy: USER_ID,
    createdByName: 'Ada Lovelace',
    externalAppAccess: 0,
    kartaViewToken: null,
    role: 'lead',
    importStatus: 'in-progress'
  }
];

// A single WorkspaceResponse for `GET /api/v1/workspaces/{id}` (settings/edit/etc).
export const aWorkspace = myWorkspaces[0]!;

// A pair of workspaces the merge flow accepts for each other: a workspace is an
// eligible merge target only when it shares both `tdeiRecordId` and
// `tdeiProjectGroupId` with the one being merged. The workspaces above carry
// `tdeiRecordId: null`, which is deliberately eligible for nothing.
//
// The dataset id is a UUID because the spec types `tdeiRecordId` as
// `format: uuid`, and the contract validator checks formats.
const MERGE_DATASET_ID = '33333333-3333-4333-8333-333333333333';

export const mergeWorkspaceA = {
  ...myWorkspaces[0]!,
  tdeiRecordId: MERGE_DATASET_ID
};

export const mergeWorkspaceB = {
  ...myWorkspaces[1]!,
  type: 'osw',
  title: 'Seattle Sidewalks (survey)',
  tdeiRecordId: MERGE_DATASET_ID,
  // The base fixture is mid-import, which makes it ineligible as a merge
  // target. A merge pair is two finished imports.
  importStatus: 'completed'
};

// Shape mirrors `GET project-group-roles/{subject}` (the TDEI user API — not in
// the new-API OpenAPI spec). The client maps `project_group_name` → `name`.
export const projectGroups = [
  {
    tdei_project_group_id: PROJECT_GROUP_ID,
    project_group_name: 'Puget Sound',
    roles: ['workspace_admin']
  }
];
