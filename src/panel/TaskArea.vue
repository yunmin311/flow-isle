<script setup lang="ts">
import { computed, ref, onBeforeUnmount, onDeactivated } from 'vue'
import { useTasks, type Task, isTaskDoneOnDate, todayString } from '../composables/useTasks'
import { useTimerBridge } from '../composables/useTimerBridge'
import { useTaskGroups } from '../composables/useTaskGroups'
import { useSettings } from '../composables/useSettings'
import { useCompanion, resolveIslandCompanionSprite, ALBUM_MINUTES } from '../composables/useCompanion'
import { getCategoryColor } from '../composables/useMemos'
import PixelTime from '../components/PixelTime.vue'
import { triggerPixelBurstFromEvent } from '../utils/pixelSpark'

const emit = defineEmits<{
  close: []
  openCompanion: []
}>()

const { groups } = useTaskGroups()

const {
  tasks,
  recentFocusTasks: recentTasks,
  addTask,
  setTaskPriority,
  incrementPomodoro,
  toggleComplete,
} = useTasks()

const {
  start,
  pause,
  resume,
  running,
  activeTaskId,
  activeTaskTitle,
  activeSubtaskTitle,
  displayTime,
  progress,
  totalDuration,
  phase,
  pendingNotification,
  abandon,
  skipBreak,
  confirmNotification,
  extendNotification,
  dismissNotification,
} = useTimerBridge()

const { settings } = useSettings()
const { selectedCompanion, companionRecord, getCompanionStage } = useCompanion()

// 快速专注：不依赖 TODO，直接用虚拟任务启动一个番茄
const QUICK_TASK_ID = 'quick-focus'
const QUICK_TASK_TITLE = '快速专注'
const quickActive = computed(() => activeTaskId.value === QUICK_TASK_ID)

function startQuick() {
  if (activeTaskId.value) return
  start(QUICK_TASK_ID, QUICK_TASK_TITLE)
}

const progressBars = computed(() =>
  Array.from({ length: 40 }, (_, index) => index < Math.round(progress.value * 40)),
)

const heroEyebrow = computed(() => {
  if (pendingNotification.value === 'focus-done') return '专注结束'
  if (pendingNotification.value === 'break-done') return '休息结束'
  return phase.value === 'break' ? '休息' : '专注'
})

const heroTitle = computed(() => {
  if (pendingNotification.value === 'focus-done') return '这一轮专注已完成'
  if (pendingNotification.value === 'break-done') return '休息好了，继续下一轮？'
  if (activeTaskId.value) return activeTaskTitle.value ?? '专注中'
  return '准备开始一段专注'
})

const heroStatus = computed(() => {
  if (pendingNotification.value === 'focus-done') return '等待开始休息'
  if (pendingNotification.value === 'break-done') return '休息完成'
  if (activeTaskId.value) return running.value ? '进行中' : '已暂停'
  return '待开始'
})

const heroMinutes = computed(() => Math.round(totalDuration.value / 60))

const companionSummary = computed(() => {
  const animal = selectedCompanion.value
  const rec = companionRecord(animal.id)
  const stage = getCompanionStage(rec.minutes, rec.collectedAt)
  const mode = pendingNotification.value
    ? 'done'
    : running.value
      ? phase.value === 'break'
        ? 'break'
        : 'focus'
      : 'idle'
  const sprite = resolveIslandCompanionSprite(animal, mode, Math.floor(rec.minutes / 5))
  const progressText = rec.minutes < ALBUM_MINUTES ? `${rec.minutes}/${ALBUM_MINUTES}m` : `${rec.minutes}m`
  return { animal, rec, stage, sprite, progressText }
})

function handleHeroAction(event?: MouseEvent) {
  if (pendingNotification.value) {
    triggerPixelBurstFromEvent(event, pendingNotification.value === 'focus-done' ? 'break' : 'accent', 8)
    confirmNotification()
    return
  }
  if (activeTaskId.value) {
    if (running.value) pause()
    else {
      triggerPixelBurstFromEvent(event, phase.value === 'break' ? 'break' : 'accent', 6)
      resume()
    }
    return
  }
  triggerPixelBurstFromEvent(event, 'accent', 8)
  startQuick()
}

// --- Quick-add state ---
const newTitle = ref('')
const quickAddRef = ref<HTMLInputElement | null>(null)

