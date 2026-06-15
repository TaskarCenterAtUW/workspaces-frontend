import type { ProjectWizardCreatePayload, ProjectWizardDraft } from '~/types/project-wizard';

export function buildProjectWizardCreatePayload(draft: ProjectWizardDraft): ProjectWizardCreatePayload {
  if (!draft.area.aoi) {
    throw new Error('Area of interest is required before creating a project.');
  }

  return {
    name: draft.details.name.trim(),
    instructions: draft.settings.instructions.trim(),
    reviewRequired: draft.settings.reviewRequired,
    lockTimeoutHours: draft.settings.lockTimeoutHours,
    aoi: draft.area.aoi,
    roleAssignments: draft.settings.roleAssignments,
  };
}
