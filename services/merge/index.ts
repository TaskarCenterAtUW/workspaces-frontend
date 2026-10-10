export { applyResolutions, threeWayMerge } from '~/services/merge/three-way';
export { findDanglingReferences } from '~/services/merge/references';
export {
  findImportMismatch,
  findUnusableTags,
  MAX_TAG_LENGTH
} from '~/services/merge/validation';
export { ThreeWayWorkspaceMerger, WorkspaceMergerFactory } from '~/services/merge/workspace';

export type {
  ConflictChoice,
  ConflictResolution,
  MergeConflict,
  MergeConflictKind,
  MergeResult
} from '~/services/merge/types';
