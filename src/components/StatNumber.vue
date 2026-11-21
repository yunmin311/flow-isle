<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { PIXEL_3X5, layoutPixelText } from '../utils/pixelFont'

const props = withDefaults(defineProps<{ value: number | string; unit?: string; size?: number; inline?: boolean }>(), {
  unit: '',
  size: 24,
  inline: false,
})

const root = ref<HTMLElement>()
const containerWidth = ref(0)
let observer: ResizeObserver | undefined

const formattedValue = computed(() => String(props.value))

const pixelUnit = computed(() => {
  const baseUnit = props.size >= 24 ? 3 : 2
  const w = containerWidth.value
  if (w <= 0) return baseUnit
  const unitAllowance = props.unit ? 16 : 0
  const avail = Math.max(18, w - unitAllowance)
  for (let u = baseUnit; u >= 2; u -= 1) {
    const layout = layoutPixelText(formattedValue.value, PIXEL_3X5, u, 1)
    if (layout.width <= avail) return u
  }
  return 2
})

const pixelLayout = computed(() => layoutPixelText(formattedValue.value, PIXEL_3X5, pixelUnit.value, 1))

onMounted(() => {
  if (root.value) {
    containerWidth.value = root.value.clientWidth
    observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0
      if (Math.abs(width - containerWidth.value) >= 1) {
        containerWidth.value = width
      }
    })
    observer.observe(root.value)
  }
})

onBeforeUnmount(() => {
  observer?.disconnect()
})
</script>

<template>
  <span
    ref="root"
    class="stat-number"
    :class="{ 'is-inline': inline }"
    :data-long="formattedValue.length > 5"
    :data-very-long="formattedValue.length > 9"
    :title="formattedValue + unit"
    :aria-label="formattedValue + unit"
  >
    <span class="number-content">
      <svg
        class="pixel-stat-digits"
        :width="pixelLayout.width"
        :height="pixelLayout.height"
        :viewBox="`0 0 ${Math.max(1, pixelLayout.width)} ${Math.max(1, pixelLayout.height)}`"
        shape-rendering="crispEdges"
        aria-hidden="true"
      >
        <rect
          v-for="cell in pixelLayout.cells"
          :key="`${cell.x}-${cell.y}`"
          :x="cell.x"
          :y="cell.y"
          :width="pixelUnit"
          :height="pixelUnit"
        />
      </svg>
      <span v-if="unit" class="number-unit">{{ unit }}</span>
    </span>
  </span>
</template>

<style scoped>
.stat-number {
  display: flex;
  justify-content: center;
  align-items: center;
  min-width: 0;
  width: 100%;
  min-height: 20px;
  white-space: nowrap;
  line-height: 1.25;
}

.stat-number.is-inline {
  display: inline-flex;
  width: auto;
  min-height: 14px;
}

.number-content {
  display: inline-flex;
  align-items: flex-end;
  gap: 3px;
  flex-shrink: 0;
}

.pixel-stat-digits {
  display: block;
  image-rendering: pixelated;
}

.pixel-stat-digits rect {
  fill: currentColor;
}

.number-unit {
  font-size: 10px;
  font-weight: 500;
  line-height: 1;
  opacity: 0.72;
}
</style>
