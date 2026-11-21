<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useDailyStats } from '../composables/useDailyStats'
import { useAchievements, type Achievement } from '../composables/useAchievements'
import { useTasks, getTaskTimeCategory, todayString, isRepeatActiveOn } from '../composables/useTasks'
import { useCompanion } from '../composables/useCompanion'
import BackButton from './BackButton.vue'
import CompanionPanel from './CompanionPanel.vue'
import StatNumber from '../components/StatNumber.vue'
import { triggerPixelBurstFromEvent } from '../utils/pixelSpark'

type TimeRange = 'today' | 'week' | 'month' | 'all'

const emit = defineEmits<{ back: [] }>()

const { todayStat, weekStats, monthStats, allTimeStats, summarizeStats, getDateString, getMonthStats, dailyStats } = useDailyStats()
const { starAchievements, streakAchievements, specialAchievements, state } = useAchievements()
const { tasks } = useTasks()
const { statsSection, selectedBadges } = useCompanion()

const timeRange = ref<TimeRange>('today')
const currentMonth = ref(new Date())
const heatExpanded = ref(false)
const selectedDate = ref<string | null>(getDateString())
const selectedBadge = ref<Achievement | null>(null)

// 跨天后如果仍停留在“今天”，自动跟随到新的一天
watch(todayString, (next, prev) => {
  if (selectedDate.value === prev) selectedDate.value = next
})

const timeRangeOptions: { value: TimeRange; label: string }[] = [
  { value: 'today', label: '今日' },
  { value: 'week', label: '本周' },
  { value: 'month', label: '本月' },
  { value: 'all', label: '全部' },
]

const currentStats = computed(() => {
  switch (timeRange.value) {
    case 'today':
      return todayStat.value
    case 'week':
      return summarizeStats(weekStats.value)
    case 'month':
      return summarizeStats(monthStats.value)
    case 'all':
      return allTimeStats.value
  }
})

const allAchievements = computed(() => [
  ...starAchievements.value,
  ...streakAchievements.value,
  ...specialAchievements.value,
])

const unlockedCount = computed(() => allAchievements.value.filter(a => a.unlockedAt !== null).length)

const formatDuration = (minutes: number) => {
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return mins > 0 ? `${hours}.${Math.round(mins / 6)}h` : `${hours}h`
}

const monthYear = computed(() => {
  const d = currentMonth.value
  return `${d.getFullYear()}年${d.getMonth() + 1}月`
})

const prevMonth = () => {
  currentMonth.value = new Date(currentMonth.value.getFullYear(), currentMonth.value.getMonth() - 1, 1)
}

const nextMonth = () => {
  currentMonth.value = new Date(currentMonth.value.getFullYear(), currentMonth.value.getMonth() + 1, 1)
}

const selectedMonthStats = computed(() => {
  const year = currentMonth.value.getFullYear()
  const month = currentMonth.value.getMonth()
  return getMonthStats(year, month)
})

const calendarDays = computed(() => {
  const year = currentMonth.value.getFullYear()
  const month = currentMonth.value.getMonth()
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const startPadding = firstDay.getDay()
  const daysInMonth = lastDay.getDate()

  const days: { date: string; day: number; intensity: number; pomodoros: number; tasks: number }[] = []

  const monthStatsMap = new Map(selectedMonthStats.value.map(s => [s.date, s]))

  for (let i = 0; i < startPadding; i++) {
    days.push({ date: '', day: 0, intensity: 0, pomodoros: 0, tasks: 0 })
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const stat = monthStatsMap.get(dateStr)
    const pomodoros = stat?.pomodoros ?? 0
    let intensity = 0
    if (pomodoros >= 5) intensity = 3
    else if (pomodoros >= 3) intensity = 2
    else if (pomodoros >= 1) intensity = 1
    days.push({ date: dateStr, day: d, intensity, pomodoros, tasks: stat?.tasksCompleted ?? 0 })
  }

  return days
})

// --- Day detail ---
const allStatsMap = computed(() => new Map(dailyStats.value.map(s => [s.date, s])))

const selectedStat = computed(() => (selectedDate.value ? allStatsMap.value.get(selectedDate.value) : undefined))

const selectedDateLabel = computed(() => {
  if (!selectedDate.value) return ''
  const [y, m, d] = selectedDate.value.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const wd = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getDay()]
  return `${m}月${d}日 ${wd}`
})

