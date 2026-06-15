import stepConfig from '~/data/project-wizard-step-config.json';

import type {
  ProjectWizardDraft,
  ProjectWizardStepDefinition,
  ProjectWizardStepId,
} from '~/types/project-wizard';

const VALID_STEP_IDS: readonly ProjectWizardStepId[] = ['details', 'area', 'tasks', 'settings', 'review'];

function parseStepDefinitions(steps: unknown): ProjectWizardStepDefinition[] {
  if (!Array.isArray(steps)) {
    throw new Error('project-wizard-step-config: "steps" must be an array.');
  }

  return steps.map((entry: unknown, index: number) => {
    if (entry === null || typeof entry !== 'object') {
      throw new Error(`project-wizard-step-config: step[${index}] must be an object.`);
    }

    const item = entry as Record<string, unknown>;

    if (!VALID_STEP_IDS.includes(item.step as ProjectWizardStepId)) {
      throw new Error(
        `project-wizard-step-config: step[${index}].step must be one of [${VALID_STEP_IDS.join(', ')}], got "${String(item.step)}".`,
      );
    }

    if (typeof item.title !== 'string' || item.title.trim() === '') {
      throw new Error(`project-wizard-step-config: step[${index}] (${String(item.step)}) must have a non-empty "title".`);
    }

    return item as unknown as ProjectWizardStepDefinition;
  });
}

const STEP_DEFINITIONS = parseStepDefinitions(stepConfig.steps);

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
      aoi: null,
      importedFileName: '',
    },
    tasks: {
      generatedSummary: null,
      instructions: '',
      taskAreaSquareKilometers: 0.45,
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
