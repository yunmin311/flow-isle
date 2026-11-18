/**
 * useTimerBridge — panel 窗口专用
 * 计时器逻辑在此运行，关键状态变化时广播状态到灵动岛窗口，并在专注完成时累计统计与伙伴陪伴时长。
 */
import { emit, emitTo, listen } from '@tauri-apps/api/event'
import { watch } from 'vue'
import { useTimer, type TimerPhase, type NotificationType } from './useTimer'
import { useTasks } from './useTasks'
import { useDailyStats } from './useDailyStats'
import { useAchievements } from './useAchievements'
import { useSettings } from './useSettings'
import { useCompanion } from './useCompanion'
import {
  flushFocusMissedSummary,
  resetActiveFocusMissedSession,
} from './useNotifications'

export interface TimerStatePayload {
  phase: TimerPhase
  remaining: number
  totalDuration: number
  running: boolean
  activeTaskId: string | null
  activeTaskTitle: string | null
  activeSubtaskId: string | null
  activeSubtaskTitle: string | null
  syncedAt: number
}

let bridgeStarted = false

export function useTimerBridge() {
  const timer = useTimer()
  const { tasks, incrementPomodoro, incrementSubtaskPomodoro, touchTask } = useTasks()
  const { recordPomodoro } = useDailyStats()
  const { recordPomodoro: recordAchievementPomodoro, recordEarlyBird, recordNightOwl } = useAchievements()
  const { settings } = useSettings()
  const { selectedId: selectedCompanionId, recordCompanionMinutes, installCompanionSyncResponder } = useCompanion()
  let lastPayloadKey = ''
  let sessionCompanionId: string | null = null

  function buildPayload() {
    return {
      phase: timer.phase.value,
      remaining: timer.remaining.value,
      totalDuration: timer.totalDuration.value,
      running: timer.running.value,
      activeTaskId: timer.activeTaskId.value,
      activeTaskTitle:
        timer.activeTaskTitle.value ??
        tasks.value.find(t => t.id === timer.activeTaskId.value)?.title ??
        null,
      activeSubtaskId: timer.activeSubtaskId.value,
      activeSubtaskTitle: timer.activeSubtaskTitle.value,
    }
  }

  function emitTimerState(force = false) {
    const payloadBase = buildPayload()
    const payloadKey = JSON.stringify(payloadBase)
    if (!force && payloadKey === lastPayloadKey) return
    lastPayloadKey = payloadKey
    const payload: TimerStatePayload = { ...payloadBase, syncedAt: Date.now() }
    emit('timer-state-update', payload)
  }

  function emitNotification(type: NotificationType) {
    emit('notification-show', type)
  }

  function startBridge() {
    if (bridgeStarted) return
    bridgeStarted = true
    installCompanionSyncResponder()

    let focusSessionActive = false

    // 专注开始时锁定该轮归属的伙伴，中途换伴不改记本轮进度；同时跟踪本轮静默期间错过的通知
    watch(
      () => [timer.running.value, timer.phase.value, timer.activeTaskId.value, timer.pendingNotification.value] as const,
      ([isRunning, currentPhase, taskId, pendingNotif]) => {
        if (isRunning && currentPhase === 'focus') {
          if (!focusSessionActive) {
            focusSessionActive = true
            resetActiveFocusMissedSession()
          }
          if (taskId) {
            sessionCompanionId ??= selectedCompanionId.value
          }
        } else if (
          focusSessionActive
          && (currentPhase !== 'focus' || (!isRunning && !taskId && !pendingNotif))
        ) {
          focusSessionActive = false
          const summary = flushFocusMissedSummary(false)
          void emitTo('main', 'focus-missed-ready', summary).catch(() => {})
        }
        if (!taskId) {
          sessionCompanionId = null
        }
      },
      { immediate: true },
    )

    timer.onPhaseDoneCallback((phase, taskId) => {
      if (phase === 'focus') {
        focusSessionActive = false
        const summary = flushFocusMissedSummary(true)
        void emitTo('main', 'focus-missed-ready', summary).catch(() => {})
      }
      if (phase === 'focus' && taskId) {
        incrementPomodoro(taskId)
        if (timer.activeSubtaskId.value) {
          incrementSubtaskPomodoro(taskId, timer.activeSubtaskId.value)
        }
        const focusMinutes = settings.value.focusDuration
        recordPomodoro(focusMinutes)
        recordAchievementPomodoro()
        recordCompanionMinutes(sessionCompanionId ?? selectedCompanionId.value, focusMinutes)
        sessionCompanionId = null

        const startHour = timer.focusStartedAt.value === null
          ? null
          : new Date(timer.focusStartedAt.value).getHours()
        if (startHour !== null) {
          if (startHour < 6) {
            recordEarlyBird()
          } else if (startHour >= 23) {
            recordNightOwl()
          }
        }
      }
    })

    // Broadcast notification state to island when pendingNotification changes
    watch(
      () => timer.pendingNotification.value,
      (notif) => {
        emitNotification(notif)
        emitTimerState(true)
      },
    )

    // Listen for notification actions from the island window
    listen<string>('notification-action', ({ payload }) => {
      if (payload === 'confirm') {
        timer.confirmNotification()
      } else if (payload === 'extend') {
        timer.extendNotification()
      } else if (payload === 'dismiss') {
        timer.dismissNotification()
      }
    }).catch(() => {})

    // 即时同步关键状态（开始/暂停/跳过/任务切换/子任务切换/阶段切换）
    watch(
      () => [
        timer.phase.value,
        timer.running.value,
        timer.totalDuration.value,
        timer.activeTaskId.value,
        timer.activeTaskTitle.value,
        timer.activeSubtaskId.value,
        timer.activeSubtaskTitle.value,
      ],
      () => emitTimerState(),
      { immediate: true },
    )

    watch(
      () => timer.activeTaskId.value,
      (taskId) => {
        if (taskId) touchTask(taskId)
      },
    )

    // 任务标题被编辑时（activeTaskTitle 为空、依赖 tasks 回退）也要同步到灵动岛。
    watch(
      () => tasks.value.find(t => t.id === timer.activeTaskId.value)?.title ?? null,
      () => emitTimerState(),
    )

    // 灵动岛窗口重启/晚启动时，允许主动请求一次当前快照。
    listen('timer-state-request', () => {
      emitTimerState(true)
      if (timer.pendingNotification.value) {
        emitNotification(timer.pendingNotification.value)
      }
    }).catch(() => {})
  }

  return { ...timer, startBridge }
}