const isSelectedFuture = computed(() => {
  if (!selectedDate.value) return false
  return selectedDate.value > todayString.value
})

const selectedCompletedTitles = computed(() => selectedStat.value?.completedTitles ?? [])

const dailyTasks = computed(() => tasks.value.filter(t => t.repeat === 'daily'))

const selectedScheduledTasks = computed(() => {
  const date = selectedDate.value
  if (!date) return []
  return [...dailyTasks.value]
    .filter(t => isRepeatActiveOn(t, date))
    .sort((a, b) => (a.repeatTime ?? '99:99').localeCompare(b.repeatTime ?? '99:99'))
    .map(t => ({
      id: t.id,
      title: t.title,
      time: t.repeatTime ?? '',
      done: (t.completionDates ?? []).includes(date),
    }))
})

const monthDailyTasks = computed(() => {
  const year = currentMonth.value.getFullYear()
  const month = currentMonth.value.getMonth()
  const ym = `${year}-${String(month + 1).padStart(2, '0')}`
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const monthStart = `${ym}-01`
  const monthEnd = `${ym}-${String(daysInMonth).padStart(2, '0')}`

  return dailyTasks.value
    .filter(t => {
      const start = t.repeatStart ?? t.dueDate ?? ''
      const end = t.repeatEnd ?? '9999-12-31'
      return (!start || start <= monthEnd) && end >= monthStart
    })
    .map(t => ({
      id: t.id,
      title: t.title,
      time: t.repeatTime ?? '',
      done: (t.completionDates ?? []).filter(d => d.startsWith(ym)).length,
    }))
    .sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'))
})

function selectDay(day: { date: string; day: number }) {
  if (!day.day) return
  selectedDate.value = selectedDate.value === day.date ? null : day.date
}

function toggleBadge(item: Achievement, event?: MouseEvent) {
  selectedBadge.value = selectedBadge.value?.id === item.id ? null : item
  if (item.unlockedAt !== null && selectedBadge.value?.id === item.id) {
    triggerPixelBurstFromEvent(event, 'gold', 7)
  }
}

const weekDays = ['日', '一', '二', '三', '四', '五', '六']

const hoveredIndex = ref<number | null>(null)

const taskDistribution = computed(() => {
  const active = tasks.value.filter(t => !t.completed)
  const today = active.filter(t => getTaskTimeCategory(t) === 'today').length
  const tomorrow = active.filter(t => getTaskTimeCategory(t) === 'tomorrow').length
  const week = active.filter(t => getTaskTimeCategory(t) === 'week').length
  const total = today + tomorrow + week || 1
  return [
    { label: '今日', value: today, percent: Math.round((today / total) * 100) },
    { label: '明日', value: tomorrow, percent: Math.round((tomorrow / total) * 100) },
    { label: '本周', value: week, percent: Math.round((week / total) * 100) },
  ]
})

const weekTrend = computed(() => {
  const now = new Date()
  const result: { day: string; pomodoros: number; minutes: number }[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const dateStr = getDateString(d)
    const stats = allStatsMap.value.get(dateStr)
    result.push({
      day: weekDays[d.getDay()],
      pomodoros: stats?.pomodoros ?? 0,
      minutes: stats?.focusMinutes ?? 0,
    })
  }
  return result
})

const maxPomodoros = computed(() => Math.max(...weekTrend.value.map(d => d.pomodoros), 1))

function steppedBarHeight(pomodoros: number): string {
  if (pomodoros <= 0) return '4px'
  const raw = (pomodoros / maxPomodoros.value) * 72
  const quantized = Math.max(8, Math.round(raw / 4) * 4)
  return `${quantized}px`
}
</script>

