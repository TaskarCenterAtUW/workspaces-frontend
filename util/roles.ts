import type { WorkspaceRole } from '~/types/workspaces'

export const ROLE_LABELS: Record<WorkspaceRole, string> = {
  lead: 'Owner',
  validator: 'Validator',
  contributor: 'Member',
}
