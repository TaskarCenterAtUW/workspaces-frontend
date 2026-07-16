<template>
  <div class="project-wizard-rich-text-editor">
    <div
      class="project-wizard-rich-text-editor-toolbar"
      role="toolbar"
      aria-label="Instruction formatting"
    >
      <button
        v-for="tool in tools"
        :key="tool.id"
        class="btn btn-link project-wizard-rich-text-editor-tool"
        :class="{ 'project-wizard-rich-text-editor-tool-active': isToolActive(tool.id) }"
        type="button"
        :aria-label="tool.label"
        @mousedown.prevent
        @click="applyTool(tool.id)"
      >
        <app-icon
          :variant="tool.icon"
          size="18"
          no-margin
        />
      </button>
    </div>

    <editor-content
      :editor="editor"
      class="project-wizard-rich-text-editor-content"
    />
  </div>
</template>

<script setup lang="ts">
import { EditorContent, useEditor } from '@tiptap/vue-3';
import { Image } from '@tiptap/extension-image';
import { Link } from '@tiptap/extension-link';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import { StarterKit } from '@tiptap/starter-kit';

type RichTextToolId
  = | 'bold'
    | 'italic'
    | 'link'
    | 'bullet-list'
    | 'numbered-list'
    | 'image'
    | 'table'
    | 'quote';

interface Props {
  modelValue: string;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const tools: Array<{ icon: string; id: RichTextToolId; label: string }> = [
  { id: 'bold', icon: 'format_bold', label: 'Bold' },
  { id: 'italic', icon: 'format_italic', label: 'Italic' },
  { id: 'link', icon: 'link', label: 'Link' },
  { id: 'bullet-list', icon: 'format_list_bulleted', label: 'Bullet list' },
  { id: 'numbered-list', icon: 'format_list_numbered', label: 'Numbered list' },
  { id: 'image', icon: 'image', label: 'Image' },
  { id: 'table', icon: 'table_rows', label: 'Table' },
  { id: 'quote', icon: 'format_quote', label: 'Quote' },
];

const editor = useEditor({
  content: props.modelValue || '<p></p>',
  extensions: [
    StarterKit,
    Link.configure({
      openOnClick: false,
      autolink: true,
      defaultProtocol: 'https',
    }),
    Image,
    Table.configure({
      resizable: false,
    }),
    TableRow,
    TableHeader,
    TableCell,
  ],
  editorProps: {
    attributes: {
      class: 'project-wizard-rich-text-editor-surface project-wizard-rich-text-content',
    },
  },
  onUpdate({ editor: currentEditor }) {
    const nextValue = currentEditor.isEmpty ? '' : currentEditor.getHTML();
    emit('update:modelValue', nextValue);
  },
});

watch(
  () => props.modelValue,
  (value) => {
    const currentEditor = editor.value;

    if (!currentEditor) {
      return;
    }

    const nextValue = value || '<p></p>';

    if (currentEditor.isFocused || currentEditor.getHTML() === nextValue) {
      return;
    }

    currentEditor.commands.setContent(nextValue, { emitUpdate: false });
  },
);

function isToolActive(toolId: RichTextToolId) {
  const currentEditor = editor.value;

  if (!currentEditor) {
    return false;
  }

  switch (toolId) {
    case 'bold':
      return currentEditor.isActive('bold');
    case 'italic':
      return currentEditor.isActive('italic');
    case 'link':
      return currentEditor.isActive('link');
    case 'bullet-list':
      return currentEditor.isActive('bulletList');
    case 'numbered-list':
      return currentEditor.isActive('orderedList');
    case 'quote':
      return currentEditor.isActive('blockquote');
    default:
      return false;
  }
}

function applyTool(toolId: RichTextToolId) {
  const currentEditor = editor.value;

  if (!currentEditor) {
    return;
  }

  switch (toolId) {
    case 'bold':
      currentEditor.chain().focus().toggleBold().run();
      return;
    case 'italic':
      currentEditor.chain().focus().toggleItalic().run();
      return;
    case 'link': {
      const existingHref = currentEditor.getAttributes('link').href as string | undefined;
      const href = window.prompt('Enter a URL', existingHref ?? 'https://');

      if (href === null) {
        return;
      }

      if (!href.trim()) {
        currentEditor.chain().focus().unsetLink().run();
        return;
      }

      const trimmedHref = href.trim();
      try {
        const url = new URL(trimmedHref, window.location.origin);
        if (!['http:', 'https:'].includes(url.protocol)) {
          alert('Only HTTP and HTTPS URLs are allowed.');
          return;
        }
      } catch {
        alert('Please enter a valid URL.');
        return;
      }

      currentEditor.chain().focus().extendMarkRange('link').setLink({ href: trimmedHref }).run();
      return;
    }
    case 'bullet-list':
      currentEditor.chain().focus().toggleBulletList().run();
      return;
    case 'numbered-list':
      currentEditor.chain().focus().toggleOrderedList().run();
      return;
    case 'image': {
      const src = window.prompt('Enter image URL', 'https://');

      if (!src?.trim()) {
        return;
      }

      currentEditor.chain().focus().setImage({ src: src.trim() }).run();
      return;
    }
    case 'table':
      currentEditor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
      return;
    case 'quote':
      currentEditor.chain().focus().toggleBlockquote().run();
  }
}

onBeforeUnmount(() => {
  editor.value?.destroy();
});
</script>

<style lang="scss" scoped>
@import "~/assets/scss/theme.scss";

.project-wizard-rich-text-editor {
  border: 1px solid rgba($text-navy, 0.12);
  border-radius: 0.45rem;
  overflow: hidden;
}

.project-wizard-rich-text-editor-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.1rem;
  padding: 0.35rem 0.45rem;
  background-color: rgba($text-navy, 0.04);
  border-bottom: 1px solid rgba($text-navy, 0.12);
}

.project-wizard-rich-text-editor-tool {
  width: 2rem;
  height: 2rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: rgba($secondary, 0.96);
  text-decoration: none;
  border-radius: 0.35rem;
}

.project-wizard-rich-text-editor-tool:hover,
.project-wizard-rich-text-editor-tool:focus-visible,
.project-wizard-rich-text-editor-tool-active {
  color: $text-navy;
  background-color: rgba($text-navy, 0.08);
  text-decoration: none;
}

.project-wizard-rich-text-editor-content :deep(.project-wizard-rich-text-editor-surface) {
  min-height: 9rem;
  padding: 0.85rem 0.9rem;
  color: $text-navy;
  font-size: 0.95rem;
  line-height: 1.55;
  outline: 0;
}
</style>