<template>
  <div class="stats-page">
    <!-- Header -->
    <div class="page-header">
      <BackButton @click="emit('back')" />
      <h2 class="page-title">记录与陪伴</h2>
      <div class="section-tabs" role="tablist" aria-label="记录板块">
        <button
          role="tab"
          :aria-selected="statsSection === 'stats'"
          :class="['tab', { active: statsSection === 'stats' }]"
          @click="statsSection = 'stats'"
        >
          专注记录
        </button>
        <button
          role="tab"
          :aria-selected="statsSection === 'companions'"
          :class="['tab', { active: statsSection === 'companions' }]"
          @click="statsSection = 'companions'"
        >
          陪伴相册
        </button>
      </div>
    </div>

    <CompanionPanel v-if="statsSection === 'companions'" />

    <template v-else>
      <div class="range-bar">
        <span class="range-caption">时间范围</span>
        <div class="time-range-tabs">
          <button
            v-for="opt in timeRangeOptions"
            :key="opt.value"
            :class="['tab', { active: timeRange === opt.value }]"
            @click="timeRange = opt.value"
          >
            {{ opt.label }}
          </button>
        </div>
      </div>

      <!-- 4-Up Overview -->
      <div class="stats-cards">
        <div class="stat-card">
          <div class="stat-lcd-bay">
            <StatNumber :value="currentStats.pomodoros" :size="20" class="stat-value accent" />
          </div>
          <div class="stat-label">番茄</div>
        </div>
        <div class="stat-card">
          <div class="stat-lcd-bay">
            <StatNumber
              :value="currentStats.focusMinutes < 60 ? currentStats.focusMinutes : Number((currentStats.focusMinutes / 60).toFixed(1))"
              :unit="currentStats.focusMinutes < 60 ? 'm' : 'h'"
              :size="20"
              class="stat-value"
            />
          </div>
          <div class="stat-label">专注时长</div>
        </div>
        <div class="stat-card">
          <div class="stat-lcd-bay">
            <StatNumber :value="currentStats.tasksCompleted" :size="20" class="stat-value" />
          </div>
          <div class="stat-label">完成任务</div>
        </div>
        <div class="stat-card">
          <div class="stat-lcd-bay">
            <StatNumber :value="state.streakDays" :size="20" class="stat-value" />
          </div>
          <div class="stat-label">连续天数</div>
        </div>
      </div>

      <!-- Heatmap Calendar -->
      <div class="section">
        <div class="section-header">
          <span class="section-title">专注日历 · {{ monthYear }}</span>
          <div class="heat-actions">
            <button class="expand-btn" :class="{ active: heatExpanded }" @click="heatExpanded = !heatExpanded">
              {{ heatExpanded ? '收起' : '明细' }}
            </button>
            <div class="month-nav">
              <button class="nav-btn" aria-label="上一月" @click="prevMonth">&lt;</button>
              <button class="nav-btn" aria-label="下一月" @click="nextMonth">&gt;</button>
            </div>
          </div>
        </div>
        <div class="heatmap">
          <div class="heatmap-weekdays">
            <span v-for="d in weekDays" :key="d" class="weekday">{{ d }}</span>
          </div>
          <div class="heatmap-grid" :class="{ detailed: heatExpanded }">
            <div
              v-for="(day, i) in calendarDays"
              :key="i"
              :class="['heat-cell', `intensity-${day.intensity}`, { empty: !day.day, selected: selectedDate === day.date }]"
              @click="selectDay(day)"
              @mouseenter="hoveredIndex = day.day ? i : null"
              @mouseleave="hoveredIndex = null"
            >
              <span v-if="day.day" class="day-number">{{ day.day }}</span>
              <span v-if="heatExpanded && day.day && (day.pomodoros > 0 || day.tasks > 0)" class="cell-count">
                <span v-if="day.pomodoros > 0" class="cell-metric">
                  <span class="pixel-dot" aria-hidden="true"></span>{{ day.pomodoros }}
                </span>
                <span v-if="day.tasks > 0" class="cell-metric cell-task-count">
                  <svg class="cell-check-icon" width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="2.5 6.5 5 9 9.5 3.5" /></svg>{{ day.tasks }}
                </span>
              </span>
              <span
                v-else-if="!heatExpanded && day.day && (day.pomodoros > 0 || day.tasks > 0)"
                class="cell-indicator"
                :class="{ 'has-tasks': day.tasks > 0 }"
                aria-hidden="true"
              ></span>
              <div v-if="!heatExpanded && hoveredIndex === i && (day.pomodoros > 0 || day.tasks > 0)" class="cell-tooltip">
                {{ day.pomodoros }}次专注<template v-if="day.tasks > 0"> · {{ day.tasks }}项任务</template>
              </div>
            </div>
          </div>
        </div>
        <div class="heatmap-legend">
          <span class="legend-hint">点击日期查看明细</span>
          <span class="legend-item"><span class="legend-box intensity-0"></span>无</span>
          <span class="legend-item"><span class="legend-box intensity-1"></span>1-2</span>
          <span class="legend-item"><span class="legend-box intensity-2"></span>3-4</span>
          <span class="legend-item"><span class="legend-box intensity-3"></span>5+</span>
        </div>

        <!-- Selected day detail -->
        <Transition name="drawer-unfold">
          <div v-if="selectedDate" class="day-detail">
          <div class="day-detail-header">
            <span class="day-detail-title">{{ selectedDateLabel }}</span>
            <button class="day-detail-close" @click="selectedDate = null" title="收起">×</button>
          </div>
          <div class="day-detail-metrics">
            <div class="mini-metric">
              <span class="mini-value">{{ selectedStat?.pomodoros ?? 0 }}</span>
              <span class="mini-label">番茄</span>
            </div>
            <div class="mini-metric">
              <span class="mini-value">{{ formatDuration(selectedStat?.focusMinutes ?? 0) }}</span>
              <span class="mini-label">专注</span>
            </div>
            <div class="mini-metric">
              <span class="mini-value">{{ selectedStat?.tasksCompleted ?? 0 }}</span>
              <span class="mini-label">完成任务</span>
            </div>
          </div>

          <div class="day-detail-group">
            <div class="day-detail-group-title">完成的任务</div>
            <div v-if="selectedCompletedTitles.length === 0" class="day-empty">
              {{ (selectedStat?.tasksCompleted ?? 0) > 0 ? `完成 ${selectedStat?.tasksCompleted} 个任务（无标题记录）` : '当日没有完成记录' }}
            </div>
            <div v-else class="day-task-list">
              <div v-for="(title, i) in selectedCompletedTitles" :key="i" class="day-task-row done">
                <span class="pixel-check" aria-hidden="true"></span>
                <span class="day-task-title">{{ title }}</span>
              </div>
            </div>
          </div>

          <div class="day-detail-group">
            <div class="day-detail-group-title">每日定时任务</div>
            <div v-if="selectedScheduledTasks.length === 0" class="day-empty">暂无每日任务</div>
            <div v-else class="day-task-list">
              <div
                v-for="t in selectedScheduledTasks"
                :key="t.id"
                class="day-task-row"
                :class="{ done: t.done, planned: !t.done && isSelectedFuture }"
              >
                <span class="day-task-time">{{ t.time || '全天' }}</span>
                <span class="day-task-title">{{ t.title }}</span>
                <span class="day-task-state">{{ t.done ? '完成' : (isSelectedFuture ? '计划' : '未完成') }}</span>
              </div>
            </div>
          </div>
          </div>
        </Transition>
      </div>

      <!-- Daily recurring tasks -->
      <div v-if="monthDailyTasks.length > 0" class="section">
        <div class="section-header">
          <span class="section-title">每日定时任务</span>
          <span class="section-hint">{{ monthYear }}</span>
        </div>
        <div class="daily-task-list">
          <div v-for="t in monthDailyTasks" :key="t.id" class="daily-task-row">
            <span class="daily-task-time">{{ t.time || '全天' }}</span>
            <span class="daily-task-title">{{ t.title }}</span>
            <span class="daily-task-count">本月 {{ t.done }} 天</span>
          </div>
        </div>
      </div>

      <!-- Charts Row -->
      <div class="charts-row">
        <div class="section chart-section">
          <div class="section-title">本周趋势</div>
          <div class="trend-chart">
            <div class="trend-bars">
              <div
                v-for="d in weekTrend"
                :key="d.day"
                class="trend-bar-wrapper"
              >
                <div class="trend-bar-track">
                  <span v-if="d.pomodoros > 0" class="bar-value">{{ d.pomodoros }}</span>
                  <div
                    class="trend-bar"
                    :class="{ empty: d.pomodoros === 0 }"
                    :style="{ height: steppedBarHeight(d.pomodoros) }"
                  ></div>
                </div>
                <span class="bar-label">{{ d.day }}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="section chart-section">
          <div class="section-title">任务分布</div>
          <div class="distribution">
            <div v-for="item in taskDistribution" :key="item.label" class="dist-item">
              <div class="dist-label">
                <span>{{ item.label }}</span>
                <span class="dist-percent">{{ item.percent }}%</span>
              </div>
              <div class="dist-bar-bg">
                <div class="dist-bar" :style="{ width: `${item.percent}%` }"></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Pixel Companion Achievements -->
      <div class="section">
        <div class="section-header">
          <span class="section-title">专注纪念</span>
          <span class="section-hint">{{ unlockedCount }} / {{ allAchievements.length }}</span>
        </div>
        <div class="badge-strip">
          <button
            v-for="a in allAchievements"
            :key="a.id"
            class="badge-btn"
            :class="{ unlocked: a.unlockedAt !== null, active: selectedBadge?.id === a.id }"
            @click="toggleBadge(a, $event)"
          >
            <img
              v-if="selectedBadges[a.id]"
              :src="selectedBadges[a.id]"
              alt=""
              width="18"
              height="18"
              class="pixel-badge"
            />
            <span class="badge-name">{{ a.name }}</span>
          </button>
        </div>
        <Transition name="drawer-unfold">
          <div v-if="selectedBadge" class="badge-detail">
            <strong>{{ selectedBadge.name }}</strong>
            <span>{{ selectedBadge.description }} · {{ selectedBadge.unlockedAt ? '已达成' : `${selectedBadge.progress}/${selectedBadge.target}` }}</span>
          </div>
        </Transition>
      </div>
    </template>
  </div>
