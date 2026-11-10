import { markRaw } from 'vue';

import type { MergeResult } from '~/services/merge';

/*
 * The shared result is kept out of reactivity: it is marked raw on assignment.
 *
 * `useState` stores values in a reactive payload, which would otherwise wrap
 * the result in a deep Proxy. The result holds `OsmElementLookup` instances
 * over every element in both workspaces plus the ancestor, and making that
 * reactive costs a great deal for state the pages only ever read wholesale.
 */

/** Reads the `MergeResult` shared between the merge pages. */
export function useMergeResult() {
  return useState<MergeResult | null>('merge-result', () => null);
}

/** Assigns the shared `MergeResult`. Use this rather than writing `.value`. */
export function setMergeResult(result: MergeResult | null) {
  const mergeResult = useMergeResult();

  mergeResult.value = result === null ? null : markRaw(result);
}
