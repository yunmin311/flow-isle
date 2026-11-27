import { ref, computed, watch, effectScope } from 'vue'
import { useSettings } from './useSettings'

export type TimerPhase = 'focus' | 'break'
export type NotificationType = 'focus-done' | 'break-done' | null

const phase = ref<TimerPhase>('focus')
const remaining = ref(25 * 60)
const totalDuration = ref(25 * 60)
const running = ref(false)
const activeTaskId = ref<string | null>(null)
const activeTaskTitle = ref<string | null>(null)
const focusStartedAt = ref<number | null>(null)
const pendingNotification = ref<NotificationType>(null)
const activeSubtaskId = ref<string | null>(null)
const activeSubtaskTitle = ref<string | null>(null)
let intervalId: ReturnType<typeof setInterval> | null = null
let phaseEndAtMs: number | null = null
let accumulatedFocusMs = 0
let focusSegmentStartMs: number | null = null

function flushRunningFocusSegment() {
  if (focusSegmentStartMs !== null) {
    accumulatedFocusMs += Math.max(0, Date.now() - focusSegmentStartMs)
    focusSegmentStartMs = null
  }
}

function getCurrentFocusedSeconds(): number {
  const liveMs = focusSegmentStartMs !== null ? Math.max(0, Date.now() - focusSegmentStartMs) : 0
  return Math.floor((accumulatedFocusMs + liveMs) / 1000)
}

function consumeFocusedSeconds(): number {
  flushRunningFocusSegment()
  const secs = Math.floor(accumulatedFocusMs / 1000)
  accumulatedFocusMs = 0
  return secs
}

function resetFocusedAccumulation() {
  accumulatedFocusMs = 0
  focusSegmentStartMs = null
}

function syncRemainingFromEndAt() {
  if (phaseEndAtMs === null) return
  const next = Math.max(0, Math.ceil((phaseEndAtMs - Date.now()) / 1000))
  remaining.value = next
}

function startTicking() {
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
  }
  intervalId = setInterval(tick, 200)
}

function tick() {
  syncRemainingFromEndAt()
  if (remaining.value <= 0) {
    clearInterval(intervalId!)
    intervalId = null
    phaseEndAtMs = null
    running.value = false
    onPhaseDone()
    return
  }
}

export interface FocusSessionSummary {
  taskId: string | null
  taskTitle: string | null
  focusedSeconds: number
  completed: boolean
}

type PhaseCallback = (phase: TimerPhase, taskId: string | null, focusedSeconds: number) => void
type FocusEndedCallback = (summary: FocusSessionSummary) => void
const onDoneCallbacks: PhaseCallback[] = []
const onFocusEndedCallbacks: FocusEndedCallback[] = []

function emitFocusEnded(completed: boolean) {
  if (phase.value !== 'focus') return
  const focusedSeconds = consumeFocusedSeconds()
  if (focusedSeconds <= 0 && !completed) return
  const summary: FocusSessionSummary = {
    taskId: activeTaskId.value,
    taskTitle: activeTaskTitle.value,
    focusedSeconds: completed ? Math.max(focusedSeconds, totalDuration.value) : focusedSeconds,
    completed,
  }
  onFocusEndedCallbacks.forEach(cb => cb(summary))
}

function onPhaseDone() {
  const donePhase = phase.value
  const doneTaskId = activeTaskId.value
  const focusedSeconds = donePhase === 'focus'
    ? Math.max(consumeFocusedSeconds(), totalDuration.value)
    : 0
  if (donePhase === 'focus') {
    onFocusEndedCallbacks.forEach(cb => cb({
      taskId: doneTaskId,
      taskTitle: activeTaskTitle.value,
      focusedSeconds,
      completed: true,
    }))
  }
  onDoneCallbacks.forEach(cb => cb(donePhase, doneTaskId, focusedSeconds))
  // Don't auto-transition; set pendingNotification and wait for user action
  pendingNotification.value = donePhase === 'focus' ? 'focus-done' : 'break-done'
}

let durationWatchInstalled = false