</template>

<style scoped>
@reference "../styles.css";

.stats-page {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 0 12px 14px;
  overflow-y: auto;
  min-height: 0;
}

.page-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0 2px;
}

.page-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--v2-ink);
  flex: 1;
  min-width: 0;
}

.section-tabs,
.time-range-tabs {
  display: inline-flex;
  background: var(--ui-well);
  border: 1px solid var(--v2-line);
  border-radius: 8px;
  padding: 2px;
  gap: 2px;
}

.tab {
  padding: 4px 9px;
  font-size: 11px;
  font-weight: 500;
  color: var(--v2-muted);
  background: transparent;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  white-space: nowrap;
  transition: color 140ms ease, background 140ms ease;
}

.tab:hover {
  color: var(--v2-secondary);
}

.tab.active {
  background-color: var(--v2-accent);
  background-image: var(--pixel-dither);
  box-shadow: var(--pixel-bevel-sm);
  color: var(--v2-on-accent);
}

.range-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.range-caption {
  font-size: 11px;
  color: var(--v2-muted);
}

.stats-cards {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.stat-card {
  background:
    radial-gradient(ellipse at 82% 14%, var(--v2-glow), transparent 72%),
    var(--v2-surface);
  border: 1px solid var(--v2-line);
  border-radius: 12px;
  box-shadow: inset 0 1px 0 var(--v2-specular);
  padding: 6px 6px 7px;
  text-align: center;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  transition: transform 200ms cubic-bezier(0.22, 1, 0.36, 1), border-color 180ms ease;
}

.stat-card:hover {
  transform: translate3d(0, -1px, 0);
  border-color: color-mix(in srgb, var(--v2-accent) 32%, var(--v2-line));
}

.stat-lcd-bay {
  width: 100%;
  padding: 6px 4px;
  border-radius: 8px;
  background-color: var(--ui-well);
  background-image: var(--pixel-dot-grid);
  border: 1px solid var(--v2-line);
  box-shadow: var(--pixel-lcd-well);
  display: flex;
  align-items: center;
  justify-content: center;
}

.stat-value {
  color: var(--v2-ink);
  font-weight: 600;
}

.stat-value.accent {
  color: var(--v2-accent);
}

.stat-label {
  font-size: 10px;
  font-weight: 500;
  color: var(--v2-muted);
  white-space: nowrap;
}

.section {
  background: var(--v2-surface);
  border: 1px solid var(--v2-line);
  border-radius: 12px;
  box-shadow: inset 0 1px 0 var(--v2-specular);
  padding: 12px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.section-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--v2-ink);
}

