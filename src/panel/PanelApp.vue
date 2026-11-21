<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed, watch, nextTick } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { useTimerBridge } from '../composables/useTimerBridge'
import { useSettings } from '../composables/useSettings'
import { useNotifications } from '../composables/useNotifications'
import { startScreenshotCollection } from '../composables/useScreenshots'
import { useTaskReminders } from '../composables/useTaskReminders'
import { useTasks } from '../composables/useTasks'
import { useTaskGroups } from '../composables/useTaskGroups'
import { useMemos } from '../composables/useMemos'
import { useDailyStats } from '../composables/useDailyStats'
import { useAchievements } from '../composables/useAchievements'
import { useRadio } from '../composables/useRadio'
import { useCompanion } from '../composables/useCompanion'
import { installGlobalPixelSpark } from '../utils/pixelSpark'
import TodoPage from './TodoPage.vue'
import TaskArea from './TaskArea.vue'
import TaskDetailPage from './TaskDetailPage.vue'
import SettingsPage from './SettingsPage.vue'
import MemoPage from './MemoPage.vue'
import StatsPage from './StatsPage.vue'
import RadioPage from './RadioPage.vue'
import NotificationsPage from './NotificationsPage.vue'
import PanelTitleBar from './PanelTitleBar.vue'

interface PanelTransitionMetrics {
  island_x: number
  island_y: number
  island_width: number
  island_height: number
  panel_x: number
  panel_y: number
  panel_width: number
  panel_height: number
}

const { startBridge } = useTimerBridge()
const { settings } = useSettings()
// 面板启动即开始记录番茄通知，避免通知页未打开时漏记
useNotifications()
void startScreenshotCollection()
// 每日任务 repeatTime 到点提醒
useTaskReminders()
const { tasks } = useTasks()
const { statsSection } = useCompanion()
const { clearError: clearRadioError } = useRadio()

function clearDocumentSelection() {
  try {
    window.getSelection()?.removeAllRanges()
  } catch {
    // ignore
  }
}

function prewarmPanelData() {
  useTaskGroups()
  useMemos()
  useDailyStats()
  useAchievements()
  useCompanion()
}

prewarmPanelData()


const PANEL_CLOSE_DURATION = 235
const CLOSE_FALLBACK_BUFFER = 140
const IS_MACOS = navigator.userAgent.toLowerCase().includes('mac')


const currentView = ref<'tasks' | 'todo' | 'taskDetail' | 'settings' | 'memos' | 'stats' | 'radio' | 'notifications'>('tasks')
const notificationFocusRequest = ref<{ recordId?: string; openSource?: boolean; destination?: 'timer'; focusMissed?: boolean }>()
const panelContent = ref<HTMLElement | null>(null)
let notificationRouteFocus: string | undefined
const viewScrollMemory = new Map<string, number>()
let activeViewAnim: Animation | null = null

const viewOrder: Record<string, number> = {
  tasks: 0,
  todo: 1,
  taskDetail: 1,
  memos: 2,
  stats: 3,
  radio: 4,
  notifications: 5,
  settings: 6,
}

function pulsePanelGlass(ms = 240) {
  panelSettling.value = true
  if (settleTimer !== null) window.clearTimeout(settleTimer)
  settleTimer = window.setTimeout(() => {
    panelSettling.value = false
    settleTimer = null
  }, ms)
}

