import type {
  ProjectWizardAreaFeature,
  ProjectWizardCreatePayload,
  ProjectWizardCreateResult,
  ProjectWizardNameAvailabilityResponse,
  ProjectWizardTaskGenerationSummary,
} from '~/types/project-wizard';
import { simulateProjectWizardTaskGeneration } from '~/services/project-wizard-tasks';

const UNAVAILABLE_PROJECT_NAMES = new Set([
  'drc ebola 2026',
  'madagascar toamasina 1',
  'seattle test project',
]);

export async function createMockProjectWizardProject(payload: ProjectWizardCreatePayload): Promise<ProjectWizardCreateResult> {
  await new Promise(resolve => setTimeout(resolve, 320));

  const normalizedName = payload.name.trim().toLowerCase();

  if (normalizedName.includes('fail') || normalizedName.includes('error')) {
    throw new Error('Project could not be created. Please review the configuration and try again.');
  }

  return {
    projectId: crypto.randomUUID(),
    status: 'draft',
  };
}

export async function generateMockProjectWizardTasks(
  projectId: string,
  aoi: ProjectWizardAreaFeature,
  requestedTaskAreaSquareKilometers: number,
): Promise<ProjectWizardTaskGenerationSummary> {
  if (projectId.toLowerCase().includes('error')) {
    throw new Error('Tasks could not be generated. Please try again.');
  }

  return await simulateProjectWizardTaskGeneration(
    aoi,
    requestedTaskAreaSquareKilometers,
  );
}

export async function getMockProjectNameAvailabilityResponse(projectName: string): Promise<ProjectWizardNameAvailabilityResponse> {
  await new Promise(resolve => setTimeout(resolve, 220));

  const normalizedName = projectName.trim().toLowerCase();
  const isUnavailable = normalizedName.length < 3
    || UNAVAILABLE_PROJECT_NAMES.has(normalizedName)
    || normalizedName.includes('existing');

  if (isUnavailable) {
    return {
      available: false,
      message: normalizedName.length < 3
        ? 'Enter at least 3 characters'
        : 'Project name already exists',
    };
  }

  return {
    available: true,
    message: 'Name available',
  };
}
