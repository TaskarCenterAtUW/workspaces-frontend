// @vitest-environment nuxt

import { mountSuspended } from '@nuxt/test-utils/runtime';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import ResolveFeedbackDialog from '~/components/review/ResolveFeedbackDialog.vue';

vi.mock('~/services/index', () => ({}));

describe('ResolveFeedbackDialog', () => {
  // Modals render into the app's #teleports element.
  beforeAll(() => {
    if (!document.querySelector('#teleports')) {
      const target = document.createElement('div');
      target.id = 'teleports';
      document.body.appendChild(target);
    }
  });

  async function open() {
    const wrapper = await mountSuspended(ResolveFeedbackDialog, {
      props: { modelValue: true },
      attachTo: document.body
    });
    await vi.waitFor(() => expect(document.querySelector('#resolve-feedback-fixed')).not.toBeNull());
    return wrapper;
  }

  function confirm() {
    const ok = [...document.querySelectorAll('button')].find(b => b.textContent?.includes('Mark as Resolved'));
    ok!.click();
  }

  it('defaults to "fixed" and leaves out a blank note', async () => {
    const wrapper = await open();
    expect((document.querySelector('#resolve-feedback-fixed') as HTMLInputElement).checked).toBe(true);

    confirm();
    await vi.waitFor(() => expect(wrapper.emitted('resolve')).toEqual([[{ resolution: 'fixed' }]]));
    wrapper.unmount();
  });

  it('sends the chosen resolution and note', async () => {
    const wrapper = await open();
    const notAnIssue = document.querySelector('#resolve-feedback-not_an_issue') as HTMLInputElement;
    notAnIssue.checked = true;
    notAnIssue.dispatchEvent(new Event('change'));
    const note = document.querySelector('#resolve-feedback-description') as HTMLTextAreaElement;
    note.value = '  Already mapped  ';
    note.dispatchEvent(new Event('input'));
    await nextTick();

    confirm();
    await vi.waitFor(() => expect(wrapper.emitted('resolve')).toEqual([[{ resolution: 'not_an_issue', description: 'Already mapped' }]]));
    wrapper.unmount();
  });
});