function navigateTo(nextView: typeof currentView.value) {
  const prevView = currentView.value
  if (prevView === nextView) return
  clearDocumentSelection()
  const prevChild = panelContent.value?.firstElementChild as HTMLElement | null
  if (prevChild) viewScrollMemory.set(prevView, prevChild.scrollTop)

  const dir = (viewOrder[nextView] ?? 0) >= (viewOrder[prevView] ?? 0) ? 1 : -1
  const isDetailDrill = nextView === 'taskDetail' || prevView === 'taskDetail'
  currentView.value = nextView

  void nextTick(() => {
    const nextChild = panelContent.value?.firstElementChild as HTMLElement | null
    if (!nextChild) return
    const savedScroll = viewScrollMemory.get(nextView) ?? 0
    nextChild.scrollTop = savedScroll
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    pulsePanelGlass(300)
    activeViewAnim?.cancel()
    if (typeof nextChild.animate === 'function') {
      const startX = isDetailDrill ? (nextView === 'taskDetail' ? 22 : -18) : dir * 16
      activeViewAnim = nextChild.animate(
        [
          { opacity: 0, transform: `translate3d(${startX}px, 3px, 0) scale(0.988)` },
          { opacity: 1, transform: 'translate3d(0, 0, 0) scale(1)' },
        ],
        {
          duration: 320,
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
        },
      )
    }
  })
}

function openCompanionPanel() {
  statsSection.value = 'companions'
  navigateTo('stats')
}

function focusNotificationDestination() {
  if (!notificationRouteFocus) return
  const destination = notificationRouteFocus === '.panel-body'
    ? panelContent.value : panelContent.value?.querySelector<HTMLElement>(notificationRouteFocus)
  if (!destination) return
  destination.focus()
  notificationRouteFocus = undefined
}

function openNotificationDestination(view: 'tasks' | 'taskDetail' | 'todo', taskId?: string) {
  if (taskId) taskIdForDetail.value = taskId
  notificationRouteFocus = view === 'tasks' ? '.focus-hero' : view === 'taskDetail' ? '.detail-page' : '.panel-body'
  navigateTo(view)
  void nextTick(focusNotificationDestination)
}

const taskIdForDetail = ref<string>('')
const todoInitialTab = ref<string | undefined>(undefined)
const todoSearchQuery = ref('')
const memoSearchQuery = ref('')
const todoActiveTabLabel = ref('')
const cachedPanelViews = ['TaskArea', 'TodoPage', 'SettingsPage', 'MemoPage', 'StatsPage', 'RadioPage', 'NotificationsPage']

watch(currentView, (v) => {
  if (v !== 'todo' && v !== 'taskDetail') {
    todoSearchQuery.value = ''
  }
  if (v !== 'memos') {
    memoSearchQuery.value = ''
  }
})

const navItems = [
  {
    key: 'tasks',
    label: '首页',
    title: '首页',
    iconPaths: [
      'M7 2h2v1H7z M5 3h6v1H5z M3 4h10v1H3z M2 5h12v2H2z',
      'M3 7h2v7H3z M11 7h2v7h-2z M3 13h10v1H3z',
      'M6 9h4v1H6z M6 10h1v4H6z M9 10h1v4H9z',
    ],
  },
  {
    key: 'todo',
    label: 'TODO',
    title: 'TODO',
    iconPaths: [
      'M2 2h12v2H2z M2 12h12v2H2z M2 4h2v8H2z M12 4h2v8h-2z',
      'M5 8h1v2H5z M6 9h1v2H6z M7 10h1v1H7z M8 8h1v2H8z M9 7h1v2H9z M10 6h1v2h-1z',
    ],
  },
  {
    key: 'memos',
    label: '备忘',
    title: '备忘录',
    iconPaths: [
      'M3 2h7v2H3z M10 3h2v2h-2z M11 5h2v9h-2z M3 4h2v10H3z M3 12h10v2H3z',
      'M9 4h2v2H9z M6 7h4v1H6z M6 9h4v1H6z M6 11h3v1H6z',
    ],
  },
  {
    key: 'stats',
    label: '统计',
    title: '统计',
    iconPaths: [
      'M2 13h12v1H2z',
      'M3 8h2v5H3z M7 4h2v9H7z M11 6h2v7h-2z',
    ],
  },
  {
    key: 'radio',
    label: '电台',
    title: '专注电台',
    iconPaths: [
      'M5 2h9v2H5z M5 4h2v7H5z M12 4h2v6h-2z',
      'M2 10h5v3H2z M9 9h5v3H9z',
    ],
  },
  {
    key: 'notifications',
    label: '通知',
    title: '通知中心',
    iconPaths: [
      'M7 2h2v1H7z M5 3h6v2H5z M4 5h8v5H4z',
      'M2 10h12v2H2z M6 13h4v1H6z',
    ],
  },
  {
    key: 'settings',
    label: '设置',
    title: '设置',
    iconPaths: [
      'M7 1h2v2H7z M7 13h2v2H7z M1 7h2v2H1z M13 7h2v2h-2z',
      'M3 3h2v2H3z M11 3h2v2h-2z M3 11h2v2H3z M11 11h2v2h-2z',
      'M5 4h6v2H5z M5 10h6v2H5z M4 5h2v6H4z M10 5h2v6h-2z',
    ],
  },
] as const

