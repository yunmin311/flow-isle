// Execute the page's actual computed expression with fixed local dates and fixtures.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { computed, ref } from 'vue'

const page = readFileSync(new URL('../src/panel/StatsPage.vue', import.meta.url), 'utf8')
const store = readFileSync(new URL('../src/composables/useDailyStats.ts', import.meta.url), 'utf8')
const dateFunction = store.match(/function getDateString\([^]*?\n\}/)?.[0]
const mapExpression = page.match(/const allStatsMap = computed\([^\n]+/)?.[0]
const trendExpression = page.slice(page.indexOf('const weekTrend = computed('), page.indexOf('const maxPomodoros ='))
assert.ok(dateFunction && mapExpression && trendExpression)

for (const today of ['2026-11-16', '2026-11-15', '2026-03-01', '2027-01-01']) {
  const now = new Date(`${today}T12:00:00`)
  const dateKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const rows = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(now)
    day.setDate(day.getDate() - 6 + i)
    return { date: dateKey(day), pomodoros: i + 1, focusMinutes: (i + 1) * 25 }
  })
  // A missing day must remain zero, not inherit an adjacent day's value.
  rows.splice(2, 1)
  const dailyStats = ref(rows)
  const sunday = new Date(now)
  sunday.setDate(now.getDate() - now.getDay())
  const weekStats = computed(() => dailyStats.value.filter(s => s.date >= dateKey(sunday)))
  class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now.getTime()])) }
  }
  const context = vm.createContext({ Date: FixedDate, computed, dailyStats, weekStats, weekDays: ['日', '一', '二', '三', '四', '五', '六'] })
  vm.runInContext(ts.transpileModule(`${dateFunction}\n${mapExpression}\n${trendExpression}\nglobalThis.trend = weekTrend`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context)
  const values = () => Array.from(context.trend.value, d => d.pomodoros)
  assert.deepEqual(values(), [1, 2, 0, 4, 5, 6, 7], `${today}: retain dates before this calendar week`)
  assert.deepEqual(Array.from(context.trend.value, d => d.minutes), [25, 50, 0, 100, 125, 150, 175])
  dailyStats.value[0].pomodoros = 9
  assert.equal(values()[0], 9, 'chart reacts to history updates')
  console.log(`PASS ${today}: rolling seven days, missing day, focus minutes, reactive history update`)
}
