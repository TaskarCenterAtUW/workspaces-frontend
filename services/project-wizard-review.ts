import { calculateProjectWizardAoiAreaSquareKilometers } from '~/services/project-wizard-aoi';

import type {
  ProjectWizardDraft,
  ProjectWizardTaskGenerationSummary,
  ProjectWizardWorkspaceUser,
} from '~/types/project-wizard';

export interface ProjectWizardReviewSummary {
  aoiAreaSquareKilometers: string;
  hasImageryUrl: boolean;
  imageryStatusLabel: string;
  instructionsHtml: string;
  instructionsProvided: boolean;
  lockTimeoutLabel: string;
  numberOfTasksLabel: string;
  projectDescription: string;
  projectName: string;
  reviewRequiredLabel: string;
  selectedValidators: ProjectWizardWorkspaceUser[];
}

export function buildProjectWizardReviewSummary(
  draft: ProjectWizardDraft,
  selectedValidators: ProjectWizardWorkspaceUser[],
  generatedTaskSummary: ProjectWizardTaskGenerationSummary | null,
): ProjectWizardReviewSummary {
  const hasImageryUrl = draft.details.imageryUrl.trim().length > 0;
  const instructionsHtml = sanitizeReviewHtml(draft.settings.instructions);

  return {
    projectName: draft.details.name.trim() || 'Not provided',
    projectDescription: draft.details.description.trim() || 'Not provided',
    hasImageryUrl,
    imageryStatusLabel: hasImageryUrl ? 'Working' : 'Not provided',
    numberOfTasksLabel: String(generatedTaskSummary?.totalTasks ?? 0),
    lockTimeoutLabel: `${draft.settings.lockTimeoutHours} ${draft.settings.lockTimeoutHours === 1 ? 'Hour' : 'Hours'}`,
    reviewRequiredLabel: draft.settings.reviewRequired ? 'Yes' : 'No',
    selectedValidators,
    instructionsHtml,
    instructionsProvided: instructionsHtml.trim().length > 0,
    aoiAreaSquareKilometers: draft.area.aoi
      ? formatSquareKilometers(calculateProjectWizardAoiAreaSquareKilometers(draft.area.aoi))
      : '0',
  };
}

export function sanitizeReviewHtml(html: string): string {
  if (!html.trim()) {
    return '';
  }

  return html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
    .replace(/\son[a-z]+="[^"]*"/gi, '')
    .replace(/\son[a-z]+='[^']*'/gi, '')
    .replace(/\s(href|src)\s*=\s*(['"])javascript:[\s\S]*?\2/gi, '')
    .trim();
}

function formatSquareKilometers(value: number): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
  }).format(value);
}
