<script setup lang="ts">
import { parsePositiveIntegerQuery } from '~/util/route-query';

definePageMeta({
  alias: ['/dashboard/workspace/:id'],
});

const route = useRoute();

const workspaceId = parsePositiveIntegerQuery(route.params.id ?? null);

if (workspaceId === undefined) {
  throw new Error(`Invalid workspace id: ${route.params.id}`);
}

await navigateTo({
  path: '/dashboard',
  query: {
    workspace: workspaceId.toString(),
  },
  replace: true,
})
</script>