function installDurationWatch() {
  if (durationWatchInstalled) return
  durationWatchInstalled = true
  const { settings, settingsReady } = useSettings()
  // Detached so the watcher outlives whichever component happened to call useTimer() first.
  effectScope(true).run(() => {
    watch(
      // settingsReady 也要作为依赖：设置是异步读文件的，首次挂载时可能还是默认值，
      // 只监听时长会漏掉“加载完成”这一次赋值，导致首页停在 25:00。
      () => [settings.value.focusDuration, settings.value.breakDuration, settingsReady.value] as const,
      ([newFocus, newBreak, ready]) => {
        if (!ready) return
        const newDuration = phase.value === 'focus' ? newFocus * 60 : newBreak * 60
        if (!running.value) {
          if (!activeTaskId.value) {
            totalDuration.value = newDuration
            remaining.value = newDuration
            phaseEndAtMs = null
            return
          }
        }
        if (totalDuration.value !== newDuration) {
          // 保留已经专注/休息的真实秒数，避免修改时长导致已专注进度跳变
          const elapsed = phase.value === 'focus'
            ? getCurrentFocusedSeconds()
            : Math.max(0, totalDuration.value - remaining.value)
          totalDuration.value = newDuration
          remaining.value = Math.max(1, newDuration - elapsed)
          if (running.value && phaseEndAtMs !== null) {
            phaseEndAtMs = Date.now() + remaining.value * 1000
          }
        }
      },
      { immediate: true },
    )
  })
}

const progress = computed(() => {
  return 1 - remaining.value / totalDuration.value
})

