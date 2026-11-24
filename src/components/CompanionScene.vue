<script setup lang="ts">
import type { CompanionPlacement } from '../composables/useCompanion'

withDefaults(
  defineProps<{
    name: string
    backgroundUrl: string
    portraitUrl: string
    placement: CompanionPlacement
    family?: 'cat' | 'dog' | 'fox'
    hopping?: boolean
    mode?: 'scene' | 'detail'
    size?: number
  }>(),
  {
    family: 'cat',
    hopping: false,
    mode: 'scene',
    size: 72,
  },
)
</script>

<template>
  <svg
    class="companion-scene-svg"
    :class="[`family-${family}`, { 'is-hopping': hopping, 'is-detail': mode === 'detail' }]"
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
      class="scene-bg"
      style="image-rendering: pixelated"
    />
    <!-- Subtle pixel ground shadow under the companion -->
    <ellipse
      v-if="mode === 'scene'"
      :cx="placement.x + placement.width / 2"
      :cy="placement.y + placement.height - 2"
      :rx="placement.width * 0.34"
      ry="2.6"
      class="pet-ground-shadow"
    />
    <g
      v-if="mode === 'scene'"
      class="pet-rig"
      :style="{
        transformOrigin: `${placement.x + placement.width / 2}px ${placement.y + placement.height}px`,
      }"
    >
      <image
        :href="portraitUrl"
        :x="placement.x"
        :y="placement.y"
        :width="placement.width"
        :height="placement.height"
        preserveAspectRatio="xMidYMid meet"
        style="image-rendering: pixelated"
      />
    </g>
    <g v-else class="pet-rig" style="transform-origin: 36px 68px">
      <image
        :href="portraitUrl"
        x="0"
        y="0"
        width="72"
        height="72"
        preserveAspectRatio="xMidYMid meet"
        style="image-rendering: pixelated"
      />
    </g>
  </svg>
</template>

<style scoped>
.companion-scene-svg {
  display: block;
  flex-shrink: 0;
  image-rendering: pixelated;
  overflow: visible;
}

.pet-ground-shadow {
  fill: rgba(44, 24, 12, 0.22);
  transform-box: fill-box;
  transform-origin: center;
  animation: shadow-breathe 3.4s ease-in-out infinite;
}

.pet-rig {
  will-change: transform;
}

/* 猫咪：慵懒轻柔呼吸 + 细微歪头打盹感 */
.family-cat .pet-rig {
  animation: cat-breathe 3.6s ease-in-out infinite;
}

/* 狗狗：轻快弹跳呼吸 + 活泼微晃 */
.family-dog .pet-rig {
  animation: dog-wag 2.6s ease-in-out infinite;
}

/* 狐狸：灵动警觉轻伏 + 优雅微倾 */
.family-fox .pet-rig {
  animation: fox-poise 3.2s ease-in-out infinite;
}

/* 轻拍互动瞬间：全物种通用开心弹跳 */
.companion-scene-svg.is-hopping .pet-rig {
  animation: pet-happy-hop 460ms cubic-bezier(0.22, 1.25, 0.36, 1) both;
}

.companion-scene-svg.is-hopping .pet-ground-shadow {
  animation: shadow-hop 460ms cubic-bezier(0.22, 1.25, 0.36, 1) both;
}

@keyframes cat-breathe {
  0%, 100% { transform: translateY(0) scaleY(1) rotate(0deg); }
  45% { transform: translateY(-0.9px) scaleY(1.028) rotate(-0.8deg); }
  75% { transform: translateY(-0.3px) scaleY(1.01) rotate(0.7deg); }
}

@keyframes dog-wag {
  0%, 100% { transform: translateY(0) scale(1, 1) rotate(0deg); }
  25% { transform: translateY(-1.5px) scale(0.985, 1.03) rotate(-1.5deg); }
  55% { transform: translateY(0) scale(1.02, 0.985) rotate(1.4deg); }
  80% { transform: translateY(-1px) scale(0.99, 1.02) rotate(-0.8deg); }
}

@keyframes fox-poise {
  0%, 100% { transform: translateY(0) scaleY(1) rotate(0deg); }
  35% { transform: translateY(-1.3px) scaleY(1.025) rotate(1.3deg); }
  68% { transform: translateY(-0.6px) scaleY(1.015) rotate(-1.1deg); }
}

@keyframes pet-happy-hop {
  0% { transform: translateY(0) scale(1, 1); }
  22% { transform: translateY(1px) scale(1.07, 0.91); }
  52% { transform: translateY(-5.5px) scale(0.95, 1.07) rotate(-2deg); }
  78% { transform: translateY(0.5px) scale(1.03, 0.96) rotate(1deg); }
  100% { transform: translateY(0) scale(1, 1) rotate(0deg); }
}

@keyframes shadow-breathe {
  0%, 100% { transform: scaleX(1); opacity: 0.22; }
  50% { transform: scaleX(0.92); opacity: 0.16; }
}

@keyframes shadow-hop {
  0%, 100% { transform: scaleX(1); opacity: 0.22; }
  52% { transform: scaleX(0.72); opacity: 0.10; }
}

@media (prefers-reduced-motion: reduce) {
  .pet-rig,
  .pet-ground-shadow {
    animation: none !important;
  }
}
</style>