const currentTitleMeta = computed(() =>
  navItems.find(item => item.key === (currentView.value === 'taskDetail' ? 'todo' : currentView.value)) ?? navItems[0]
)
const isClosing = ref(false)
const panelRootRef = ref<HTMLElement | null>(null)
const panelAnimState = ref<'hidden' | 'steady' | 'opening-ready' | 'opening' | 'closing'>('hidden')
// 刚上屏时给当前玻璃底色加一层很轻的同色叠加。
const panelSettling = ref(false)
let settleTimer: number | null = null

let unlistenResize: (() => void) | null = null
let unlistenMove: (() => void) | null = null
let unlistenTransition: (() => void) | null = null
let unlistenOpenNotifications: (() => void) | null = null
let unlistenOpenTask: (() => void) | null = null
let uninstallPixelSpark: (() => void) | null = null
let closeFallbackTimer: number | null = null

function clearCloseFallback() {
  if (closeFallbackTimer) {
    window.clearTimeout(closeFallbackTimer)
    closeFallbackTimer = null
  }
}

function scheduleCloseFallback() {
  clearCloseFallback()
  closeFallbackTimer = window.setTimeout(() => {
    void finishCloseAnimation()
  }, PANEL_CLOSE_DURATION + CLOSE_FALLBACK_BUFFER)
}

async function finishCloseAnimation() {
  clearCloseFallback()
  clearDocumentSelection()
  panelAnimState.value = 'hidden'
  isClosing.value = false
  // 等透明度真正提交两帧再隐藏窗口：否则 DWM 会保留最后一帧（页头）几帧，看起来像残留+闪烁
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })
  await new Promise<void>((resolve) => setTimeout(resolve, 40))
  await invoke('hide_panel')
}

function clampVal(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v))
}

function applyTransitionVars(metrics: PanelTransitionMetrics) {
  const root = panelRootRef.value
  if (!root) return
  const panelW = Math.max(1, metrics.panel_width)
  const panelH = Math.max(1, metrics.panel_height)
  const islandCenterX = metrics.island_x + metrics.island_width / 2
  const panelCenterX = metrics.panel_x + panelW / 2
  const rawDx = islandCenterX - panelCenterX
  const fromX = clampVal(rawDx * 0.48, -140, 140)
  const scaleX = clampVal(Math.max(0.76, metrics.island_width / panelW), 0.76, 0.9)
  const scaleY = clampVal(Math.max(0.62, (metrics.island_height / panelH) * 5.2), 0.62, 0.78)
  root.style.setProperty('--panel-from-x', `${fromX.toFixed(2)}px`)
  root.style.setProperty('--panel-from-y', '-34px')
  root.style.setProperty('--panel-from-sx', scaleX.toFixed(4))
  root.style.setProperty('--panel-from-sy', scaleY.toFixed(4))
}

async function prepareTransitionVars() {
  try {
    const metrics = await invoke<PanelTransitionMetrics | null>('get_panel_transition_metrics')
    if (metrics) applyTransitionVars(metrics)
  } catch {
    // ignore outside Tauri runtime
  }
}