// --- Title scroll animation ---
type ScrollPhase = 'start' | 'scroll' | 'end'
interface ScrollState {
  taskId: string
  container: HTMLElement
  text: HTMLElement
  frameId: number | null
  offset: number
  waitFrames: number
  phase: ScrollPhase
}

const SCROLL_SPEED = 0.5
const START_WAIT_FRAMES = 30
const END_WAIT_FRAMES = 60
let activeScroll: ScrollState | null = null

function startScroll(taskId: string, eventTarget: EventTarget | null) {
  const containerEl = eventTarget as HTMLElement | null
  if (!containerEl) return
  const textEl = containerEl.querySelector('.task-title-text') as HTMLElement | null
  if (!textEl) return
  const overflow = textEl.scrollWidth - containerEl.clientWidth
  if (overflow <= 0) return
  stopScroll()
  textEl.style.transform = 'translateX(0)'
  activeScroll = { taskId, container: containerEl, text: textEl, frameId: null, offset: 0, waitFrames: START_WAIT_FRAMES, phase: 'start' }
  scheduleNextScrollFrame()
}

function scheduleNextScrollFrame() {
  if (!activeScroll) return
  activeScroll.frameId = requestAnimationFrame(runScrollFrame)
}

function runScrollFrame() {
  const state = activeScroll
  if (!state) return
  if (!state.container.isConnected || !state.text.isConnected) {
    stopScroll(state.taskId)
    return
  }
  const overflow = state.text.scrollWidth - state.container.clientWidth
  if (overflow <= 0) {
    stopScroll(state.taskId)
    return
  }
  if (state.phase !== 'scroll') {
    state.waitFrames -= 1
    if (state.waitFrames <= 0) {
      if (state.phase === 'end') {
        state.offset = 0
        state.text.style.transform = 'translateX(0)'
      }
      state.phase = 'scroll'
    }
    scheduleNextScrollFrame()
    return
  }
  state.offset += SCROLL_SPEED
  if (state.offset >= overflow) {
    state.offset = overflow
    state.text.style.transform = `translateX(-${overflow}px)`
    state.phase = 'end'
    state.waitFrames = END_WAIT_FRAMES
  } else {
    state.text.style.transform = `translateX(-${state.offset}px)`
  }
  scheduleNextScrollFrame()
}

function stopScroll(taskId?: string) {
  if (!activeScroll) return
  if (taskId && activeScroll.taskId !== taskId) return
  if (activeScroll.frameId !== null) cancelAnimationFrame(activeScroll.frameId)
  activeScroll.text.style.transform = 'translateX(0)'
  activeScroll = null
}

onDeactivated(() => { stopScroll() })
onBeforeUnmount(() => { stopScroll() })

// --- Quick-add ---
async function handleInput(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault()
    const t = newTitle.value.trim()
    if (!t) return
    const task = addTask(t)
    newTitle.value = ''
    if (event.shiftKey) {
      setTaskPriority(task.id, 1)
      start(task.id, task.title)
      emit('close')
    }
  }
}

// --- Timer Controls ---
function handleStartTask(task: Task, event?: MouseEvent) {
  if (activeTaskId.value === task.id) {
    if (running.value) pause()
    else {
      triggerPixelBurstFromEvent(event, phase.value === 'break' ? 'break' : 'accent', 6)
      resume()
    }
  } else {
    triggerPixelBurstFromEvent(event, 'accent', 7)
    start(task.id, task.title)
  }
}

function isDoneToday(task: Task): boolean {
  return isTaskDoneOnDate(task, todayString.value)
}

function handleDoneTask(taskId: string, event?: MouseEvent) {
  const task = tasks.value.find(item => item.id === taskId)
  const doneToday = task ? isDoneToday(task) : false
  if (activeTaskId.value === taskId) {
    // 已完成的任务再次点击是撤销完成，不再重复累计番茄。
    if (!doneToday) incrementPomodoro(taskId)
    abandon()
  }
  toggleComplete(taskId)
  if (!doneToday) triggerPixelBurstFromEvent(event, 'accent', 9)
}
</script>

