
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
