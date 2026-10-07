import { describe, expect, it, vi } from 'vitest';

import { ThreeWayWorkspaceMerger } from '~/services/merge';

import { workspace } from '../../mocks/merge';

import type { OsmApiClient } from '~/services/osm';
import type { WorkspacesClient } from '~/services/workspaces';
import type { Workspace } from '~/types/workspaces';

describe('ThreeWayWorkspaceMerger.getMergeTargets', () => {
  function targetsFor(current: Workspace, candidates: Workspace[]) {
    const workspacesClient = {
      getMyWorkspaces: vi.fn(async () => candidates)
    } as unknown as WorkspacesClient;

    return new ThreeWayWorkspaceMerger(
      workspacesClient,
      { } as unknown as OsmApiClient,
      current
    ).getMergeTargets();
  }

  it('offers workspaces sharing the dataset and project group', async () => {
    const targets = await targetsFor(workspace(), [
      workspace({ id: 2, title: 'Sibling' })
    ]);

    expect(targets.map(t => t.id)).toEqual([2]);
  });

  it('never offers the workspace itself', async () => {
    const targets = await targetsFor(workspace(), [workspace({ id: 1 })]);

    expect(targets).toEqual([]);
  });

  it('offers nothing when the workspace has no dataset to share', async () => {
    // Two workspaces that both lack a dataset ID are unrelated, not matching.
    const blank = workspace({ tdeiRecordId: undefined });
    const targets = await targetsFor(blank, [
      workspace({ id: 2, tdeiRecordId: undefined })
    ]);

    expect(targets).toEqual([]);
  });

  // Imports run as a background job, so a workspace can be listed while it is
  // still filling. Merging one mid-import compares a partial dataset and
  // reports it as an import mismatch, which blames the imports rather than
  // saying one has not finished.
  it('excludes a workspace whose import is still running', async () => {
    const targets = await targetsFor(workspace(), [
      workspace({ id: 2, importStatus: 'in-progress' })
    ]);

    expect(targets).toEqual([]);
  });

  it('excludes a workspace whose import failed', async () => {
    const targets = await targetsFor(workspace(), [
      workspace({ id: 2, importStatus: 'failed' })
    ]);

    expect(targets).toEqual([]);
  });

  // A workspace that never had a TDEI import reports `NA`, and one built
  // before the field existed reports nothing at all. Neither is in flight.
  it('still offers a workspace with a settled or absent import status', async () => {
    const targets = await targetsFor(workspace(), [
      workspace({ id: 2, importStatus: 'completed' }),
      workspace({ id: 3, importStatus: 'NA' }),
      workspace({ id: 4, importStatus: undefined })
    ]);

    expect(targets.map(t => t.id).sort()).toEqual([2, 3, 4]);
  });

  // `MergeResult.type` is taken from workspace A, so merging across types
  // would produce a workspace typed after A holding B's data.
  it('excludes a workspace of a different type', async () => {
    const targets = await targetsFor(workspace(), [
      workspace({ id: 2, type: 'pathways' })
    ]);

    expect(targets).toEqual([]);
  });

  it('excludes a workspace in another project group', async () => {
    const targets = await targetsFor(workspace(), [
      workspace({ id: 2, tdeiProjectGroupId: '99999999-9999-4999-8999-999999999999' })
    ]);

    expect(targets).toEqual([]);
  });
});
