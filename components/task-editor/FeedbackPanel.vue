<!--
  Displays reviewer feedback for a task as a list of categorized cards.
  For example, `.task-editor-feedback-card` styles each feedback entry's container.
-->
<template>
  <section
    class="task-editor-feedback-panel"
    aria-labelledby="task-editor-feedback-heading"
  >
    <div class="task-editor-feedback-heading">
      <h2 id="task-editor-feedback-heading">
        Feedback<span v-if="feedback.length"> ({{ feedback.length }})</span>
      </h2>
      <p v-if="feedback.length">
        Feedback submitted for this task.
      </p>
    </div>

    <p
      v-if="!feedback.length"
      class="task-editor-feedback-empty"
    >
      No feedback has been submitted for this task.
    </p>

    <ul
      v-else
      class="task-editor-feedback-list"
    >
      <li
        v-for="item in feedbackItems"
        :key="item.key"
      >
        <article class="task-editor-feedback-card">
          <div class="task-editor-feedback-category">
            <span
              class="task-editor-feedback-dot"
              :class="item.categoryClass"
              aria-hidden="true"
            />
            <span class="task-editor-feedback-badge">{{ item.reasonLabel }}</span>
          </div>

          <p class="task-editor-feedback-notes">
            {{ item.notes }}
          </p>

          <footer class="task-editor-feedback-author">
            <span
              class="task-editor-feedback-avatar"
              aria-hidden="true"
            >{{ item.authorInitials }}</span>
            <span>
              <strong>{{ item.authorName }}</strong>
              <time :datetime="item.createdAtIso">{{ item.createdAtLabel }}</time>
            </span>
          </footer>
        </article>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import { formatElapsed } from '~/util/time';
import type {
  WorkspaceProjectTaskFeedback,
  WorkspaceProjectTaskFeedbackReasonCategory,
} from '~/types/projects';

interface Props {
  feedback: WorkspaceProjectTaskFeedback[];
}

interface FeedbackItem {
  authorInitials: string;
  authorName: string;
  categoryClass: string;
  createdAtIso: string;
  createdAtLabel: string;
  key: string;
  notes: string;
  reasonLabel: string;
}

const props = defineProps<Props>();

const reasonLabels: Record<WorkspaceProjectTaskFeedbackReasonCategory, string> = {
  incomplete_mapping: 'Incomplete mapping',
  data_quality_issue: 'Data quality issue',
  wrong_area: 'Wrong area',
  other: 'Other',
};

const feedbackItems = computed<FeedbackItem[]>(() => props.feedback.map((item, index) => ({
  authorInitials: getInitials(item.createdByUserName),
  authorName: item.createdByUserName,
  categoryClass: `task-editor-feedback-dot-${item.reasonCategory.replaceAll('_', '-')}`,
  createdAtIso: item.createdAt.toISOString(),
  createdAtLabel: formatElapsed(item.createdAt),
  key: `${item.createdByUserId}-${item.createdAt.toISOString()}-${index}`,
  notes: item.notes,
  reasonLabel: reasonLabels[item.reasonCategory],
})));

function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part.charAt(0).toUpperCase())
    .join('') || '?';
}
</script>

<style lang="scss" scoped>
@import "~/assets/scss/theme.scss";

.task-editor-feedback-panel,
.task-editor-feedback-heading,
.task-editor-feedback-list {
  display: grid;
}

.task-editor-feedback-panel {
  gap: 1rem;
}

.task-editor-feedback-heading {
  gap: 0.35rem;
}

.task-editor-feedback-heading h2,
.task-editor-feedback-heading p,
.task-editor-feedback-empty,
.task-editor-feedback-notes {
  margin: 0;
}

.task-editor-feedback-heading h2 {
  color: $text-navy;
  font-size: 1.2rem;
  font-weight: 700;
  line-height: 1.35;
}

.task-editor-feedback-heading p,
.task-editor-feedback-empty,
.task-editor-feedback-notes {
  color: $secondary;
  font-size: 0.95rem;
  line-height: 1.5;
}

.task-editor-feedback-list {
  gap: 0.8rem;
  padding: 0;
  margin: 0;
  list-style: none;
}

.task-editor-feedback-card {
  display: grid;
  gap: 0.8rem;
  padding: 1rem;
  background: $surface-card;
  border: 1px solid $border-subtle;
  border-radius: $border-radius-lg;
  box-shadow: $box-shadow-sm;
}

.task-editor-feedback-category,
.task-editor-feedback-author {
  display: flex;
  align-items: center;
}

.task-editor-feedback-category {
  gap: 0.45rem;
}

.task-editor-feedback-dot {
  flex: 0 0 auto;
  width: 0.65rem;
  height: 0.65rem;
  background: $primary;
  border-radius: 50%;
}

.task-editor-feedback-dot-incomplete-mapping,
.task-editor-feedback-dot-wrong-area {
  background: $status-warning-text;
}

.task-editor-feedback-dot-data-quality-issue {
  background: $status-in-progress-text;
}

.task-editor-feedback-badge {
  padding: 0.2rem 0.55rem;
  color: $text-navy;
  font-size: 0.82rem;
  font-weight: 700;
  line-height: 1.3;
  background: $purple-background-medium;
  border-radius: 999px;
}

.task-editor-feedback-notes {
  padding-left: 1.1rem;
  color: $text-secondary;
}

.task-editor-feedback-author {
  gap: 0.65rem;
  padding-left: 1.1rem;
}

.task-editor-feedback-author > span:last-child {
  display: grid;
  gap: 0.1rem;
}

.task-editor-feedback-author strong {
  color: $text-navy;
  font-size: 0.85rem;
  line-height: 1.3;
}

.task-editor-feedback-author time {
  color: $text-disabled;
  font-size: 0.8rem;
  line-height: 1.3;
}

.task-editor-feedback-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  color: $white;
  font-size: 0.75rem;
  font-weight: 700;
  background: $secondary;
  border-radius: 50%;
}
</style>