<template>
  <div class="home-page">
    <!-- Timer hero -->
    <section class="focus-hero" :class="{ 'is-break': phase === 'break', 'is-running': running }" tabindex="-1" aria-label="专注计时">
      <div class="hero-eyebrow">
        <span class="pixel-status" aria-hidden="true"></span>
        <span>{{ heroEyebrow }}</span>
        <span v-if="activeSubtaskTitle" class="hero-subtask">· {{ activeSubtaskTitle }}</span>
      </div>
      <h1>{{ heroTitle }}</h1>

      <div class="hero-clock">
        <PixelTime :value="displayTime" class="pixel-time" />
      </div>

      <div class="pixel-progress" aria-hidden="true">
        <i v-for="(filled, index) in progressBars" :key="index" :class="{ filled }" />
      </div>

      <div class="hero-meta">
        <span>{{ heroMinutes }} 分钟</span>
        <span>{{ heroStatus }}</span>
      </div>

      <div class="hero-actions">
        <template v-if="pendingNotification === 'focus-done'">
          <button class="primary-action" @click="triggerPixelBurstFromEvent($event, 'break', 8); confirmNotification()">开始休息</button>
          <button class="quiet-action" @click="extendNotification()">+5m</button>
          <button class="quiet-action" @click="dismissNotification()">结束</button>
        </template>
        <template v-else-if="pendingNotification === 'break-done'">
          <button class="primary-action" @click="triggerPixelBurstFromEvent($event, 'accent', 8); confirmNotification()">继续专注</button>
          <button class="quiet-action" @click="dismissNotification()">结束</button>
        </template>
        <template v-else>
          <button class="primary-action" @click="handleHeroAction($event)">
            {{ activeTaskId ? (running ? '暂停' : '继续') : '开始专注' }}
          </button>
          <button v-if="activeTaskId && phase === 'break'" class="quiet-action" @click="skipBreak()">跳过</button>
          <button v-if="activeTaskId" class="quiet-action" @click="abandon()">停止</button>
        </template>
      </div>

      <!-- Companion Micro-Bar -->
      <button class="hero-companion" title="打开陪伴与相册" @click="emit('openCompanion')">
        <img
          :src="companionSummary.sprite.url"
          :width="companionSummary.sprite.width"
          :height="companionSummary.sprite.height"
          alt=""
          class="companion-sprite"
        />
        <span class="companion-name">{{ companionSummary.animal.name }}</span>
        <span class="companion-stage">{{ companionSummary.stage.label }}</span>
        <span class="companion-meter">{{ companionSummary.progressText }}</span>
      </button>
    </section>

    <!-- Focus Queue -->
    <div class="focus-zone">
      <div class="zone-header">核心专注</div>

      <div class="focus-container">
        <!-- 快速专注运行态 -->
        <div
          v-if="quickActive"
          class="focus-task-item is-running"
          :style="{ '--active-color': phase === 'break' ? 'var(--break-color)' : 'var(--focus-color)' }"
        >
          <div class="task-row">
            <span class="running-dot" :class="{ paused: !running }" aria-hidden="true"></span>
            <span class="task-title running-title">{{ phase === 'break' ? '休息中' : '快速专注' }}</span>
            <span class="task-timer">{{ displayTime }}</span>
            <button class="queue-btn" @click="running ? pause() : resume()" :title="running ? '暂停' : '继续'">
              {{ running ? '暂停' : '继续' }}
            </button>
            <button class="queue-btn subtle" @click="abandon()" title="停止">停止</button>
          </div>
        </div>

        <div v-if="recentTasks.length === 0 && !quickActive" class="focus-empty">
          <span class="focus-empty-text">暂无核心任务 · 在下方输入后按 Shift+Enter 直接开专注</span>
        </div>

        <div
          v-for="task in recentTasks"
          :key="task.id"
          class="focus-task-item"
          :class="{ 'is-running': activeTaskId === task.id }"
          :style="activeTaskId === task.id ? { '--active-color': phase === 'break' ? 'var(--break-color)' : 'var(--focus-color)' } : undefined"
        >
          <div class="task-row">
            <span v-if="activeTaskId === task.id" class="running-dot" :class="{ paused: !running }" aria-hidden="true"></span>
            <button
              v-else
              class="check-circle"
              @click="handleDoneTask(task.id, $event)"
              title="完成"
              aria-label="完成"
            ></button>

            <span
              class="task-title"
              :class="{ 'running-title': activeTaskId === task.id }"
              @mouseenter="startScroll(task.id, $event.currentTarget)"
              @mouseleave="stopScroll(task.id)"
            >
              <span class="task-title-text">{{ task.title }}</span>
            </span>

            <span v-if="task.groupId" class="task-group-badge">
              <span class="group-dot-sm" :style="{ backgroundColor: getCategoryColor(groups.find(g => g.id === task.groupId)?.color ?? 'yellow').icon }"></span>
              {{ groups.find(g => g.id === task.groupId)?.name ?? '' }}
            </span>

            <template v-if="activeTaskId === task.id">
              <span class="task-timer">{{ displayTime }}</span>
              <button class="queue-btn icon-only" @click="handleStartTask(task, $event)" :title="running ? '暂停' : '继续'" :aria-label="running ? '暂停' : '继续'">
                {{ running ? '❚❚' : '▶' }}
              </button>
              <button class="queue-btn icon-only done" @click="handleDoneTask(task.id, $event)" title="完成" aria-label="完成">✓</button>
              <button class="queue-btn icon-only subtle" @click="abandon()" title="停止" aria-label="停止">■</button>
            </template>
            <template v-else>
              <span v-if="task.pomodoroCount > 0" class="pomo-count">
                <span class="pomo-dot" aria-hidden="true"></span>{{ task.pomodoroCount }}
              </span>
              <button class="start-btn" @click="handleStartTask(task, $event)" title="开始">▶</button>
            </template>
          </div>
        </div>
      </div>
    </div>

    <!-- Quick-add -->
    <div class="quick-add-zone">
      <div class="quick-add-row">
        <div class="quick-add-search">
          <svg class="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7"></circle>
            <line x1="16.5" y1="16.5" x2="21" y2="21"></line>
          </svg>
          <input
            ref="quickAddRef"
            v-model="newTitle"
            class="quick-add-field-input"
            placeholder="添加任务 · Enter 保存"
            title="Enter 保存，Shift+Enter 直接开始"
            @keydown="handleInput"
          />
        </div>
        <button
          class="quick-add-btn"
          :disabled="!!activeTaskId"
          :title="`无需任务，直接开始 ${settings.focusDuration} 分钟专注`"
          @click="startQuick"
        >
          ▶ {{ settings.focusDuration }}′
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
@reference "../styles.css";

