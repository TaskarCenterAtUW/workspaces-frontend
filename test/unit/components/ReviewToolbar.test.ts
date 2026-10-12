// @vitest-environment nuxt

import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it, vi } from 'vitest';
import ReviewToolbar from '~/components/review/Toolbar.vue';

import type { ReviewListItem } from '~/services/review';
import type { Workspace } from '~/types/workspaces';

vi.mock('~/services/index', () => ({
  rapid3Manager: {}
}));

const item = {
  id: 555,
  badgeIcon: 'chat_bubble',
  badgeClass: 'bg-danger',
  displayType: 'Feedback',
  isChangeset: false,
  isFeedback: true,
  isNote: false,
  isResolved: false,
  hasComments: false,
  commentCount: 0,
  needsReview: false
} as ReviewListItem;

const workspace = { role: 'lead' } as Workspace;

describe('ReviewToolbar', () => {
  it('offers Rapid 2 and Rapid 3 for an OSW workspace', async () => {
    const wrapper = await mountSuspended(ReviewToolbar, {
      props: { item, workspaceType: 'osw' },
      global: { provide: { workspace } }
    });

    expect(document.body.textContent).toContain('Rapid 2 (default)');
    expect(document.body.textContent).toContain('Rapid 3 (beta)');

    const buttons = Array.from(document.body.querySelectorAll('button'));
    const rapid2Button = buttons
      .find(button => button.textContent?.includes('Rapid 2 (default)'));
    const rapid3Button = buttons
      .find(button => button.textContent?.includes('Rapid 3 (beta)'));
    rapid2Button?.click();
    rapid3Button?.click();
    await nextTick();

    expect(wrapper.emitted('edit')).toContainEqual(['rapid']);
    expect(wrapper.emitted('edit')).toContainEqual(['rapid3']);
  });

  it('keeps the primary Edit Here action on Rapid 2', async () => {
    const wrapper = await mountSuspended(ReviewToolbar, {
      props: { item, workspaceType: 'osw' },
      global: { provide: { workspace } }
    });

    const editButton = wrapper.findAll('button')
      .find(button => button.text().includes('Edit Here'));
    await editButton?.trigger('click');

    expect(wrapper.emitted('edit')).toContainEqual(['rapid']);
  });
});
