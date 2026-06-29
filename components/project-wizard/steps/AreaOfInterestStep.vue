<template>
  <section class="project-wizard-step project-wizard-step-area">
    <header class="project-wizard-step-header">
      <h2 class="project-wizard-step-title">{{ step.title }}</h2>
      <p class="project-wizard-step-copy">{{ step.description }}</p>
    </header>

    <div class="project-wizard-area-actions">
      <button
        class="btn btn-outline-secondary project-wizard-area-action"
        :class="{ 'project-wizard-area-action-active': isDrawing }"
        type="button"
        @click="emit('draw')"
      >
        <img :src="drawIcon" class="project-wizard-area-icon" alt="">
        {{ step.content.drawLabel }}
      </button>

      <button
        class="btn btn-outline-secondary project-wizard-area-action project-wizard-area-action-reset"
        type="button"
        :disabled="!hasAoi && !importedFileName && !isDrawing"
        @click="emit('reset')"
      >
        <img :src="resetIcon" class="project-wizard-area-icon" alt="">
        {{ step.content.resetLabel }}
      </button>
    </div>

    <section
      v-if="hasAoi"
      class="project-wizard-area-captured"
      aria-live="polite"
    >
      <div class="project-wizard-area-captured-copy">
        <app-icon variant="check_circle" size="18" no-margin />
        <div>
          <strong>Area of interest captured</strong>
          <p>{{ importedFileName ? 'The uploaded GeoJSON is active on the map.' : 'The drawn polygon is active on the map.' }}</p>
        </div>
      </div>

      <button
        class="btn btn-light project-wizard-area-download"
        type="button"
        @click="emit('download')"
      >
        <app-icon variant="download" size="18" no-margin />
        Download Area of Interest
      </button>
    </section>

    <div class="project-wizard-area-divider" aria-hidden="true">
      <span>{{ step.content.dividerLabel }}</span>
    </div>

    <div
      class="project-wizard-area-dropzone-shell"
      :class="{ 'project-wizard-area-dropzone-shell-dragging': isDraggingFile }"
      @dragenter.prevent="isDraggingFile = true"
      @dragover.prevent="isDraggingFile = true"
      @dragleave.prevent="isDraggingFile = false"
      @drop.prevent="onFileDrop"
    >
      <input
        ref="fileInputRef"
        class="visually-hidden"
        type="file"
        accept=".json,.geojson,application/json"
        @change="onFileInputChange"
      >

      <button
        class="project-wizard-area-dropzone"
        type="button"
        @click="openFilePicker"
      >
        <span class="project-wizard-area-dropzone-icon">
          <img :src="uploadIcon" class="project-wizard-area-upload-icon" alt="">
        </span>
        <span class="project-wizard-area-dropzone-copy">{{ step.content.dropzoneActionLabel }}</span>
        <span class="project-wizard-area-dropzone-meta">{{ step.content.allowedFormatLabel }}</span>
      </button>
    </div>

    <div
      v-if="importedFileName"
      class="project-wizard-area-file"
    >
      <div class="project-wizard-area-file-copy">
        <app-icon variant="description" size="20" no-margin />
        <span>{{ importedFileName }}</span>
      </div>

      <button
        class="project-wizard-area-file-clear btn btn-link"
        type="button"
        aria-label="Remove imported AOI file"
        @click="emit('reset')"
      >
        <app-icon variant="close" size="20" no-margin />
      </button>
    </div>

    <section
      v-if="warningMessage"
      class="project-wizard-area-message project-wizard-area-message-warning"
      aria-live="polite"
    >
      <img :src="warningIcon" class="project-wizard-area-warning-icon" alt="">
      <span>{{ warningMessage }}</span>
    </section>

    <section
      v-if="errorMessage"
      class="project-wizard-area-message project-wizard-area-message-error"
      role="alert"
    >
      <img :src="warningIcon" class="project-wizard-area-warning-icon" alt="">
      <span>{{ errorMessage }}</span>
    </section>
  </section>
</template>

<script setup lang="ts">
import drawIcon from '~/assets/img/draw.svg';
import resetIcon from '~/assets/img/reset.svg';
import uploadIcon from '~/assets/img/upload.svg';
import warningIcon from '~/assets/img/warning.svg';

import type { ProjectWizardAreaStepDefinition } from '~/types/project-wizard';

interface Props {
  errorMessage: string;
  hasAoi: boolean;
  importedFileName: string;
  isDrawing: boolean;
  step: ProjectWizardAreaStepDefinition;
  warningMessage: string;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  download: [];
  draw: [];
  reset: [];
  upload: [file: File];
}>();

const fileInputRef = useTemplateRef<HTMLInputElement>('fileInputRef');
const isDraggingFile = ref(false);

watch(
  () => props.importedFileName,
  () => {
    if (fileInputRef.value) {
      fileInputRef.value.value = '';
    }
  },
);

function openFilePicker() {
  fileInputRef.value?.click();
}

function onFileInputChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];

  if (!file) {
    return;
  }

  emit('upload', file);
  input.value = '';
}

function onFileDrop(event: DragEvent) {
  isDraggingFile.value = false;

  const file = event.dataTransfer?.files?.[0];

  if (!file) {
    return;
  }

  emit('upload', file);
}
</script>

<style lang="scss" scoped>
@import "~/assets/scss/theme.scss";

