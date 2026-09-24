import { describe, expect, it } from 'vitest';
import { prepareAdiffForMap } from '~/util/adiff';

import type { AugmentedDiff } from '~/types/adiff';

describe('prepareAdiffForMap', () => {
  it('removes relation members that do not include renderable geometry', () => {
    const adiff = {
      actions: [{
        type: 'create',
        new: {
          id: 1,
          type: 'relation',
          tags: {},
          members: [
            { type: 'way', ref: 10, role: 'outer' },
            {
              type: 'way',
              ref: 11,
              role: 'outer',
              nodes: [
                { ref: 1, lat: 47.6, lon: -122.3 },
                { ref: 2, lat: 47.7, lon: -122.4 },
              ],
            },
          ],
        },
      }],
    } as unknown as AugmentedDiff;

    const prepared = prepareAdiffForMap(adiff);
    const relation = prepared.actions[0]?.new;

    expect(relation?.type).toBe('relation');
    if (relation?.type === 'relation') {
      expect(relation.members).toHaveLength(1);
      expect(relation.members[0]?.ref).toBe(11);
    }

    expect(adiff.actions[0]?.new.type).toBe('relation');
    if (adiff.actions[0]?.new.type === 'relation') {
      expect(adiff.actions[0].new.members).toHaveLength(2);
    }
  });
});
