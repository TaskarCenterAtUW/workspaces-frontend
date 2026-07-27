export type TaskEditorActionId = 'complete' | 'skip';

export interface TaskEditorAction {
  disabled: boolean;
  id: TaskEditorActionId;
  label: string;
  variant: 'outline-secondary' | 'primary';
}
