<script setup lang="ts">
import type { CompanionBackgroundEffect, CompanionPlacement, CompanionStage } from '../composables/useCompanion'

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
    effect?: CompanionBackgroundEffect
    stageTier?: CompanionStage['tier']
  }>(),
  {
    family: 'cat',
    hopping: false,
    mode: 'scene',
    size: 72,
    effect: 'none',
    stageTier: 'new',
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

    <!-- 背景层氛围动效（纯 SVG + CSS，零定时器零额外内存） -->
    <g v-if="mode === 'scene' && effect === 'stars'" class="fx-layer fx-stars" aria-hidden="true">
      <rect class="fx-twinkle d1" x="10" y="9" width="2" height="2" fill="#fff7d6" />
      <rect class="fx-twinkle d2" x="26" y="6" width="1.5" height="1.5" fill="#fde68a" />
      <rect class="fx-twinkle d3" x="54" y="10" width="2" height="2" fill="#fff7d6" />
      <rect class="fx-twinkle d4" x="61" y="19" width="1.5" height="1.5" fill="#fef3c7" />
      <rect class="fx-twinkle d2" x="15" y="21" width="1.5" height="1.5" fill="#fde68a" />
      <g class="fx-meteor">
        <rect x="0" y="0" width="3" height="1" fill="#fffbeb" />
        <rect x="3" y="1" width="2" height="1" fill="#fde68a" opacity="0.7" />
      </g>
    </g>

    <g v-else-if="mode === 'scene' && effect === 'fireflies'" class="fx-layer fx-fireflies" aria-hidden="true">
      <rect class="fx-float-up d1" x="12" y="48" width="2" height="2" fill="#fde047" />
      <rect class="fx-float-up d2" x="24" y="54" width="1.5" height="1.5" fill="#fb923c" />
      <rect class="fx-float-up d3" x="55" y="46" width="2" height="2" fill="#fef08a" />
      <rect class="fx-float-up d4" x="48" y="56" width="1.5" height="1.5" fill="#facc15" />
      <rect class="fx-float-up d5" x="62" y="42" width="1.5" height="1.5" fill="#fde68a" />
    </g>

    <g v-else-if="mode === 'scene' && effect === 'petals'" class="fx-layer fx-petals" aria-hidden="true">
      <rect class="fx-petal d1" x="12" y="6" width="2" height="1.5" fill="#fbcfe8" />
      <rect class="fx-petal d2" x="30" y="4" width="2" height="1.5" fill="#fce7f3" />
      <rect class="fx-petal d3" x="50" y="8" width="2" height="1.5" fill="#f9a8d4" />
      <rect class="fx-petal d4" x="20" y="14" width="1.5" height="1.5" fill="#fff1f2" />
      <rect class="fx-petal d5" x="58" y="12" width="2" height="1.5" fill="#fbcfe8" />
    </g>

    <g v-else-if="mode === 'scene' && effect === 'rain'" class="fx-layer fx-rain" aria-hidden="true">
      <rect class="fx-drop d1" x="12" y="4" width="1" height="4" fill="#dbeafe" />
      <rect class="fx-drop d2" x="25" y="2" width="1" height="4" fill="#bfdbfe" />
      <rect class="fx-drop d3" x="41" y="6" width="1" height="4" fill="#dbeafe" />
      <rect class="fx-drop d4" x="55" y="3" width="1" height="4" fill="#bfdbfe" />
      <rect class="fx-drop d5" x="64" y="8" width="1" height="3.5" fill="#e0f2fe" />
    </g>

    <g v-else-if="mode === 'scene' && effect === 'bubbles'" class="fx-layer fx-bubbles" aria-hidden="true">
      <rect class="fx-bubble d1" x="11" y="56" width="2" height="2" fill="#e0f2fe" />
      <rect class="fx-bubble d2" x="20" y="62" width="1.5" height="1.5" fill="#bae6fd" />
      <rect class="fx-bubble d3" x="56" y="54" width="2.5" height="2.5" fill="#e0f2fe" />
      <rect class="fx-bubble d4" x="62" y="60" width="1.5" height="1.5" fill="#f0f9ff" />
    </g>

    <g v-else-if="mode === 'scene' && effect === 'steam'" class="fx-layer fx-steam" aria-hidden="true">
      <rect class="fx-wisp d1" x="14" y="40" width="2" height="2" fill="#fffaf0" />
      <rect class="fx-wisp d2" x="22" y="34" width="2" height="1.5" fill="#fef3c7" />
      <rect class="fx-wisp d3" x="54" y="38" width="2" height="2" fill="#fffaf0" />
      <rect class="fx-wisp d4" x="48" y="32" width="1.5" height="1.5" fill="#fef3c7" />
    </g>

    <g v-else-if="mode === 'scene' && effect === 'sparkle'" class="fx-layer fx-sparkle" aria-hidden="true">
      <rect class="fx-twinkle d1" x="11" y="14" width="2" height="2" fill="#fef08a" />
      <rect class="fx-twinkle d2" x="58" y="13" width="2" height="2" fill="#e9d5ff" />
      <rect class="fx-twinkle d3" x="15" y="36" width="1.5" height="1.5" fill="#fffbeb" />
      <rect class="fx-twinkle d4" x="59" y="34" width="1.5" height="1.5" fill="#fde68a" />
    </g>

    <!-- 常伴搭档(>=300分)养成专属金光星点 -->
    <g v-if="mode === 'scene' && stageTier === 'bonded'" class="fx-layer fx-bonded" aria-hidden="true">
      <rect class="fx-twinkle d1" x="7" y="7" width="2" height="2" fill="#fcd34d" />
      <rect class="fx-twinkle d3" x="63" y="7" width="2" height="2" fill="#fcd34d" />
    </g>

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

    <!-- 轻拍互动时冒出像素小爱心 -->
    <g v-if="hopping" class="pet-love-heart" aria-hidden="true">
      <rect x="33" y="10" width="2" height="2" fill="#f43f5e" />
      <rect x="37" y="10" width="2" height="2" fill="#f43f5e" />
      <rect x="32" y="12" width="8" height="2" fill="#fb7185" />
      <rect x="33" y="14" width="6" height="2" fill="#f43f5e" />
      <rect x="35" y="16" width="2" height="2" fill="#e11d48" />
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

/* ===== 背景氛围像素动效 ===== */
.fx-layer {
  pointer-events: none;
}

.fx-twinkle {
  animation: fx-twinkle 2.4s steps(3, end) infinite;
}

.fx-meteor {
  opacity: 0;
  animation: fx-meteor 6.5s linear infinite;
}

.fx-float-up {
  animation: fx-float-up 3.6s ease-in-out infinite;
}

.fx-petal {
  animation: fx-petal-fall 4.4s linear infinite;
}

.fx-drop {
  animation: fx-rain-fall 1.3s linear infinite;
}

.fx-bubble {
  animation: fx-bubble-rise 3.8s ease-in-out infinite;
}

.fx-wisp {
  animation: fx-steam-rise 3.4s ease-out infinite;
}

.pet-love-heart {
  animation: fx-heart-pop 460ms ease-out both;
}

.d1 { animation-delay: 0s; }
.d2 { animation-delay: -0.7s; }
.d3 { animation-delay: -1.4s; }
.d4 { animation-delay: -2.1s; }
.d5 { animation-delay: -2.9s; }

@keyframes fx-twinkle {
  0%, 100% { opacity: 0.25; }
  50% { opacity: 0.98; }
}

@keyframes fx-meteor {
  0%, 72% { opacity: 0; transform: translate(10px, 6px); }
  78% { opacity: 0.95; }
  90% { opacity: 0; transform: translate(52px, 24px); }
  100% { opacity: 0; transform: translate(52px, 24px); }
}

@keyframes fx-float-up {
  0% { opacity: 0; transform: translate(0, 0); }
  25% { opacity: 0.92; }
  75% { opacity: 0.8; }
  100% { opacity: 0; transform: translate(3px, -22px); }
}

@keyframes fx-petal-fall {
  0% { opacity: 0; transform: translate(0, 0); }
  15% { opacity: 0.88; }
  85% { opacity: 0.72; }
  100% { opacity: 0; transform: translate(12px, 46px); }
}

@keyframes fx-rain-fall {
  0% { opacity: 0; transform: translate(0, 0); }
  20% { opacity: 0.65; }
  90% { opacity: 0.55; }
  100% { opacity: 0; transform: translate(-4px, 52px); }
}

@keyframes fx-bubble-rise {
  0% { opacity: 0; transform: translate(0, 0); }
  20% { opacity: 0.75; }
  80% { opacity: 0.6; }
  100% { opacity: 0; transform: translate(-2px, -34px); }
}

@keyframes fx-steam-rise {
  0% { opacity: 0; transform: translate(0, 0); }
  30% { opacity: 0.52; }
  100% { opacity: 0; transform: translate(2px, -16px); }
}

@keyframes fx-heart-pop {
  0% { opacity: 0; transform: translateY(4px); }
  30% { opacity: 1; transform: translateY(-2px); }
  100% { opacity: 0; transform: translateY(-9px); }
}

@media (prefers-reduced-motion: reduce) {
  .pet-rig,
  .pet-ground-shadow,
  .fx-twinkle,
  .fx-meteor,
  .fx-float-up,
  .fx-petal,
  .fx-drop,
  .fx-bubble,
  .fx-wisp,
  .pet-love-heart {
    animation: none !important;
  }
}
</style>
