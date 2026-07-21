export type WorkspaceId = number;
export type WorkspaceType = 'osw' | 'pathways' | 'flex';
export type WorkspaceAppAccess = 0 | 1 | 2;
export type WorkspaceRole = 'lead' | 'validator' | 'contributor';

// Map view centered on the workspace's data. Not returned by the API — it is
// computed client-side from the workspace bbox and attached once the dashboard
// map emits `center-loaded` (see components/dashboard/Map.vue), so it is optional.
export interface WorkspaceCenter {
  zoom: number;
  latitude: number;
  longitude: number;
}

export interface Workspace {
  id: WorkspaceId;
  type: WorkspaceType;
  title: string;
  description?: string;
  tdeiRecordId?: string;
  tdeiProjectGroupId: string;
  tdeiServiceId?: string;
  tdeiMetadata?: string;
  createdAt: Date;
  createdBy: string;
  createdByName: string;
  externalAppAccess: WorkspaceAppAccess;
  kartaViewToken?: string;
  autoFlagReview?: boolean;
  role?: WorkspaceRole;
  center?: WorkspaceCenter;
}

export interface WorkspaceCreation {
  type: WorkspaceType;
  title: string;
  description?: string;
  tdeiRecordId?: string;
  tdeiProjectGroupId: string;
  tdeiServiceId?: string;
  tdeiMetadata?: string;
  createdBy?: string;
  createdByName?: string;
}

export interface WorkspacePatch {
  title?: string;
  description?: string;
  externalAppAccess?: WorkspaceAppAccess;
  autoFlagReview?: boolean;
}

export type QuestSettingsType = 'NONE' | 'JSON' | 'URL';

export interface QuestSettingsPatch {
  type: QuestSettingsType;
  definition?: string;
  url?: string;
}

export interface QuestSettings extends QuestSettingsPatch {
  workspace_id: WorkspaceId;
  modified_at: Date;
  modified_by: string;
  modified_by_name: string;
}

export interface WorkspaceTeam {
  id: number;
  name: string;
  member_count: number;
}

export interface User {
  id: number;
  auth_uid: string;
  email: string;
  display_name: string;
}

export interface WorkspaceMember {
  user: User;
  role: WorkspaceRole;
}
