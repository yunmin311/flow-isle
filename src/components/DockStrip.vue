<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  progress: number
  color: string
  scale: number
}>()

const fillWidth = computed(() => `${Math.max(0, Math.min(1, props.progress)) * 100}%`)
const barHeight = computed(() => `${Math.max(2, 3 * props.scale)}px`)
</script>

<template>
  <div class="dock-strip" :style="{ '--strip-color': color }">
    <div class="track" :style="{ height: barHeight }">
      <div class="fill" :style="{ width: fillWidth, height: barHeight }" />
    </div>
  </div>
</template>

<style scoped>
.dock-strip {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.track {
  width: 64%;
  border-radius: 999px;
  background: color-mix(in srgb, var(--strip-color) 18%, transparent);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.14);
  overflow: hidden;
  display: flex;
  align-items: stretch;
  padding: 0 2px;
}

.fill {
  position: relative;
  border-radius: 1px;
  background: repeating-linear-gradient(
    90deg,
    var(--strip-color) 0 4px,
    transparent 4px 6px
  );
  transition: width 0.56s cubic-bezier(0.22, 1, 0.36, 1);
  min-width: 0;
}
</style>
