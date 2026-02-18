<template>
  <div
    ref="modal"
    class="modal fade"
    tabindex="-1"
    aria-labelledby="joinTeamDialogLabel"
    aria-hidden="true"
  >
    <div class="modal-dialog">
      <div class="modal-content">
        <div class="modal-header">
          <h5
            id="joinTeamDialogLabel"
            class="modal-title"
          >
            Join this Team
          </h5>
          <button
            type="button"
            class="btn-close"
            data-bs-dismiss="modal"
            aria-label="Close"
          />
        </div>

        <div
          v-if="props?.team"
          class="modal-body"
        >
          <qr-code
            ref="qrCode"
            class="d-block mx-auto border rounded-3"
            type="image/png"
            :width="256"
            :color="{ dark: '#000000ff', light: '#ffffffff' }"
            :value="joinUrl"
            @change="updateQrCodeUrl"
          />

          <div class="text-center">
            <small>Share this link:</small>
          </div>
          <div class="text-center">
            <a
              :href="joinUrl"
              target="_blank"
            >{{ joinUrl }}</a>
          </div>
        </div>

        <div class="modal-footer justify-content-center">
          <a
            v-if="qrCodeUrl"
            class="btn btn-dark"
            :href="qrCodeUrl"
            download="qr-code.png"
          >
            <app-icon variant="download" />
            Download QR Code
          </a>
          <button
            type="button"
            class="btn btn-primary"
            data-bs-dismiss="modal"
          >
            Close
          </button>
        </div><!-- .modal-footer -->
      </div><!-- .modal-content -->
    </div><!-- .modal-dialog -->
  </div>
</template>

<script setup lang="ts">
import type { WorkspaceTeam } from '~/types/workspaces';

interface Props {
  team?: WorkspaceTeam;
}

const props = defineProps<Props>();

const qrCodeUrl = ref('');
const joinUrl = computed(() => `${window.location.origin}/join-team/${props.team?.id}`);

function updateQrCodeUrl(dataUrl: string) {
  qrCodeUrl.value = dataUrl;
}
</script>
