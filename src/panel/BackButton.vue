<script setup lang="ts">
defineEmits<{ click: [] }>()
</script>

<template>
  <button class="page-back-btn" type="button" aria-label="返回" @click="$emit('click')">
    <svg viewBox="0 0 12 12" fill="currentColor" shape-rendering="crispEdges" aria-hidden="true">
      <rect x="7" y="2" width="1" height="2" />
      <rect x="6" y="3" width="1" height="2" />
      <rect x="5" y="4" width="1" height="4" />
      <rect x="4" y="5" width="1" height="2" />
      <rect x="6" y="7" width="1" height="2" />
      <rect x="7" y="8" width="1" height="2" />
    </svg>
  </button>
</template>

<style scoped>
.page-back-btn {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 26px;
  height: 26px;
  padding: 0;
  border: 1px solid var(--v2-line);
  border-radius: 7px;
  background: var(--v2-surface);
  box-shadow: var(--pixel-keycap);
  color: var(--v2-ink);
  cursor: pointer;
  transition: background 150ms ease, border-color 150ms ease, color 150ms ease, transform 120ms ease;
}

.page-back-btn:hover {
  background: var(--ui-hover);
  border-color: color-mix(in srgb, var(--v2-accent) 34%, var(--v2-line));
  color: var(--v2-ink);
}

.page-back-btn:active {
  transform: translate3d(0, 1px, 0);
  box-shadow: var(--pixel-keycap-pressed);
}

.page-back-btn svg {
  width: 12px;
  height: 12px;
  image-rendering: pixelated;
}
</style>