function runOpenAnimation() {
  if (panelAnimState.value === 'opening' || panelAnimState.value === 'opening-ready') return
  clearCloseFallback()
  panelAnimState.value = 'opening-ready'
  requestAnimationFrame(() => {
    panelAnimState.value = 'opening'
  })
}

async function runCloseAnimation() {
  if (panelAnimState.value === 'closing') return
  clearDocumentSelection()
  clearRadioError()
  scheduleCloseFallback()
  panelAnimState.value = 'closing'
}

async function onWindowTransition(payload: string) {
  if (payload === 'open') {
    isClosing.value = false
    panelAnimState.value = 'hidden'
    await prepareTransitionVars()
    void invoke('emit_island_panel_motion', { phase: 'open' })
    try {
      await invoke('position_panel_under_island')
    } catch {
      // 命令不可用时忽略
    }
    pulsePanelGlass(460)
    runOpenAnimation()
    return
  }

  if (payload === 'close') {
    await prepareTransitionVars()
    void invoke('emit_island_panel_motion', { phase: 'close' })
    await runCloseAnimation()
  }
}

async function onPanelAnimationEnd(event: AnimationEvent) {
  if (event.target !== panelRootRef.value) return

  // Vue scoped 样式会给 keyframes 加哈希后缀（panel-open-xxxx），必须用前缀匹配，
  // 否则 animationend 永远不命中：面板会一直停在 motion-opening，关闭也只能等兜底定时器（多出 160ms 残留窗口）
  const animName = event.animationName
  if (animName.startsWith('panel-open') && panelAnimState.value === 'opening') {
    panelAnimState.value = 'steady'
    // 不要在这里再 move 窗口：打开动画结束后再移动窗口，DWM 会在旧位置留下半透明残影，
    // 看起来就是“面板背后还有一块旧 UI”。窗口在打开前已经定位到最终位置。
    if (!IS_MACOS) {
      try {
        await getCurrentWindow().setFocus()
      } catch {
        // ignore focus errors during animation completion
      }
    }
    return
  }

  if (animName.startsWith('panel-close') && panelAnimState.value === 'closing') {
    void finishCloseAnimation()
  }
}

function onPanelKeydown(event: KeyboardEvent) {
  if (event.defaultPrevented) return
  if (event.key !== 'Escape' || event.repeat) return
  if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return
  if (isClosing.value || panelAnimState.value === 'closing' || panelAnimState.value === 'hidden') return
  event.preventDefault()
  void closeWindow()
}

onMounted(async () => {
  startBridge()
  window.addEventListener('keydown', onPanelKeydown)
  if (!('__TAURI_INTERNALS__' in window)) {
    panelAnimState.value = 'steady'
    return
  }
  unlistenOpenNotifications = await listen<{ recordId?: string; openSource?: boolean; destination?: 'timer'; focusMissed?: boolean }>('open-notifications', ({ payload }) => {
    notificationFocusRequest.value = {
      recordId: payload?.recordId,
      openSource: payload?.openSource,
      destination: payload?.destination,
      focusMissed: payload?.focusMissed,
    }
    navigateTo('notifications')
  })
  unlistenOpenTask = await listen<{ taskId?: string }>('open-task', ({ payload }) => {
    const taskId = (payload?.taskId ?? '').trim()
    if (taskId && tasks.value.some(task => task.id === taskId)) {
      openNotificationDestination('taskDetail', taskId)
    } else {
      openNotificationDestination('todo')
    }
  })
  await invoke('set_click_through', { ignore: false }).catch(() => {})

  const win = getCurrentWebviewWindow()
  try {
    await win.setBackgroundColor([0, 0, 0, 0])
  } catch {
    // ignore if not supported or denied
  }

  // 面板位置在打开时已确定，窗口移动/尺寸变化不再自动 reposition：
  // 每次移动都会在 DWM 旧位置留下半透明残影（看起来像背后还有一块 UI）。
  unlistenResize = await getCurrentWindow().onResized(() => {
    // 固定尺寸面板，不需要跟随
  })
  unlistenMove = await getCurrentWindow().onMoved(() => {
    // 固定位置面板，不需要跟随
  })

  unlistenTransition = await listen<string>('panel-window-transition', event => {
    void onWindowTransition(String(event.payload ?? ''))
  })

  if (panelRootRef.value) {
    uninstallPixelSpark = installGlobalPixelSpark(panelRootRef.value)
  }
})

