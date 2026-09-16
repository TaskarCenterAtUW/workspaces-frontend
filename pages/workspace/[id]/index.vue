<script setup lang="ts">
const route = useRoute();

const workspaceId = Number(route.params.id);

if (isNaN(workspaceId)) {
  throw new Error(`Invalid workspace id: ${route.params.id}`);
}

await navigateTo({
    path: '/dashboard',
    query: {
      workspaceId: workspaceId.toString(),
    },
    replace: true,
})
</script>