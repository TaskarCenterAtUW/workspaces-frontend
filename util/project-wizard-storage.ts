import { PROJECT_WIZARD_STEPS } from '~/services/project-wizard-definitions';

import type {
  ProjectWizardStepId,
  ProjectWizardStoredState,
} from '~/types/project-wizard';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isWorkspaceRole(value: unknown) {
  return value === 'lead' || value === 'validator' || value === 'contributor';
}

function isPosition(value: unknown) {
  return Array.isArray(value)
    && value.length >= 2
    && value.every(coordinate => typeof coordinate === 'number' && Number.isFinite(coordinate));
}

function isLinearRing(value: unknown) {
  return Array.isArray(value) && value.every(isPosition);
}

function isPolygonCoordinates(value: unknown) {
  return Array.isArray(value) && value.every(isLinearRing);
}

function isAreaFeature(value: unknown) {
  if (!isObject(value) || value.type !== 'Feature' || !isObject(value.geometry)) {
    return false;
  }

  return value.geometry.type === 'Polygon'
    && isPolygonCoordinates(value.geometry.coordinates)
    && (value.properties === null || isObject(value.properties));
}

function isRoleAssignment(value: unknown) {
  return isObject(value)
    && isString(value.displayName)
    && isString(value.email)
    && isWorkspaceRole(value.role)
    && isString(value.userId);
}

function isCreatedProjectCheckpoint(value: unknown) {
  return value === null
    || (
      isObject(value)
      && isString(value.projectId)
      && value.projectId.trim().length > 0
      && isString(value.projectName)
      && value.projectName.trim().length > 0
      && value.status === 'draft'
    );
}

export function isValidProjectWizardStoredState(value: unknown): value is ProjectWizardStoredState {
  if (!isObject(value)) return false;
  if (!isString(value.currentStep) || !PROJECT_WIZARD_STEPS.includes(value.currentStep as ProjectWizardStepId)) {
    return false;
  }
  if (!isCreatedProjectCheckpoint(value.createdProject)) return false;
  if (!isObject(value.draft)) return false;

  const { area, details, review, settings } = value.draft;
  if (!isObject(details)
    || !isString(details.name)
    || !isString(details.description)
    || !isString(details.imageryUrl)) {
    return false;
  }

  if (!isObject(area)
    || !isString(area.importedFileName)
    || !(area.aoi === null || isAreaFeature(area.aoi))) {
    return false;
  }

  if (!isObject(settings)
    || !isString(settings.instructions)
    || typeof settings.reviewRequired !== 'boolean'
    || typeof settings.lockTimeoutHours !== 'number'
    || !Number.isFinite(settings.lockTimeoutHours)
    || settings.lockTimeoutHours <= 0
    || !Array.isArray(settings.roleAssignments)
    || !settings.roleAssignments.every(isRoleAssignment)) {
    return false;
  }

  return isObject(review) && typeof review.acknowledged === 'boolean';
}