export function useTimer() {
  const { settings } = useSettings()
  installDurationWatch()

  const displayTime = computed(() => {
    const m = Math.floor(remaining.value / 60).toString().padStart(2, '0')
    const s = (remaining.value % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  })

  function setSubtaskContext(subtaskId: string | null, subtaskTitle: string | null) {
    activeSubtaskId.value = subtaskId
    activeSubtaskTitle.value = subtaskTitle
  }

  function start(taskId: string, taskTitle?: string, subtask?: { id: string; title: string } | null) {
    // 切换任务前先结算上一轮已专注时长，避免中途切任务丢失专注时间
    if (phase.value === 'focus' && (running.value || accumulatedFocusMs > 0 || focusSegmentStartMs !== null)) {
      pause()
      emitFocusEnded(false)
    }
    resetFocusedAccumulation()
    pendingNotification.value = null
    activeSubtaskId.value = subtask?.id ?? null
    activeSubtaskTitle.value = subtask?.title ?? null
    activeTaskId.value = taskId
    activeTaskTitle.value = taskTitle ?? null
    phase.value = 'focus'
    focusStartedAt.value = Date.now()
    const focusSecs = settings.value.focusDuration * 60
    remaining.value = focusSecs
    totalDuration.value = focusSecs
    phaseEndAtMs = Date.now() + focusSecs * 1000
    resume()
  }

  function resume() {
    if (running.value) return
    running.value = true
    if (phase.value === 'focus' && focusSegmentStartMs === null) {
      focusSegmentStartMs = Date.now()
    }
    phaseEndAtMs = Date.now() + remaining.value * 1000
    startTicking()
  }

  function pause() {
    if (!running.value) return
    syncRemainingFromEndAt()
    if (phase.value === 'focus') {
      flushRunningFocusSegment()
    }
    running.value = false
    clearInterval(intervalId!)
    intervalId = null
    phaseEndAtMs = null
  }

  function skipToBreak() {
    pause()
    emitFocusEnded(false)
    phase.value = 'break'
    focusStartedAt.value = null
    const breakSecs = settings.value.breakDuration * 60
    remaining.value = breakSecs
    totalDuration.value = breakSecs
    phaseEndAtMs = Date.now() + breakSecs * 1000
    resume()
  }

  function clearActiveContext() {
    activeTaskId.value = null
    activeTaskTitle.value = null
    activeSubtaskId.value = null
    activeSubtaskTitle.value = null
  }

  function skipBreak() {
    pause()
    resetFocusedAccumulation()
    phase.value = 'focus'
    focusStartedAt.value = null
    phaseEndAtMs = null
    const focusSecs = settings.value.focusDuration * 60
    remaining.value = focusSecs
    totalDuration.value = focusSecs
    clearActiveContext()
  }

  /** User chose "休息" (after focus) or "继续" (after break) */
  function confirmNotification() {
    const notif = pendingNotification.value
    if (!notif) return
    pendingNotification.value = null
    if (notif === 'focus-done') {
      // Transition to break
      resetFocusedAccumulation()
      phase.value = 'break'
      focusStartedAt.value = null
      const breakSecs = settings.value.breakDuration * 60
      remaining.value = breakSecs
      totalDuration.value = breakSecs
      running.value = true
      phaseEndAtMs = Date.now() + breakSecs * 1000
      startTicking()
    } else {
      // break-done → start new focus countdown immediately (retain active task)
      resetFocusedAccumulation()
      phase.value = 'focus'
      focusStartedAt.value = Date.now()
      focusSegmentStartMs = Date.now()
      const focusSecs = settings.value.focusDuration * 60
      remaining.value = focusSecs
      totalDuration.value = focusSecs
      running.value = true
      phaseEndAtMs = Date.now() + focusSecs * 1000
      startTicking()
    }
  }

  /** User chose "继续专注" / "+5m" / "再休息会儿" */
  function extendNotification(customMinutes?: number) {
    const notif = pendingNotification.value
    if (!notif) return
    pendingNotification.value = null
    const overrideSecs = typeof customMinutes === 'number' && Number.isFinite(customMinutes) && customMinutes > 0
      ? Math.round(customMinutes * 60)
      : null
    if (notif === 'focus-done') {
      // Extend focus countdown (e.g. +5m) or start another full focus round
      resetFocusedAccumulation()
      phase.value = 'focus'
      focusStartedAt.value = Date.now()
      focusSegmentStartMs = Date.now()
      const focusSecs = overrideSecs ?? settings.value.focusDuration * 60
      remaining.value = focusSecs
      totalDuration.value = focusSecs
      running.value = true
      phaseEndAtMs = Date.now() + focusSecs * 1000
      startTicking()
    } else {
      // Extend break countdown or start another full break round
      resetFocusedAccumulation()
      phase.value = 'break'
      focusStartedAt.value = null
      const breakSecs = overrideSecs ?? settings.value.breakDuration * 60
      remaining.value = breakSecs
      totalDuration.value = breakSecs
      running.value = true
      phaseEndAtMs = Date.now() + breakSecs * 1000
      startTicking()
    }
  }

  /** User chose "退出" — return to idle */
  function dismissNotification() {
    pendingNotification.value = null
    resetFocusedAccumulation()
    phase.value = 'focus'
    focusStartedAt.value = null
    phaseEndAtMs = null
    const focusSecs = settings.value.focusDuration * 60
    remaining.value = focusSecs
    totalDuration.value = focusSecs
    clearActiveContext()
    running.value = false
  }

  function abandon() {
    pause()
    emitFocusEnded(false)
    resetFocusedAccumulation()
    phase.value = 'focus'
    focusStartedAt.value = null
    phaseEndAtMs = null
    const focusSecs = settings.value.focusDuration * 60
    remaining.value = focusSecs
    totalDuration.value = focusSecs
    clearActiveContext()
    running.value = false
  }

  function onPhaseDoneCallback(cb: PhaseCallback) {
    onDoneCallbacks.push(cb)
  }

  function onFocusEndedCallback(cb: FocusEndedCallback) {
    onFocusEndedCallbacks.push(cb)
  }

  return {
    phase,
    remaining,
    totalDuration,
    running,
    activeTaskId,
    activeTaskTitle,
    focusStartedAt,
    pendingNotification,
    activeSubtaskId,
    activeSubtaskTitle,
    progress,
    displayTime,
    start,
    resume,
    pause,
    skipToBreak,
    skipBreak,
    abandon,
    confirmNotification,
    extendNotification,
    dismissNotification,
    onPhaseDoneCallback,
    onFocusEndedCallback,
    setSubtaskContext,
  }
}
