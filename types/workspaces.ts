export type WorkspaceId = number;
export type WorkspaceType = 'osw' | 'pathways';
export type WorkspaceAppAccess = 0 | 1 | 2;

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
