<script setup lang="ts">
import type { CompanionPlacement } from '../composables/useCompanion'

withDefaults(
  defineProps<{
    name: string
    backgroundUrl: string
    portraitUrl: string
    placement: CompanionPlacement
    mode?: 'scene' | 'detail'
    size?: number
  }>(),
  {
    mode: 'scene',
    size: 72,
  },
)
</script>

<template>
  <svg
    class="companion-scene-svg"
    xmlns="http://www.w3.org/2000/svg"
    :width="size"
    :height="size"
    viewBox="0 0 72 72"
    role="img"
    :aria-label="`${name} ${mode === 'scene' ? '场景收藏画' : '细节立绘'}`"
  >
    <image
      v-if="mode === 'scene'"
      :href="backgroundUrl"
      x="0"
      y="0"
      width="72"
      height="72"
      style="image-rendering: pixelated"
    />
    <image
      v-if="mode === 'scene'"
      :href="portraitUrl"
      :x="placement.x"
      :y="placement.y"
      :width="placement.width"
      :height="placement.height"
      preserveAspectRatio="xMidYMid meet"
      style="image-rendering: pixelated"
    />
    <image
      v-else
      :href="portraitUrl"
      x="0"
      y="0"
      width="72"
      height="72"
      preserveAspectRatio="xMidYMid meet"
      style="image-rendering: pixelated"
    />
  </svg>
</template>

<style scoped>
.companion-scene-svg {
  display: block;
  flex-shrink: 0;
  image-rendering: pixelated;
}
</style>
