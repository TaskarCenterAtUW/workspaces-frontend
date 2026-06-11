import type { ProjectWizardCreatePayload, ProjectWizardDraft } from '~/types/project-wizard';

export function buildProjectWizardCreatePayload(draft: ProjectWizardDraft): ProjectWizardCreatePayload {
  return {
    name: draft.details.name.trim(),
    instructions: draft.details.description.trim(),
    reviewRequired: draft.settings.reviewRequired,
    lockTimeoutHours: draft.settings.lockTimeoutHours,
    aoi: draft.area.aoi,
    roleAssignments: draft.settings.roleAssignments,
  };
}