.section-title::before {
  content: '';
  width: 5px;
  height: 5px;
  border-radius: 1px;
  background: var(--v2-accent);
  opacity: 0.78;
  flex-shrink: 0;
}

.month-nav {
  display: flex;
  gap: 4px;
}

.nav-btn {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--ui-well);
  border: 1px solid var(--v2-line);
  border-radius: 6px;
  box-shadow: var(--pixel-keycap);
  color: var(--v2-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: color 140ms ease, background 140ms ease, transform 120ms ease;
}

.nav-btn:hover {
  background: var(--ui-hover);
  border-color: color-mix(in srgb, var(--v2-accent) 32%, var(--v2-line));
  color: var(--v2-ink);
}

.nav-btn:active {
  transform: translate3d(0, 1px, 0);
  box-shadow: var(--pixel-keycap-pressed);
}

.heatmap {
  position: relative;
}

.heatmap-weekdays {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 3px;
  margin-bottom: 4px;
}

.weekday {
  font-size: 10px;
  color: var(--v2-muted);
  text-align: center;
}

.heatmap-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 3px;
}

.heat-cell {
  aspect-ratio: 1;
  border-radius: 7px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  cursor: pointer;
  border: 1px solid transparent;
  transition: transform 180ms cubic-bezier(0.34, 1.56, 0.64, 1), background 160ms ease, border-color 140ms ease, box-shadow 140ms ease;
}

