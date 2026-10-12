import type { WorkspaceJob } from '~/types/workspaces';

export function findFailedImportJob(jobs: WorkspaceJob[]): WorkspaceJob | undefined {
  const latestImportJob = jobs.find(job => job.job_type.startsWith('workspace-import'));

  return latestImportJob
    && (latestImportJob.status === 'failed' || latestImportJob.response?.success === false)
    ? latestImportJob
    : undefined;
}
