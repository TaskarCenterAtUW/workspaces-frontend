import { describe, expect, it } from 'vitest';
import { compareStringAsc, compareStringDesc } from '~/util/compare';

interface Item { name: string }

const items: Item[] = [
  { name: 'Banana' },
  { name: 'apple' },
  { name: 'cherry' }
];

describe('compareStringAsc', () => {
  it('sorts case-insensitively ascending by the selected property', () => {
    const sorted = [...items].sort(compareStringAsc<Item>(i => i.name));
    expect(sorted.map(i => i.name)).toEqual(['apple', 'Banana', 'cherry']);
  });
});

describe('compareStringDesc', () => {
  it('sorts case-insensitively descending by the selected property', () => {
    const sorted = [...items].sort(compareStringDesc<Item>(i => i.name));
    expect(sorted.map(i => i.name)).toEqual(['cherry', 'Banana', 'apple']);
  });
});