onUnmounted(() => {
  window.removeEventListener('keydown', onPanelKeydown)
  clearCloseFallback()
  if (uninstallPixelSpark) uninstallPixelSpark()
  if (unlistenResize) unlistenResize()
  if (unlistenMove) unlistenMove()
  if (unlistenTransition) unlistenTransition()
  if (unlistenOpenNotifications) unlistenOpenNotifications()
  if (unlistenOpenTask) unlistenOpenTask()
})

async function closeWindow() {
  if (isClosing.value || panelAnimState.value === 'closing') return
  isClosing.value = true
  await invoke('animate_panel_close')
}
</script>

<template>
  <div
    ref="panelRootRef"
    class="panel-root"
    :class="{
      'motion-hidden': panelAnimState === 'hidden',
      'motion-opening-ready': panelAnimState === 'opening-ready',
      'motion-opening': panelAnimState === 'opening',
      'motion-closing': panelAnimState === 'closing',
      'panel-settling': panelSettling,
      'glass-bright': settings.panelGlass === 'bright',
      'glass-frost': settings.panelGlass === 'frost',
      'glass-acrylic': settings.panelGlass === 'acrylic'
    }"
    @animationend="onPanelAnimationEnd"
  >
    <div class="panel-card">
      <div class="panel-tint" />
      <div class="panel-sheen" />
      <div class="panel-vignette" />
      <div class="panel-inner">
      <PanelTitleBar
        :title="currentTitleMeta.title"
        :icon-paths="[...currentTitleMeta.iconPaths]"
        :show-search="currentView === 'todo' || currentView === 'memos'"
        :search-query="currentView === 'memos' ? memoSearchQuery : todoSearchQuery"
        :search-placeholder="currentView === 'memos' ? '搜索备忘录...' : (todoActiveTabLabel ? `搜索「${todoActiveTabLabel}」...` : '搜索当前分类...')"
        @update:search-query="currentView === 'memos' ? (memoSearchQuery = $event) : (todoSearchQuery = $event)"
        @open-companion="openCompanionPanel"
        @close="closeWindow"
      />
      <div ref="panelContent" class="panel-body" tabindex="-1">
        <KeepAlive :include="cachedPanelViews">
          <TaskArea v-if="currentView === 'tasks'" category="today" @close="closeWindow" @open-companion="openCompanionPanel" />
          <TodoPage v-else-if="currentView === 'todo'" :initial-tab="todoInitialTab" :search-query="todoSearchQuery" @view-detail="taskId => { taskIdForDetail = taskId; navigateTo('taskDetail') }" @tab-change="tab => { todoInitialTab = tab }" @active-tab-label="todoActiveTabLabel = $event" />
          <TaskDetailPage v-else-if="currentView === 'taskDetail'" :task-id="taskIdForDetail" @back="navigateTo('todo')" />
          <SettingsPage v-else-if="currentView === 'settings'" @back="navigateTo('tasks')" />
          <MemoPage v-else-if="currentView === 'memos'" :search-query="memoSearchQuery" @back="navigateTo('tasks')" />
          <StatsPage v-else-if="currentView === 'stats'" @back="navigateTo('tasks')" />
          <RadioPage v-else-if="currentView === 'radio'" @back="navigateTo('tasks')" />
          <NotificationsPage
            v-else-if="currentView === 'notifications'"
            :focus-request="panelAnimState === 'steady' ? notificationFocusRequest : undefined"
            @back="navigateTo('tasks')"
            @open-task="taskId => openNotificationDestination('taskDetail', taskId)"
            @open-home="openNotificationDestination('tasks')"
            @open-todo="openNotificationDestination('todo')"
          />
        </KeepAlive>
      </div>
      <nav class="panel-nav">
        <button
          v-for="item in navItems"
          :key="item.key"
          class="nav-btn"
          :class="{ active: currentView === item.key }"
          @click="navigateTo(item.key)"
        >
          <span class="nav-icon" aria-hidden="true">
            <svg viewBox="0 0 16 16" fill="currentColor" shape-rendering="crispEdges">
              <path
                v-for="(path, pathIndex) in item.iconPaths"
                :key="`${item.key}-icon-${pathIndex}`"
                :d="path"
              />
            </svg>
          </span>
          <span class="nav-label">{{ item.label }}</span>
        </button>
      </nav>
      </div>
    </div>
  </div>
