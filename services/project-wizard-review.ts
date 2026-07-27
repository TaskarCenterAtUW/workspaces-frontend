import DOMPurify from 'dompurify';

import { calculateProjectWizardAoiAreaSquareKilometers } from '~/services/project-wizard-aoi';
import { formatArea, type AreaDisplayUnit } from '~/composables/useAreaDisplayUnit';

import type {
  ProjectWizardDraft,
  ProjectWizardWorkspaceUser,
} from '~/types/project-wizard';

export interface ProjectWizardReviewSummary {
  aoiAreaLabel: string;
  hasImageryUrl: boolean;
  imageryStatusLabel: string;
  instructionsHtml: string;
  instructionsProvided: boolean;
  lockTimeoutLabel: string;
  numberOfTasksLabel: string | null;
  projectDescription: string;
  projectName: string;
  reviewRequiredLabel: string;
  selectedValidators: ProjectWizardWorkspaceUser[];
}

export function buildProjectWizardReviewSummary(
  draft: ProjectWizardDraft,
  selectedValidators: ProjectWizardWorkspaceUser[],
  areaDisplayUnit: AreaDisplayUnit = 'square_kilometers',
): ProjectWizardReviewSummary {
  const hasImageryUrl = draft.details.imageryUrl.trim().length > 0;
  const instructionsHtml = sanitizeReviewHtml(draft.settings.instructions);

  return {
    projectName: draft.details.name.trim() || 'Not provided',
    projectDescription: draft.details.description.trim() || 'Not provided',
    hasImageryUrl,
    imageryStatusLabel: hasImageryUrl ? 'Working' : 'Not provided',
    numberOfTasksLabel: null,
    lockTimeoutLabel: `${draft.settings.lockTimeoutHours} ${draft.settings.lockTimeoutHours === 1 ? 'Hour' : 'Hours'}`,
    reviewRequiredLabel: draft.settings.reviewRequired ? 'Yes' : 'No',
    selectedValidators,
    instructionsHtml,
    instructionsProvided: instructionsHtml.trim().length > 0,
    aoiAreaLabel: draft.area.aoi
      ? formatArea(
          calculateProjectWizardAoiAreaSquareKilometers(draft.area.aoi),
          areaDisplayUnit,
        )
      : formatArea(0, areaDisplayUnit),
  };
}

export function sanitizeReviewHtml(html: string): string {
  if (!html.trim()) {
    return '';
  }

  return typeof window !== 'undefined'
    ? DOMPurify.sanitize(html, { USE_PROFILES: { html: true } })
    : html;
}
