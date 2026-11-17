// Real Island queue functions with a controlled clock. No Windows delivery claims.
import ts from 'typescript'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
const source = readFileSync(new URL('../src/components/Island.vue', import.meta.url), 'utf8')
const functions = source.slice(source.indexOf('function clearSystemPeekTimer()'), source.indexOf('watch(externalNotificationsSilent,'))
const timers = new Map()
let serial = 0
const c = {
  systemPeek: { value: null }, notificationType: { value: null }, panelOpen: { value: false },
  externalNotificationsSilent: { value: false }, systemPeekQueue: [], systemPeekTimer: null,
  systemPeekStartedAt: 0, systemPeekRemaining: 0,
  SYSTEM_PEEK_MS: 5000, SYSTEM_PEEK_MAX_AGE_MS: 15000, SYSTEM_PEEK_QUEUE_LIMIT: 2,
  Date: { now: () => 1000 }, invoke: async () => {},
  window: { setTimeout(fn) { timers.set(++serial, fn); return serial }, clearTimeout(id) { timers.delete(id) } },
}
vm.runInNewContext(ts.transpileModule(functions, {}).outputText, c)
const item = (key, external = true) => ({ key, external, kind: external ? 'system' : 'task', receivedAt: 1000 })
c.pushPeekItem(item('first'))
assert.equal(c.systemPeek.value.key, 'first')
c.pushPeekItem(item('second'))
assert.equal(c.systemPeek.value.key, 'second', 'new external banner must not wait five seconds')
assert.equal(c.systemPeekQueue.length, 0)
assert.equal(timers.size, 1)
c.pushPeekItem(item('second'))
assert.equal(c.systemPeekQueue.length, 0, 'duplicate must not queue')
c.onSystemPeekHold()
c.pushPeekItem(item('third'))
assert.equal(c.systemPeek.value.key, 'second', 'hovered banner must not change under pointer')
assert.equal(c.systemPeekQueue.length, 1)
c.onSystemPeekResume()
timers.get(c.systemPeekTimer)()
assert.equal(c.systemPeek.value.key, 'third')
c.closeSystemPeek(true)
c.pushPeekItem(item('task', false))
c.pushPeekItem(item('external'))
assert.equal(c.systemPeek.value.key, 'task', 'task remains visible')
c.closeSystemPeek(true)
c.panelOpen.value = true
c.pushPeekItem(item('panel-open'))
assert.equal(c.systemPeek.value, null)
c.panelOpen.value = false
c.externalNotificationsSilent.value = true
c.pushPeekItem(item('focus'))
assert.equal(c.systemPeek.value, null)
c.pushPeekItem(item('task-focus', false))
assert.equal(c.systemPeek.value.key, 'task-focus')
console.log('PASS: immediate external replacement, deduplication, hover protection/resume, task priority, open-panel suppression, focus silence. Controlled clock; not native notification latency evidence.')

const social = { exports: {} }
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/utils/notificationSources.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, social)
const calls = []; let failActivation = false
Object.assign(c, {
  isTransientSocialNotification: social.exports.isTransientSocialNotification,
  shouldMirrorSystemNotification: () => true,
  systemNotificationRecordId: p => `sys-${p.id}`,
  playNotificationSound() {},
  invoke: async (name, args) => { calls.push({ name, args }); if (name === 'activate_notification_source' && failActivation) throw new Error('fixture failure') },
  openNotificationFallback: async () => { throw new Error('chat must not open notification-center fallback') },
})
const extract = (start, end) => source.slice(source.indexOf(start), source.indexOf(end))
vm.runInNewContext(ts.transpileModule(extract('function enqueueSystemPeek(', 'function enqueueEmailPeek(') + '\n' + extract('async function onSystemPeekOpen()', 'async function onNotifOpen()'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, c)
c.externalNotificationsSilent.value = false
for (const [app, aumid] of [['QQ', 'flowisle.social.qq'], ['微信', 'flowisle.social.wechat'], ['WeChat', 'fixture-toast']]) {
  c.closeSystemPeek(true)
  c.enqueueSystemPeek({ id: 123, created_ms: 1000, app, aumid, title: 'fixture reminder', body: 'fixture preview' })
  assert.equal(c.systemPeek.value.app, app, 'transient social notifications still peek')
  await c.onSystemPeekOpen()
  assert.equal(calls.at(-1).name, 'activate_notification_source')
  assert.equal(c.systemPeek.value, null)
}
failActivation = true
c.enqueueSystemPeek({ id: 124, created_ms: 1000, app: 'QQ', aumid: '', title: 'fixture', body: '' })
await c.onSystemPeekOpen()
assert.equal(c.systemPeek.value.title, '无法打开 QQ')
assert.match(c.systemPeek.value.body, /系统托盘/)
assert(!calls.some(call => call.name === 'show_panel'))
console.log('PASS: QQ/WeChat reminders still peek and activate source; activation failure stays transient with explicit retry/tray guidance, without opening notification center.')