.heat-cell.empty {
  background: transparent;
  cursor: default;
}

.heat-cell:not(.empty):hover {
  border-color: color-mix(in srgb, var(--v2-accent) 65%, transparent);
  transform: translate3d(0, -1px, 0);
  z-index: 2;
}

.heat-cell:not(.empty):active {
  transform: translate3d(0, 0, 0) scale(0.96);
}

.heat-cell.intensity-0 {
  background: var(--ui-well);
}

.heat-cell.intensity-1 {
  background-color: var(--ui-well);
  background-image: repeating-conic-gradient(
    color-mix(in srgb, var(--v2-accent) 13%, transparent) 0% 25%,
    transparent 0% 50%
  );
  background-size: 6px 6px;
}

.heat-cell.intensity-2 {
  background-color: color-mix(in srgb, var(--v2-accent) 16%, var(--ui-well));
  background-image: repeating-conic-gradient(
    color-mix(in srgb, var(--v2-accent) 17%, transparent) 0% 25%,
    transparent 0% 50%
  );
  background-size: 4px 4px;
}

.heat-cell.intensity-2 .day-number,
.heat-cell.intensity-2 .cell-count,
.heat-cell.intensity-2 .cell-task-count {
  color: var(--v2-ink);
}

.heat-cell.intensity-3 {
  background-color: var(--v2-accent);
  background-image: var(--pixel-dither-coarse);
  box-shadow: var(--pixel-bevel-sm);
}

.day-number {
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  color: var(--v2-secondary);
}

.heat-cell.intensity-3 .day-number {
  color: var(--v2-on-accent);
  font-weight: 600;
}

.cell-indicator {
  position: absolute;
  bottom: 3px;
  right: 3px;
  width: 4px;
  height: 4px;
  border-radius: 0;
  background: currentColor;
  opacity: 0.78;
}

.heat-cell.intensity-3 .cell-indicator {
  color: var(--v2-on-accent);
  opacity: 0.95;
}

.cell-indicator.has-tasks {
  background: var(--v2-break);
}

.heat-cell.intensity-3 .cell-indicator.has-tasks {
  background: var(--v2-on-accent);
}

.cell-tooltip {
  position: absolute;
  bottom: calc(100% + 4px);
  left: 50%;
  transform: translateX(-50%);
  background: var(--v2-surface);
  border: 1px solid var(--v2-line);
  border-radius: 6px;
  padding: 3px 7px;
  font-size: 10px;
  color: var(--v2-ink);
  white-space: nowrap;
  z-index: 10;
  pointer-events: none;
  box-shadow: 0 4px 12px var(--v2-shadow);
}

.heat-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.expand-btn {
  padding: 3px 8px;
  border-radius: 6px;
  background: var(--ui-well);
  border: 1px solid var(--v2-line);
  box-shadow: var(--pixel-keycap);
  color: var(--v2-secondary);
  font-size: 11px;
  font-family: inherit;
  cursor: pointer;
  transition: border-color 140ms ease, color 140ms ease, background 140ms ease, transform 120ms ease;
  white-space: nowrap;
}

.expand-btn:hover {
  border-color: var(--v2-accent);
  color: var(--v2-ink);
}

.expand-btn:active {
  transform: translate3d(0, 1px, 0);
  box-shadow: var(--pixel-keycap-pressed);
}

.expand-btn.active {
  background-color: var(--v2-accent);
  background-image: var(--pixel-dither);
  border-color: color-mix(in srgb, #000 18%, var(--v2-accent));
  box-shadow: var(--pixel-bevel-sm);
  color: var(--v2-on-accent);
}

.section-hint {
  font-size: 10px;
  color: var(--v2-muted);
}

.heat-cell.selected {
  border-color: var(--v2-accent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--v2-accent) 28%, transparent);
}

