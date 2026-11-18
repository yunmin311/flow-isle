// Real notification store focus-missed tracking + Island promotion logic, simulated Tauri IPC/clock.
import ts from 'typescript'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const notifSource = readFileSync(new URL('../src/composables/useNotifications.ts', import.meta.url), 'utf8')
const socialSource = readFileSync(new URL('../src/utils/notificationSources.ts', import.meta.url), 'utf8')
const islandSource = readFileSync(new URL('../src/components/Island.vue', import.meta.url), 'utf8')

const social = { exports: {} }
vm.runInNewContext(
  ts.transpileModule(socialSource, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
  social,
)

const handlers = new Map()
let persisted = []
let mockMirror = true
const mockSettings = { value: { systemNotificationSilentInFocus: true } }
const mockTimer = { phase: { value: 'focus' }, running: { value: true } }
const fakeTimers = new Map()
let fakeSeq = 0

const modules = {
  '../utils/notificationSources': social.exports,
  vue: { ref: value => ({ value }), computed: fn => ({ get value() { return fn() } }) },
  '@tauri-apps/api/core': { invoke: async () => {} },
  '@tauri-apps/api/event': {
    listen: async (name, fn) => { handlers.set(name, fn); return () => {} },
    emitTo: async () => {},
  },
  '@tauri-apps/plugin-fs': {
    BaseDirectory: { AppData: 1 },
    mkdir: async () => {},
    readTextFile: async () => JSON.stringify(persisted),
    writeTextFile: async (_, value) => { persisted = JSON.parse(value) },
  },
  './useSettings': {
    useSettings: () => ({ settings: mockSettings }),
    rememberSystemNotificationSource() {},
    shouldMirrorSystemNotification: () => mockMirror,
  },
  './useTimer': { useTimer: () => mockTimer },
}

const ctx = {
  exports: {},
  require: name => {
    assert(name in modules, `Unexpected import: ${name}`)
    return modules[name]
  },
  console,
  Date,
  Set,
  Map,
  Math,
  setTimeout: fn => { fakeTimers.set(++fakeSeq, fn); return fakeSeq },
  clearTimeout: id => fakeTimers.delete(id),
}

vm.runInNewContext(
  ts.transpileModule(notifSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
  ctx,
)

const api = ctx.exports
const store = api.useNotifications()
const flush = () => new Promise(resolve => setTimeout(resolve, 20))
await flush()

// 1. Focus session with 0 notifications -> null, nothing shown
assert.equal(api.flushFocusMissedSummary(true), null)
assert.equal(store.lastFocusMissed.value, null)

// 2. Focus session with silent=true collecting mixed email, mirrored system, muted system, historical email, QQ & WeChat
const emitSys = payload => handlers.get('system-notification')({ payload })
const emitMail = payload => handlers.get('email-notification')({ payload })

emitMail({ uid: 101, mailbox_key: '163', provider: '163', from: 'Alice', subject: '163 Live Check', date: new Date().toUTCString(), historical: false })
emitMail({ uid: 101, mailbox_key: '163', provider: '163', from: 'Alice', subject: '163 Live Check', date: new Date().toUTCString(), historical: false }) // duplicate UID
emitMail({ uid: 102, mailbox_key: 'gmail', provider: 'gmail', from: 'Bob', subject: 'Design Note', date: new Date().toUTCString(), historical: false })
emitMail({ uid: 999, mailbox_key: '163', provider: '163', from: 'Old', subject: 'Archived', date: new Date(Date.now() - 86400000).toUTCString(), historical: true })

emitSys({ id: 201, app: '企业微信', aumid: 'wecom.app', title: '会议提醒', body: '10 分钟后开始', created_ms: 10000 })
emitSys({ id: 201, app: '企业微信', aumid: 'wecom.app', title: '会议提醒', body: '10 分钟后开始', created_ms: 10000 }) // duplicate
mockMirror = false
emitSys({ id: 202, app: '广告应用', aumid: 'muted.app', title: '推广', body: '已屏蔽不应计入', created_ms: 10001 })
mockMirror = true
emitSys({ id: 0xFFFFFFFF, app: 'QQ', aumid: 'flowisle.social.qq', title: '有新提醒', body: '聊天预览绝不落盘', created_ms: 10002 })
emitSys({ id: 0xFFFFFFFF, app: '微信', aumid: 'flowisle.social.wechat', title: '有新提醒', body: '聊天预览绝不落盘', created_ms: 10003 })

await flush()

const mixed = api.flushFocusMissedSummary(true)
assert(mixed, 'mixed focus-missed summary should exist')
assert.equal(mixed.total, 5)
assert.equal(mixed.emailCount, 2)
assert.equal(mixed.systemCount, 1)
assert.equal(mixed.socialCount, 2)
assert.deepEqual(Array.from(mixed.socialApps), ['QQ', '微信'])
assert.equal(mixed.phaseCompleted, true)
assert.equal(api.formatFocusMissedTitle(mixed), '专注期间错过 5 条通知')
assert.equal(api.formatFocusMissedBreakdown(mixed), '2 封邮件 · 2 条社交提醒 · 1 条系统通知')
assert.equal(store.focusMissedRecordIds.value.length, 3)

// Privacy invariant: QQ / WeChat reminders must never be saved to notifications.json
assert.equal(persisted.some(r => r.app === 'QQ' || r.app === '微信' || String(r.aumid || '').startsWith('flowisle.social.')), false)

// Session resets cleanly for next focus session
assert.equal(api.flushFocusMissedSummary(true), null)

// 3. Pause mid-focus stops accumulating while paused, then resumes & ends via abandon/skip (phaseCompleted=false)
mockTimer.running.value = true
emitMail({ uid: 301, mailbox_key: '163', provider: '163', from: 'Carol', subject: 'Before Pause', date: new Date().toUTCString(), historical: false })
mockTimer.running.value = false // paused
emitMail({ uid: 302, mailbox_key: '163', provider: '163', from: 'Carol', subject: 'During Pause Live', date: new Date().toUTCString(), historical: false })
mockTimer.running.value = true // resumed
emitSys({ id: 0xFFFFFFFF, app: 'QQ', aumid: 'flowisle.social.qq', title: '有新提醒', body: 'chat', created_ms: 20000 })
await flush()

const stopped = api.flushFocusMissedSummary(false)
assert(stopped)
assert.equal(stopped.total, 2)
assert.equal(stopped.emailCount, 1)
assert.equal(stopped.socialCount, 1)
assert.equal(stopped.phaseCompleted, false)
assert.equal(api.formatFocusMissedBreakdown(stopped), '1 封邮件 · 1 条 QQ')

// 4. systemNotificationSilentInFocus = false skips accumulation completely
mockSettings.value.systemNotificationSilentInFocus = false
emitMail({ uid: 401, mailbox_key: '163', provider: '163', from: 'Dave', subject: 'Live Peek', date: new Date().toUTCString(), historical: false })
emitSys({ id: 402, app: '日历', aumid: 'calendar.app', title: 'Live Sys', body: 'Body', created_ms: 30000 })
assert.equal(api.flushFocusMissedSummary(true), null)
assert.equal(store.lastFocusMissed.value, null)
mockSettings.value.systemNotificationSilentInFocus = true

// 5. Dismissal and markAllRead clear non-null summary cleanly
emitMail({ uid: 501, mailbox_key: '163', provider: '163', from: 'Eve', subject: 'Missed During Focus', date: new Date().toUTCString(), historical: false })
const dismissCandidate = api.flushFocusMissedSummary(true)
assert(dismissCandidate && store.lastFocusMissed.value)
store.clearFocusMissedSummary()
assert.equal(store.lastFocusMissed.value, null)
assert.deepEqual(Array.from(store.focusMissedRecordIds.value), [])

emitMail({ uid: 502, mailbox_key: '163', provider: '163', from: 'Frank', subject: 'Clear on MarkAllRead', date: new Date().toUTCString(), historical: false })
assert(api.flushFocusMissedSummary(true))
assert.notEqual(store.lastFocusMissed.value, null)
store.markAllRead()
assert.equal(store.lastFocusMissed.value, null)
assert.deepEqual(Array.from(store.focusMissedRecordIds.value), [])

// 6. Island.vue promotion state machine (notificationType -> peek, panelOpen deferral, extend dismissal, click routing)
const islandTimers = new Map()
let islandSeq = 0
const islandCalls = []
const islandEmits = []
const islandCtx = {
  pendingFocusMissed: { value: null },
  focusMissedPeekAllowed: { value: false },
  panelOpen: { value: false },
  notificationType: { value: null },
  externalNotificationsSilent: { value: false },
  systemPeek: { value: null },
  systemPeekQueue: [],
  systemPeekTimer: null,
  systemPeekStartedAt: 0,
  systemPeekRemaining: 0,
  SYSTEM_PEEK_MS: 5000,
  SYSTEM_PEEK_MAX_AGE_MS: 15000,
  SYSTEM_PEEK_QUEUE_LIMIT: 2,
  formatFocusMissedBreakdown: api.formatFocusMissedBreakdown,
  formatFocusMissedTitle: api.formatFocusMissedTitle,
  isTransientSocialNotification: social.exports.isTransientSocialNotification,
  shouldMirrorSystemNotification: () => true,
  systemNotificationRecordId: p => `sys-${p.id}`,
  playNotificationSound() {},
  Date,
  nextTick(fn) { if (typeof fn === 'function') fn() },
  emit: (name, payload) => islandEmits.push({ name, payload }),
  emitTo: async (target, name, payload) => islandEmits.push({ target, name, payload }),
  invoke: async (name, args) => { islandCalls.push({ name, args }) },
  window: {
    setTimeout(fn, ms) { const id = ++islandSeq; islandTimers.set(id, { fn, ms }); return id },
    clearTimeout(id) { islandTimers.delete(id) },
  },
}
const sliceBetween = (src, start, end) => src.slice(src.indexOf(start), src.indexOf(end))
const islandCode = [
  sliceBetween(islandSource, 'function clearSystemPeekTimer()', 'watch(externalNotificationsSilent,'),
  sliceBetween(islandSource, 'function handleFocusMissedReady(', 'function enqueueEmailHistoryPeek('),
  sliceBetween(islandSource, 'async function onSystemPeekOpen()', 'async function onNotifOpen()'),
  sliceBetween(islandSource, 'function onNotifConfirm()', 'let panelMotionTimer'),
].join('\n')

vm.runInNewContext(ts.transpileModule(islandCode, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, islandCtx)

// 6a. Completed focus keeps summary ready behind focus-done NotificationBanner without clobbering it
islandCtx.notificationType.value = 'focus-done'
islandCtx.handleFocusMissedReady(mixed)
assert.equal(islandCtx.pendingFocusMissed.value.total, 5)
assert.equal(islandCtx.systemPeek.value, null)

// Clicking extend clears pendingFocusMissed so Focus #2 starts quiet
islandCtx.onNotifExtend()
assert.equal(islandCtx.pendingFocusMissed.value, null)
assert.equal(islandCtx.focusMissedPeekAllowed.value, false)
assert.equal(islandCtx.systemPeek.value, null)

// 6b. Closing focus-done via Break/Exit promotes summary to normal SystemPeekBanner (8000ms)
islandCtx.notificationType.value = 'focus-done'
islandCtx.handleFocusMissedReady(mixed)
islandCtx.notificationType.value = null
islandCtx.focusMissedPeekAllowed.value = true
islandCtx.promoteFocusMissedPeek()
assert.equal(islandCtx.systemPeek.value.kind, 'focus-missed')
assert.equal(islandCtx.systemPeek.value.badgeCount, 5)
assert.equal(islandCtx.systemPeek.value.title, '专注期间错过 5 条通知')
assert.equal(islandTimers.get(islandCtx.systemPeekTimer).ms, 8000)

// Clicking missed peek opens Notification Center directly
await islandCtx.onSystemPeekOpen()
assert.deepEqual(JSON.parse(JSON.stringify(islandEmits.at(-1))), {
  target: 'panel',
  name: 'open-notifications',
  payload: { recordId: mixed.latestRecordId, openSource: false, focusMissed: true },
})
assert.equal(islandCalls.at(-1).name, 'show_panel')
assert.equal(islandCtx.systemPeek.value, null)

// 6c. Early stop while Panel is open defers peek until Panel closes
islandCtx.panelOpen.value = true
islandCtx.handleFocusMissedReady(stopped)
assert.equal(islandCtx.systemPeek.value, null)
islandCtx.panelOpen.value = false
islandCtx.promoteFocusMissedPeek()
assert.equal(islandCtx.systemPeek.value.kind, 'focus-missed')
assert.equal(islandCtx.systemPeek.value.badgeCount, 2)

// 6d. Receiving null clears any visible missed banner immediately ("如果没有就不显示")
islandCtx.handleFocusMissedReady(null)
assert.equal(islandCtx.systemPeek.value, null)
assert.equal(islandCtx.pendingFocusMissed.value, null)

console.log('PASS: focus-missed collection, dedup, pause/silent gating, social privacy invariant, 0-count silence, Island banner deferral/promotion, and Notification Center navigation verified.')
