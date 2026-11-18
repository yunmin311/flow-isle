<script setup lang="ts">
import { computed } from 'vue'
import type { NotificationType } from '../composables/useTimer'
import { useCompanion, resolveIslandCompanionSprite } from '../composables/useCompanion'
import type { FocusMissedSummary } from '../composables/useNotifications'

const props = defineProps<{
  type: NotificationType
  scale: number
  missedSummary?: FocusMissedSummary | null
}>()

const emit = defineEmits<{
  open: []
  confirm: []
  extend: []
  dismiss: []
}>()

const { selectedCompanion } = useCompanion()
const isFocusDone = computed(() => props.type === 'focus-done')
const hasMissed = computed(() => isFocusDone.value && Boolean(props.missedSummary && props.missedSummary.total > 0))
const bannerTitle = computed(() => {
  if (!isFocusDone.value) return '休息结束'
  if (hasMissed.value && props.missedSummary) return `完成专注 · 错过 ${props.missedSummary.total} 条`
  return '完成了一个番茄'
})

function compactMissedLine(summary: FocusMissedSummary): string {
  const parts: string[] = []
  if (summary.emailCount > 0) parts.push(`${summary.emailCount}邮件`)
  if (summary.socialCount > 0) {
    const label = summary.socialApps.length === 1 ? summary.socialApps[0] : '社交'
    parts.push(`${summary.socialCount}${label}`)
  }
  if (summary.systemCount > 0) parts.push(`${summary.systemCount}系统`)
  return parts.join(' · ')
}

const bannerSub = computed(() => {
  if (!isFocusDone.value) return '准备开启下一个番茄钟吗'
  if (hasMissed.value && props.missedSummary) return compactMissedLine(props.missedSummary)
  return `${selectedCompanion.value.name} · 休息一下吧`
})
const companionSprite = computed(() =>
  resolveIslandCompanionSprite(selectedCompanion.value, isFocusDone.value ? 'done' : 'idle'),
)

const primaryColor = computed(() => isFocusDone.value ? 'var(--break-color)' : 'var(--focus-color)')
const extendColor = computed(() => isFocusDone.value ? 'var(--focus-color)' : 'var(--break-color)')
</script>

<template>
  <transition name="notif">
    <div
      v-if="type"
      class="notif-banner"
      @click="emit('open')"
      :style="{
        '--notif-scale': scale,
        '--accent': primaryColor,
        '--extend-color': extendColor,
      }"
    >
      <div class="notif-icon" aria-hidden="true">
        <img
          v-if="companionSprite.url"
          class="notif-companion"
          :src="companionSprite.url"
          alt=""
          :style="{
            width: `calc(${companionSprite.width}px * var(--notif-scale, 1))`,
            height: `calc(${companionSprite.height}px * var(--notif-scale, 1))`,
          }"
        />
        <svg
          v-else
          class="pixel-done"
          viewBox="0 0 16 16"
          fill="currentColor"
          shape-rendering="crispEdges"
        >
          <path d="M0 8h4v4H0zm4 4h4v4H4zm4-4h4v4H8zm4-4h4v4h-4z" />
        </svg>
      </div>
      <div
        class="notif-text"
        role="button"
        tabindex="0"
        title="打开计时区"
        @keydown.enter.prevent="emit('open')"
        @keydown.space.prevent="emit('open')"
      >
        <div class="notif-title">{{ bannerTitle }}</div>
        <div class="notif-sub">{{ bannerSub }}</div>
      </div>
      <div class="notif-actions">
        <button class="notif-btn primary" @click.stop="emit('confirm')">
          {{ isFocusDone ? '休息' : '专注' }}
        </button>
        <button class="notif-btn extend" @click.stop="emit('extend')">
          {{ isFocusDone ? '专注' : '休息' }}
        </button>
        <button class="notif-btn dismiss" @click.stop="emit('dismiss')">退出</button>
      </div>
    </div>
  </transition>
</template>

<style scoped>
@reference "../styles.css";

.notif-banner {
  width: calc(352px * var(--notif-scale, 1));
  height: calc(60px * var(--notif-scale, 1));
  border-radius: calc(22px * var(--notif-scale, 1));
  background: var(--notif-bg);
  border: 1px solid var(--notif-border);
  box-shadow: var(--notif-shadow);
  display: flex;
  align-items: center;
  gap: calc(10px * var(--notif-scale, 1));
  padding: 0 calc(12px * var(--notif-scale, 1));
  pointer-events: auto;
  contain: layout style paint;
}

.notif-icon {
  width: calc(34px * var(--notif-scale, 1));
  height: calc(34px * var(--notif-scale, 1));
  border-radius: 10px;
  background: var(--notif-icon-bg);
  border: 1px solid var(--notif-border);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--v2-accent);
  flex-shrink: 0;
}

.notif-companion {
  display: block;
  image-rendering: pixelated;
}

.pixel-done {
  width: calc(16px * var(--notif-scale, 1));
  height: calc(16px * var(--notif-scale, 1));
}

.notif-text {
  cursor: pointer;
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: calc(2px * var(--notif-scale, 1));
}

.notif-title {
  font-size: calc(12px * var(--notif-scale, 1));
  font-weight: 700;
  color: var(--notif-title-color);
  line-height: 1.25;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.notif-sub {
  font-size: calc(11px * var(--notif-scale, 1));
  color: var(--notif-sub-color);
  line-height: 1.25;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.notif-actions {
  display: flex;
  gap: calc(4px * var(--notif-scale, 1));
  flex-shrink: 0;
}

.notif-btn {
  height: calc(28px * var(--notif-scale, 1));
  padding: 0 calc(9px * var(--notif-scale, 1));
  border-radius: calc(8px * var(--notif-scale, 1));
  font-size: calc(11px * var(--notif-scale, 1));
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
  transition: background-color 160ms ease, filter 160ms ease;
  white-space: nowrap;
  font-family: inherit;
}

.notif-btn.primary {
  background-color: var(--accent);
  background-image: var(--pixel-dither);
  border: 1px solid color-mix(in srgb, #000 18%, var(--accent));
  box-shadow: var(--pixel-bevel-sm);
  color: var(--v2-on-accent);
}

.notif-btn.primary:hover {
  filter: brightness(1.08);
}

.notif-btn.extend {
  background: var(--ui-well);
  border: 1px solid var(--notif-border);
  color: var(--notif-title-color);
}

.notif-btn.extend:hover {
  background: var(--ui-hover);
}

.notif-btn.dismiss {
  background: transparent;
  border: 1px solid var(--notif-dismiss-border);
  color: var(--notif-dismiss-color);
}

.notif-btn.dismiss:hover {
  background: var(--notif-dismiss-hover-bg);
  border-color: var(--notif-dismiss-hover-border);
  color: var(--notif-dismiss-hover-color);
}

/* MOTION-SPEC：无 scale 变形，纯合成层位移与透明度 */
.notif-enter-active {
  animation: notif-in 180ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
}

.notif-leave-active {
  animation: notif-out 140ms ease-in both;
}

@keyframes notif-in {
  from {
    opacity: 0;
    transform: translate3d(0, -6px, 0);
  }
  to {
    opacity: 1;
    transform: translate3d(0, 0, 0);
  }
}

@keyframes notif-out {
  from {
    opacity: 1;
    transform: translate3d(0, 0, 0);
  }
  to {
    opacity: 0;
    transform: translate3d(0, -4px, 0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .notif-enter-active,
  .notif-leave-active,
  .notif-btn {
    animation: none;
    transition: none;
  }
}
</style>
