import type { OsmElement, OsmElementType, OsmTags } from '~/types/osm';
import type { WorkspaceType } from '~/types/workspaces';
import type { OsmElementLookup } from '~/util/osm';

/**
 * How the two workspaces diverged.
 *
 * `deleted-in-a` and `deleted-in-b` mean one side removed the element while the
 * other edited it. The side that deleted is represented by the common ancestor,
 * so the UI must offer "drop the element" as a third outcome rather than
 * presenting it as an ordinary A-versus-B choice.
 */
export type MergeConflictKind = 'both-modified' | 'deleted-in-a' | 'deleted-in-b';

export interface MergeConflict {
  number: number;
  kind: MergeConflictKind;
  type: OsmElementType;
  elementId: number;
  a: OsmElement;
  b: OsmElement;
  base?: OsmElement;
  geometryConflict: boolean;
  tagConflicts: string[];

  /**
   * Tags settled by the three-way merge, with conflicting keys left at A's
   * value. Seeds the resolution so that tags neither side disputed survive.
   */
  mergedTags: OsmTags;
}

export type ConflictChoice = 'a' | 'b' | 'delete';

export interface ConflictResolution {
  resolved: boolean;
  chosenSide: ConflictChoice | null;
  tags: OsmTags;
}

export interface MergeResult {
  type: WorkspaceType;
  title: string;
  workspaceIdA: number;
  workspaceIdB: number;
  tdeiDatasetId?: string;
  tdeiProjectGroupId: string;

  /**
   * Dataset details copied from workspace A. Both sources are built from the
   * same TDEI dataset, so the merged workspace should present the same way on
   * the dashboard, the dashboard map and the TDEI export page.
   */
  description?: string;
  tdeiServiceId?: string;
  tdeiMetadata?: string;
  elements: OsmElementLookup;
  conflicts: MergeConflict[];

  /**
   * The import both workspaces descend from. Kept so that resolving a conflict
   * can restore an element the other side's deletion removed but the resolved
   * element still references.
   */
  ancestor: OsmElementLookup;
}
