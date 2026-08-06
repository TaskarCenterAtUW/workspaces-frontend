<template>
  <section class="task-editor-mapping-panel">
    <h2>Ready to finish mapping?</h2>
    <p>
      Push your edits in Rapid before marking this task as done. You can skip the task to
      release the lock without submitting it.
    </p>
  </section>
</template>

<style lang="scss" scoped>
@import "~/assets/scss/theme.scss";

.task-editor-mapping-panel {
  display: grid;
  gap: 1rem;
  padding-top: 1.5rem;
  border-top: 1px solid rgba($text-navy, 0.1);
}

.task-editor-mapping-panel h2,
.task-editor-mapping-panel p {
  margin: 0;
}

.task-editor-mapping-panel h2 {
  color: $text-navy;
  font-size: 1.2rem;
  font-weight: 700;
}

.task-editor-mapping-panel p {
  color: $secondary;
  line-height: 1.5;
}
</style>
