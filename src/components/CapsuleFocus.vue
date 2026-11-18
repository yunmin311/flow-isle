<script setup lang="ts">
import { computed } from 'vue'
import { useTimer } from '../composables/useTimer'
import { useTasks } from '../composables/useTasks'
import { useCompanion, resolveIslandCompanionSprite } from '../composables/useCompanion'
import { PIXEL_3X5, layoutPixelText } from '../utils/pixelFont'

const { displayTime, phase, activeTaskId, activeTaskTitle, activeSubtaskTitle, running, remaining } = useTimer()
const { tasks } = useTasks()
const { selectedCompanion } = useCompanion()

defineProps<{ radioPlaying?: boolean }>()

const activeTask = computed(() =>
  tasks.value.find(t => t.id === activeTaskId.value),
)
const resolvedTitle = computed(() => {
  if (activeSubtaskTitle.value) return activeSubtaskTitle.value
  return activeTaskTitle.value ?? activeTask.value?.title ?? null
})

const phaseColor = computed(() =>
  phase.value === 'focus' ? 'var(--focus-color)' : 'var(--break-color)',
)

const companionSprite = computed(() =>
  resolveIslandCompanionSprite(
    selectedCompanion.value,
    phase.value === 'break' ? 'break' : 'focus',
  ),
)

// 固定 3px：与 idle 时钟保持一致
const pixelUnit = 3
const pixelTime = computed(() => layoutPixelText(displayTime.value, PIXEL_3X5, pixelUnit, 1))
</script>

<template>
  <div class="capsule-focus">
    <div class="focus-companion">
      <img
        class="companion-pixel"
        :src="companionSprite.url"
        :alt="selectedCompanion.name"
        width="18"
        height="18"
        :style="{
          width: `calc(18px * var(--island-scale, 1))`,
          height: `calc(18px * var(--island-scale, 1))`,
        }"
      />
      <span
        class="phase-pip"
        :class="{ 'is-running': running }"
        :style="{ backgroundColor: phaseColor }"
        aria-hidden="true"
      />
    </div>

    <div class="flex-1 min-w-0">
      <span
        class="font-medium truncate block text-[var(--capsule-text)]"
        :style="{ fontSize: `calc(12.5px * var(--island-scale, 1))` }"
      >{{ resolvedTitle ?? (phase === 'break' ? '休息一下' : '专注中') }}</span>
    </div>

    <div
      class="shrink-0 flex items-center"
      :style="{ gap: `calc(8px * var(--island-scale, 1))` }"
    >
      <svg
        class="capsule-pixel-time"
        :width="pixelTime.width"
        :height="pixelTime.height"
        :viewBox="`0 0 ${pixelTime.width} ${pixelTime.height}`"
        shape-rendering="crispEdges"
        :style="{ '--pixel-color': phaseColor }"
        :aria-label="`剩余 ${displayTime}`"
      >
        <rect
          v-for="cell in pixelTime.cells"
          :key="`${cell.x}-${cell.y}`"
          :x="cell.x"
          :y="cell.y"
          :width="pixelUnit"
          :height="pixelUnit"
        />
      </svg>
      <span
        v-if="!running && remaining > 0"
        class="text-[var(--capsule-muted)]"
        :style="{ fontSize: `calc(10px * var(--island-scale, 1))` }"
      >
        ⏸
      </span>
      <div v-if="radioPlaying" class="wave-bars">
        <span class="wave-bar" />
        <span class="wave-bar" />
        <span class="wave-bar" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.capsule-focus {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: 100%;
  padding: 0 calc(14px * var(--island-scale, 1));
  gap: calc(10px * var(--island-scale, 1));
}

.focus-companion {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.companion-pixel {
  display: block;
  image-rendering: pixelated;
}

.phase-pip {
  position: absolute;
  right: -2px;
  bottom: -1px;
  width: 5px;
  height: 5px;
  transition: background-color 420ms ease;
}

.phase-pip.is-running {
  animation: pip-pulse 1.8s steps(2, end) infinite;
}

@keyframes pip-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.45; }
}

.capsule-pixel-time {
  flex-shrink: 0;
  display: block;
  image-rendering: pixelated;
}

.capsule-pixel-time rect {
  fill: var(--pixel-color);
  transition: fill 420ms ease;
}

.wave-bars {
  display: flex;
  align-items: flex-end;
  gap: calc(3px * var(--island-scale, 1));
  height: calc(12px * var(--island-scale, 1));
}

.wave-bar {
  width: calc(3px * var(--island-scale, 1));
  height: calc(12px * var(--island-scale, 1));
  background: var(--focus-color);
  border-radius: 0;
  opacity: 0.82;
  animation: wave-bounce 1s steps(2, end) infinite;
}

.wave-bar:nth-child(1) {
  animation-delay: 0s;
  clip-path: inset(30% 0 0);
}

.wave-bar:nth-child(2) {
  animation-delay: -0.33s;
  clip-path: inset(0);
}

.wave-bar:nth-child(3) {
  animation-delay: -0.66s;
  clip-path: inset(55% 0 0);
}

@keyframes wave-bounce {
  0%, 100% { clip-path: inset(66% 0 0); }
  50% { clip-path: inset(0); }
}

@media (prefers-reduced-motion: reduce) {
  .phase-pip.is-running,
  .wave-bar {
    animation: none;
  }
}
</style>
