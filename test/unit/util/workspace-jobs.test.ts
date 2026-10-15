import { describe, expect, it } from 'vitest';
import { findFailedImportJob } from '~/util/workspace-jobs';

import type { WorkspaceJob } from '~/types/workspaces';

function makeJob(overrides: Partial<WorkspaceJob> = {}): WorkspaceJob {
  return {
    id: 1,
    workspace_id: 2632,
    job_type: 'workspace-import-file',
    request: {},
    current_task: 'Create Changeset',
    response: {
      success: true,
      messageCode: 'SUCCESS',
      message: 'Import completed'
    },
    created_at: '2026-10-02T00:00:00Z',
    updated_at: '2026-10-02T00:00:00Z',
    status: 'completed',
    current_task_status: null,
    ...overrides
  };
}

describe('findFailedImportJob', () => {
  it('treats a completed import with success false as failed', () => {
    const failedJob = makeJob({
      response: {
        success: false,
        messageCode: 'STEP_EXECUTION_FAILED',
        message: 'Create Changeset failed'
      }
    });

    expect(findFailedImportJob([failedJob])).toBe(failedJob);
  });

  it('recognizes an explicitly failed import', () => {
    const failedJob = makeJob({ status: 'failed', response: null });

    expect(findFailedImportJob([failedJob])).toBe(failedJob);
  });

  it('ignores successful imports and failed non-import jobs', () => {
    const jobs = [
      makeJob(),
      makeJob({
        id: 2,
        job_type: 'workspace-export',
        response: {
          success: false,
          messageCode: 'EXPORT_FAILED',
          message: 'Export failed'
        }
      })
    ];

    expect(findFailedImportJob(jobs)).toBeUndefined();
  });

  it('does not let an older failed import override the latest successful import', () => {
    const jobs = [
      makeJob({ id: 2 }),
      makeJob({
        id: 1,
        response: {
          success: false,
          messageCode: 'STEP_EXECUTION_FAILED',
          message: 'An older import failed'
        }
      })
    ];

    expect(findFailedImportJob(jobs)).toBeUndefined();
  });
});
