<template>
  <nav class="list-group mb-4">
    <settings-nav-link
      to=""
      icon=""
      class="list-nav-item"
    >
      General
    </settings-nav-link>
    <settings-nav-link
      to="/members"
      icon=""
    >
      Members
    </settings-nav-link>
    <settings-nav-link
      to="/teams"
      icon=""
    >
      Teams
    </settings-nav-link>
  </nav>
</template>

<script setup lang="ts">
</script>

<style lang="scss" scoped>
@import "~/assets/scss/theme.scss";

.list-group {
  display: grid;
  align-content: start;
  gap: 0.3rem;
  overflow-y: auto;
}
.list-group-item {
  padding: 15px 12px;
  color: $text-navy;
  font-size: 0.95rem;
  font-weight: 500;
  border: 0;
  border-radius: 0.7rem;
}
.list-group-item.active {
  font-weight: 700;
  background: #f2f4fe;
}
</style>
