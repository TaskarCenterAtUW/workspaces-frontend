<template>
  <li class="list-group-item d-flex">
    <div>
      <app-icon variant="group" />
    </div>
    <div>
      <a
        href="#"
        class="fw-bold"
        @click.prevent="viewMembers"
      >
        {{ props.team.name }}
      </a>
      <b-button
        variant="link"
        class="team-members-btn"
        @click="viewMembers"
      >
        {{ props.team.member_count }} members
      </b-button>
    </div>
    <div class="align-self-center flex-shrink-0 ms-auto">
      <button
        class="btn px-1"
        @click="openSettings"
      >
        <app-icon
          variant="settings"
          no-margin
        />
        <span class="visually-hidden">Open Team Settings</span>
      </button>
      <button
        class="btn ms-1 px-1"
        @click="join"
      >
        <app-icon
          variant="qr_code"
          no-margin
        />
        <span class="visually-hidden">View QR Code</span>
      </button>
      <button
        class="btn ms-1 px-1 text-danger"
        @click="remove"
      >
        <app-icon
          variant="delete"
          no-margin
        />
        <span class="visually-hidden">Delete</span>
      </button>
    </div>
  </li>
</template>

<script setup lang="ts">
import type { WorkspaceTeam } from '~/types/workspaces';

interface Props {
  team: WorkspaceTeam;
}

const props = defineProps<Props>();
const emit = defineEmits(['join', 'open-settings', 'remove', 'view-members']);

function viewMembers() {
  emit('view-members', props.team);
}

function openSettings() {
  emit('open-settings', props.team);
}

function join() {
  emit('join', props.team);
}

async function remove() {
  emit('remove', props.team);
}
</script>

<style lang="scss">
@import "assets/scss/theme.scss";

.team-members-btn {
  display: block;
  padding: 0;
  color: $body-color;
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
}
</style>
