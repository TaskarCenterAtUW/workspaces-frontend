// @vitest-environment nuxt

import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it, vi } from 'vitest';

import ConflationTagDiff from '~/components/edit/ConflationTagDiff.vue';

vi.mock('~/services/index', () => ({}));

describe('ConflationTagDiff', () => {
  it('lists the tags before and after, sorted, marking added, removed, changed and unchanged ones', async () => {
    const wrapper = await mountSuspended(ConflationTagDiff, {
      props: {
        before: { kerb: 'raised', barrier: 'kerb', surface: 'asphalt' },
        after: { kerb: 'lowered', barrier: 'kerb', tactile_paving: 'yes' }
      }
    });

    const rows = wrapper.findAll('tbody tr').map(row => ({
      cells: row.findAll('th, td').map(cell => cell.text()),
      changed: row.classes().find(c => c.startsWith('table-'))
    }));
    expect(rows).toEqual([
      { cells: ['', 'barrier', '=', 'kerb'], changed: undefined },
      { cells: ['~', 'kerb', '=', 'raised → lowered'], changed: 'table-warning' },
      { cells: ['-', 'surface', '=', 'asphalt'], changed: 'table-danger' },
      { cells: ['+', 'tactile_paving', '=', 'yes'], changed: 'table-success' }
    ]);
  });
});
