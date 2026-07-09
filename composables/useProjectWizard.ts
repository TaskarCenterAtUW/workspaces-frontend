import { LoadingContext } from '~/services/loading';
import { projectWizardClient } from '~/services/index';
import {
  PROJECT_WIZARD_STEPS,
  createDefaultProjectWizardDraft,
  getProjectWizardStepDefinition,
} from '~/services/project-wizard-definitions';

import type {
  ProjectWizardCreatedProjectCheckpoint,
  ProjectWizardDraft,
  ProjectWizardStepDefinition,
  ProjectWizardStepId,
  ProjectWizardStoredState,
} from '~/types/project-wizard';
import type { WorkspaceId } from '~/types/workspaces';

function createStorageKey(workspaceId: WorkspaceId) {
  return `project-wizard:${workspaceId}`;
}

function readStoredState(workspaceId: WorkspaceId): ProjectWizardStoredState | null {
  if (!import.meta.client) {
    return null;
  }

  const serializedState = localStorage.getItem(createStorageKey(workspaceId));
  if (!serializedState) {
    return null;
  }

  try {
    return JSON.parse(serializedState) as ProjectWizardStoredState;
  }
  catch {
    localStorage.removeItem(createStorageKey(workspaceId));
    return null;
  }
}

function writeStoredState(workspaceId: WorkspaceId, state: ProjectWizardStoredState) {
  if (!import.meta.client) {
    return;
  }

  localStorage.setItem(createStorageKey(workspaceId), JSON.stringify(state));
}

function clearStoredState(workspaceId: WorkspaceId) {
  if (!import.meta.client) {
    return;
  }

  localStorage.removeItem(createStorageKey(workspaceId));
}

function serializeStoredState(state: ProjectWizardStoredState) {
  return JSON.stringify(state);
}

function shouldPersistState(state: ProjectWizardStoredState) {
  if (state.createdProject) {
    return false;
  }

  const defaultState: ProjectWizardStoredState = {
    createdProject: null,
    currentStep: 'details',
    draft: createDefaultProjectWizardDraft(),
  };

  return serializeStoredState(state) !== serializeStoredState(defaultState);
}

export function useProjectWizard(workspaceId: WorkspaceId) {
  const loading = reactive(new LoadingContext());
  const creating = reactive(new LoadingContext());
  const currentStep = ref<ProjectWizardStepId>('details');
  const draft = reactive<ProjectWizardDraft>(createDefaultProjectWizardDraft());
  const createdProject = ref<ProjectWizardCreatedProjectCheckpoint | null>(null);
  const stepData = ref<ProjectWizardStepDefinition>();

  const currentStepIndex = computed(() =>
    PROJECT_WIZARD_STEPS.findIndex(step => step === currentStep.value),
  );

  const isFirstStep = computed(() => currentStepIndex.value <= 0);
  const isLastStep = computed(() => currentStepIndex.value === PROJECT_WIZARD_STEPS.length - 1);

  function applyStoredState(state: ProjectWizardStoredState | null) {
    if (!state) {
      return;
    }

    createdProject.value = null;
    currentStep.value = PROJECT_WIZARD_STEPS.includes(state.currentStep)
      ? state.currentStep
      : 'details';
    Object.assign(draft.details, state.draft.details);
    Object.assign(draft.area, state.draft.area);
    Object.assign(draft.settings, state.draft.settings);
    Object.assign(draft.review, state.draft.review);
  }

  async function loadStep(step: ProjectWizardStepId = currentStep.value) {
    loading.start();

    try {
      stepData.value = getProjectWizardStepDefinition(step);
    }
    finally {
      loading.finish();
    }
  }

  async function goToStep(step: ProjectWizardStepId) {
    if (createdProject.value) {
      return;
    }

    currentStep.value = step;
    await loadStep(step);
  }

  async function goNext() {
    if (isLastStep.value) {
      return;
    }

    const nextStep = PROJECT_WIZARD_STEPS[currentStepIndex.value + 1];
    if (nextStep) {
      await goToStep(nextStep);
    }
  }

  async function goPrevious() {
    if (createdProject.value) {
      return;
    }

    if (isFirstStep.value) {
      return;
    }

    const previousStep = PROJECT_WIZARD_STEPS[currentStepIndex.value - 1];
    if (previousStep) {
      await goToStep(previousStep);
    }
  }

  async function createProject() {
    const result = await creating.wrap(projectWizardClient, client =>
      client.createProject(workspaceId, structuredClone(toRaw(draft)))
    );

    if (!result) {
      throw new Error('Project creation did not return a result.');
    }

    createdProject.value = {
      projectId: result.projectId,
      projectName: draft.details.name.trim(),
      status: result.status,
    };

    return result;
  }

  function clearDraft() {
    clearStoredState(workspaceId);

    const defaultDraft = createDefaultProjectWizardDraft();
    Object.assign(draft.details, defaultDraft.details);
    Object.assign(draft.area, defaultDraft.area);
    Object.assign(draft.settings, defaultDraft.settings);
    Object.assign(draft.review, defaultDraft.review);
    createdProject.value = null;
    currentStep.value = 'details';
  }

  function clearPersistedState() {
    clearStoredState(workspaceId);
  }

  function hydrateDraft() {
    applyStoredState(readStoredState(workspaceId));
  }

  watch(
    [currentStep, draft, createdProject],
    () => {
      const state: ProjectWizardStoredState = {
        createdProject: structuredClone(toRaw(createdProject.value)),
        currentStep: currentStep.value,
        draft: structuredClone(toRaw(draft)),
      };

      if (!shouldPersistState(state)) {
        clearStoredState(workspaceId);
        return;
      }

      writeStoredState(workspaceId, state);
    },
    { deep: true },
  );

  return {
    clearDraft,
    clearPersistedState,
    creating,
    createdProject,
    currentStep,
    currentStepIndex,
    draft,
    goNext,
    goPrevious,
    goToStep,
    hydrateDraft,
    isFirstStep,
    isLastStep,
    loadStep,
    loading,
    stepData,
    steps: PROJECT_WIZARD_STEPS,
    createProject,
  };
}
