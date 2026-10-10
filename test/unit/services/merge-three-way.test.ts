import { describe, expect, it, vi } from 'vitest';

import { ThreeWayWorkspaceMerger } from '~/services/merge';

import { PROJECT_GROUP_ID, runMerge, workspace } from '../../mocks/merge';
import { osmNode, osmWay } from '../../mocks/osm-elements';

import type { OsmApiClient } from '~/services/osm';
import type { WorkspacesClient } from '~/services/workspaces';
import type { OsmElement, OsmNode, OsmWay } from '~/types/osm';
import type { OsmElementLookup } from '~/util/osm';

function ids(elements: OsmElementLookup): string[] {
  return [...elements].map(element => `${element.type}/${element.id}`).sort();
}

describe('threeWayMerge element selection', () => {
  it('takes the edit when only one side modified an element', async () => {
    const scenario = {
      ancestor: [osmNode(1, { lat: 0, lon: 0, version: 1 }), osmNode(2, { lat: 0, lon: 0, version: 1 })],
      a: [osmNode(1, { lat: 47.6, lon: 0, version: 2 }), osmNode(2, { lat: 0, lon: 0, version: 1 })],
      b: [osmNode(1, { lat: 0, lon: 0, version: 1 }), osmNode(2, { lat: 47.7, lon: 0, version: 2 })]
    };

    const { result } = await runMerge(scenario);

    expect(result.conflicts).toHaveLength(0);
    expect((result.elements.get('node', 1) as OsmNode).lat).toBe(47.6);
    expect((result.elements.get('node', 2) as OsmNode).lat).toBe(47.7);
  });

  it('carries through elements created after the import in either workspace', async () => {
    const scenario = {
      ancestor: [osmNode(999)], // deleted in both, so it drops out
      a: [osmNode(10, { lat: 1, lon: 1, version: 1 })],
      b: [osmNode(20, { lat: 2, lon: 2, version: 1 })]
    };

    const { result } = await runMerge(scenario);

    expect(ids(result.elements)).toEqual(['node/10', 'node/20']);
  });

  it('drops an element both sides deleted', async () => {
    const scenario = {
      ancestor: [osmNode(1, { lat: 0, lon: 0, version: 1 })],
      a: [],
      b: []
    };

    const { result } = await runMerge(scenario);

    expect(ids(result.elements)).toEqual([]);
    expect(result.conflicts).toHaveLength(0);
  });

  it('honors a deletion the other side left untouched', async () => {
    const scenario = {
      ancestor: [osmNode(1, { lat: 0, lon: 0, version: 1 })],
      a: [],
      b: [osmNode(1, { lat: 0, lon: 0, version: 1 })]
    };

    const { result } = await runMerge(scenario);

    expect(ids(result.elements)).toEqual([]);
    expect(result.conflicts).toHaveLength(0);
  });

  it('auto-merges tags both sides changed in non-overlapping ways', async () => {
    const scenario = {
      ancestor: [osmNode(1, { lat: 0, lon: 0, version: 1, tags: { highway: 'footway' } })],
      a: [osmNode(1, { lat: 0, lon: 0, version: 2, tags: { highway: 'footway', surface: 'asphalt' } })],
      b: [osmNode(1, { lat: 0, lon: 0, version: 2, tags: { highway: 'footway', lit: 'yes' } })]
    };

    const { result } = await runMerge(scenario);

    expect(result.conflicts).toHaveLength(0);
    expect(result.elements.get('node', 1)!.tags).toEqual({
      highway: 'footway',
      surface: 'asphalt',
      lit: 'yes'
    });
  });
});

describe('threeWayMerge independently created elements', () => {
  it('keeps both when each workspace created a different element under the same ID', async () => {
    // Each workspace has its own ID sequence, so this collision is expected
    // and means two distinct features, not one disputed one.
    const scenario = {
      ancestor: [osmNode(999)], // deleted in both, so it drops out
      a: [osmNode(5, { lat: 47.6, lon: -122.3, version: 1 })],
      b: [osmNode(5, { lat: 47.9, lon: -122.9, version: 1 })]
    };

    const { result } = await runMerge(scenario);

    expect([...result.elements]).toHaveLength(2);
    expect(result.conflicts).toHaveLength(0);

    const positions = [...result.elements].map(e => (e as OsmNode).lat).sort();
    expect(positions).toEqual([47.6, 47.9]);
  });

  it('repoints a way in the second workspace at the re-identified node', async () => {
    const scenario = {
      ancestor: [osmNode(999)], // deleted in both, so it drops out
      a: [osmNode(5, { lat: 47.6, lon: -122.3, version: 1 })],
      b: [osmNode(5, { lat: 47.9, lon: -122.9, version: 1 }), osmWay(8, [5], { version: 1 })]
    };

    const { result } = await runMerge(scenario);

    const movedWay = [...result.elements].find(e => e.type === 'way') as OsmWay;
    const reIdentified = [...result.elements]
      .find(e => e.type === 'node' && (e as OsmNode).lat === 47.9)!;

    expect(movedWay.nodes).toEqual([reIdentified.id]);
    expect(reIdentified.id).not.toBe(5);
  });
});

