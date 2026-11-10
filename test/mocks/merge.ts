import { vi } from 'vitest';

import { ThreeWayWorkspaceMerger } from '~/services/merge';

import type { OsmApiClient } from '~/services/osm';
import type { WorkspacesClient } from '~/services/workspaces';
import type { OsmElement } from '~/types/osm';
import type { Workspace } from '~/types/workspaces';

// Shared workspace fixtures and merge runners for the merge suites.

export const DATASET_ID = 'dataset-1';
export const PROJECT_GROUP_ID = '11111111-1111-4111-8111-111111111111';

export function workspace(overrides: Partial<Workspace> = { }): Workspace {
  return {
    id: 1,
    type: 'osw',
    title: 'Workspace A',
    tdeiRecordId: DATASET_ID,
    tdeiProjectGroupId: PROJECT_GROUP_ID,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    createdBy: 'tester',
    createdByName: 'Tester',
    externalAppAccess: 0,
    ...overrides
  };
}

export interface MergeScenario {
  ancestor: OsmElement[];
  a: OsmElement[];
  b: OsmElement[];
}

export function makeOsmClient(scenario: MergeScenario) {
  return {
    getWorkspaceData: vi.fn(async (id: number) =>
      id === 1 ? scenario.a : scenario.b
    ),
    listChangesets: vi.fn(async () => [
      { id: 9, created_at: new Date('2026-02-01T00:00:00Z') },
      { id: 4, created_at: new Date('2026-01-01T00:00:00Z') }
    ]),
    getOsmChange: vi.fn(async () => ({
      create: scenario.ancestor,
      modify: [],
      delete: []
    }))
  };
}

export async function runMerge(scenario: MergeScenario) {
  const osmClient = makeOsmClient(scenario);
  const merger = new ThreeWayWorkspaceMerger(
    { } as unknown as WorkspacesClient,
    osmClient as unknown as OsmApiClient,
    workspace()
  );

  const result = await merger.merge(2, PROJECT_GROUP_ID, 'Merged');

  return { result, osmClient };
}
