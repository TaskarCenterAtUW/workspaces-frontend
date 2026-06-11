import stepConfig from '~/data/project-wizard-step-config.json';

import type {
  ProjectWizardAreaFeature,
  ProjectWizardDraft,
  ProjectWizardStepDefinition,
  ProjectWizardStepId,
} from '~/types/project-wizard';

const DEFAULT_AOI: ProjectWizardAreaFeature = {
  type: 'Feature',
  geometry: {
    type: 'Polygon',
    coordinates: [[
      [-122.48, 47.73],
      [-122.13, 47.73],
      [-122.13, 47.49],
      [-122.48, 47.49],
      [-122.48, 47.73],
    ]],
  },
  properties: {},
};

const STEP_DEFINITIONS = stepConfig.steps as ProjectWizardStepDefinition[];

export const PROJECT_WIZARD_STEPS: ProjectWizardStepId[] = STEP_DEFINITIONS.map(step => step.step);

export function getProjectWizardStepDefinition(stepId: ProjectWizardStepId): ProjectWizardStepDefinition {
  const stepDefinition = STEP_DEFINITIONS.find(step => step.step === stepId);

  if (!stepDefinition) {
    throw new Error(`Missing project wizard step definition for "${stepId}".`);
  }

  return stepDefinition;
}

export function createDefaultProjectWizardDraft(): ProjectWizardDraft {
  return {
    details: {
      name: '',
      description: '',
      imageryUrl: '',
    },
    area: {
      aoi: structuredClone(DEFAULT_AOI),
    },
    tasks: {
      instructions: '',
    },
    settings: {
      reviewRequired: true,
      lockTimeoutHours: 8,
      roleAssignments: [],
    },
    review: {
      acknowledged: false,
    },
  };
}