describe('threeWayMerge conflicts', () => {
  it('reports a conflict when both sides moved the same node differently', async () => {
    const scenario = {
      ancestor: [osmNode(1, { lat: 0, lon: 0, version: 1 })],
      a: [osmNode(1, { lat: 10, lon: 10, version: 2 })],
      b: [osmNode(1, { lat: 20, lon: 20, version: 2 })]
    };

    const { result } = await runMerge(scenario);

    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]!.kind).toBe('both-modified');
    expect(result.conflicts[0]!.geometryConflict).toBe(true);
  });

  it('leaves a conflicted element out of the merged set so neither side is lost', async () => {
    // Both sides carry the same ID. Storing them together keeps only the last
    // one written, and the user's choice then has nothing to apply to.
    const scenario = {
      ancestor: [osmNode(1, { lat: 0, lon: 0, version: 1 })],
      a: [osmNode(1, { lat: 10, lon: 10, version: 2 })],
      b: [osmNode(1, { lat: 20, lon: 20, version: 2 })]
    };

    const { result } = await runMerge(scenario);

    expect(result.elements.has('node', 1)).toBe(false);
    expect(result.conflicts[0]!.a).not.toBe(result.conflicts[0]!.b);
    expect((result.conflicts[0]!.a as OsmNode).lat).toBe(10);
    expect((result.conflicts[0]!.b as OsmNode).lat).toBe(20);
  });

  it('shows each side its own tag values rather than a merged value', async () => {
    const scenario = {
      ancestor: [osmNode(1, { lat: 0, lon: 0, version: 1, tags: { surface: 'gravel' } })],
      a: [osmNode(1, { lat: 0, lon: 0, version: 2, tags: { surface: 'asphalt' } })],
      b: [osmNode(1, { lat: 0, lon: 0, version: 2, tags: { surface: 'concrete' } })]
    };

    const { result } = await runMerge(scenario);
    const conflict = result.conflicts[0]!;

    expect(conflict.a.tags!.surface).toBe('asphalt');
    expect(conflict.b.tags!.surface).toBe('concrete');
    expect(conflict.tagConflicts).toEqual(['surface']);
  });

  it('classifies a delete on one side against an edit on the other', async () => {
    const deletedInA = await runMerge({
      ancestor: [osmNode(1, { lat: 0, lon: 0, version: 1 })],
      a: [],
      b: [osmNode(1, { lat: 5, lon: 5, version: 2 })]
    });

    expect(deletedInA.result.conflicts[0]!.kind).toBe('deleted-in-a');

    const deletedInB = await runMerge({
      ancestor: [osmNode(1, { lat: 0, lon: 0, version: 1 })],
      a: [osmNode(1, { lat: 5, lon: 5, version: 2 })],
      b: []
    });

    expect(deletedInB.result.conflicts[0]!.kind).toBe('deleted-in-b');
  });

  it('numbers conflicts from one', async () => {
    const scenario = {
      ancestor: [osmNode(1, { lat: 0, lon: 0, version: 1 }), osmNode(2, { lat: 0, lon: 0, version: 1 })],
      a: [osmNode(1, { lat: 10, lon: 0, version: 2 }), osmNode(2, { lat: 10, lon: 0, version: 2 })],
      b: [osmNode(1, { lat: 20, lon: 0, version: 2 }), osmNode(2, { lat: 20, lon: 0, version: 2 })]
    };

    const { result } = await runMerge(scenario);

    expect(result.conflicts.map(c => c.number)).toEqual([1, 2]);
  });

  it('does not modify the elements handed to it', async () => {
    // The inputs belong to the caller and the ancestor is read repeatedly, so
    // mutating either corrupts every comparison that follows.
    const ancestor = [osmNode(1, { lat: 0, lon: 0, version: 1, tags: { surface: 'gravel' } })];
    const a = [osmNode(1, { lat: 0, lon: 0, version: 2, tags: { surface: 'asphalt' } })];
    const b = [osmNode(1, { lat: 0, lon: 0, version: 2, tags: { surface: 'concrete' } })];

    const snapshot = JSON.stringify({ ancestor, a, b });

    await runMerge({ ancestor, a, b });

    expect(JSON.stringify({ ancestor, a, b })).toBe(snapshot);
  });
});

