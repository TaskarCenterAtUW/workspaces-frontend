<template>
  <app-page
    fluid
    class="project-create-page"
  >
    <section
      class="project-create-shell"
      :class="`project-create-shell-step-${currentStep}`"
    >
      <header class="project-create-header">
        <div class="project-create-header-copy">
          <h1 class="project-create-title">Create New Project</h1>
          <div class="project-create-workspace-copy">
            <span class="project-create-workspace-label">Workspace</span>
            <strong>{{ workspace.title }}</strong>
          </div>
        </div>

        <button
          class="project-create-close btn btn-link"
          type="button"
          aria-label="Close create project flow"
          :disabled="creating.active"
          @click="exitWizard()"
        >
          <app-icon
            variant="close"
            size="28"
            no-margin
          />
        </button>
      </header>

      <div class="project-create-body">
        <aside class="project-create-panel">
          <div class="project-create-panel-card">
            <project-wizard-stepper
              :steps="steps"
              :current-index="currentStepIndex"
              :selection-locked="Boolean(createdProject)"
              @select="onSelectStep"
            />

            <p
              class="visually-hidden"
              aria-live="polite"
            >
              {{ liveRegionMessage }}
            </p>

            <div class="project-create-step-frame">
              <div
                v-if="loading.active && !stepData"
                class="project-create-loading"
              >
                <app-spinner />
              </div>

              <template v-else-if="stepData">
                <project-wizard-steps-project-details-step
                  v-if="detailsStep"
                  :step="detailsStep"
                  :details="draft.details"
                  :imagery-error="imageryError"
                  :imagery-validating="imageryValidating"
                  :name-availability-status="nameAvailabilityStatus"
                  :name-availability-message="nameAvailabilityMessage"
                  @update:field="updateDetailsField"
                />

                <project-wizard-steps-area-of-interest-step
                  v-else-if="areaStep"
                  :step="areaStep"
                  :error-message="areaImportError"
                  :has-aoi="Boolean(draft.area.aoi)"
                  :imported-file-name="draft.area.importedFileName"
                  :is-drawing="isAreaDrawMode"
                  :warning-message="areaWarningMessage"
                  @download="downloadAreaOfInterest"
                  @draw="startAreaDrawMode"
                  @reset="resetAreaOfInterest"
                  @upload="importAreaOfInterest"
                />
                <project-wizard-steps-settings-step
                  v-else-if="settingsStep"
                  :step="settingsStep"
                  :instructions="draft.settings.instructions"
                  :lock-timeout-hours="draft.settings.lockTimeoutHours"
                  :review-required="draft.settings.reviewRequired"
                  :selected-validators="selectedValidators"
                  :validator-search-query="validatorSearchQuery"
                  :workspace-users="filteredWorkspaceUsers"
                  :workspace-users-error="workspaceUsersError"
                  :workspace-users-loading="workspaceUsersLoading"
                  @add:validator="addValidator"
                  @retry:workspace-users="retryLoadWorkspaceUsers"
                  @remove:validator="removeValidator"
                  @update:instructions="updateInstructions"
                  @update:lock-timeout-hours="updateLockTimeoutHours"
                  @update:review-required="updateReviewRequired"
                  @update:validator-search="updateValidatorSearchQuery"
                />

                <project-wizard-steps-review-step
                  v-else-if="reviewStep"
                  :step="reviewStep"
                  :summary="reviewSummary"
                />
              </template>
            </div>

            <footer class="project-create-footer">
              <button
                class="btn btn-link project-create-cancel-action"
                type="button"
                :disabled="loading.active || creating.active"
                @click="exitWizard()"
              >
                Cancel
              </button>

              <div class="project-create-footer-actions">
                <button
                  v-if="showPreviousAction"
                  class="btn btn-outline-secondary project-create-secondary-action"
                  type="button"
                  :disabled="loading.active || creating.active"
                  @click="onSecondaryAction"
                >
                  <app-icon
                    variant="chevron_left"
                    no-margin
                  />
                  Prev
                </button>

                <button
                  class="btn btn-primary project-create-primary-action"
                  type="button"
                  :disabled="!canProceed || loading.active || creating.active"
                  @click="onPrimaryAction"
                >
                  <app-spinner
                    v-if="creating.active"
                    size="sm"
                  />
                  <template v-else>
                    {{ primaryActionLabel }}
                    <app-icon
                      v-if="!isLastStep"
                      variant="chevron_right"
                      no-margin
                    />
                  </template>
                </button>
              </div>
            </footer>
          </div>
        </aside>

        <section class="project-create-map-panel">
          <LazyProjectWizardAoiGeometryMap
            v-if="stepData"
            :aoi="displayedAoi"
            :camera-padding="mapPadding"
            :draw-mode="isAreaStepActive && isAreaDrawMode"
            :editable="isAreaStepActive"
            :map-state="stepData.map"
            @update:aoi="updateAreaFeature"
            @update:draw-mode="updateAreaDrawMode"
          />
        </section>
      </div>

      <project-wizard-status-dialog
        :visible="Boolean(statusDialog)"
        :variant="statusDialog?.variant ?? 'success'"
        :title="statusDialog?.title ?? ''"
        :message="statusDialog?.message ?? ''"
        :primary-action-label="statusDialog?.primaryActionLabel ?? ''"
        :secondary-action-label="statusDialog?.secondaryActionLabel"
        @close="closeStatusDialog"
        @primary-action="handleStatusDialogPrimaryAction"
        @secondary-action="handleStatusDialogSecondaryAction"
      />
    </section>
  </app-page>
