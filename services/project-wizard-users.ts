import type { WorkspaceId } from '~/types/workspaces';
import type { ProjectWizardWorkspaceUser } from '~/types/project-wizard';

const SIMULATED_WORKSPACE_USERS_DELAY_MS = 220;

const MOCK_PROJECT_WIZARD_WORKSPACE_USERS: ProjectWizardWorkspaceUser[] = [
  {
    id: 1,
    authUid: '3fa85f64-5717-4562-b3fc-2c963f66afa1',
    email: 'richard.binzel@example.com',
    displayName: 'Richard Binzel',
    role: 'validator',
  },
  {
    id: 2,
    authUid: '3fa85f64-5717-4562-b3fc-2c963f66afa2',
    email: 'alex.parker@example.com',
    displayName: 'Alex Parker',
    role: 'validator',
  },
  {
    id: 3,
    authUid: '3fa85f64-5717-4562-b3fc-2c963f66afa3',
    email: 'maria.lopez@example.com',
    displayName: 'Maria Lopez',
    role: 'lead',
  },
  {
    id: 4,
    authUid: '3fa85f64-5717-4562-b3fc-2c963f66afa4',
    email: 'samuel.ng@example.com',
    displayName: 'Samuel Ng',
    role: 'contributor',
  },
  {
    id: 5,
    authUid: '3fa85f64-5717-4562-b3fc-2c963f66afa5',
    email: 'olivia.johnson@example.com',
    displayName: 'Olivia Johnson',
    role: 'validator',
  },
];

export async function listProjectWizardWorkspaceUsers(workspaceId: WorkspaceId): Promise<ProjectWizardWorkspaceUser[]> {
  void workspaceId;

  // Replace this mock with GET /api/v1/workspaces/:id/users when the endpoint is ready.
  await new Promise(resolve => setTimeout(resolve, SIMULATED_WORKSPACE_USERS_DELAY_MS));

  return structuredClone(MOCK_PROJECT_WIZARD_WORKSPACE_USERS);
}
