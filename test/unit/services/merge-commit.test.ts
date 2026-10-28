import { describe, expect, it, vi } from 'vitest';

import { WorkspaceMergerFactory } from '~/services/merge';
import { OsmElementLookup } from '~/util/osm';

import { DATASET_ID, PROJECT_GROUP_ID } from '../../mocks/merge';
import { osmNode, osmRelation, osmWay } from '../../mocks/osm-elements';

import type { MergeResult } from '~/services/merge';
import type { OsmApiClient } from '~/services/osm';
import type { WorkspacesClient } from '~/services/workspaces';

interface CommitOverrides {
  upload?: () => Promise<string>;
  elements?: OsmElementLookup;
  ancestor?: OsmElementLookup;
}

function makeCommitStubs(overrides: CommitOverrides = { }) {
  const workspacesClient = {
    createBlankWorkspace: vi.fn(async () => 42),
    deleteWorkspace: vi.fn(async () => undefined)
  };

  const osmClient = {
    createChangeset: vi.fn(async () => 777),
    uploadChangeset: vi.fn(
      async (_workspaceId: number, _changesetId: number, _osc: string): Promise<string> =>
        overrides.upload ? await overrides.upload() : ''
    ),
    closeChangeset: vi.fn(async () => undefined)
  };

  const factory = new WorkspaceMergerFactory(
    workspacesClient as unknown as WorkspacesClient,
    osmClient as unknown as OsmApiClient
  );

  const result: MergeResult = {
    type: 'osw',
    title: 'Merged',
    workspaceIdA: 1,
    workspaceIdB: 2,
    tdeiDatasetId: DATASET_ID,
    tdeiProjectGroupId: PROJECT_GROUP_ID,
    elements: overrides.elements
      ?? new OsmElementLookup([osmNode(1, { version: 3 })]),
    conflicts: [],
    ancestor: overrides.ancestor ?? new OsmElementLookup()
  };

  return { factory, workspacesClient, osmClient, result };
}