</template>

<script setup lang="ts">
import { projectWizardClient, workspacesClient } from '~/services/index';
import { resolveHttpErrorMessage } from '~/services/http';
import { validateProjectCustomImagery } from '~/services/project-custom-imagery';
import { buildProjectWizardReviewSummary } from '~/services/project-wizard-review';

import type {
  ProjectWizardAreaStepDefinition,
  ProjectWizardCreateResult,
  ProjectWizardDetailsFieldId,
  ProjectWizardDetailsStepDefinition,
  ProjectWizardNameAvailabilityStatus,
  ProjectWizardReviewStepDefinition,
  ProjectWizardSettingsStepDefinition,
  ProjectWizardStepId,
} from '~/types/project-wizard';

const route = useRoute();
const workspaceId = Number(route.params.id);

if (!Number.isInteger(workspaceId) || workspaceId <= 0) {
  throw createError({ statusCode: 404, statusMessage: 'Workspace not found.' });
}

const workspace = await workspacesClient.getWorkspace(workspaceId).catch((error) => {
  throw createError({ statusCode: 500, statusMessage: 'Failed to load workspace.', data: error });
});
const projectsRoute = `/workspace/${workspaceId}/projects`;
const PROJECT_NAME_CHECK_DEBOUNCE_MS = 300;
const IMAGERY_VALIDATION_DEBOUNCE_MS = 300;
const imagerySchemaUrl = import.meta.env.VITE_IMAGERY_SCHEMA;

const {
  creating,
  createdProject,
  currentStep,
  currentStepIndex,
  clearPersistedState,
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
  steps,
  createProject,
} = useProjectWizard(workspaceId);

if (import.meta.client) {
  hydrateDraft();
}

await loadStep(currentStep.value);

const detailsStep = computed(() =>
  stepData.value?.step === 'details' ? stepData.value as ProjectWizardDetailsStepDefinition : undefined,
);
const areaStep = computed(() =>
  stepData.value?.step === 'area' ? stepData.value as ProjectWizardAreaStepDefinition : undefined,
);
const settingsStep = computed(() =>
  stepData.value?.step === 'settings' ? stepData.value as ProjectWizardSettingsStepDefinition : undefined,
);
const reviewStep = computed(() =>
  stepData.value?.step === 'review' ? stepData.value as ProjectWizardReviewStepDefinition : undefined,
);

const nameAvailabilityStatus = ref<ProjectWizardNameAvailabilityStatus>('idle');
const nameAvailabilityMessage = ref('');
const imageryError = ref<string | null>(null);
const imagerySchema = ref<object>();
const imageryValidating = ref(false);
const {
  areaImportError,
  areaWarningMessage,
  downloadAreaOfInterest,
  displayedAoi,
  importAreaOfInterest,
  isAreaDrawMode,
  isAreaStepActive,
  resetAreaOfInterest,
  startAreaDrawMode,
  updateAreaDrawMode,
  updateAreaFeature,
} = useProjectWizardAoi({
  areaStep,
  currentStep,
  draft,
});
const {
  addValidator,
  filteredWorkspaceUsers,
  removeValidator,
  selectedValidators,
  updateInstructions,
  updateLockTimeoutHours,
  updateReviewRequired,
  updateValidatorSearchQuery,
  validatorSearchQuery,
  workspaceUsersError,
  workspaceUsersLoading,
  retryLoadWorkspaceUsers,
} = useProjectWizardSettings({
  currentStep,
  draft,
  projectGroupId: workspace.tdeiProjectGroupId,
});
const reviewSummary = computed(() =>
  buildProjectWizardReviewSummary(
    draft,
    selectedValidators.value,
  ),
);

