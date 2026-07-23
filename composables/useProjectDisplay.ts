import { isRef, ref, computed } from 'vue';
import type { Ref } from 'vue';
import type { WorkspaceProject } from '~/types/projects';

export function useProjectDisplay(project: Ref<WorkspaceProject> | WorkspaceProject) {
  const projectRef = isRef(project) ? project : ref(project);

  const progressPercent = computed(() => projectRef.value.percentCompleted);

  const completedTaskCount = computed(() =>
    Math.round((projectRef.value.taskCount * projectRef.value.percentCompleted) / 100),
  );

  const taskSummary = computed(() =>
    progressPercent.value === 0
      ? 'Not started'
      : `${completedTaskCount.value}/${projectRef.value.taskCount} Tasks Executed`,
  );

  const createdDate = computed(() =>
    new Date(projectRef.value.createdAt).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }),
  );

  return { progressPercent, completedTaskCount, taskSummary, createdDate };
}
