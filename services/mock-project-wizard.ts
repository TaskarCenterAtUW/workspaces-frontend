import type {
  ProjectWizardCreatePayload,
  ProjectWizardCreateResult,
  ProjectWizardNameAvailabilityResponse,
} from '~/types/project-wizard';

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
