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
    :viewBox="size === 12 ? '0 0 12 12' : '0 0 16 16'"
    fill="currentColor"
    shape-rendering="crispEdges"
    aria-hidden="true"
  >
    <!-- 16×16 Gear -->
    <template v-if="name === 'gear' && size === 16">
      <rect x="7" y="1" width="2" height="2" /><rect x="7" y="13" width="2" height="2" />
      <rect x="1" y="7" width="2" height="2" /><rect x="13" y="7" width="2" height="2" />
      <rect x="3" y="3" width="2" height="2" /><rect x="11" y="3" width="2" height="2" />
      <rect x="3" y="11" width="2" height="2" /><rect x="11" y="11" width="2" height="2" />
      <rect x="5" y="3" width="6" height="2" /><rect x="5" y="11" width="6" height="2" />
      <rect x="3" y="5" width="2" height="6" /><rect x="11" y="5" width="2" height="6" />
      <rect x="7" y="7" width="2" height="2" />
    </template>
    <!-- 12×12 Gear -->
    <template v-else-if="name === 'gear'">
      <rect x="5" y="1" width="2" height="1" /><rect x="5" y="10" width="2" height="1" />
      <rect x="1" y="5" width="1" height="2" /><rect x="10" y="5" width="1" height="2" />
      <rect x="2" y="2" width="2" height="2" /><rect x="8" y="2" width="2" height="2" />
      <rect x="2" y="8" width="2" height="2" /><rect x="8" y="8" width="2" height="2" />
      <rect x="4" y="2" width="4" height="2" /><rect x="4" y="8" width="4" height="2" />
      <rect x="2" y="4" width="2" height="4" /><rect x="8" y="4" width="2" height="4" />
      <rect x="5" y="5" width="2" height="2" />
    </template>

    <!-- 16×16 Trash -->
    <template v-else-if="name === 'trash' && size === 16">
      <rect x="6" y="2" width="4" height="1" />
      <rect x="3" y="4" width="10" height="2" />
      <rect x="4" y="6" width="1" height="8" /><rect x="11" y="6" width="1" height="8" />
      <rect x="5" y="13" width="6" height="1" />
      <rect x="6" y="7" width="1" height="5" /><rect x="9" y="7" width="1" height="5" />
    </template>
    <!-- 12×12 Trash -->
    <template v-else-if="name === 'trash'">
      <rect x="4" y="1" width="4" height="1" />
      <rect x="2" y="3" width="8" height="1" />
      <rect x="3" y="4" width="1" height="7" /><rect x="8" y="4" width="1" height="7" />
      <rect x="4" y="10" width="4" height="1" />
      <rect x="5" y="5" width="2" height="4" opacity="0.65" />
    </template>

    <!-- 16×16 Search -->
    <template v-else-if="name === 'search' && size === 16">
      <rect x="5" y="2" width="4" height="2" /><rect x="5" y="9" width="4" height="2" />
      <rect x="3" y="4" width="2" height="5" /><rect x="9" y="4" width="2" height="5" />
      <rect x="10" y="10" width="2" height="2" /><rect x="12" y="12" width="2" height="2" />
    </template>
    <!-- 12×12 Search -->
    <template v-else-if="name === 'search'">
      <rect x="3" y="1" width="4" height="1" /><rect x="3" y="7" width="4" height="1" />
      <rect x="1" y="3" width="1" height="4" /><rect x="7" y="3" width="1" height="4" />
      <rect x="2" y="2" width="1" height="1" /><rect x="7" y="2" width="1" height="1" />
      <rect x="2" y="7" width="1" height="1" /><rect x="7" y="7" width="1" height="1" />
      <rect x="8" y="8" width="2" height="2" /><rect x="10" y="10" width="1" height="1" />
    </template>

    <!-- 12×12 Calendar -->
    <template v-else-if="name === 'calendar' && size === 12">
      <rect x="3" y="1" width="1" height="2" /><rect x="8" y="1" width="1" height="2" />
      <rect x="1" y="2" width="10" height="2" />
      <rect x="1" y="4" width="1" height="7" /><rect x="10" y="4" width="1" height="7" />
      <rect x="2" y="10" width="8" height="1" />
      <rect x="3" y="6" width="2" height="2" /><rect x="7" y="6" width="2" height="2" />
    </template>
    <!-- 16×16 Calendar -->
    <template v-else-if="name === 'calendar'">
      <rect x="4" y="2" width="2" height="2" /><rect x="10" y="2" width="2" height="2" />
      <rect x="2" y="4" width="12" height="2" />
      <rect x="2" y="6" width="2" height="8" /><rect x="12" y="6" width="2" height="8" />
      <rect x="4" y="12" width="8" height="2" />
      <rect x="5" y="8" width="2" height="2" /><rect x="9" y="8" width="2" height="2" />
    </template>

    <!-- 12×12 Repeat -->
    <template v-else-if="name === 'repeat' && size === 12">
      <rect x="2" y="3" width="7" height="1" /><rect x="7" y="1" width="1" height="2" /><rect x="8" y="2" width="2" height="2" />
      <rect x="1" y="4" width="1" height="3" />
      <rect x="3" y="8" width="7" height="1" /><rect x="4" y="9" width="1" height="2" /><rect x="2" y="8" width="2" height="2" />
      <rect x="10" y="5" width="1" height="3" />
    </template>
    <!-- 16×16 Repeat -->
    <template v-else-if="name === 'repeat'">
      <rect x="3" y="4" width="9" height="2" /><rect x="10" y="2" width="2" height="6" />
      <rect x="2" y="6" width="2" height="4" />
      <rect x="4" y="10" width="9" height="2" /><rect x="4" y="8" width="2" height="6" />
      <rect x="12" y="6" width="2" height="4" />
    </template>

    <!-- 12×12 Folder -->
    <template v-else-if="name === 'folder' && size === 12">
      <rect x="1" y="2" width="4" height="2" />
      <rect x="1" y="4" width="10" height="6" />
      <rect x="3" y="6" width="6" height="1" opacity="0.35" />
    </template>
    <!-- 16×16 Folder -->
    <template v-else-if="name === 'folder'">
      <rect x="2" y="3" width="5" height="2" />
      <rect x="2" y="5" width="12" height="8" />
      <rect x="4" y="7" width="8" height="1" opacity="0.35" />
    </template>

    <!-- 12×12 Chevron Down -->
    <template v-else-if="name === 'chevron-down' && size === 12">
      <rect x="2" y="4" width="2" height="1" /><rect x="8" y="4" width="2" height="1" />
      <rect x="3" y="5" width="2" height="1" /><rect x="7" y="5" width="2" height="1" />
      <rect x="4" y="6" width="4" height="1" /><rect x="5" y="7" width="2" height="1" />
    </template>
    <!-- 16×16 Chevron Down -->
    <template v-else-if="name === 'chevron-down'">
      <rect x="3" y="5" width="2" height="2" /><rect x="11" y="5" width="2" height="2" />
      <rect x="5" y="7" width="2" height="2" /><rect x="9" y="7" width="2" height="2" />
      <rect x="7" y="9" width="2" height="2" />
    </template>

    <!-- 12×12 Plus -->
    <template v-else-if="name === 'plus' && size === 12">
      <rect x="5" y="2" width="2" height="8" />
      <rect x="2" y="5" width="8" height="2" />
    </template>
    <!-- 16×16 Plus -->
    <template v-else-if="name === 'plus'">
      <rect x="7" y="3" width="2" height="10" />
      <rect x="3" y="7" width="10" height="2" />
    </template>
  </svg>
</template>

<style scoped>
.px-icon {
  display: block;
  flex-shrink: 0;
  image-rendering: pixelated;
  image-rendering: crisp-edges;
}
</style>
