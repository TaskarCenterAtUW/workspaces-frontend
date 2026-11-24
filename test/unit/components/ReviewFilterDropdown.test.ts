// @vitest-environment nuxt

import { mountSuspended } from '@nuxt/test-utils/runtime';
import { reactive } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import ReviewFilterDropdown from '~/components/review/FilterDropdown.vue';
import { ReviewListFilter } from '~/services/review';

vi.mock('~/services/index', () => ({}));

async function mountFilter(filter: ReviewListFilter) {
  return await mountSuspended(ReviewFilterDropdown, {
    props: { modelValue: filter }
  });
}

describe('ReviewFilterDropdown', () => {
  it('clears a stale contributor when Changesets or Notes change', async () => {
    const filter = reactive(new ReviewListFilter());
    filter.contributorId = 7;
    const wrapper = await mountFilter(filter);
    const switches = wrapper.findAll('input[type="checkbox"]');

    await switches[2]!.setValue(false);

    expect(filter.contributorId).toBeUndefined();
    expect(wrapper.emitted('apply')).toHaveLength(1);
  });

  it('clears OSM-only filters when neither Changesets nor Notes is enabled', async () => {
    const filter = reactive(new ReviewListFilter());
    filter.includeNotes = false;
    filter.includeFeedback = true;
    filter.startDate = new Date(2026, 5, 1);
    filter.endDate = new Date(2026, 5, 2);
    filter.contributorId = 7;
    filter.teamIds = [1];
    const wrapper = await mountFilter(filter);
    const switches = wrapper.findAll('input[type="checkbox"]');

    await switches[0]!.setValue(false);

    expect(filter.startDate).toBeUndefined();
    expect(filter.endDate).toBeUndefined();
    expect(filter.contributorId).toBeUndefined();
    expect(filter.teamIds).toEqual([]);
    expect(filter.includeNeedsReview).toBe(false);
    expect(wrapper.text()).toContain(
      'Date, contributor, and team filters are available when Changesets or Notes are enabled.'
    );
  });

  it('disables resolved and needs-review switches for Fixmes only', async () => {
    const filter = reactive(new ReviewListFilter());
    filter.includeChangesets = false;
    filter.includeFeedback = false;
    filter.includeNotes = false;
    filter.includeFixmes = true;
    const wrapper = await mountFilter(filter);
    const switches = wrapper.findAll('input[type="checkbox"]');

    expect(switches[4]!.attributes('disabled')).toBeDefined();
    expect(switches[5]!.attributes('disabled')).toBeDefined();
  });

  it('restores the complete initial state when filters are cleared', async () => {
    const filter = reactive(new ReviewListFilter());
    filter.includeFeedback = false;
    filter.includeFixmes = false;
    filter.includeResolved = true;
    filter.includeNeedsReview = true;
    filter.startDate = new Date(2026, 5, 1);
    filter.endDate = new Date(2026, 5, 2);
    filter.contributorId = 7;
    filter.teamIds = [1];
    const wrapper = await mountFilter(filter);
    const clearButton = wrapper.findAll('button')
      .find(button => button.text() === 'Clear filters');

    await clearButton!.trigger('click');

    expect(filter).toMatchObject(new ReviewListFilter());
    expect(wrapper.emitted('apply')).toHaveLength(1);
  });

  it('shows only Changesets when Needs Review Only is enabled', async () => {
    const filter = reactive(new ReviewListFilter());
    filter.contributorId = 11;
    filter.includeResolved = true;
    const wrapper = await mountFilter(filter);
    const needsReview = wrapper.findAll('input[type="checkbox"]')[5]!;

    await needsReview.setValue(true);

    expect(filter.includeChangesets).toBe(true);
    expect(filter.includeFeedback).toBe(false);
    expect(filter.includeNotes).toBe(false);
    expect(filter.includeFixmes).toBe(false);
    expect(filter.includeResolved).toBe(false);
    expect(filter.contributorId).toBeUndefined();
    expect(wrapper.text()).toContain('Shows only unresolved Changesets marked as needing review.');
    expect(wrapper.findAll('input[type="checkbox"]')[4]!.attributes('disabled')).toBeDefined();
    expect(wrapper.emitted('apply')).toHaveLength(1);
  });

  it('does not apply a type change while the date range is invalid', async () => {
    const filter = reactive(new ReviewListFilter());
    filter.startDate = new Date(2026, 5, 10);
    filter.endDate = new Date(2026, 5, 5);
    const wrapper = await mountFilter(filter);

    await wrapper.findAll('input[type="checkbox"]')[2]!.setValue(false);

    expect(filter.includeNotes).toBe(false);
    expect(wrapper.emitted('apply')).toBeUndefined();
    expect(wrapper.get('[role="alert"]').text()).toContain('must be on or before');
  });
});