const detailsStepComplete = computed(() =>
  draft.details.name.trim().length > 0
  && nameAvailabilityStatus.value === 'available'
  && !imageryValidating.value
  && !imageryError.value,
);

const areaStepComplete = computed(() => Boolean(draft.area.aoi));

const canProceed = computed(() => {
  switch (currentStep.value) {
    case 'details':
      return draft.details.name.trim().length > 0
        && nameAvailabilityStatus.value === 'available'
        && !imageryValidating.value
        && !imageryError.value;
    case 'area':
      return Boolean(draft.area.aoi);
    case 'review':
      return !createdProject.value && detailsStepComplete.value && areaStepComplete.value;
    default:
      return true;
  }
});

const primaryActionLabel = computed(() => {
  if (currentStep.value === 'review') {
    return 'Create Project';
  }

  return stepData.value?.nextLabel ?? (isLastStep.value ? 'Finish' : 'Next');
});

const liveRegionMessage = computed(() =>
  loading.active
    ? 'Loading project wizard step.'
    : `Project wizard step ${currentStepIndex.value + 1} of ${steps.length}: ${stepData.value?.title ?? ''}.`,
);

const showPreviousAction = computed(() =>
  !isFirstStep.value && !createdProject.value,
);

type StatusDialogState = {
  message: string;
  primaryActionLabel: string;
  primaryActionType: 'navigate' | 'retry-create';
  primaryRoute: string;
  secondaryActionLabel?: string;
  secondaryRoute?: string;
  title: string;
  variant: 'error' | 'success';
};

const statusDialog = ref<StatusDialogState | null>(null);

const mapPadding = ref({
  top: 56,
  right: 56,
  bottom: 56,
  left: 580,
});

let nameCheckDebounce: ReturnType<typeof setTimeout> | undefined;
let nameCheckRequestId = 0;
let imageryValidationDebounce: ReturnType<typeof setTimeout> | undefined;
let imageryValidationRequestId = 0;

function syncMapPadding() {
  if (!import.meta.client) {
    return;
  }

  mapPadding.value = window.innerWidth >= 992
    ? {
        top: 56,
        right: 56,
        bottom: 56,
        left: 580,
      }
    : {
        top: 28,
        right: 28,
        bottom: 28,
        left: 28,
      };
}

onMounted(() => {
  syncMapPadding();
  window.addEventListener('resize', syncMapPadding, { passive: true });
});

onBeforeUnmount(() => {
  if (nameCheckDebounce) {
    clearTimeout(nameCheckDebounce);
  }
  if (imageryValidationDebounce) {
    clearTimeout(imageryValidationDebounce);
  }

  nameCheckRequestId += 1;
  imageryValidationRequestId += 1;
  window.removeEventListener('resize', syncMapPadding);
});

watch(
  () => draft.details.name,
  (projectName) => {
    const trimmedProjectName = projectName.trim();

    if (nameCheckDebounce) {
      clearTimeout(nameCheckDebounce);
    }

    nameCheckRequestId += 1;

    if (!trimmedProjectName) {
      nameAvailabilityStatus.value = 'idle';
      nameAvailabilityMessage.value = '';
      return;
    }

    nameAvailabilityStatus.value = 'checking';
    nameAvailabilityMessage.value = 'Checking name...';

    const requestId = nameCheckRequestId;
    nameCheckDebounce = setTimeout(async () => {
      try {
        const response = await projectWizardClient.checkProjectNameAvailability(workspaceId, trimmedProjectName);

        if (requestId !== nameCheckRequestId) {
          return;
        }

        nameAvailabilityStatus.value = response.available ? 'available' : 'unavailable';
        nameAvailabilityMessage.value = response.message;
      }
      catch {
        if (requestId !== nameCheckRequestId) {
          return;
        }

        nameAvailabilityStatus.value = 'unavailable';
        nameAvailabilityMessage.value = 'Unable to check name';
      }
    }, PROJECT_NAME_CHECK_DEBOUNCE_MS);
  },
  { immediate: true },
);

