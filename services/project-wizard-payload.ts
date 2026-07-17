import { sanitizeReviewHtml } from '~/services/project-wizard-review';

import type {
  ProjectWizardCreatePayload,
  ProjectWizardCustomImagery,
  ProjectWizardDraft,
} from '~/types/project-wizard';

export function parseProjectWizardCustomImagery(value: string): ProjectWizardCustomImagery | null {
  const normalizedValue = value.trim();

  if (!normalizedValue) {
    return null;
  }

  const parsedValue = JSON.parse(normalizedValue) as unknown;

  if (parsedValue === null || typeof parsedValue !== 'object' || Array.isArray(parsedValue)) {
    throw new Error('Custom imagery must be a single JSON object.');
  }

  return parsedValue as ProjectWizardCustomImagery;
}

export function buildProjectWizardCreatePayload(draft: ProjectWizardDraft): ProjectWizardCreatePayload {
  if (!draft.area.aoi) {
    throw new Error('Area of interest is required before creating a project.');
  }

  return {
    name: draft.details.name.trim(),
    description: draft.details.description.trim() || null,
    custom_imagery: parseProjectWizardCustomImagery(draft.details.imageryUrl),
    instructions: sanitizeReviewHtml(draft.settings.instructions).trim(),
    review_required: draft.settings.reviewRequired,
    lock_timeout_hours: draft.settings.lockTimeoutHours,
    aoi: draft.area.aoi.geometry,
    role_assignments: draft.settings.roleAssignments.map(assignment => ({
      user_id: assignment.userId,
      role: assignment.role,
    })),
  };
}
