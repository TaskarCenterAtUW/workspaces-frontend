import { findDanglingReferences, repairReferences } from '~/services/merge/references';
import { threeWayMerge } from '~/services/merge/three-way';
import { buildOsc } from '~/services/merge/upload';
import { findImportMismatch, findUnusableTags } from '~/services/merge/validation';
import { compareWorkspaceCreatedAtDesc } from '~/services/workspaces';
import { OsmElementLookup } from '~/util/osm';

import type { MergeResult } from '~/services/merge/types';
import type { OsmApiClient } from '~/services/osm';
import type { WorkspacesClient } from '~/services/workspaces';
import type { Workspace, WorkspaceId } from '~/types/workspaces';

export class ThreeWayWorkspaceMerger {
  readonly #workspacesClient: WorkspacesClient;
  readonly #osmClient: OsmApiClient;
  readonly #workspace: Workspace;

  constructor(
    workspacesClient: WorkspacesClient,
    osmClient: OsmApiClient,
    workspace: Workspace
  ) {
    this.#workspacesClient = workspacesClient;
    this.#osmClient = osmClient;
    this.#workspace = workspace;
  }

  async getMergeTargets(): Promise<Workspace[]> {
    return (await this.#workspacesClient.getMyWorkspaces())
      .filter(w => this.#isEligibleWorkspace(w))
      .sort(compareWorkspaceCreatedAtDesc);
  }

  async merge(
    targetId: WorkspaceId,
    projectGroupId: string,
    title: string
  ): Promise<MergeResult> {
    // The target is filtered out of `getMergeTargets`, but the workspace the
    // user started from is never checked, and it fails later as a bogus import
    // mismatch rather than saying its import has not finished:
    //
    if (!importHasSettled(this.#workspace)) {
      throw new Error(
        `This workspace's import is ${this.#workspace.importStatus}, so it does not hold `
        + 'all of its data yet. Wait for the import to finish, then merge.'
      );
    }

    const [elementsA, elementsB, lookupC, targetLookupC] = await Promise.all([
      this.#osmClient.getWorkspaceData(this.#workspace.id),
      this.#osmClient.getWorkspaceData(targetId),
      this.#getInitialLookup(this.#workspace.id),
      this.#getInitialLookup(targetId)
    ]);

    // Matching TDEI dataset and project group is not enough: the two imports
    // ran separately, into separate databases with their own id sequences.
    //
    const mismatch = findImportMismatch(lookupC, targetLookupC);

    if (mismatch) {
      throw new Error(
        'These workspaces were not imported the same way, so their element IDs cannot be '
        + `matched up: ${mismatch}. Merging them would discard the other workspace's work.`
      );
    }

    const { merged, conflicts } = threeWayMerge(elementsA, elementsB, lookupC);

    return {
      type: this.#workspace.type,
      title,
      workspaceIdA: this.#workspace.id,
      workspaceIdB: targetId,
      tdeiDatasetId: this.#workspace.tdeiRecordId,
      tdeiProjectGroupId: projectGroupId,
      description: this.#workspace.description,
      tdeiServiceId: this.#workspace.tdeiServiceId,
      tdeiMetadata: this.#workspace.tdeiMetadata,
      elements: merged,
      conflicts,
      ancestor: lookupC
    };
  }

  /**
   * Reads the import that both workspaces descend from: the workspace's first
   * changeset.
   *
   * This takes the import to be a single changeset, which is what the importer
   * writes: the deployment raises the changeset element cap
   * (`WS_OSM_MAX_CHANGESET_ELEMENTS`) far enough that a dataset never has to be
   * split. An import split across several changesets would leave everything
   * after the first looking newly created on both sides, and the merge would
   * keep two copies of it. Nothing here detects that.
   */
  async #getInitialLookup(workspaceId: WorkspaceId): Promise<OsmElementLookup> {
    // The API returns the newest changesets and caps the page, so asking for
    // the oldest is what makes this the import rather than an ordinary edit on
    // a workspace with a long history. The reduce below only normalises order
    // within the page that comes back: if a server ignored `order` entirely,
    // the earliest of its newest page would not be the import either.
    //
    const changesets = await this.#osmClient.listChangesets(workspaceId, {
      order: 'oldest'
    });

    if (changesets.length === 0) {
      throw new Error(
        `Workspace ${workspaceId} has no changesets, so there is no common ancestor `
        + 'to merge against.'
      );
    }

    const initial = changesets.reduce((earliest, changeset) =>
      changeset.created_at.getTime() < earliest.created_at.getTime()
        ? changeset
        : earliest
    );

    const osc = await this.#osmClient.getOsmChange(workspaceId, initial.id);

    // An empty ancestor makes every element look newly created, so no conflict
    // can be detected and the merge silently copies both workspaces whole.
    // Refusing is better than producing that:
    //
    const lookup = new OsmElementLookup(osc.create);

    if (lookup.size === 0) {
      throw new Error(
        `Changeset ${initial.id} creates no elements, so it cannot be the import `
        + `workspace ${workspaceId} descends from. There is no common ancestor to `
        + 'merge against.'
      );
    }

    return lookup;
  }

  #isEligibleWorkspace(workspace: Workspace): boolean {
    // Without a dataset ID there is no shared import, and two workspaces that
    // both lack one are unrelated rather than matching:
    //
    if (!this.#workspace.tdeiRecordId) {
      return false;
    }