describe('WorkspaceMergerFactory.commit', () => {
  it('provisions the workspace in the OSM database, not just the workspace row', async () => {
    // createWorkspace only inserts the row. Without the OSM tenant schema the
    // very next call, createChangeset, has no database to write to.
    const { factory, workspacesClient, result } = makeCommitStubs();

    await factory.commit(result);

    expect(workspacesClient.createBlankWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Merged',
        type: 'osw',
        tdeiProjectGroupId: PROJECT_GROUP_ID
      })
    );
  });

  it('closes the changeset it opened', async () => {
    const { factory, osmClient, result } = makeCommitStubs();

    await factory.commit(result);

    expect(osmClient.closeChangeset).toHaveBeenCalledWith(42, 777);
  });

  it('uploads the elements as an osmChange with negative create IDs', async () => {
    const { factory, osmClient, result } = makeCommitStubs();

    await factory.commit(result);

    const [, , osc] = osmClient.uploadChangeset.mock.calls[0]!;

    expect(osc).toMatch(/<create>/);
    expect(osc).toMatch(/id="-1"/);
    expect(osc).not.toMatch(/<node[^>]*id="1"/);
  });

  it('deletes the new workspace when the upload fails, so a retry leaves no orphan', async () => {
    const { factory, workspacesClient, result } = makeCommitStubs({
      upload: async () => { throw new Error('upload rejected'); }
    });

    await expect(factory.commit(result)).rejects.toThrow('upload rejected');
    expect(workspacesClient.deleteWorkspace).toHaveBeenCalledWith(42);
  });

  it('reports the original failure even when the cleanup also fails', async () => {
    const { factory, workspacesClient, result } = makeCommitStubs({
      upload: async () => { throw new Error('upload rejected'); }
    });

    workspacesClient.deleteWorkspace.mockRejectedValue(new Error('delete failed'));

    await expect(factory.commit(result)).rejects.toThrow('upload rejected');
  });

  it('rejects a dangling reference before it creates the workspace', async () => {
    // Reported after the create, this would leave an empty workspace behind on
    // every attempt at a resolution the builder cannot serialize.
    const { factory, workspacesClient, result } = makeCommitStubs();
    const broken = new OsmElementLookup([osmNode(1), osmWay(10, [1, 2])]);

    await expect(factory.commit(result, broken)).rejects
      .toThrow(/merge is incomplete: way 10 references node 2/);

    expect(workspacesClient.createBlankWorkspace).not.toHaveBeenCalled();
  });

  it('commits a caller-supplied element set when conflicts were resolved', async () => {
    const { factory, osmClient, result } = makeCommitStubs();
    const resolved = new OsmElementLookup([osmNode(1, { version: 3, tags: { a: 'b' } })]);

    await factory.commit(result, resolved);

    const [, , osc] = osmClient.uploadChangeset.mock.calls[0]!;

    expect(osc).toMatch(/k="a"/);
  });

  it('carries the dataset details over to the merged workspace', async () => {
    const { factory, workspacesClient, result } = makeCommitStubs();

    result.description = 'Merged sidewalks';
    result.tdeiServiceId = 'service-9';
    result.tdeiMetadata = '{"area":1}';

    await factory.commit(result);

    expect(workspacesClient.createBlankWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'Merged sidewalks',
        tdeiServiceId: 'service-9',
        tdeiMetadata: '{"area":1}'
      })
    );
  });

  // The create endpoint reads a payload carrying both a dataset id and a
  // project group id as "import this TDEI dataset": it marks the workspace as
  // importing and queues a job that writes the whole source dataset into it.
  // Sending the id here would have every merge upload its result into a
  // workspace that a background import is simultaneously filling.
  it('does not send a dataset id, which the create endpoint reads as an import request', async () => {
    const { factory, workspacesClient, result } = makeCommitStubs();

    await factory.commit(result);

    expect(workspacesClient.createBlankWorkspace).toHaveBeenCalledWith(
      expect.not.objectContaining({ tdeiRecordId: expect.anything() })
    );
    expect(workspacesClient.createBlankWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ tdeiProjectGroupId: PROJECT_GROUP_ID })
    );
  });

  it('rejects a tag the API cannot store before it creates the workspace', async () => {
    // Reported after the create, this would leave an empty workspace behind,
    // and the server's own error names neither the element nor the tag.
    const { factory, workspacesClient, result } = makeCommitStubs({
      elements: new OsmElementLookup([osmNode(1, { tags: { note: 'x'.repeat(256) } })])
    });

    await expect(factory.commit(result)).rejects
      .toThrow(/cannot be uploaded: node 1: the value of "note" is longer than 255/);

    expect(workspacesClient.createBlankWorkspace).not.toHaveBeenCalled();
  });

  it('names the first three problems and counts the rest', async () => {
    const tags = { note: 'x'.repeat(256) };
    const { factory, result } = makeCommitStubs({
      elements: new OsmElementLookup(
        [1, 2, 3, 4, 5].map(id => osmNode(id, { tags }))
      )
    });

    await expect(factory.commit(result)).rejects.toThrow(/, and 2 more/);
  });

  it('keeps the merged workspace when only the close fails', async () => {
    // The upload has already succeeded, so the merged data is in the new
    // workspace. Deleting it over a failed close would discard the merge.
    const { factory, workspacesClient, osmClient, result } = makeCommitStubs();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    osmClient.closeChangeset.mockRejectedValue(new Error('close failed'));

    // Restored in `finally`: a failed assertion here would otherwise leave the
    // spy in place for every later test in this file.
    try {
      await expect(factory.commit(result)).resolves.toBe(42);
      expect(workspacesClient.deleteWorkspace).not.toHaveBeenCalled();
    }
    finally {
      warn.mockRestore();
    }
  });
});

