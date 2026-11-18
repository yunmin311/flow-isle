<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = withDefaults(defineProps<{ value: number; unit?: string; size?: number }>(), {
  unit: '',
  size: 24,
})

const root = ref<HTMLElement>()
const content = ref<HTMLElement>()
const fontSize = ref(props.size)
let observer: ResizeObserver | undefined
let generation = 0
let lastWidth = -1

async function fit() {
  const run = ++generation
  fontSize.value = props.size
  await nextTick()
  if (run !== generation || !root.value || !content.value) return
  const width = root.value.clientWidth
  for (let attempt = 0; attempt < 3 && width > 0; attempt++) {
    const needed = content.value.getBoundingClientRect().width
    if (needed <= width || fontSize.value <= 12) break
    fontSize.value = Math.max(12, Math.floor((fontSize.value * (width - 1)) / needed))
    await nextTick()
    if (run !== generation || !content.value) return
  }
}

watch(() => [props.value, props.unit, props.size], fit)

onMounted(() => {
  observer = new ResizeObserver((entries) => {
    const width = entries[0]?.contentRect.width ?? -1
    if (width !== lastWidth) {
      lastWidth = width
      void fit()
    }
  })
  if (root.value) observer.observe(root.value)
  void fit()
})

onBeforeUnmount(() => {
  generation++
  observer?.disconnect()
})
</script>

<template>
  <span
    ref="root"
    class="stat-number"
    :data-long="String(value).length > 5"
    :data-very-long="String(value).length > 9"
    :title="String(value) + unit"
    :aria-label="String(value) + unit"
  >
    <span ref="content" class="number-content" :style="{ fontSize: `${fontSize}px` }">
      <span class="number-digits">{{ value }}</span>
      <span v-if="unit" class="number-unit">{{ unit }}</span>
    </span>
  </span>
</template>

<style scoped>
.stat-number {
  display: flex;
  justify-content: center;
  min-width: 0;
  width: 100%;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  line-height: 1.25;
}

.number-content {
  display: inline-flex;
  align-items: baseline;
  gap: 0.16em;
  flex-shrink: 0;
}

.number-digits {
  font-weight: 700;
}

.number-unit {
  font-size: max(10px, 0.55em);
  font-weight: 400;
  opacity: 0.72;
}
</style>