    return workspace.id !== this.#workspace.id
      && workspace.type === this.#workspace.type
      && workspace.tdeiRecordId === this.#workspace.tdeiRecordId
      && workspace.tdeiProjectGroupId === this.#workspace.tdeiProjectGroupId
      && importHasSettled(workspace);
  }
}

export class WorkspaceMergerFactory {
  readonly #workspacesClient: WorkspacesClient;
  readonly #osmClient: OsmApiClient;

  constructor(workspacesClient: WorkspacesClient, osmClient: OsmApiClient) {
    this.#workspacesClient = workspacesClient;
    this.#osmClient = osmClient;
  }

  getThreeWayMerger(workspace: Workspace): ThreeWayWorkspaceMerger {
    return new ThreeWayWorkspaceMerger(
      this.#workspacesClient,
      this.#osmClient,
      workspace
    );
  }

  async commit(result: MergeResult, elements?: OsmElementLookup): Promise<WorkspaceId> {
    // A resolved set arrives already repaired by `applyResolutions`, which
    // knows which elements the user chose to delete and leaves those out. An
    // unresolved one has had no repair at all: a merge with no conflicts never
    // visits the conflicts page, and one side deleting an element the other
    // side's untouched way still uses is an uncontested deletion, not a
    // conflict. Without this the commit would fail telling the user to change
    // a resolution that does not exist.
    //
    const merged = elements ?? repairReferences(result);

    // Checked before anything is created. The osmChange builder rejects a
    // dangling reference too, but only after the destination workspace exists,
    // which turns a fixable resolution into a failed commit and a rollback:
    //
    const dangling = findDanglingReferences(merged);

    if (dangling.length > 0) {
      throw new Error(
        `The merge is incomplete: ${summarize(dangling)}`
        + (elements
          ? '. Change the resolution that removes those elements, or keep the side that uses them.'
          : '. The two workspaces cannot be merged without the missing elements.')
      );
    }

    // Same reasoning as the dangling check: the server rejects these, but only
    // once the destination workspace exists, and its error names neither the
    // element nor the tag:
    //
    const unusable = findUnusableTags(merged);

    if (unusable.length > 0) {
      throw new Error(
        `The merge cannot be uploaded: ${summarize(unusable)}`
        + '. Shorten or remove those tag values, then commit again.'
      );
    }

    // createBlankWorkspace also provisions the workspace in the OSM API. A
    // workspace created without that step has no database to write to.
    //
    // `tdeiRecordId` is deliberately absent. The create endpoint reads it, with
    // a project group id, as "import this TDEI dataset": it marks the workspace
    // as importing and queues a job that would write the whole source dataset
    // into the one this merge is about to upload to. The dataset's other details
    // carry no such meaning and are safe to send.
    //
    const mergedWorkspaceId = await this.#workspacesClient.createBlankWorkspace({
      title: result.title,
      type: result.type,
      tdeiProjectGroupId: result.tdeiProjectGroupId,
      description: result.description,
      tdeiServiceId: result.tdeiServiceId,
      tdeiMetadata: result.tdeiMetadata
    });

    let openChangesetId: number;

    try {
      openChangesetId = await this.#osmClient.createChangeset(mergedWorkspaceId, {
        comment: `Merge of workspaces ${result.workspaceIdA} and ${result.workspaceIdB}`
      });

      const osc = buildOsc(openChangesetId, merged);

      await this.#osmClient.uploadChangeset(mergedWorkspaceId, openChangesetId, osc);
    } catch (error) {
      // Leaving the empty workspace behind would put an unusable entry on the
      // dashboard, and every retry would add another:
      //
      await this.#deleteQuietly(mergedWorkspaceId);
      throw error;
    }

    // Closing happens outside the rollback on purpose. The upload has already
    // succeeded here, so the merged data is in the new workspace: deleting it
    // over a failed close would discard the whole merge. A changeset left
    // open closes itself, after an idle timeout on the server.
    //
    try {
      await this.#osmClient.closeChangeset(mergedWorkspaceId, openChangesetId);
    } catch (error) {
      console.warn(`Merged changeset ${openChangesetId} could not be closed.`, error);
    }

    return mergedWorkspaceId;
  }

  async #deleteQuietly(workspaceId: WorkspaceId): Promise<void> {
    try {
      await this.#workspacesClient.deleteWorkspace(workspaceId);
    } catch (error) {
      // The commit failure is the one worth reporting, so this one is logged
      // rather than thrown: it would otherwise replace the original error on
      // its way to the user, and an orphaned workspace would be invisible.
      //
      console.warn(`Rollback of merged workspace ${workspaceId} failed.`, error);
    }
  }
}

/**
 * Whether a workspace's data is all there, so it can be merged.
 *
 * Imports run as a background job, so a workspace can be listed while it is
 * still filling. Merging one compares a partial dataset and reports it as an
 * import mismatch, which blames the imports rather than saying one has not
 * finished. `in-progress` is excluded as unfinished and `failed` as
 * incomplete. Everything else passes, including an absent status: the backend
 * types the column as a plain nullable string with no constraint, and a
 * workspace that never had a TDEI import reports `NA` and is already excluded
 * by the dataset ID check.
 */
function importHasSettled(workspace: Workspace): boolean {
  return workspace.importStatus !== 'in-progress' && workspace.importStatus !== 'failed';
}

/** Caps a problem list at three named items so the message stays readable. */
function summarize(problems: string[]): string {
  return problems.slice(0, 3).join('; ')
    + (problems.length > 3 ? `, and ${problems.length - 3} more` : '');
}