describe('commit repairs an unresolved element set', () => {
  // One side deleted elements the other side's untouched way still uses. That
  // is an uncontested deletion, not a conflict, so the conflicts page is never
  // reached and nothing else would repair it.
  function danglingMerge() {
    return makeCommitStubs({
      // The way survived; the vertices it uses did not.
      elements: new OsmElementLookup([osmWay(50, [5, 6])]),
      ancestor: new OsmElementLookup([osmNode(5), osmNode(6), osmWay(50, [5, 6])])
    });
  }

  it('restores references on a merge that produced no conflicts', async () => {
    const { factory, osmClient, result } = danglingMerge();

    await expect(factory.commit(result)).resolves.toBe(42);

    const [, , osc] = osmClient.uploadChangeset.mock.calls[0]!;
    const doc = new DOMParser().parseFromString(osc, 'application/xml');

    // Both vertices came back, so the way's refs resolve:
    expect(doc.getElementsByTagName('node')).toHaveLength(2);
  });

  it('commits the caller-supplied resolved set rather than the merged one', async () => {
    const { factory, osmClient, result } = danglingMerge();

    // Only node 5 kept: the user deleted node 6 and the way was dropped with it.
    await factory.commit(result, new OsmElementLookup([osmNode(5)]));

    const [, , osc] = osmClient.uploadChangeset.mock.calls[0]!;
    const doc = new DOMParser().parseFromString(osc, 'application/xml');

    expect(doc.getElementsByTagName('node')).toHaveLength(1);
    expect(doc.getElementsByTagName('way')).toHaveLength(0);
  });

  it('tells the user which resolution to change when a resolved set dangles', async () => {
    // The two branches of the message differ: a resolved set names an action
    // the user can take, an unresolved one has no resolution to point at.
    const { factory, result } = danglingMerge();

    await expect(factory.commit(result, new OsmElementLookup([osmWay(50, [5, 6]), osmNode(5)])))
      .rejects.toThrow(/Change the resolution that removes those elements/);
  });

  it('reports an unresolved set the ancestor cannot repair as unmergeable', async () => {
    const { factory, workspacesClient, result } = makeCommitStubs({
      elements: new OsmElementLookup([osmWay(50, [5, 6])]),
      // Node 6 is missing from the ancestor too, so the repair cannot supply it:
      ancestor: new OsmElementLookup([osmNode(5)])
    });

    await expect(factory.commit(result)).rejects
      .toThrow(/way 50 references node 6\. The two workspaces cannot be merged without the missing elements\./);

    expect(workspacesClient.createBlankWorkspace).not.toHaveBeenCalled();
  });

  it('reports a resolved set that still references a deleted element', async () => {
    // A resolved set has already been repaired, with the user's deletions
    // honored. Restoring node 6 from the ancestor here would undo the
    // deletion, so the contradiction is reported instead.
    const { factory, workspacesClient, result } = danglingMerge();

    const resolved = new OsmElementLookup([osmWay(50, [5, 6]), osmNode(5)]);

    await expect(factory.commit(result, resolved)).rejects
      .toThrow(/way 50 references node 6/);

    expect(workspacesClient.createBlankWorkspace).not.toHaveBeenCalled();
  });
});

describe('osmChange ordering', () => {
  it('emits a relation after the relation it references', async () => {
    const child = osmRelation(1, []);
    const parent = osmRelation(2, [{ type: 'relation', ref: 1, role: 'sub' }]);

    const { factory, osmClient, result } = makeCommitStubs({
      // Parent first, so only dependency ordering can fix the sequence:
      elements: new OsmElementLookup([parent, child])
    });

    await factory.commit(result);

    const [, , osc] = osmClient.uploadChangeset.mock.calls[0]!;
    const doc = new DOMParser().parseFromString(osc, 'application/xml');
    const relations = Array.from(doc.getElementsByTagName('relation'));

    // The child must be emitted first so the parent's member ref resolves:
    expect(relations[0]!.getElementsByTagName('member')).toHaveLength(0);
    expect(relations[1]!.getElementsByTagName('member')[0]!.getAttribute('ref'))
      .toBe(relations[0]!.getAttribute('id'));
  });
});