.home-page {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px 12px 12px;
  height: 100%;
  overflow-y: auto;
  background: transparent;
  color: var(--v2-ink);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

.home-page::-webkit-scrollbar {
  width: 4px;
}
.home-page::-webkit-scrollbar-track {
  background: transparent;
}
.home-page::-webkit-scrollbar-thumb {
  background: var(--ui-hover);
  border-radius: 2px;
}

/* ===== V2 计时英雄区（Liquid Focus） ===== */
.focus-hero {
  position: relative;
  flex-shrink: 0;
  padding: 15px 16px 12px;
  border-radius: 16px;
  border: 1px solid var(--v2-line);
  background:
    radial-gradient(ellipse at 82% 14%, var(--v2-glow), transparent 64%),
    var(--v2-surface);
  box-shadow:
    inset 0 1px 0 var(--v2-specular),
    0 8px 20px var(--v2-shadow);
  color: var(--v2-ink);
  transition: background 420ms ease, border-color 360ms ease, box-shadow 360ms ease;
}

.focus-hero.is-break .pixel-status,
.focus-hero.is-break .pixel-progress i.filled,
.focus-hero.is-break .primary-action {
  background: var(--v2-break);
}

.focus-hero.is-break .hero-clock {
  color: var(--v2-break);
}

.hero-eyebrow {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--v2-secondary);
  font-size: 11px;
  min-width: 0;
}

.hero-subtask {
  color: var(--v2-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pixel-status {
  width: 7px;
  height: 7px;
  flex-shrink: 0;
  background: var(--v2-accent);
  border-radius: 1px;
  transition: transform 220ms cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 220ms ease;
}

.focus-hero.is-running .pixel-status {
  animation: pixel-heartbeat 1.8s steps(2, end) infinite;
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--v2-accent) 26%, transparent);
}

.focus-hero.is-break.is-running .pixel-status {
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--v2-break) 28%, transparent);
}

@keyframes pixel-heartbeat {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.22); opacity: 0.72; }
}

