// Node test of the real notification store with simulated Tauri events/files.
import ts from 'typescript'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
const source = readFileSync(new URL('../src/composables/useNotifications.ts', import.meta.url), 'utf8')
const handlers = new Map()
let ready = false
let persisted = []
const modules = {
  vue: { ref: value => ({ value }), computed: fn => ({ get value() { return fn() } }) },
  '@tauri-apps/api/core': { invoke: async name => { assert.equal(name, 'email_listener_ready'); assert(handlers.has('email-notification')); ready = true } },
  '@tauri-apps/api/event': { listen: async (name, fn) => { handlers.set(name, fn); return () => {} } },
  '@tauri-apps/plugin-fs': { BaseDirectory: { AppData: 1 }, mkdir: async () => {}, readTextFile: async () => '[]', writeTextFile: async (_, value) => { persisted = JSON.parse(value) } },
  './useSettings': { useSettings: () => ({ settings: { value: {} } }) },
  './useTimer': { useTimer: () => ({}) },
}
const context = { exports: {}, require: name => { assert(name in modules, name); return modules[name] }, console, Date, setTimeout }
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context)
const store = context.exports.useNotifications()
const flush = () => new Promise(resolve => setTimeout(resolve, 20))
await flush()
assert(ready)
const send = (uid, days) => handlers.get('email-notification')({ payload: { uid, mailbox_key: 'synthetic', provider: '163', from: 'fixture', subject: 'fixture', date: new Date(Date.now() - days * 86400000).toUTCString(), historical: true } })
send(1, 2); send(2, 1); send(1, 2)
await flush()
assert.equal(store.records.value.length, 2)
assert.equal(store.records.value[0].id, 'email-synthetic-2')
assert.equal(persisted.length, 2)
store.markAllRead(); send(1, 2)
await flush()
assert(store.records.value.every(r => r.read))
const island = readFileSync(new URL('../src/components/Island.vue', import.meta.url), 'utf8')
const body = island.slice(island.indexOf('function enqueueEmailPeek('), island.indexOf('\n}', island.indexOf('function enqueueEmailPeek(')) + 2)
let peeks = 0, sounds = 0
const peekContext = { externalNotificationsSilent: { value: false }, playNotificationSound: () => sounds++, pushPeekItem: () => peeks++, emailNotificationRecordId: () => 'fixture', Date }
vm.runInNewContext(ts.transpileModule(body, {}).outputText, peekContext)
peekContext.enqueueEmailPeek({ historical: true }); assert.equal(peeks, 0); assert.equal(sounds, 0)
peekContext.enqueueEmailPeek({ historical: false }); assert.equal(peeks, 1); assert.equal(sounds, 1)
console.log('PASS: listener readiness, history insertion/date ordering, deduplication/read-state preservation, persistence, history silent, live peek')