.heatmap-grid.detailed .heat-cell {
  aspect-ratio: 0.86;
  border-radius: 8px;
}

.heatmap-grid.detailed .heat-cell .day-number {
  position: absolute;
  top: 4px;
  left: 5px;
}

.heatmap-grid.detailed .heat-cell .cell-count {
  left: 5px;
  right: 4px;
  bottom: 4px;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
}

.cell-count {
  position: absolute;
  display: flex;
  font-size: 8.5px;
  line-height: 1;
  color: var(--v2-secondary);
  pointer-events: none;
}

.cell-metric {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

.pixel-dot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--v2-accent);
  flex-shrink: 0;
}

.heat-cell.intensity-3 .pixel-dot {
  background: var(--v2-on-accent);
}

.cell-check-icon {
  flex-shrink: 0;
  color: inherit;
}

.heat-cell.intensity-3 .cell-count,
.heat-cell.intensity-3 .cell-task-count {
  color: var(--v2-on-accent);
  opacity: 0.94;
}

.cell-task-count {
  color: var(--v2-break);
}

.legend-hint {
  margin-right: auto;
  font-size: 10px;
  color: var(--v2-muted);
}

/* Selected day detail */
.day-detail {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--v2-line);
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.day-detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.day-detail-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--v2-ink);
}

.day-detail-close {
  width: 20px;
  height: 20px;
  border-radius: 5px;
  background: transparent;
  border: none;
  color: var(--v2-muted);
  font-size: 15px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.day-detail-close:hover {
  background: var(--ui-well);
  color: var(--v2-ink);
}

.day-detail-metrics {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
}

.mini-metric {
  display: flex;
  align-items: baseline;
  gap: 4px;
  padding: 6px 8px;
  border-radius: 8px;
  background: var(--ui-well);
  border: 1px solid var(--v2-line);
  box-shadow: inset 0 1px 0 var(--v2-specular);
}

.mini-value {
  font-size: 13px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--v2-ink);
}

.mini-label {
  font-size: 10px;
  color: var(--v2-muted);
}

.day-detail-group-title {
  font-size: 10px;
  font-weight: 500;
  color: var(--v2-muted);
  margin-bottom: 4px;
}

.day-empty {
  font-size: 11px;
  color: var(--v2-muted);
  padding: 2px 0;
}

.day-task-list {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.day-task-row {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 5px 8px;
  border-radius: 6px;
  background: var(--ui-well);
  font-size: 11px;
  color: var(--v2-secondary);
}

.day-task-row.done {
  color: var(--v2-muted);
}

.day-task-time {
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  color: var(--v2-muted);
  flex-shrink: 0;
  min-width: 28px;
}

.day-task-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.day-task-state {
  font-size: 10px;
  color: var(--v2-muted);
  flex-shrink: 0;
}

.day-task-row.done .day-task-state {
  color: var(--v2-accent);
}

/* Daily recurring tasks list */
.daily-task-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.daily-task-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 8px;
  background: var(--ui-well);
}

.daily-task-time {
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  color: var(--v2-accent);
  background: var(--v2-accent-soft);
  padding: 2px 6px;
  border-radius: 4px;
  flex-shrink: 0;
}