.focus-hero h1 {
  margin: 8px 0 12px;
  color: var(--v2-ink);
  font-size: 17px;
  font-weight: 600;
  line-height: 1.3;
  letter-spacing: -0.3px;
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}

.hero-clock {
  display: flex;
  justify-content: center;
  margin-bottom: 12px;
  color: var(--v2-accent);
}

.pixel-progress {
  display: grid;
  grid-template-columns: repeat(40, 4px);
  justify-content: center;
  gap: 3px;
  height: 4px;
  margin: 0 0 10px;
}

.pixel-progress i {
  width: 4px;
  height: 4px;
  border-radius: 1px;
  background: var(--v2-line);
  transition: background 360ms ease, transform 280ms cubic-bezier(0.22, 1, 0.36, 1);
}

.pixel-progress i.filled {
  background: var(--v2-accent);
}

.focus-hero.is-running .pixel-progress i.filled {
  box-shadow: 0 0 4px color-mix(in srgb, var(--v2-accent) 35%, transparent);
}

.hero-meta {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
  color: var(--v2-secondary);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.hero-actions {
  display: flex;
  gap: 8px;
}

.hero-actions button {
  min-height: 34px;
  padding: 6px 12px;
  border: 1px solid transparent;
  border-radius: 9px;
  background: var(--ui-well);
  color: var(--v2-secondary);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  transition: background 240ms ease, color 220ms ease, filter 220ms ease, border-color 240ms ease, transform 240ms cubic-bezier(0.22, 1, 0.36, 1);
}

.hero-actions .primary-action {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  background: linear-gradient(180deg, color-mix(in srgb, #fff 14%, var(--v2-accent)), var(--v2-accent));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.28);
  color: var(--v2-on-accent);
  font-weight: 600;
}

.hero-actions .primary-action:hover {
  filter: brightness(1.06);
}

.hero-actions .quiet-action {
  border-color: var(--v2-line);
}

.hero-actions .quiet-action:hover {
  background: var(--ui-hover);
  color: var(--v2-ink);
}

/* Hero Companion Micro-Bar */
.hero-companion {
  margin-top: 10px;
  padding: 6px 8px;
  width: 100%;
  display: flex;
  align-items: center;
  gap: 7px;
  border-radius: 9px;
  border: 1px solid var(--v2-line);
  background: var(--ui-well);
  color: var(--v2-ink);
  font-size: 11px;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  transition: background 140ms ease, border-color 140ms ease;
}

.hero-companion:hover {
  background: var(--ui-hover);
  border-color: var(--v2-accent);
}

.companion-sprite {
  display: block;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  image-rendering: pixelated;
  image-rendering: crisp-edges;
}

.companion-name {
  font-weight: 600;
  color: var(--v2-ink);
}

.companion-stage {
  color: var(--v2-muted);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.companion-meter {
  color: var(--v2-accent);
  font-variant-numeric: tabular-nums;
  font-weight: 500;
  flex-shrink: 0;
}

/* ===== Focus Queue ===== */
.focus-zone {
  flex-shrink: 0;
}

.zone-header {
  font-size: 11px;
  color: var(--v2-muted);
  margin-bottom: 6px;
  font-weight: 500;
  letter-spacing: 0.4px;
}

.focus-container {
  background: var(--v2-surface);
  border: 1px solid var(--v2-line);
  border-radius: 12px;
  overflow: hidden;
}

.focus-empty {
  padding: 12px 14px;
}

.focus-empty-text {
  font-size: 11px;
  color: var(--v2-muted);
  line-height: 1.5;
}

.focus-task-item {
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid transparent;
  transition: background 140ms ease, border-color 140ms ease;
}

.focus-task-item.is-running {
  background: color-mix(in srgb, var(--active-color) 11%, var(--v2-surface));
  border-color: color-mix(in srgb, var(--active-color) 34%, var(--v2-line));
}

.task-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 24px;
}

.running-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--active-color);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--active-color) 18%, transparent);
  flex-shrink: 0;
  animation: running-halo 2s ease-in-out infinite;
}

.running-dot.paused {
  opacity: 0.45;
  box-shadow: none;
  animation: none;
}

@keyframes running-halo {
  0%, 100% {
    box-shadow: 0 0 0 2.5px color-mix(in srgb, var(--active-color) 20%, transparent);
  }
  50% {
    box-shadow: 0 0 0 4.5px color-mix(in srgb, var(--active-color) 10%, transparent);
  }
}

