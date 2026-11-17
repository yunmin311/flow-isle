// Real notification store + Island summary function, simulated Tauri events/files.
import ts from 'typescript'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
const source = readFileSync(new URL('../src/composables/useNotifications.ts', import.meta.url), 'utf8')
const social = { exports: {} }
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/utils/notificationSources.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, social)
const handlers = new Map(), timers = new Map()
let ready = false, serial = 0, persisted = []
const summaries = []
const modules = {
  '../utils/notificationSources': social.exports,
  vue: { ref: value => ({ value }), computed: fn => ({ get value() { return fn() } }) },
  '@tauri-apps/api/core': { invoke: async name => { assert.equal(name, 'email_listener_ready'); assert(handlers.has('email-notification')); ready = true } },
  '@tauri-apps/api/event': {
    listen: async (name, fn) => { handlers.set(name, fn); return () => {} },
    emitTo: async (target, name, payload) => { assert.equal(target, 'main'); assert.equal(name, 'email-history-ready'); summaries.push(payload) },
  },
  '@tauri-apps/plugin-fs': { BaseDirectory: { AppData: 1 }, mkdir: async () => {}, readTextFile: async () => JSON.stringify(persisted), writeTextFile: async (_, value) => { persisted = JSON.parse(value) } },
  './useSettings': { useSettings: () => ({ settings: { value: {} } }), rememberSystemNotificationSource() {}, shouldMirrorSystemNotification: () => true },
  './useTimer': { useTimer: () => ({}) },
}
function boot() {
  const context = { exports: {}, require: name => { assert(name in modules, name); return modules[name] }, console, Date,
    setTimeout: fn => { timers.set(++serial, fn); return serial }, clearTimeout: id => timers.delete(id) }
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context)
  return context.exports.useNotifications()
}
let store = boot()
const flush = () => new Promise(resolve => setTimeout(resolve, 20))
const flushSummary = async () => { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach(fn => fn()); await flush() }
await flush(); assert(ready)
const send = (uid, days, mailbox_key = 'synthetic') => handlers.get('email-notification')({ payload: { uid, mailbox_key, provider: '163', from: 'fixture', subject: 'fixture', date: new Date(Date.now() - days * 86400000).toUTCString(), historical: true } })
send(1, 2); send(2, 1); send(1, 2)
await flush()
assert.equal(store.records.value.length, 2)
assert.equal(store.records.value[0].id, 'email-synthetic-2')
assert.equal(persisted.length, 2)
assert.equal(timers.size, 1, 'startup history batches into one summary')
await flushSummary()
assert.equal(summaries.length, 1); assert.equal(summaries[0].count, 2); assert.equal(summaries[0].recordId, 'email-synthetic-2')
store.markAllRead(); send(1, 2); await flush()
assert(store.records.value.every(r => r.read)); assert.equal(timers.size, 0)
for (let id = 1; id <= 210; id++) handlers.get('system-notification')({ payload: { id, created_ms: Date.now(), title: 'fixture', body: 'fixture', app: 'fixture' } })
await flush()
assert.equal(store.records.value.filter(r => r.kind === 'system').length, 200)
assert.equal(store.records.value.filter(r => r.kind === 'email').length, 2, 'system flood must not evict mail')
store = boot(); await flush(); send(1, 2); send(2, 1); await flush()
assert.equal(timers.size, 0, 'restart replay of saved mail must not repeat summary')
send(3, 0.1); send(4, 0.2, 'second-mailbox'); await flush(); await flushSummary()
assert.equal(summaries[1].count, 2); assert.equal(summaries[1].accounts, 2)
const island = readFileSync(new URL('../src/components/Island.vue', import.meta.url), 'utf8')
const functionText = name => island.slice(island.indexOf(`function ${name}(`), island.indexOf('\n}', island.indexOf(`function ${name}(`)) + 2)
const peeks = []; let sounds = 0
const context = { externalNotificationsSilent: { value: false }, playNotificationSound: () => sounds++, pushPeekItem: item => peeks.push(item), emailNotificationRecordId: () => 'fixture', Date }
vm.runInNewContext(ts.transpileModule(functionText('enqueueEmailPeek') + '\n' + functionText('enqueueEmailHistoryPeek'), {}).outputText, context)
context.enqueueEmailPeek({ historical: true }); assert.equal(peeks.length, 0)
context.enqueueEmailHistoryPeek(summaries[1]); assert.equal(peeks[0].kind, 'email-history'); assert.equal(peeks[0].key, summaries[1].recordId); assert.equal(sounds, 0)
context.externalNotificationsSilent.value = true; context.enqueueEmailHistoryPeek(summaries[1]); assert.equal(peeks.length, 1)
context.externalNotificationsSilent.value = false; context.enqueueEmailPeek({ historical: false }); assert.equal(peeks.length, 2); assert.equal(sounds, 1)
send(5, 0.05); await flush(); assert.equal(timers.size, 1)
store.clearAll(); await flush(); await flushSummary(); assert.equal(summaries.length, 2, 'clearing records cancels pending summary'); assert.equal(persisted.length, 0)
persisted = [
  { id: 'legacy-qq', kind: 'system', app: 'QQ', detail: 'legacy fixture', time: Date.now(), read: false },
  { id: 'legacy-wechat', kind: 'system', aumid: 'flowisle.social.wechat', time: Date.now(), read: false },
  { id: 'mail-not-chat', kind: 'email', app: 'QQ', time: Date.now(), read: false },
  { id: 'mail-app-not-chat', kind: 'system', app: 'QQ邮箱', time: Date.now(), read: false },
]
store = boot(); await flush()
assert.equal(store.records.value.length, 2); assert.equal(store.unreadCount.value, 2)
for (const [app, aumid] of [['QQ', 'fixture'], ['微信', 'fixture'], [' WeChat ', 'fixture'], ['WEIXIN', 'fixture'], ['', 'flowisle.social.qq'], ['', 'flowisle.social.wechat']]) {
  handlers.get('system-notification')({ payload: { id: 999, created_ms: Date.now(), app, aumid, title: 'synthetic chat preview', body: 'content still must not persist' } })
}
await flush()
assert.equal(store.records.value.length, 2); assert.equal(store.unreadCount.value, 2)
assert.equal(persisted.length, 4, 'new chat previews never write records; legacy data remains untouched')
console.log('PASS: QQ/WeChat Toast and taskbar reminders never persist, regardless of preview; legacy chat records hidden from list and unread count; QQ mail and other notifications preserved.')
console.log('PASS: listener readiness, dated history insertion/persistence, duplicate/read-state preservation, one startup summary across accounts, restart replay silent, newly missed mail summarized, 210 system alerts do not evict mail, summary record target, clear cancels pending summary, focus silence and live peek. Simulated events/files; not physical shutdown or live mailbox proof.')