watch(
  () => draft.details.imageryUrl,
  (customImagery) => {
    if (imageryValidationDebounce) {
      clearTimeout(imageryValidationDebounce);
    }

    imageryValidationRequestId += 1;
    imageryError.value = null;

    if (!customImagery.trim()) {
      imageryValidating.value = false;
      return;
    }

    imageryValidating.value = true;
    const requestId = imageryValidationRequestId;
    imageryValidationDebounce = setTimeout(async () => {
      const result = await validateCustomImagery(customImagery);

      if (requestId !== imageryValidationRequestId) {
        return;
      }

      imageryError.value = result.error;
      imageryValidating.value = false;
    }, IMAGERY_VALIDATION_DEBOUNCE_MS);
  },
  { immediate: true },
);

async function validateCustomImagery(customImagery = draft.details.imageryUrl) {
  return await validateProjectCustomImagery(
    customImagery,
    imagerySchemaUrl,
    imagerySchema,
  );
}

function updateDetailsField(fieldId: ProjectWizardDetailsFieldId, value: string) {
  draft.details[fieldId] = value;
}

async function leaveWizard(targetRoute: string) {
  clearPersistedState();
  await navigateTo(targetRoute);
}

async function exitWizard() {
  await leaveWizard(projectsRoute);
}

async function onPrimaryAction() {
  if (currentStep.value === 'details' && draft.details.imageryUrl.trim()) {
    imageryValidating.value = true;
    const result = await validateCustomImagery();
    imageryError.value = result.error;
    imageryValidating.value = false;

    if (result.error) {
      return;
    }
  }

  if (currentStep.value === 'review') {
    await submitProject();
    return;
  }

  await goNext();
}

async function onSecondaryAction() {
  if (isFirstStep.value || createdProject.value) {
    await exitWizard();
    return;
  }

  await goPrevious();
}

async function onSelectStep(step: ProjectWizardStepId) {
  if (createdProject.value) {
    return;
  }

  if (step === 'review' && (!detailsStepComplete.value || !areaStepComplete.value)) {
    return;
  }

  await goToStep(step);
}

function closeStatusDialog() {
  statusDialog.value = null;
}

async function handleStatusDialogPrimaryAction() {
  const dialog = statusDialog.value;
  closeStatusDialog();

  if (!dialog) {
    return;
  }

  if (dialog.primaryActionType === 'retry-create') {
    await submitProject();
    return;
  }

  if (dialog.primaryRoute) {
    await leaveWizard(dialog.primaryRoute);
  }
}

async function handleStatusDialogSecondaryAction() {
  const targetRoute = statusDialog.value?.secondaryRoute;
  closeStatusDialog();

  if (targetRoute) {
    await leaveWizard(targetRoute);
  }
}

async function submitProject() {
  try {
    const imageryResult = await validateCustomImagery();
    if (imageryResult.error) {
      throw new Error(imageryResult.error);
    }

    const result = await createProject();

    openProjectCreationSuccessDialog(result);
  }
  catch (error) {
    await openProjectCreationErrorDialog(error);
  }
}

function openProjectCreationSuccessDialog(result: ProjectWizardCreateResult) {
  const projectName = createdProject.value?.projectName || draft.details.name.trim();

  statusDialog.value = {
    variant: 'success',
    title: 'Success!',
    message: `Project ${projectName} created successfully. Generate and save tasks from the Tasks tab when you are ready. It is now in ${formatProjectStatus(result.status)} status.`,
    primaryActionLabel: 'Open Tasks Tab',
    primaryActionType: 'navigate',
    primaryRoute: createdProject.value
      ? `/workspace/${workspaceId}/projects/${encodeURIComponent(createdProject.value.projectId)}?tab=tasks`
      : projectsRoute,
    secondaryActionLabel: 'Go to Projects',
    secondaryRoute: projectsRoute,
  };
}

async function openProjectCreationErrorDialog(error: unknown) {
  statusDialog.value = {
    variant: 'error',
    title: 'Something went wrong',
    message: await resolveHttpErrorMessage(
      error,
      'Project could not be created. Please try again.',
    ),
    primaryActionLabel: 'Try Again',
    primaryActionType: 'retry-create',
    primaryRoute: '',
  };
}

function formatProjectStatus(status: ProjectWizardCreateResult['status']) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}
</script>

<style lang="scss" scoped>
@import "~/assets/scss/theme.scss";

