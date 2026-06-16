import type {
  Feature,
  FeatureCollection,
  GeoJsonProperties,
  LineString,
  Point,
  Polygon,
} from 'geojson';

import type { WorkspaceId, WorkspaceRole } from '~/types/workspaces';

export type ProjectWizardStepId = 'details' | 'area' | 'tasks' | 'settings' | 'review';
export type ProjectWizardMapTone = 'primary' | 'accent' | 'muted';
export type ProjectWizardNameAvailabilityStatus = 'idle' | 'checking' | 'available' | 'unavailable';
export type ProjectWizardFieldType = 'text' | 'textarea';
export type ProjectWizardDetailsFieldId = 'name' | 'description' | 'imageryUrl';
export type ProjectWizardDetailsFieldDefinition = ProjectWizardFieldDefinition<ProjectWizardDetailsFieldId>;

export interface ProjectWizardFieldDefinition<FieldId extends string = string> {
  id: FieldId;
  label: string;
  placeholder: string;
  required?: boolean;
  rows?: number;
  type: ProjectWizardFieldType;
}

export type ProjectWizardMapGeometry =
  | Point
  | LineString
  | Polygon;

export interface ProjectWizardMapFeatureProperties {
  label?: string;
  tone?: ProjectWizardMapTone;
}

export type ProjectWizardMapFeature = Feature<
  ProjectWizardMapGeometry,
  ProjectWizardMapFeatureProperties
>;

export type ProjectWizardMapFeatureCollection = FeatureCollection<
  ProjectWizardMapGeometry,
  ProjectWizardMapFeatureProperties
>;

export interface ProjectWizardMapState {
  center: [number, number];
  features: ProjectWizardMapFeatureCollection;
  zoom: number;
}

export interface ProjectWizardBaseStepDefinition {
  description: string;
  nextLabel: string;
  step: ProjectWizardStepId;
  title: string;
  map: ProjectWizardMapState;
}

export interface ProjectWizardDetailsStepDefinition extends ProjectWizardBaseStepDefinition {
  step: 'details';
  content: {
    fields: ProjectWizardDetailsFieldDefinition[];
  };
}

export interface ProjectWizardAreaStepContent {
  allowedFormatLabel: string;
  dividerLabel: string;
  drawLabel: string;
  dropzoneActionLabel: string;
  resetLabel: string;
  uploadWarningThresholdSquareKilometers: number;
  uploadWarningText: string;
}

export interface ProjectWizardAreaStepDefinition extends ProjectWizardBaseStepDefinition {
  step: 'area';
  content: ProjectWizardAreaStepContent;
}

export interface ProjectWizardTasksStepDefinition extends ProjectWizardBaseStepDefinition {
  step: 'tasks';
  content?: Record<string, never>;
}

export interface ProjectWizardSettingsStepDefinition extends ProjectWizardBaseStepDefinition {
  step: 'settings';
  content?: Record<string, never>;
}

export interface ProjectWizardReviewStepDefinition extends ProjectWizardBaseStepDefinition {
  step: 'review';
  content?: Record<string, never>;
}

export type ProjectWizardStepDefinition =
  | ProjectWizardDetailsStepDefinition
  | ProjectWizardAreaStepDefinition
  | ProjectWizardTasksStepDefinition
  | ProjectWizardSettingsStepDefinition
  | ProjectWizardReviewStepDefinition;

export interface ProjectWizardNameAvailabilityResponse {
  available: boolean;
  message: string;
}

export interface ProjectWizardRoleAssignment {
  displayName: string;
  email: string;
  role: WorkspaceRole;
  userId: string;
}

export interface ProjectWizardCreateRoleAssignmentPayload {
  role: WorkspaceRole;
  userId: string;
}

export interface ProjectWizardWorkspaceUser {
  authUid: string;
  displayName: string;
  email: string;
  id: number;
  role: WorkspaceRole;
}

export type ProjectWizardAreaFeature = Feature<Polygon, GeoJsonProperties>;

export interface ProjectWizardDetailsDraft {
  description: string;
  imageryUrl: string;
  name: string;
}

export interface ProjectWizardAreaDraft {
  aoi: ProjectWizardAreaFeature | null;
  importedFileName: string;
}

export interface ProjectWizardTaskPreviewCellProperties {
  approximateAreaSquareKilometers: number;
  column?: number;
  featureKind: 'grid-fill' | 'grid-line';
  name?: string;
  row?: number;
  taskIndex?: number;
}

export type ProjectWizardTaskPreviewGeometry =
  | Polygon
  | LineString;

export type ProjectWizardTaskPreviewCellFeature = Feature<
  ProjectWizardTaskPreviewGeometry,
  ProjectWizardTaskPreviewCellProperties
>;

export type ProjectWizardTaskPreviewFeatureCollection = FeatureCollection<
  ProjectWizardTaskPreviewGeometry,
  ProjectWizardTaskPreviewCellProperties
>;

export interface ProjectWizardTaskGenerationSummary {
  aoiSignature: string;
  approximateTaskAreaSquareKilometers: number;
  generatedAt: string;
  requestedTaskAreaSquareKilometers: number;
  totalTasks: number;
}

export interface ProjectWizardTasksDraft {
  generatedSummary: ProjectWizardTaskGenerationSummary | null;
  instructions: string;
  taskAreaSquareKilometers: number;
}

export interface ProjectWizardSettingsDraft {
  instructions: string;
  lockTimeoutHours: number;
  reviewRequired: boolean;
  roleAssignments: ProjectWizardRoleAssignment[];
}

export interface ProjectWizardReviewDraft {
  acknowledged: boolean;
}

export interface ProjectWizardDraft {
  area: ProjectWizardAreaDraft;
  details: ProjectWizardDetailsDraft;
  review: ProjectWizardReviewDraft;
  settings: ProjectWizardSettingsDraft;
  tasks: ProjectWizardTasksDraft;
}

export interface ProjectWizardStoredState {
  currentStep: ProjectWizardStepId;
  draft: ProjectWizardDraft;
}

export interface ProjectWizardCreatePayload {
  aoi: ProjectWizardAreaFeature;
  instructions: string;
  lockTimeoutHours: number;
  name: string;
  reviewRequired: boolean;
  roleAssignments: ProjectWizardCreateRoleAssignmentPayload[];
}

export interface ProjectWizardCreateResult {
  projectId: string;
  status: 'draft';
}

export interface ProjectWizardState {
  currentStep: ProjectWizardStepId;
  draft: ProjectWizardDraft;
  stepData?: ProjectWizardStepDefinition;
  workspaceId: WorkspaceId;
}
