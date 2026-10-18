<template>
  <div
    class="list-group-item level-contents"
    :aria-label="label"
  >
    <section
      v-for="category in categories"
      :key="category.key"
      class="level-category"
    >
      <button
        type="button"
        class="level-category-toggle"
        :aria-expanded="!collapsed.has(category.key)"
        @click="toggle(category.key)"
      >
        <app-icon
          :variant="collapsed.has(category.key) ? 'chevron_right' : 'expand_more'"
          no-margin
        />
        {{ category.title }} ({{ category.items.length }})
      </button>
      <ul
        v-if="!collapsed.has(category.key)"
        class="level-category-items"
        :aria-label="`${category.title} ${scope}`"
      >
        <li
          v-for="item in category.items"
          :key="item.id"
        >
          <button
            type="button"
            class="level-item"
            :title="`Select ${item.label}`"
            @click="emit('select', item.id)"
            @mouseenter="emit('hover', item.id)"
            @mouseleave="emit('hover', undefined)"
            @focus="emit('hover', item.id)"
            @blur="emit('hover', undefined)"
          >
            {{ item.label }}
          </button>
        </li>
      </ul>
    </section>
  </div>
</template>

<script setup lang="ts">
// @test unit: lists a level's nodes and edges under "Nodes (N)" and "Edges (N)", each collapsible, skipping an empty one; clicking an item selects it
// @test unit: pointing at or focusing an item emits hover with its ID, and leaving emits hover with undefined

const props = defineProps<{
  nodes: { id: string; label: string }[];
  edges: { id: string; label: string }[];
  /** Names the whole list, e.g. "Contents of Street (L0)". */
  label: string;
  /** Completes each category's name, e.g. "on Street (L0)" for "Nodes on Street (L0)". */
  scope: string;
}>();

const emit = defineEmits<{
  select: [id: string];
  /** The item pointed at or focused (to highlight it on the map), or undefined when none is. */
  hover: [id: string | undefined];
}>();

const categories = computed(() => [
  { key: 'nodes', title: 'Nodes', items: props.nodes },
  { key: 'edges', title: 'Edges', items: props.edges }
].filter(category => category.items.length));

const collapsed = ref(new Set<string>());

function toggle(key: string) {
  const next = new Set(collapsed.value);
  if (!next.delete(key)) next.add(key);
  collapsed.value = next;
}
</script>

<style lang="scss" scoped>
.level-contents {
  padding: 0.125rem 0.25rem 0.25rem 2rem;
  font-size: 0.8rem;
}

.level-category-toggle {
  display: flex;
  align-items: center;
  gap: 0.125rem;
  width: 100%;
  padding: 0.125rem 0;
  border: 0;
  background: none;
  color: var(--bs-secondary-color);
  font-size: 0.75rem;
  font-weight: 600;
  text-align: left;
}

.level-category-toggle:hover {
  color: var(--bs-body-color);
}

.level-category-items {
  margin: 0 0 0.25rem;
  padding: 0 0 0 0.75rem;
  list-style: none;
}

// Alternate rows are shaded, so long lists are easier to follow.
.level-category-items > li:nth-child(even) {
  background: var(--bs-tertiary-bg);
}

.level-item {
  display: block;
  width: 100%;
  padding: 0.125rem 0.375rem;
  overflow: hidden;
  border: 0;
  background: none;
  color: inherit;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.level-item:hover {
  color: var(--bs-link-hover-color);
  text-decoration: underline;
}
</style>