</template>

<style scoped>
.panel-root {
  position: relative;
  width: 100vw;
  height: 100vh;
  padding: 0;
  background: transparent;
  border: 0;
  border-radius: 22px;
  box-shadow: none;
  overflow: clip;
  color: var(--panel-text);
  font-family: var(--font-ui);
  transform-origin: 50% 0;
  --panel-from-x: 0px;
  --panel-from-y: -34px;
  --panel-from-sx: 0.80;
  --panel-from-sy: 0.66;
  will-change: transform, opacity;
  backface-visibility: hidden;
  isolation: isolate;
}

.panel-card {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background: var(--panel-shell-bg);
  border: 1px solid var(--panel-shell-border);
  border-radius: 22px;
  box-shadow: var(--panel-shell-edge);
  /* 防止 focus/scrollIntoView 滚动外壳并导致整页位移。 */
  overflow: clip;
  contain: layout style;
}

.panel-tint,
.panel-sheen,
.panel-vignette {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
}

.panel-tint {
  background: var(--panel-shell-bg);
  opacity: 0;
  transition: opacity 220ms cubic-bezier(0.22, 1, 0.36, 1);
}

.panel-settling .panel-tint {
  opacity: 0.08;
  transition: opacity 90ms ease-out;
}

.panel-sheen {
  background:
    var(--panel-mode-sheen, none),
    var(--panel-sheen-bg);
  opacity: var(--panel-sheen-opacity, 0.9);
  transition: opacity 220ms ease;
}

