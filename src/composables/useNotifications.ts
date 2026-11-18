import { ref, computed } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { emitTo, listen } from '@tauri-apps/api/event'
import { readTextFile, writeTextFile, mkdir, BaseDirectory } from '@tauri-apps/plugin-fs'
import { shouldMirrorSystemNotification, rememberSystemNotificationSource, useSettings } from './useSettings'
import { useTimer } from './useTimer'
import { isTransientSocialNotification } from '../utils/notificationSources'

export type NotificationKind = 'focus-done' | 'break-done' | 'system' | 'task-reminder' | 'email'

export interface NotificationRecord {
  id: string
  kind: NotificationKind
  title: string
  detail: string
  time: number
  read: boolean
  /** 系统通知镜像：来源应用名 */
  app?: string
  /** 系统通知镜像：来源应用 AUMID */
  aumid?: string
  /** 每日任务提醒：对应任务 id，供“打开来源”跳转 */
  taskId?: string
  emailProvider?: string
  emailAccountId?: string
  emailAccountAddress?: string
}

/** Rust 端 system-notification 事件的载荷 */
export interface SystemNotificationPayload {
  id: number
  app: string
  aumid: string
  title: string
  body: string
  created_ms: number
}

/** Rust 端 email-notification 事件的载荷 */
export interface EmailNotificationPayload {
  uid: number
  from: string
  subject: string
  date: string
  provider: string
  mailbox_key: string
  historical?: boolean
  account_id?: string
  account_address?: string
}

export function systemNotificationRecordId(p: SystemNotificationPayload) {
  return `sys-${p.id}-${p.created_ms}`
}

export function emailNotificationRecordId(p: EmailNotificationPayload) {
  return `email-${p.mailbox_key}-${p.uid}`
}

export interface FocusMissedSummary {
  id: string
  total: number
  emailCount: number
  systemCount: number
  socialCount: number
  socialApps: string[]
  systemApps: string[]
  latestRecordId?: string
  latestLabel?: string
  endedAt: number
  phaseCompleted: boolean
}

export function formatFocusMissedBreakdown(
  summary: Pick<FocusMissedSummary, 'emailCount' | 'systemCount' | 'socialCount' | 'socialApps'>,
): string {
  const parts: string[] = []
  if (summary.emailCount > 0) parts.push(`${summary.emailCount} 封邮件`)
  if (summary.socialCount > 0) {
    const label = summary.socialApps.length === 1 ? ` ${summary.socialApps[0]}` : '社交提醒'
    parts.push(`${summary.socialCount} 条${label}`)
  }
  if (summary.systemCount > 0) parts.push(`${summary.systemCount} 条系统通知`)
  return parts.join(' · ')
}

export function formatFocusMissedTitle(
  summary: Pick<FocusMissedSummary, 'total' | 'emailCount' | 'systemCount' | 'socialCount'>,
): string {
  if (summary.emailCount > 0 && summary.systemCount === 0 && summary.socialCount === 0) {
    return `专注期间错过 ${summary.emailCount} 封邮件`
  }
  return `专注期间错过 ${summary.total} 条通知`
}

export function useExternalNotificationSilence() {
  const { settings } = useSettings()
  const timer = useTimer()
  return computed(() => settings.value.systemNotificationSilentInFocus
    && timer.phase.value === 'focus' && timer.running.value)
}

const NOTIF_FILE = 'focus-island/notifications.json'
// Separate budgets: a burst of system alerts must not evict offline mail.
const LIMIT_PER_SOURCE = 200
// 系统通知按系统逻辑短期缓存；专注提醒保留更久
const SYSTEM_TTL_MS = 7 * 24 * 60 * 60 * 1000
const FOCUS_TTL_MS = 30 * 24 * 60 * 60 * 1000

const records = ref<NotificationRecord[]>([])
const loaded = ref(false)
let listening = false
let loading: Promise<void> | undefined
let pendingSave = Promise.resolve()

function pruneByRetention(list: NotificationRecord[]): NotificationRecord[] {
  const now = Date.now()
  const counts = new Map<string, number>()
  return list
    .filter((record) => {
      const ttl = record.kind === 'system' ? SYSTEM_TTL_MS : FOCUS_TTL_MS
      return now - record.time <= ttl
    })
    .filter(record => {
      const group = record.kind === 'email' ? 'email' : record.kind === 'system' ? 'system' : 'reminder'
      const count = (counts.get(group) ?? 0) + 1
      counts.set(group, count)
      return count <= LIMIT_PER_SOURCE
    })
}

/** 清理过期记录；有变化时落盘 */
export function pruneExpiredRecords() {
  if (!loaded.value) return
  const before = records.value.length
  records.value = pruneByRetention(records.value)
  if (records.value.length !== before) save()
}

// Hide legacy chat entries without deleting previously saved user data.
const visibleRecords = computed(() => records.value.filter(r => r.kind !== 'system' || !isTransientSocialNotification(r.app, r.aumid)))
const unreadCount = computed(() => visibleRecords.value.filter(r => !r.read).length)

