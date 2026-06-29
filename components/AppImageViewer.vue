<!--
Wrapper around v-viewer.
-->
<script setup lang="ts">
import { api as viewerApi } from 'v-viewer';

interface Props {
  // Label shown below the image. Omit to hide the title bar entirely.
  title?: string;
}

const props = defineProps<Props>();

const viewerOptions = computed(() => ({
  navbar: false,
  zoomRatio: 0.3,
  title: props.title ? () => props.title : false,
  toolbar: {
    zoomIn: true,
    zoomOut: true,
    oneToOne: false,
    reset: false,
    prev: false,
    play: false,
    next: false,
    rotateLeft: true,
    rotateRight: true,
    flipHorizontal: false,
    flipVertical: false,
  },
}));

function show(imageUrl: string) {
  viewerApi({ images: [imageUrl], options: viewerOptions.value });
}

defineExpose({ show });
</script>
