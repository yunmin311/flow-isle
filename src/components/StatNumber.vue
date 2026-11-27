<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{ value: number | string; unit?: string; size?: number; inline?: boolean }>(), {
  unit: '',
  size: 24,
  inline: false,
})

const formattedValue = computed(() => String(props.value))

// 小号读数改用清晰等宽无衬线数字（不再强行用 3×5 像素格导致笔画跳脱）；
// 大号倒计时仍由 PixelTime 保留规范像素风格。
const fontSizePx = computed(() => {
  if (props.size >= 24) return 22
  if (props.size >= 20) return 18
  if (props.size >= 16) return 13
  return 12
})
</script>

<template>
  <span
    class="stat-number"
    :class="{ 'is-inline': inline }"
    :style="{ '--stat-font-size': `${fontSizePx}px` }"
    :title="formattedValue + unit"
    :aria-label="formattedValue + unit"
  >
    <span class="number-content">
      <span class="stat-digits">{{ formattedValue }}</span>
      <span v-if="unit" class="number-unit">{{ unit }}</span>
    </span>
  </span>
</template>

<style scoped>
.stat-number {
  display: flex;
  justify-content: center;
  align-items: baseline;
  min-width: 0;
  width: 100%;
  white-space: nowrap;
  line-height: 1.2;
}

.stat-number.is-inline {
  display: inline-flex;
  width: auto;
}

.number-content {
  display: inline-flex;
  align-items: baseline;
  gap: 2px;
  flex-shrink: 0;
}

.stat-digits {
  font-family: var(--font-mono);
  font-size: var(--stat-font-size, 14px);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
  line-height: 1.15;
}

.number-unit {
  font-family: var(--font-ui);
  font-size: 10.5px;
  font-weight: 500;
  line-height: 1;
  opacity: 0.72;
}
</style>
