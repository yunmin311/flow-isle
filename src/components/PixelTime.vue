<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { PIXEL_5X7, layoutPixelText } from '../utils/pixelFont'

const props = defineProps<{ value: string }>()
const unit = ref(8)

function syncUnit() {
  const w = typeof window === 'undefined' ? 420 : window.innerWidth
  unit.value = w < 350 ? 6 : w < 400 ? 7 : 8
}

onMounted(() => {
  syncUnit()
  window.addEventListener('resize', syncUnit)
})

onUnmounted(() => {
  window.removeEventListener('resize', syncUnit)
})

const layout = computed(() => layoutPixelText(props.value, PIXEL_5X7, unit.value, 1))
</script>

<template>
  <svg
    class="pixel-time"
    :data-unit="unit"
    :width="layout.width"
    :height="layout.height"
    :viewBox="`0 0 ${layout.width} ${layout.height}`"
    role="img"
    :aria-label="`剩余 ${value}`"
    shape-rendering="crispEdges"
  >
    <rect
      v-for="(cell, index) in layout.cells"
      :key="index"
      :x="cell.x"
      :y="cell.y"
      :width="unit"
      :height="unit"
      fill="currentColor"
    />
  </svg>
</template>