.project-wizard-step-area {
  display: grid;
  gap: 1.35rem;
}

.project-wizard-step-header {
  display: grid;
  gap: 0.25rem;
}

.project-wizard-step-title {
  margin: 0;
  color: $text-navy;
  font-family: var(--secondary-font-family);
  font-size: 1rem;
  font-weight: 700;
  line-height: 1.15;
  text-transform: uppercase;
}

.project-wizard-step-copy {
  margin: 0;
  color: rgba($secondary, 0.95);
  font-size: 0.95rem;
  line-height: 1.45;
}

.project-wizard-area-actions {
  display: flex;
  align-items: center;
  gap: 0.9rem;
}

.project-wizard-area-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  min-width: 8.5rem;
  min-height: 2.8rem;
}

.project-wizard-area-icon {
  width: 1rem;
  height: 1rem;
  display: block;
  flex: 0 0 auto;
}

.project-wizard-area-action-active {
  color: $primary;
  border-color: rgba($primary, 0.3);
  background-color: rgba($primary, 0.05);
}

.project-wizard-area-action-reset {
  color: $danger-red;
  background-color: #fff;
  border-color: rgba($text-navy, 0.14);
}

.project-wizard-area-action-reset:hover:not(:disabled),
.project-wizard-area-action-reset:focus-visible:not(:disabled) {
  color: $danger-red;
  background-color: #fff;
  border-color: rgba($text-navy, 0.18);
}

.project-wizard-area-divider {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba($secondary, 0.85);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.06em;
}

.project-wizard-area-divider::before {
  content: "";
  position: absolute;
  inset: 50% 0 auto;
  border-top: 1px solid rgba($text-navy, 0.1);
}

.project-wizard-area-divider span {
  width: 2rem;
  height: 2rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  position: relative;
  z-index: 1;
  padding: 0;
  border-radius: 999px;
  background: #f5f5f5 0% 0% no-repeat padding-box;
}

.project-wizard-area-captured {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.95rem 1rem;
  background: #f3fcf8;
  border: 1px solid #bcebdd;
  border-radius: 0.55rem;
}

.project-wizard-area-captured-copy {
  min-width: 0;
  display: inline-flex;
  align-items: flex-start;
  gap: 0.65rem;
  color: #195747;
}

.project-wizard-area-captured-copy strong,
.project-wizard-area-captured-copy p {
  margin: 0;
}

.project-wizard-area-captured-copy strong {
  display: block;
  font-size: 0.95rem;
  font-weight: 700;
}

.project-wizard-area-captured-copy p {
  margin-top: 0.12rem;
  color: rgba($secondary, 0.92);
  font-size: 0.88rem;
  line-height: 1.45;
}

.project-wizard-area-download {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  color: $text-navy;
  background: #ffffff;
  border: 1px solid rgba($text-navy, 0.14);
}

.project-wizard-area-dropzone-shell {
  border: 1px dashed rgba($text-navy, 0.28);
  border-radius: 0.35rem;
  transition: border-color 0.2s ease, background-color 0.2s ease;
}

.project-wizard-area-dropzone-shell-dragging {
  border-color: rgba($primary, 0.45);
  background-color: rgba($primary, 0.04);
}

.project-wizard-area-dropzone {
  width: 100%;
  display: grid;
  justify-items: center;
  gap: 0.55rem;
  padding: 1.7rem 1rem;
  text-align: center;
  color: $text-navy;
  background: transparent;
  border: 0;
}

.project-wizard-area-dropzone-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.project-wizard-area-upload-icon {
  width: 1.2rem;
  height: 1.2rem;
  display: block;
}

.project-wizard-area-dropzone-copy {
  font-family: var(--secondary-font-family);
  font-size: 1rem;
  font-weight: 600;
  line-height: 1.3;
}

.project-wizard-area-dropzone-meta,
.project-wizard-area-dropzone-description {
  color: rgba($secondary, 0.92);
  font-size: 0.88rem;
  line-height: 1.4;
}

.project-wizard-area-file {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.9rem 1rem;
  border: 1px solid rgba($text-navy, 0.1);
  border-radius: 0.35rem;
}

.project-wizard-area-file-copy {
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  color: $text-navy;
  font-weight: 500;
}

.project-wizard-area-file-copy span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-wizard-area-file-clear {
  color: $danger-red;
  text-decoration: none;
}

.project-wizard-area-message {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  padding: 0.85rem 0.95rem;
  font-size: 0.92rem;
  line-height: 1.45;
  border-radius: 0.35rem;
}

.project-wizard-area-warning-icon {
  width: 1rem;
  height: 1rem;
  display: block;
  flex: 0 0 auto;
}

.project-wizard-area-message-warning {
  color: #8d4f24;
  background-color: #fff7ee;
  border: 1px solid #f0d3b5;
}

.project-wizard-area-message-error {
  color: #a13032;
  background-color: #fff3f2;
  border: 1px solid #f1c6c3;
}

@include media-breakpoint-down(sm) {
  .project-wizard-area-actions {
    flex-direction: column;
    align-items: stretch;
  }

  .project-wizard-area-action {
    width: 100%;
  }

  .project-wizard-area-captured {
    flex-direction: column;
    align-items: stretch;
  }

  .project-wizard-area-download {
    justify-content: center;
  }
}
</style>