const KIND_LABELS: Record<
  'focus-done' | 'break-done' | 'task-reminder',
  { title: string; detail: string }
> = {
  'focus-done': { title: '专注完成', detail: '本轮番茄结束，休息一下' },
  'break-done': { title: '休息结束', detail: '准备好开始下一轮专注了' },
  'task-reminder': { title: '每日任务提醒', detail: '' },
}

async function load() {
  let prunedOnLoad = false
  try {
    const raw = await readTextFile(NOTIF_FILE, { baseDir: BaseDirectory.AppData })
    const parsed = JSON.parse(raw) as NotificationRecord[]
    const list = Array.isArray(parsed) ? parsed : []
    const kept = pruneByRetention(list)
    prunedOnLoad = kept.length !== list.length
    records.value = kept
  } catch {
    records.value = []
  }
  loaded.value = true
  // 启动时把过期记录同步落盘，避免文件里长期残留
  if (prunedOnLoad) save()
}

function save() {
  pendingSave = pendingSave.then(async () => {
    await mkdir('focus-island', { baseDir: BaseDirectory.AppData, recursive: true })
    await writeTextFile(NOTIF_FILE, JSON.stringify(records.value), { baseDir: BaseDirectory.AppData })
  }).catch(() => console.error('Failed to save notifications'))
}

function addAfterLoad(record: NotificationRecord, onAdded?: () => void) {
  const ready = loading ??= load()
  void ready.then(() => {
    const existing = records.value.find(item => item.id === record.id)
    if (existing) {
      if (record.emailAccountAddress && (!existing.emailAccountAddress || existing.emailAccountId !== record.emailAccountId)) {
        existing.emailAccountAddress = record.emailAccountAddress
        existing.emailAccountId = record.emailAccountId
        save()
      }
      return
    }
    records.value = pruneByRetention([record, ...records.value].sort((a, b) => b.time - a.time))
    save()
    onAdded?.()
  })
}

export function addRecord(
  kind: 'focus-done' | 'break-done' | 'task-reminder',
  detail?: string,
  taskId?: string,
) {
  const labels = KIND_LABELS[kind]
  const id = `n-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
  addAfterLoad({
    id,
    kind,
    title: labels.title,
    detail: detail || labels.detail,
    time: Date.now(),
    read: false,
    taskId: taskId || undefined,
  })
  return id
}

function addSystemRecord(p: SystemNotificationPayload) {
  if (isTransientSocialNotification(p.app, p.aumid)) return
  const appName = (p.app || '').trim()
  const title = (p.title || '').trim() || appName || '系统通知'
  const body = (p.body || '').trim()
  const detail = body || (appName && appName !== title ? appName : '来自系统通知中心')

  const record: NotificationRecord = {
    id: systemNotificationRecordId(p),
    kind: 'system',
    title,
    detail,
    time: p.created_ms || Date.now(),
    read: false,
    app: appName || undefined,
    aumid: p.aumid || undefined,
  }
  addAfterLoad(record)
}

export interface EmailHistorySummary {
  count: number
  accounts: number
  recordId: string
}
const historyBatch = new Map<string, { mailbox: string; time: number }>()
let historyTimer: ReturnType<typeof setTimeout> | undefined
function queueHistorySummary(record: NotificationRecord, mailbox: string) {
  historyBatch.set(record.id, { mailbox, time: record.time })
  if (historyTimer !== undefined) clearTimeout(historyTimer)
  historyTimer = setTimeout(() => {
    historyTimer = undefined
    const retainedIds = new Set(records.value.map(record => record.id))
    const entries = [...historyBatch.entries()].filter(([id]) => retainedIds.has(id))
    historyBatch.clear()
    if (!entries.length) return
    entries.sort((a, b) => b[1].time - a[1].time)
    const summary: EmailHistorySummary = {
      count: entries.length,
      accounts: new Set(entries.map(([, item]) => item.mailbox)).size,
      recordId: entries[0]![0],
    }
    void emitTo('main', 'email-history-ready', summary).catch(() => console.error('Failed to show mail sync summary'))
  }, 1500)
}

function addEmailRecord(p: EmailNotificationPayload) {
  const from = (p.from || '').trim() || '未知发件人'
  const record: NotificationRecord = {
    id: emailNotificationRecordId(p),
    kind: 'email',
    title: (p.subject || '').trim() || '(无主题)',
    detail: from,
    time: Number.isFinite(Date.parse(p.date)) ? Date.parse(p.date) : Date.now(),
    read: false,
    app: from,
    emailProvider: p.provider,
    emailAccountId: p.account_id,
    emailAccountAddress: p.account_address,
  }
  addAfterLoad(record, () => {
    if (p.historical) queueHistorySummary(record, p.mailbox_key)
  })
}

const missedEmailIds = new Set<string>()
const missedSystemIds = new Set<string>()
const missedSocialKeys = new Set<string>()
const missedSystemApps = new Set<string>()
const missedSocialApps = new Set<string>()
let missedLatestRecordId: string | undefined
let missedLatestLabel: string | undefined

const lastFocusMissed = ref<FocusMissedSummary | null>(null)
const focusMissedRecordIds = ref<string[]>([])

function isFocusSilenced(): boolean {
  const { settings } = useSettings()
  const timer = useTimer()
  return Boolean(
    settings.value.systemNotificationSilentInFocus
    && timer.phase?.value === 'focus'
    && timer.running?.value,
  )
}

function recordMissedSystem(p: SystemNotificationPayload) {
  if (!isFocusSilenced()) return
  const app = (p.app || '').trim()
  if (isTransientSocialNotification(p.app, p.aumid)) {
    const socialKey = `soc-${p.id}-${p.created_ms}-${app.toLowerCase()}-${(p.aumid || '').trim().toLowerCase()}`
    if (missedSocialKeys.has(socialKey)) return
    missedSocialKeys.add(socialKey)
    if (app) missedSocialApps.add(app)
    return
  }
  const id = systemNotificationRecordId(p)
  if (missedSystemIds.has(id)) return
  missedSystemIds.add(id)
  if (app) missedSystemApps.add(app)
  missedLatestRecordId = id
  const title = (p.title || '').trim() || app || '系统通知'
  missedLatestLabel = app && app !== title ? `${app} · ${title}` : title
}

function recordMissedEmail(p: EmailNotificationPayload) {
  if (p.historical || !isFocusSilenced()) return
  const id = emailNotificationRecordId(p)
  if (missedEmailIds.has(id)) return
  missedEmailIds.add(id)
  missedLatestRecordId = id
  const subject = (p.subject || '').trim() || '(无主题)'
  const from = (p.from || '').trim() || '未知发件人'
  const account = (p.account_address || '').trim() || (p.provider ? p.provider.toUpperCase() : '')
  missedLatestLabel = account ? `[${account}] ${from} · ${subject}` : `${from} · ${subject}`
}

export function resetActiveFocusMissedSession() {
  missedEmailIds.clear()
  missedSystemIds.clear()
  missedSocialKeys.clear()
  missedSystemApps.clear()
  missedSocialApps.clear()
  missedLatestRecordId = undefined
  missedLatestLabel = undefined
}

export function flushFocusMissedSummary(phaseCompleted: boolean): FocusMissedSummary | null {
  const emailCount = missedEmailIds.size
  const systemCount = missedSystemIds.size
  const socialCount = missedSocialKeys.size
  const total = emailCount + systemCount + socialCount
  if (total === 0) {
    resetActiveFocusMissedSession()
    lastFocusMissed.value = null
    focusMissedRecordIds.value = []
    return null
  }
  const summary: FocusMissedSummary = {
    id: `fm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    total,
    emailCount,
    systemCount,
    socialCount,
    socialApps: [...missedSocialApps],
    systemApps: [...missedSystemApps],
    latestRecordId: missedLatestRecordId,
    latestLabel: missedLatestLabel,
    endedAt: Date.now(),
    phaseCompleted,
  }
  focusMissedRecordIds.value = [...missedEmailIds, ...missedSystemIds]
  resetActiveFocusMissedSession()
  lastFocusMissed.value = summary
  return summary
}