describe('ThreeWayWorkspaceMerger ancestor lookup', () => {
  it('reads the earliest changeset rather than assuming changeset 1', async () => {
    const { osmClient } = await runMerge({ ancestor: [osmNode(999)], a: [], b: [] });

    expect(osmClient.listChangesets).toHaveBeenCalled();
    expect(osmClient.getOsmChange).toHaveBeenCalledWith(1, 4);
  });

  it('fails with a clear message when the workspace has no history', async () => {
    const osmClient = {
      getWorkspaceData: vi.fn(async () => []),
      listChangesets: vi.fn(async () => [])
    };

    const merger = new ThreeWayWorkspaceMerger(
      { } as unknown as WorkspacesClient,
      osmClient as unknown as OsmApiClient,
      workspace()
    );

    await expect(merger.merge(2, PROJECT_GROUP_ID, 'Merged'))
      .rejects.toThrow(/no common ancestor/);
  });
});

describe('a source workspace whose import has not finished', () => {
  // The target is filtered out of the picker, but the workspace the user
  // started from is not, and it would otherwise fail later as a bogus import
  // mismatch rather than saying the import is still running.
  it.each(['in-progress', 'failed'] as const)(
    'refuses to merge from a workspace whose import is %s',
    async (importStatus) => {
      const merger = new ThreeWayWorkspaceMerger(
        { } as unknown as WorkspacesClient,
        { } as unknown as OsmApiClient,
        workspace({ importStatus })
      );

      await expect(merger.merge(2, PROJECT_GROUP_ID, 'Merged'))
        .rejects.toThrow(/does not hold all of its data yet/);
    }
  );
});

describe('workspaces whose imports do not line up', () => {
  // Each workspace is its own database with its own id sequences, so element 5
  // in one is unrelated to element 5 in the other unless the two imports
  // assigned matching ids. The ancestor is read from workspace A, and B is
  // matched against it by id, so a mismatch makes every B element read as
  // untouched and hands the merge to A. Refusing beats losing B's work.
  async function mergeWith(ancestorA: OsmElement[], ancestorB: OsmElement[]) {
    const osmClient = {
      // Each workspace still holds what its own import created. A workspace
      // reporting no data at all is a different failure, guarded separately.
      getWorkspaceData: vi.fn(async (workspaceId: number) =>
        workspaceId === 1 ? ancestorA : ancestorB
      ),
      listChangesets: vi.fn(async () => [
        { id: 4, created_at: new Date('2026-01-01T00:00:00Z') }
      ]),
      getOsmChange: vi.fn(async (workspaceId: number) => ({
        create: workspaceId === 1 ? ancestorA : ancestorB,
        modify: [],
        delete: []
      }))
    };

    const merger = new ThreeWayWorkspaceMerger(
      { } as unknown as WorkspacesClient,
      osmClient as unknown as OsmApiClient,
      workspace()
    );

    return await merger.merge(2, PROJECT_GROUP_ID, 'Merged');
  }

  it('refuses when the two imports created different numbers of elements', async () => {
    await expect(mergeWith([osmNode(1)], [osmNode(1), osmNode(2)]))
      .rejects.toThrow(/not imported the same way/);
  });

  it('refuses when an id is missing from the other import', async () => {
    await expect(mergeWith([osmNode(1)], [osmNode(2)]))
      .rejects.toThrow(/exists in one import and not the other/);
  });

  it('refuses when the same id sits somewhere else in the other import', async () => {
    await expect(mergeWith([osmNode(1)], [osmNode(1, { lat: 47.9 })]))
      .rejects.toThrow(/different place/);
  });

  it('merges when the two imports agree', async () => {
    await expect(mergeWith([osmNode(1)], [osmNode(1)])).resolves.toBeDefined();
  });
});
