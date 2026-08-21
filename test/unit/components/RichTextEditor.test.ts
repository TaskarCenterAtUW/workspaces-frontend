import type { Editor } from '@tiptap/core';
import { flushPromises, mount } from '@vue/test-utils';
import { EditorContent } from '@tiptap/vue-3';
import { describe, expect, it } from 'vitest';
import RichTextEditor from '~/components/project-wizard/RichTextEditor.vue';

describe('RichTextEditor', () => {
  it('creates an editable surface and emits typed content', async () => {
    const wrapper = mount(RichTextEditor, {
      props: {
        'modelValue': '',
        'onUpdate:modelValue': value => wrapper.setProps({ modelValue: value }),
      },
      global: {
        stubs: {
          AppIcon: true,
        },
      },
    });

    await flushPromises();

    const editor = wrapper.findComponent(EditorContent).props('editor') as Editor;

    expect(editor.isEditable).toBe(true);
    expect(wrapper.get('[contenteditable="true"]').attributes('contenteditable')).toBe('true');

    editor.commands.focus();
    editor.commands.insertContent('Editable instructions');
    await flushPromises();

    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([
      '<p>Editable instructions</p>',
    ]);
    expect(wrapper.get('[contenteditable="true"]').text()).toBe('Editable instructions');
    wrapper.unmount();
  });

  it('preserves consecutive edits when the controlled parent echoes each update', async () => {
    const wrapper = mount(RichTextEditor, {
      props: {
        'modelValue': '<p>Initial</p>',
        'onUpdate:modelValue': value => wrapper.setProps({ modelValue: value }),
      },
      global: {
        stubs: {
          AppIcon: true,
        },
      },
    });

    await flushPromises();

    const editor = wrapper.findComponent(EditorContent).props('editor') as Editor;
    editor.commands.focus('end');
    editor.commands.insertContent(' first');
    await flushPromises();
    editor.commands.insertContent(' second');
    await flushPromises();

    expect(editor.getText()).toBe('Initial first second');

    await wrapper.setProps({ modelValue: '<p>Replacement</p>' });
    await flushPromises();

    expect(editor.getText()).toBe('Replacement');
    wrapper.unmount();
  });

  it('marks image and table toolbar buttons active for their selections', async () => {
    const wrapper = mount(RichTextEditor, {
      props: {
        modelValue: ''
      },
      global: {
        stubs: {
          AppIcon: true
        }
      }
    });

    await flushPromises();

    const editor = wrapper.findComponent(EditorContent).props('editor') as Editor;
    const activeClass = 'project-wizard-rich-text-editor-tool-active';

    editor.commands.setContent('<img src="https://example.com/image.png">');
    editor.commands.setNodeSelection(0);
    await flushPromises();

    expect(wrapper.get('button[aria-label="Image"]').classes()).toContain(activeClass);

    editor.commands.setContent(
      '<table><tbody><tr><td><p>Cell</p></td></tr></tbody></table>'
    );
    editor.commands.setTextSelection(4);
    await flushPromises();

    expect(wrapper.get('button[aria-label="Table"]').classes()).toContain(activeClass);
    wrapper.unmount();
  });
});