export function clearFocusMissedSummary() {
  lastFocusMissed.value = null
  focusMissedRecordIds.value = []
}

function markAllRead() {
  records.value = records.value.map(r => (r.read ? r : { ...r, read: true }))
  clearFocusMissedSummary()
  save()
}

function clearAll() {
  if (historyTimer !== undefined) clearTimeout(historyTimer)
  historyTimer = undefined
  historyBatch.clear()
  clearFocusMissedSummary()
  records.value = []
  save()
}

export function formatNotifTime(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  if (d.toDateString() === now.toDateString()) return hm
  return `${d.getMonth() + 1}/${d.getDate()} ${hm}`
}

export function useNotifications() {
  loading ??= load()
  if (!listening) {
    listening = true
    // 专注时静默只抑制岛内 peek，通知中心和邮件记录仍然保留。
    // 面板端番茄钟推送的横幅事件，同步记录到通知中心
    void listen<'focus-done' | 'break-done' | null>('notification-show', ({ payload }) => {
      if (payload === 'focus-done' || payload === 'break-done') {
        addRecord(payload)
      }
    })
    // Windows 通知中心的系统通知镜像
    void listen<SystemNotificationPayload>('system-notification', ({ payload }) => {
      if (!payload) return
      rememberSystemNotificationSource(payload.app, payload.aumid)
      if (shouldMirrorSystemNotification(payload.app, payload.aumid)) {
        recordMissedSystem(payload)
        addSystemRecord(payload)
      }
    })
    // 邮箱 IMAP 新邮件
    void listen<EmailNotificationPayload>('email-notification', ({ payload }) => {
      if (!payload) return
      recordMissedEmail(payload)
      addEmailRecord(payload)
    }).then(() => invoke('email_listener_ready')).catch(() => { listening = false })
  }
  return {
    records: visibleRecords,
    unreadCount,
    markAllRead,
    clearAll,
    lastFocusMissed,
    focusMissedRecordIds,
    clearFocusMissedSummary,
  }
}
