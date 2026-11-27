<script setup lang="ts">
export type PixelIconName =
  | 'gear'
  | 'trash'
  | 'search'
  | 'calendar'
  | 'repeat'
  | 'folder'
  | 'chevron-down'
  | 'plus'

withDefaults(defineProps<{ name: PixelIconName; size?: 12 | 16 }>(), {
  size: 16,
})
</script>

<template>
  <svg
    class="px-icon"
    :width="size"
    :height="size"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    stroke-width="1.65"
    stroke-linecap="square"
    stroke-linejoin="miter"
    aria-hidden="true"
  >
    <!-- Gear -->
    <template v-if="name === 'gear'">
      <circle cx="8" cy="8" r="2.6" />
      <path d="M8 1.75v1.6M8 12.65v1.6M1.75 8h1.6M12.65 8h1.6M3.58 3.58l1.13 1.13M11.29 11.29l1.13 1.13M12.42 3.58l-1.13 1.13M4.71 11.29l-1.13 1.13" />
    </template>

    <!-- Trash -->
    <template v-else-if="name === 'trash'">
      <path d="M2.5 4.25h11M6 4.25V2.5h4v1.75M4.25 4.25v8.75a1 1 0 0 0 1 1h5.5a1 1 0 0 0 1-1V4.25M6.75 7v4.25M9.25 7v4.25" />
    </template>

    <!-- Search -->
    <template v-else-if="name === 'search'">
      <circle cx="7" cy="7" r="4.25" />
      <path d="M10.4 10.4L13.75 13.75" />
    </template>

    <!-- Calendar -->
    <template v-else-if="name === 'calendar'">
      <rect x="2.25" y="3.25" width="11.5" height="10.5" rx="1.5" />
      <path d="M5.25 1.75v2.5M10.75 1.75v2.5M2.25 6.75h11.5" />
      <rect x="5" y="9.25" width="1.5" height="1.5" fill="currentColor" stroke="none" />
      <rect x="9.5" y="9.25" width="1.5" height="1.5" fill="currentColor" stroke="none" />
    </template>

    <!-- Repeat -->
    <template v-else-if="name === 'repeat'">
      <path d="M2.5 7.5V5.25a1.5 1.5 0 0 1 1.5-1.5h8.75M10.5 1.75l2.25 2-2.25 2" />
      <path d="M13.5 8.5v2.25a1.5 1.5 0 0 1-1.5 1.5H3.25M5.5 14.25l-2.25-2 2.25-2" />
    </template>

    <!-- Folder -->
    <template v-else-if="name === 'folder'">
      <path d="M2.25 4a1.25 1.25 0 0 1 1.25-1.25h3l1.5 1.5h4.5a1.25 1.25 0 0 1 1.25 1.25v6.5a1.25 1.25 0 0 1-1.25 1.25h-9a1.25 1.25 0 0 1-1.25-1.25V4z" />
    </template>

    <!-- Chevron Down -->
    <template v-else-if="name === 'chevron-down'">
      <path d="M4 6.25l4 4 4-4" />
    </template>

    <!-- Plus -->
    <template v-else-if="name === 'plus'">
      <path d="M8 3v10M3 8h10" />
    </template>
  </svg>
</template>

<style scoped>
.px-icon {
  display: inline-block;
  vertical-align: middle;
  flex-shrink: 0;
}
</style>