.project-create-page {
  height: calc(100vh - #{$navbar-height});
  padding-top: 1rem !important;
  padding-bottom: 1rem !important;
  overflow: hidden;
}

.project-create-shell {
  position: relative;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  height: 100%;
  background: #a9d3e6;
  border: 1px solid rgba($text-navy, 0.12);
  box-shadow: $box-shadow;
  overflow: hidden;
}

.project-create-header {
  position: relative;
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.2rem 1.5rem;
  background-color: #fff;
  border-bottom: 1px solid rgba($text-navy, 0.1);
}

.project-create-header-copy {
  display: flex;
  align-items: center;
  gap: 1.55rem;
}

.project-create-title {
  margin: 0;
  padding-right: 1.45rem;
  color: $text-navy;
  font-family: var(--secondary-font-family);
  font-size: 1.15rem;
  font-weight: 700;
  line-height: 1.2;
  border-right: 1px solid rgba($text-navy, 0.15);
}

.project-create-workspace-copy {
  display: grid;
  gap: 0.05rem;
  color: $text-navy;
}

.project-create-workspace-label {
  color: rgba($secondary, 0.95);
  font-size: 0.95rem;
}

.project-create-workspace-copy strong {
  font-family: var(--secondary-font-family);
  font-size: 0.95rem;
  font-weight: 600;
}

.project-create-close {
  color: rgba($text-navy, 0.7);
  text-decoration: none;
}

.project-create-body {
  position: relative;
  min-height: 0;
}

.project-create-panel {
  position: absolute;
  top: 2rem;
  left: 2rem;
  bottom: 2rem;
  z-index: 2;
  width: min(30.5rem, calc(100% - 4rem));
}

.project-create-panel-card {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  height: 100%;
  background-color: #fff;
  border: 1px solid rgba($text-navy, 0.1);
  box-shadow: 0 0.45rem 1.2rem rgba($text-navy, 0.08);
  overflow: hidden;
}

.project-create-panel-card :deep(.tdei-select-toggle),
.project-create-panel-card :deep(.tdei-select-menu),
.project-create-panel-card :deep(.form-control),
.project-create-panel-card :deep(.btn) {
  border-radius: 0.35rem;
}

.project-create-panel-card :deep(.form-control) {
  min-height: 2.7rem;
}

.project-create-panel-card :deep(textarea.form-control) {
  min-height: auto;
}

.project-create-panel-card :deep(.project-wizard-stepper) {
  padding: 1.35rem 1.4rem;
  border-bottom: 1px solid rgba($text-navy, 0.1);
}

.project-create-step-frame {
  min-height: 0;
  padding: 1.5rem 1.4rem;
  overflow-y: auto;
}

.project-create-loading {
  min-height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.project-create-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem 1.4rem;
  border-top: 1px solid rgba($text-navy, 0.1);
  background-color: #fff;
}

.project-create-footer-actions {
  display: inline-flex;
  align-items: center;
  gap: 0.85rem;
}

.project-create-cancel-action {
  padding: 0;
  color: rgba($secondary, 0.98);
  font-weight: 600;
  text-decoration: none;
}

.project-create-cancel-action:hover,
.project-create-cancel-action:focus-visible {
  color: $text-navy;
  text-decoration: none;
}

.project-create-secondary-action,
.project-create-primary-action {
  min-width: 6.25rem;
  min-height: 2.55rem;
}

.project-create-primary-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
}

.project-create-map-panel {
  position: absolute;
  inset: 0;
  min-height: 0;
}

.project-create-map-panel :deep(.project-wizard-map),
.project-create-map-panel :deep(.maplibregl-map) {
  width: 100%;
  height: 100%;
}

@include media-breakpoint-down(lg) {
  .project-create-page {
    height: auto;
    overflow: visible;
  }

  .project-create-shell {
    height: auto;
    min-height: calc(100vh - #{$navbar-height} - 2rem);
  }

  .project-create-header-copy {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.8rem;
  }

  .project-create-title {
    padding-right: 0;
    border-right: 0;
  }

  .project-create-body {
    display: grid;
    grid-template-rows: auto 26rem;
  }

  .project-create-panel {
    position: relative;
    top: auto;
    left: auto;
    bottom: auto;
    width: auto;
    padding: 1.25rem;
  }

  .project-create-map-panel {
    position: relative;
    min-height: 26rem;
  }
}

@include media-breakpoint-down(md) {
  .project-create-panel {
    padding: 1rem;
  }

  .project-create-header {
    padding: 1rem 1.1rem;
  }

  .project-create-footer {
    flex-direction: column-reverse;
    align-items: stretch;
  }

  .project-create-footer-actions {
    width: 100%;
    justify-content: space-between;
  }

  .project-create-secondary-action,
  .project-create-primary-action {
    width: 100%;
  }
}
</style>