.panel-sheen::before {
  content: '';
  position: absolute;
  inset: -20% -35%;
  background: linear-gradient(
    108deg,
    transparent 32%,
    color-mix(in srgb, #fff 36%, transparent) 48%,
    color-mix(in srgb, var(--v2-glow) 34%, transparent) 54%,
    transparent 68%
  );
  opacity: 0;
  transform: translate3d(-40%, 0, 0);
  pointer-events: none;
}

.motion-opening .panel-sheen::before,
.panel-settling .panel-sheen::before {
  animation: liquid-sheen-sweep 480ms cubic-bezier(0.22, 1, 0.36, 1) both;
}

@keyframes liquid-sheen-sweep {
  0% {
    opacity: 0;
    transform: translate3d(-38%, -6%, 0);
  }
  42% {
    opacity: 0.55;
  }
  100% {
    opacity: 0;
    transform: translate3d(38%, 6%, 0);
  }
}

/* 颗粒层：只在磨砂/亚克力开启，亮面保持干净 */
.panel-sheen::after {
  content: '';
  position: absolute;
  inset: 0;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4'/%3E%3C/filter%3E%3Crect width='100' height='100' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E");
  background-size: var(--panel-grain-size, 100px);
  filter: grayscale(1);
  mix-blend-mode: soft-light;
  opacity: var(--panel-grain, 0);
  pointer-events: none;
}

.panel-vignette {
  background: var(--panel-vignette-bg);
}

/* 亮面：最透的清玻璃，顶部长条高光 + 斜向反光，无颗粒 */
.glass-bright {
  --panel-mode-sheen:
    linear-gradient(180deg, rgba(255, 255, 255, 0.50), rgba(255, 255, 255, 0) 15%),
    linear-gradient(112deg, rgba(255, 255, 255, 0) 33%, rgba(255, 255, 255, 0.24) 44%, rgba(255, 255, 255, 0) 57%),
    radial-gradient(70% 42% at 88% 6%, rgba(255, 255, 255, 0.22), transparent 70%);
  --panel-sheen-opacity: 1;
  --panel-grain: 0;
}

.glass-bright .panel-card {
  border-color: var(--panel-shell-border);
  box-shadow:
    inset 0 1px 0 var(--v2-specular),
    inset 0 -1px 0 var(--v2-shadow);
}

.glass-bright .panel-vignette {
  opacity: 0.25;
}

/* 主题磨砂：以宽幅漫反射和可见颗粒形成雾面。 */
.glass-frost {
  --panel-mode-sheen:
    radial-gradient(120% 82% at 46% -6%, rgba(255, 255, 255, 0.22), transparent 70%),
    radial-gradient(85% 64% at 93% 35%, var(--v2-glow), transparent 72%);
  --panel-sheen-opacity: 1;
  --panel-grain: 0.32;
  --panel-grain-size: 118px;
}

.glass-frost .panel-card {
  border-color: var(--panel-shell-border);
  box-shadow:
    inset 0 1px 0 var(--v2-specular),
    inset 0 -1px 0 var(--v2-shadow);
}

.glass-frost .panel-vignette {
  background: linear-gradient(180deg, transparent 45%, color-mix(in srgb, var(--v2-glow) 35%, transparent));
}

/* 哑光亚克力：跟随主题色，最厚实的哑光玻璃，纵向明暗 + 细颗粒 */
.glass-acrylic {
  --panel-mode-sheen:
    linear-gradient(180deg,
      rgba(255, 255, 255, 0.14) 0%,
      transparent 40%,
      color-mix(in srgb, var(--focus-color) 11%, transparent) 100%);
  --panel-sheen-opacity: 1;
  --panel-grain: 0.24;
  --panel-grain-size: 62px;
}

.glass-acrylic .panel-card {
  border-color: var(--panel-shell-border);
  box-shadow:
    inset 0 1px 0 var(--v2-specular),
    inset 0 -1px 0 var(--v2-shadow);
}

.glass-acrylic .panel-vignette {
  background: none;
}

.panel-inner {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  z-index: 3;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: clip;
}

.motion-opening {
  animation: panel-open 400ms cubic-bezier(0.22, 1, 0.36, 1) both;
}

.motion-hidden,
.motion-opening-ready {
  opacity: 0;
  transform: translate3d(var(--panel-from-x), var(--panel-from-y), 0) scale(var(--panel-from-sx), var(--panel-from-sy));
  pointer-events: none;
}

.motion-hidden {
  visibility: hidden;
}

.motion-closing {
  animation: panel-close 235ms cubic-bezier(0.32, 0.04, 0.24, 1) both;
  pointer-events: none;
}

.motion-hidden .panel-inner > *,
.motion-opening-ready .panel-inner > * {
  opacity: 0;
}

.motion-opening .panel-inner > :first-child {
  animation: panel-child-in 280ms cubic-bezier(0.22, 1, 0.36, 1) 35ms both;
}

.motion-opening .panel-body {
  animation: panel-child-in 320ms cubic-bezier(0.22, 1, 0.36, 1) 65ms both;
}

.motion-opening .panel-nav {
  animation: panel-child-in 280ms cubic-bezier(0.22, 1, 0.36, 1) 100ms both;
}

.motion-closing .panel-inner {
  opacity: 0;
  transition: opacity 150ms ease;
}

@keyframes panel-open {
  0% {
    opacity: 0;
    border-radius: 28px;
    transform: translate3d(var(--panel-from-x), var(--panel-from-y), 0) scale(var(--panel-from-sx), var(--panel-from-sy));
  }

  66% {
    opacity: 1;
    border-radius: 21px;
    transform: translate3d(0, 1.5px, 0) scale(1.007, 1.009);
  }

  100% {
    opacity: 1;
    border-radius: 22px;
    transform: translate3d(0, 0, 0) scale(1, 1);
  }
}

@keyframes panel-close {
  0% {
    opacity: 1;
    border-radius: 22px;
    transform: translate3d(0, 0, 0) scale(1, 1);
  }

  100% {
    opacity: 0;
    border-radius: 26px;
    transform: translate3d(calc(var(--panel-from-x) * 0.24), -16px, 0) scale(0.93, 0.89);
  }
}

@keyframes panel-child-in {
  0% {
    opacity: 0;
    transform: translate3d(0, 8px, 0);
  }

  100% {
    opacity: 1;
    transform: translate3d(0, 0, 0);
  }
}

.panel-body {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: clip;
  background: transparent;
}

.panel-nav {
  position: relative;
  z-index: 7;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 6px;
  /* 底栏并入面板外壳：不再做第二张悬浮卡片 */
  margin: 0;
  padding: 8px 16px;
  border: 0;
  border-top: 1px solid var(--v2-line);
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  flex-shrink: 0;
}

.nav-btn {
  position: relative;
  display: inline-flex;
  flex: 1 1 0;
  min-width: 0;
  justify-content: center;
  align-items: center;
  gap: 4px;
  padding: 6px 4px;
  background: transparent;
  border: none;
  outline: none;
  color: var(--v2-muted);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  border-radius: 8px;
  transition: color 0.24s ease, background 0.24s ease, transform 0.26s cubic-bezier(0.22, 1, 0.36, 1);
  font-family: inherit;
  letter-spacing: 0.02em;
}

.nav-btn:hover {
  color: var(--v2-ink);
  background: var(--ui-well);
}

.nav-btn:active {
  transform: translate3d(0, 1px, 0) scale(0.93);
}

.nav-btn.active {
  color: var(--v2-accent);
  background: color-mix(in srgb, var(--v2-accent) 10%, transparent);
}

.nav-btn.active::after {
  content: '';
  position: absolute;
  bottom: 2px;
  left: 50%;
  width: 12px;
  height: 3px;
  border-radius: 0;
  background: var(--v2-accent);
  transform: translateX(-50%);
  animation: nav-pip-in 280ms cubic-bezier(0.22, 1, 0.36, 1) both;
}

@keyframes nav-pip-in {
  from {
    opacity: 0;
    transform: translateX(-50%) scaleX(0.3);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) scaleX(1);
  }
}

.nav-btn.active:hover {
  background: color-mix(in srgb, var(--v2-accent) 14%, transparent);
}

.nav-icon {
  width: 14px;
  height: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.nav-icon svg {
  width: 100%;
  height: 100%;
  stroke-width: 1.8;
}

.nav-label {
  line-height: 1;
  white-space: nowrap;
  font-size: 11px;
  letter-spacing: 0.01em;
}

@media (prefers-reduced-motion: reduce) {
  .motion-opening {
    animation: panel-fade-in 120ms ease-out both;
  }

  .motion-closing {
    animation: panel-fade-out 120ms ease-in both;
  }

  @keyframes panel-fade-in {
    from {
      opacity: 0;
    }

    to {
      opacity: 1;
    }
  }

  @keyframes panel-fade-out {
    from {
      opacity: 1;
    }

    to {
      opacity: 0;
    }
  }
}
</style>