.check-circle {
  width: 15px;
  height: 15px;
  border-radius: 50%;
  border: 1.5px solid var(--v2-muted);
  background: transparent;
  cursor: pointer;
  flex-shrink: 0;
  transition: border-color 140ms ease, background 140ms ease;
}

.check-circle:hover {
  border-color: var(--v2-accent);
  background: var(--v2-accent-soft);
}

.task-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  font-size: 12px;
  color: var(--v2-ink);
}

.task-title-text {
  display: inline-block;
  white-space: nowrap;
}

.running-title {
  font-weight: 600;
}

.task-timer {
  font-size: 11px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--active-color);
  flex-shrink: 0;
}

.queue-btn {
  height: 24px;
  padding: 0 8px;
  border-radius: 6px;
  border: 1px solid var(--v2-line);
  background: var(--ui-well);
  color: var(--v2-ink);
  font-size: 11px;
  font-family: inherit;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 140ms ease, border-color 140ms ease;
}

.queue-btn.icon-only {
  width: 24px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
}

.queue-btn:hover {
  background: var(--ui-hover);
  border-color: var(--v2-accent);
}

.queue-btn.done {
  color: var(--v2-break);
  border-color: color-mix(in srgb, var(--v2-break) 35%, transparent);
}

.queue-btn.subtle {
  color: var(--v2-muted);
}

.pomo-count {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  color: var(--v2-muted);
  flex-shrink: 0;
}

.pomo-dot {
  width: 4px;
  height: 4px;
  border-radius: 1px;
  background: var(--v2-accent);
}

.start-btn {
  width: 24px;
  height: 24px;
  padding: 0;
  border-radius: 6px;
  border: 1px solid color-mix(in srgb, var(--v2-accent) 32%, transparent);
  background: var(--v2-accent-soft);
  color: var(--v2-accent);
  font-size: 10px;
  cursor: pointer;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 140ms ease, color 140ms ease;
}

.start-btn:hover {
  background: var(--v2-accent);
  color: var(--v2-on-accent);
}

.task-group-badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 10px;
  color: var(--v2-muted);
  background: var(--ui-well);
  padding: 1px 6px;
  border-radius: 4px;
  flex-shrink: 0;
}

.group-dot-sm {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

/* ===== Quick-add Zone ===== */
.quick-add-zone {
  flex-shrink: 0;
  margin-top: auto;
}

.quick-add-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.quick-add-search {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 36px;
  padding: 0 10px;
  background: var(--v2-surface);
  border: 1px solid var(--v2-line);
  border-radius: 9px;
  transition: border-color 140ms ease, background 140ms ease;
}

.quick-add-search:focus-within {
  border-color: var(--v2-accent);
  background: var(--v2-popover);
}

.quick-add-search .search-icon {
  flex-shrink: 0;
  color: var(--v2-muted);
}

.quick-add-field-input {
  flex: 1 1 0;
  min-width: 0;
  height: 100%;
  padding: 0;
  border: 0;
  outline: none;
  background: transparent;
  color: var(--v2-ink);
  font-size: 12px;
  font-family: inherit;
}

.quick-add-field-input::placeholder {
  color: var(--v2-muted);
}

.quick-add-btn {
  flex-shrink: 0;
  height: 36px;
  padding: 0 11px;
  border-radius: 9px;
  border: 1px solid color-mix(in srgb, var(--v2-accent) 32%, transparent);
  background: var(--v2-accent-soft);
  color: var(--v2-accent);
  font-size: 11px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  font-family: inherit;
  cursor: pointer;
  transition: background 140ms ease, color 140ms ease, opacity 140ms ease;
}

.quick-add-btn:hover:not(:disabled) {
  background: var(--v2-accent);
  color: var(--v2-on-accent);
}

.quick-add-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

@media (max-width: 399px) {
  .pixel-progress {
    gap: 2px;
  }
}

@media (max-width: 389px) {
  .hero-companion {
    gap: 5px;
  }
}

@media (max-width: 349px) {
  .focus-hero {
    padding: 13px 12px 10px;
  }

  .pixel-progress {
    gap: 1.5px;
  }

  .hero-meta {
    flex-wrap: wrap;
  }

  .task-timer {
    display: none;
  }
}
</style>
