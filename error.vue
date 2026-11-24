// Test outline
// @test e2e: Opening a page of a workspace the API answers 404 to (settings, review, export, export to TDEI, merge, projects,
//            a project, creating a project) shows "Workspace not found" and "This workspace does not exist or you do not have
//            permission to access it." with the app's navbar, not a 500 error (ARIA snapshot this state)
// @test e2e: A workspace id that is not a number (e.g. /workspace/abc/settings) also shows "Workspace not found"
// @test e2e: "View my workspaces" leaves the error page for the dashboard, which loads the user's workspaces again
// @test e2e: An address with no page shows "Page not found"

<template>
  <b-app>
    <nuxt-layout>
      <app-page>
        <section
          class="error-state"
          role="alert"
        >
          <h1>{{ title }}</h1>
          <p v-if="detail">
            {{ detail }}
          </p>
          <a
            class="btn btn-primary"
            href="/dashboard"
            @click.prevent="viewWorkspaces"
          >
            View my workspaces
          </a>
        </section>
      </app-page>
    </nuxt-layout>
  </b-app>
</template>

<script setup lang="ts">
import type { NuxtError } from '#app';

const props = defineProps<{ error: NuxtError }>();

// A 404 names what was missing ("Workspace not found", "Page not found: /x").
// Anything else is an unexpected failure, whose message is the detail.
const title = computed(() =>
  props.error.statusText
  || (props.error.status === 404 ? 'Page not found' : 'Something went wrong')
);
const detail = computed(() =>
  props.error.message && props.error.message !== title.value ? props.error.message : ''
);

function viewWorkspaces(): void {
  // Clearing remounts the app, so the dashboard fetches the workspaces again
  // rather than offering a stale one the user just failed to open.
  void clearError({ redirect: '/dashboard' });
}
</script>

<style lang="scss" scoped>
@import "~/assets/scss/theme.scss";

// Matches the dashboard's "Workspace not found" state.
.error-state {
  max-width: 34rem;
  margin: 8vh auto 0;
  padding: 2.5rem;
  display: grid;
  justify-items: center;
  gap: 0.75rem;
  color: $secondary;
  text-align: center;
  background: $white;
  border: $border-width solid $border-color;
  border-radius: 0.75rem;
}

.error-state h1,
.error-state p {
  margin: 0;
}

.error-state h1 {
  color: $text-navy;
  font-family: var(--secondary-font-family);
  font-size: 1rem;
  font-weight: $font-weight-bold;
  overflow-wrap: anywhere;
}
</style>
