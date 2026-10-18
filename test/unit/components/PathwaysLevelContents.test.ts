// @vitest-environment nuxt
import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it, vi } from 'vitest';
import PathwaysLevelContents from '~/components/edit/PathwaysLevelContents.vue';

// The Nuxt env loads services/index, whose clients open IndexedDB caches on import.
vi.mock('~/services/index', () => ({}));

const nodes = [{ id: 'n1', label: 'Platform: A' }, { id: 'n2', label: 'Node: B' }, { id: 'n3', label: 'Entrance: C' }];
const edges = [{ id: 'w1', label: 'Stairs: A ↔ B' }];

async function mountContents(props: Partial<{ nodes: typeof nodes; edges: typeof edges }> = {}) {
  return await mountSuspended(PathwaysLevelContents, {
    props: { nodes, edges, label: 'Contents of L1', scope: 'on L1', ...props }
  });
}

describe('PathwaysLevelContents', () => {
  // @test unit: lists a level's nodes and edges under "Nodes (N)" and "Edges (N)", each collapsible, skipping an empty one; clicking an item selects it
  it('lists nodes and edges under their own headings, with counts', async () => {
    const wrapper = await mountContents();
    expect(wrapper.findAll('.level-category-toggle').map(b => b.text())).toEqual(['Nodes (3)', 'Edges (1)']);
    expect(wrapper.find('[aria-label="Nodes on L1"]').findAll('.level-item').map(b => b.text()))
      .toEqual(['Platform: A', 'Node: B', 'Entrance: C']);
    expect(wrapper.find('[aria-label="Edges on L1"]').text()).toBe('Stairs: A ↔ B');
  });

  it('collapses and expands each category on its own', async () => {
    const wrapper = await mountContents();
    const toggle = (i: number) => wrapper.findAll('.level-category-toggle')[i]!;
    expect(toggle(0).attributes('aria-expanded')).toBe('true');

    await toggle(0).trigger('click');
    expect(toggle(0).attributes('aria-expanded')).toBe('false');
    expect(wrapper.find('[aria-label="Nodes on L1"]').exists()).toBe(false);
    expect(wrapper.find('[aria-label="Edges on L1"]').exists()).toBe(true);

    await toggle(0).trigger('click');
    expect(wrapper.find('[aria-label="Nodes on L1"]').exists()).toBe(true);
  });

  it('leaves out an empty category, and emits select with the item\'s ID', async () => {
    const wrapper = await mountContents({ edges: [] });
    expect(wrapper.findAll('.level-category-toggle').map(b => b.text())).toEqual(['Nodes (3)']);

    await wrapper.findAll('.level-item')[1]!.trigger('click');
    expect(wrapper.emitted('select')).toEqual([['n2']]);
  });

  // @test unit: pointing at or focusing an item emits hover with its ID, and leaving emits hover with undefined
  it('emits hover as an item is pointed at or focused, and left', async () => {
    const wrapper = await mountContents();
    const item = wrapper.findAll('.level-item')[2]!;
    await item.trigger('mouseenter');
    await item.trigger('mouseleave');
    await item.trigger('focus');
    await item.trigger('blur');
    expect(wrapper.emitted('hover')).toEqual([['n3'], [undefined], ['n3'], [undefined]]);
  });
});
