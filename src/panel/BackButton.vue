<script setup lang="ts">
defineEmits<{ click: [] }>()
</script>

<template>
  <button class="page-back-btn" type="button" aria-label="返回" @click="$emit('click')">
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true">
      <polyline points="9.75 3.5 5.25 8 9.75 12.5" />
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
  width: 13px;
  height: 13px;
}
</style>