.daily-task-title {
  flex: 1;
  min-width: 0;
  font-size: 11px;
  color: var(--v2-ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.daily-task-count {
  font-size: 10px;
  color: var(--v2-muted);
  flex-shrink: 0;
}

.heatmap-legend {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 8px;
  justify-content: flex-end;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  color: var(--v2-muted);
}

.legend-box {
  width: 9px;
  height: 9px;
  border-radius: 2px;
}

.legend-box.intensity-0 {
  background: var(--ui-well);
}

.legend-box.intensity-1 {
  background-color: var(--ui-well);
  background-image: repeating-conic-gradient(
    color-mix(in srgb, var(--v2-accent) 22%, transparent) 0% 25%,
    transparent 0% 50%
  );
  background-size: 4px 4px;
}

.legend-box.intensity-2 {
  background-color: color-mix(in srgb, var(--v2-accent) 24%, var(--ui-well));
  background-image: repeating-conic-gradient(
    color-mix(in srgb, var(--v2-accent) 32%, transparent) 0% 25%,
    transparent 0% 50%
  );
  background-size: 4px 4px;
}

.legend-box.intensity-3 {
  background-color: var(--v2-accent);
  background-image: var(--pixel-dither);
}

.charts-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.chart-section {
  min-height: 132px;
  display: flex;
  flex-direction: column;
}

.chart-section .section-title {
  margin-bottom: 8px;
}

.trend-chart {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 8px 6px 6px;
  border-radius: 9px;
  background-color: var(--ui-well);
  background-image: var(--pixel-dot-grid);
  border: 1px solid var(--v2-line);
  box-shadow: var(--pixel-lcd-well);
}

.trend-bars {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  align-items: end;
  height: 92px;
  gap: 4px;
}

.trend-bar-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  height: 100%;
  gap: 4px;
}

.trend-bar-track {
  width: 100%;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  gap: 2px;
}

.trend-bar {
  width: 10px;
  background-color: transparent;
  background-image: repeating-linear-gradient(
    to top,
    var(--v2-accent) 0 3px,
    transparent 3px 4px
  );
  border-radius: 1px;
  transition: height 480ms cubic-bezier(0.22, 1, 0.36, 1);
}

.trend-bar.empty {
  background-color: var(--v2-line);
  background-image: none;
}

.bar-value {
  font-size: 9px;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  color: var(--v2-secondary);
}

.bar-label {
  font-size: 10px;
  color: var(--v2-muted);
}

.distribution {
  display: flex;
  flex-direction: column;
  gap: 9px;
  justify-content: center;
  flex: 1;
  padding: 8px 9px;
  border-radius: 9px;
  background-color: var(--ui-well);
  background-image: var(--pixel-dot-grid);
  border: 1px solid var(--v2-line);
  box-shadow: var(--pixel-lcd-well);
}

.dist-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.dist-label {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--v2-secondary);
}

.dist-percent {
  color: var(--v2-muted);
  font-variant-numeric: tabular-nums;
}

.dist-bar-bg {
  height: 6px;
  padding: 1px;
  background: var(--ui-well);
  border: 1px solid var(--v2-line);
  border-radius: 2px;
  overflow: hidden;
}

.dist-bar {
  height: 100%;
  background: repeating-linear-gradient(
    90deg,
    var(--v2-accent) 0 5px,
    transparent 5px 8px
  );
  border-radius: 0;
  transition: width 480ms cubic-bezier(0.22, 1, 0.36, 1);
}

/* Companion Pixel Badges */
.badge-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
}

.badge-btn {
  appearance: none;
  border: 1px solid var(--v2-line);
  background: var(--ui-well);
  border-radius: 8px;
  padding: 7px 4px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  opacity: 0.45;
  transition: opacity 140ms ease, border-color 140ms ease, background 140ms ease;
}

.badge-btn.unlocked {
  opacity: 1;
}

.badge-btn.active {
  border-color: var(--v2-accent);
  background: var(--v2-accent-soft);
}

.pixel-badge {
  display: block;
  width: 18px;
  height: 18px;
  image-rendering: pixelated;
  image-rendering: crisp-edges;
}

.badge-name {
  font-size: 10px;
  color: var(--v2-ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.badge-detail {
  margin-top: 8px;
  padding: 7px 9px;
  border-radius: 8px;
  background: var(--ui-well);
  border: 1px solid var(--v2-line);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 11px;
  color: var(--v2-secondary);
}

.badge-detail strong {
  color: var(--v2-ink);
  font-weight: 600;
  flex-shrink: 0;
}

.drawer-unfold-enter-active {
  transition: opacity 260ms cubic-bezier(0.22, 1, 0.36, 1), transform 280ms cubic-bezier(0.22, 1, 0.36, 1);
}

.drawer-unfold-leave-active {
  transition: opacity 180ms cubic-bezier(0.4, 0, 0.6, 1), transform 180ms cubic-bezier(0.4, 0, 0.6, 1);
}

.drawer-unfold-enter-from,
.drawer-unfold-leave-to {
  opacity: 0;
  transform: translate3d(0, -4px, 0);
}

@media (max-width: 349px) {
  .charts-row {
    grid-template-columns: 1fr;
  }

  .badge-strip {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

/* Custom scrollbar */
.stats-page::-webkit-scrollbar {
  width: 4px;
}
.stats-page::-webkit-scrollbar-track {
  background: transparent;
}
.stats-page::-webkit-scrollbar-thumb {
  background: var(--ui-hover);
  border-radius: 2px;
}
</style>
