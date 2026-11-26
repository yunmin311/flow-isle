<script setup lang="ts">
import { computed, nextTick, onActivated, onDeactivated, onMounted, onUnmounted, ref, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-shell'
import { writeText } from '@tauri-apps/plugin-clipboard-manager'
import {
  useNotifications,
  formatNotifTime,
  formatFocusMissedBreakdown,
  formatFocusMissedTitle,
  pruneExpiredRecords,
  type NotificationRecord,
} from '../composables/useNotifications'
import {
  useSettings,
  isSystemNotificationSourceBlocked,
  systemNotificationSourceKey,
} from '../composables/useSettings'
import { useTasks } from '../composables/useTasks'
import { emailInboxUrl, formatEmailSourceTag } from '../utils/emailLinks'
import EmailReader from './EmailReader.vue'
import ScreenshotShelf from './ScreenshotShelf.vue'
import StatNumber from '../components/StatNumber.vue'
import { triggerPixelBurstFromEvent } from '../utils/pixelSpark'

const props = defineProps<{ focusRequest?: { recordId?: string; openSource?: boolean; destination?: 'timer'; focusMissed?: boolean } }>()
const emit = defineEmits<{ back: []; openTask: [taskId: string]; openHome: []; openTodo: [] }>()

const {
  records,
  unreadCount,
  markAllRead,
  clearAll,
  lastFocusMissed,
  focusMissedRecordIds,
  clearFocusMissedSummary,
} = useNotifications()
const missedIdSet = computed(() => new Set(focusMissedRecordIds.value))
const focusMissedTitle = computed(() => (lastFocusMissed.value ? formatFocusMissedTitle(lastFocusMissed.value) : ''))
const focusMissedBreakdown = computed(() => (lastFocusMissed.value ? formatFocusMissedBreakdown(lastFocusMissed.value) : ''))
const focusMissedCardRef = ref<HTMLElement | null>(null)
const missedSocialError = ref<string | null>(null)

async function openMissedSocialApp(app: string) {
  missedSocialError.value = null
  try {
    await invoke('activate_notification_source', { app, aumid: '' })
  } catch (reason) {
    missedSocialError.value = typeof reason === 'string' ? reason : `无法打开 ${app}，请从系统托盘打开`
  }
}
const { settings } = useSettings()
const { tasks } = useTasks()

// 系统通知与番茄钟/任务提醒分栏展示
const notifGroups = computed(() =>
  [
    { key: 'system', title: '系统通知', items: records.value.filter(r => r.kind === 'system') },
    { key: 'email', title: '邮件', items: records.value.filter(r => r.kind === 'email') },
    {
      key: 'focus',
      title: '专注提醒',
      items: records.value.filter(r => r.kind !== 'system' && r.kind !== 'email'),
    },
  ].filter(group => group.items.length > 0),
)

const selectedEmail = ref<NotificationRecord | null>(null)
function openRecord(record: NotificationRecord) {
  if (record.kind === 'email') selectedEmail.value = record
  else toggleRecord(record.id)
}
function closeEmail() {
  const id = selectedEmail.value?.id
  selectedEmail.value = null
  if (id) void nextTick(() => recordNodes.get(id)?.focus({ preventScroll: true }))
}

// 所有通知分组默认全部收起；每次点击逐步展开少量条目，避免一次性铺满整页
const GROUP_PAGE_STEP = 4
const groupVisibleCounts = ref<Record<string, number>>({})

function groupVisibleCount(key: string): number {
  return groupVisibleCounts.value[key] ?? 0
}

function isGroupExpanded(key: string): boolean {
  return groupVisibleCount(key) > 0
}

function toggleGroupHeader(key: string) {
  const cur = groupVisibleCount(key)
  groupVisibleCounts.value = {
    ...groupVisibleCounts.value,
    [key]: cur > 0 ? 0 : GROUP_PAGE_STEP,
  }
}

function showMoreInGroup(key: string, total: number) {
  const next = Math.min(total, groupVisibleCount(key) + GROUP_PAGE_STEP)
  groupVisibleCounts.value = {
    ...groupVisibleCounts.value,
    [key]: next,
  }
}

function collapseGroup(key: string) {
  groupVisibleCounts.value = {
    ...groupVisibleCounts.value,
    [key]: 0,
  }
}

function groupVisibleItems(group: { key: string; items: NotificationRecord[] }): NotificationRecord[] {
  const limit = groupVisibleCount(group.key)
  return limit > 0 ? group.items.slice(0, limit) : []
}

function groupUnreadCount(items: NotificationRecord[]): number {
  return items.filter(item => !item.read).length
}

// 单条通知：点击展开完整标题与正文，展开后可复制
const expandedRecords = ref<Record<string, boolean>>({})
const copiedId = ref<string | null>(null)
let copiedTimer: number | null = null

function isRecordExpanded(id: string): boolean {
  return Boolean(expandedRecords.value[id])
}

function toggleRecord(id: string) {
  expandedRecords.value = {
    ...expandedRecords.value,
    [id]: !expandedRecords.value[id],
  }
}

async function copyRecord(record: NotificationRecord) {
  try {
    const text = [record.app, record.title, record.detail].filter(Boolean).join('\n')
    await writeText(text)
    copiedId.value = record.id
    if (copiedTimer !== null) window.clearTimeout(copiedTimer)
    copiedTimer = window.setTimeout(() => {
      copiedId.value = null
      copiedTimer = null
    }, 1500)
  } catch {
    showActionStatus(record.id, '复制失败', false)
  }
}

// ---- 通知操作：打开来源 / 屏蔽来源 ----

const openingId = ref<string | null>(null)
const actionStatus = ref<{ id: string; message: string; ok: boolean } | null>(null)
let actionTimer: number | null = null
const focusedRecordId = ref<string | null>(null)
let focusTimer: number | null = null
const recordNodes = new Map<string, HTMLElement>()

function setRecordNode(id: string, el: unknown) {
  if (el instanceof HTMLElement) recordNodes.set(id, el)
  else recordNodes.delete(id)
}

function showActionStatus(id: string, message: string, ok: boolean) {
  actionStatus.value = { id, message, ok }
  if (actionTimer !== null) window.clearTimeout(actionTimer)
  actionTimer = ok ? window.setTimeout(() => {
    actionStatus.value = null
    actionTimer = null
  }, 2600) : null
}

function isRecordBlocked(record: NotificationRecord): boolean {
  if (record.kind !== 'system') return false
  return isSystemNotificationSourceBlocked(record.app ?? '', record.aumid ?? '')
}

function groupKeyForRecord(record: NotificationRecord): string {
  if (record.kind === 'system') return 'system'
  if (record.kind === 'email') return 'email'
  return 'focus'
}

function focusRecord(record: NotificationRecord) {
  const key = groupKeyForRecord(record)
  const group = notifGroups.value.find(g => g.key === key)
  const idx = group ? group.items.findIndex(item => item.id === record.id) : 0
  const needed = Math.max(GROUP_PAGE_STEP, idx + 1)
  groupVisibleCounts.value = {
    ...groupVisibleCounts.value,
    [key]: Math.max(groupVisibleCount(key), needed),
  }
  expandedRecords.value = { ...expandedRecords.value, [record.id]: true }
  selectedEmail.value = null
  focusedRecordId.value = record.id
  if (focusTimer !== null) window.clearTimeout(focusTimer)
  focusTimer = window.setTimeout(() => {
    focusedRecordId.value = null
    focusTimer = null
  }, 1800)
  nextTick(() => {
    const node = recordNodes.get(record.id)
    node?.focus({ preventScroll: true })
    node?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  })
}

const pageHeading = ref<HTMLElement | null>(null)
let handledFocusRequest: typeof props.focusRequest
watch([() => props.focusRequest, records], ([request]) => {
  if (!request || handledFocusRequest === request) return
  if (request.destination === 'timer') {
    handledFocusRequest = request
    emit('openHome')
    return
  }
  const record = records.value.find(item => item.id === request.recordId)
  if (record) {
    handledFocusRequest = request
    if (request.openSource) void openRecordSource(record)
    else focusRecord(record)
  } else if (request.focusMissed && lastFocusMissed.value) {
    handledFocusRequest = request
    void nextTick(() => focusMissedCardRef.value?.focus())
  } else {
    void nextTick(() => pageHeading.value?.focus())
  }
}, { immediate: true, flush: 'post' })

async function openRecordSource(record: NotificationRecord) {
  if (openingId.value) return
  actionStatus.value = null

  if (record.kind === 'focus-done' || record.kind === 'break-done') {
    emit('openHome')
    return
  }
  if (record.kind === 'task-reminder') {
    const taskId = record.taskId
    if (taskId && tasks.value.some(task => task.id === taskId)) emit('openTask', taskId)
    else emit('openTodo')
    return
  }
  const inbox = emailInboxUrl(record.emailProvider)
  if (record.kind === 'email' && !inbox) {
    focusRecord(record)
    return
  }

  openingId.value = record.id
  try {
    if (record.kind === 'system') {
      await invoke('activate_notification_source', { app: record.app ?? '', aumid: record.aumid ?? '' })
      showActionStatus(record.id, '已打开来源应用', true)
    } else if (inbox) {
      await open(inbox)
    }
  } catch (reason) {
    focusRecord(record)
    const message = record.kind === 'system'
      ? (typeof reason === 'string' ? reason : '无法打开来源应用，已定位到这条通知')
      : '无法打开网页版收件箱，已定位到这条通知'
    showActionStatus(record.id, message, false)
  } finally {
    openingId.value = null
  }
}

function muteRecordSource(record: NotificationRecord) {
  const app = (record.app ?? '').trim()
  const aumid = (record.aumid ?? '').trim()
  const source = systemNotificationSourceKey(app, aumid)
  if (!source) {
    showActionStatus(record.id, '无法定位来源应用', false)
    return
  }

  const keys = [app.toLowerCase(), aumid.toLowerCase()].filter(Boolean)
  const matches = (entry: string) => keys.includes(entry.trim().toLowerCase())

  const muted = (settings.value.systemNotificationMutedApps ?? []).filter(entry => !matches(entry))
  settings.value.systemNotificationMutedApps = [...muted, source]
  settings.value.systemNotificationAllowedApps = (settings.value.systemNotificationAllowedApps ?? [])
    .filter(entry => !matches(entry))
  showActionStatus(record.id, '已屏蔽此应用，可在设置「通知来源」解除', true)
}

onUnmounted(() => {
  if (copiedTimer !== null) window.clearTimeout(copiedTimer)
  if (actionTimer !== null) window.clearTimeout(actionTimer)
  if (focusTimer !== null) window.clearTimeout(focusTimer)
})

// ---- 快捷设置：系统音量 ----

const sysVolume = ref(0)
const sysMuted = ref(false)
const volumeReady = ref(false)
const volumeError = ref<string | null>(null)
let applying = false

async function refreshVolume() {
  try {
    const state = await invoke<{ volume: number; muted: boolean }>('get_volume_state')
    sysVolume.value = Math.round(state.volume * 100)
    sysMuted.value = state.muted
    volumeReady.value = true
    volumeError.value = null
  } catch (e) {
    volumeError.value = typeof e === 'string' ? e : '无法读取系统音量'
  }
}

async function onVolumeInput(event: Event) {
  const v = Number((event.target as HTMLInputElement).value)
  sysVolume.value = v
  if (applying) return
  applying = true
  try {
    if (sysMuted.value && v > 0) {
      sysMuted.value = false
      await invoke('set_system_mute', { muted: false })
    }
    await invoke('set_system_volume', { volume: v / 100 })
  } catch {
    /* 滑动中失败不打断 */
  } finally {
    applying = false
  }
}

async function toggleMute() {
  const next = !sysMuted.value
  sysMuted.value = next
  try {
    await invoke('set_system_mute', { muted: next })
  } catch {
    sysMuted.value = !next
  }
}

onMounted(() => {
  refreshVolume()
  pruneExpiredRecords()
})
onActivated(pruneExpiredRecords)
// Cached pages must not retain mail bodies after leaving for account settings.
onDeactivated(() => { selectedEmail.value = null })
</script>

<template>
  <div class="notif-page">
    <!-- 音量：紧凑工具条，进入邮件正文阅读时自动隐藏以让出阅读空间 -->
    <template v-if="!selectedEmail">
      <div v-if="volumeReady" class="volume-strip">
        <span class="volume-pixel-pip" :class="{ muted: sysMuted || sysVolume === 0 }" aria-hidden="true"></span>
        <span class="volume-label">音量</span>
        <button class="mute-btn" :class="{ active: sysMuted }" @click="triggerPixelBurstFromEvent($event, 'accent', 4); toggleMute()" :title="sysMuted ? '取消静音' : '静音'">
          <svg v-if="sysMuted || sysVolume === 0" width="16" height="16" viewBox="0 0 16 16" fill="currentColor" shape-rendering="crispEdges" aria-hidden="true">
            <rect x="1" y="6" width="3" height="4" /><rect x="4" y="5" width="2" height="6" /><rect x="6" y="3" width="2" height="10" />
            <rect x="10" y="5" width="2" height="2" /><rect x="14" y="5" width="2" height="2" />
            <rect x="12" y="7" width="2" height="2" />
            <rect x="10" y="9" width="2" height="2" /><rect x="14" y="9" width="2" height="2" />
          </svg>
          <svg v-else width="16" height="16" viewBox="0 0 16 16" fill="currentColor" shape-rendering="crispEdges" aria-hidden="true">
            <rect x="1" y="6" width="3" height="4" /><rect x="4" y="5" width="2" height="6" /><rect x="6" y="3" width="2" height="10" />
            <rect x="10" y="6" width="2" height="4" /><rect v-if="sysVolume > 45" x="13" y="4" width="2" height="8" />
          </svg>
        </button>
        <input
          type="range"
          class="volume-slider"
          min="0"
          max="100"
          :value="sysVolume"
          :style="{ '--volume': `${sysMuted ? 0 : sysVolume}%` }"
          @input="onVolumeInput"
        />
        <span class="volume-value">
          <template v-if="sysMuted">静音</template>
          <StatNumber v-else :value="sysVolume" :size="16" inline />
        </span>
      </div>
      <div v-else class="volume-hint">{{ volumeError ?? '读取系统音量中…' }}</div>
    </template>

    <EmailReader v-if="selectedEmail" :record="selectedEmail" @back="closeEmail" />
    <div v-show="!selectedEmail" class="records-view">
    <!-- 通知记录 -->
    <div class="section-head">
      <span ref="pageHeading" class="section-title" tabindex="-1">通知记录</span>
      <div class="record-tools">
        <button v-if="unreadCount" class="text-btn" @click="markAllRead">全部已读 ({{ unreadCount }})</button>
        <button v-if="records.length" class="text-btn" @click="clearAll">清空</button>
      </div>
    </div>
    <div class="notif-scroll">
      <Transition name="module-dismiss">
      <section
        v-if="lastFocusMissed && lastFocusMissed.total > 0"
        ref="focusMissedCardRef"
        class="focus-missed-card"
        tabindex="-1"
        aria-label="本轮专注错过通知"
      >
        <div class="focus-missed-head">
          <div class="focus-missed-heading">
            <span class="focus-missed-badge"><StatNumber :value="lastFocusMissed.total" :size="16" inline /></span>
            <span class="focus-missed-title">{{ focusMissedTitle }}</span>
          </div>
          <button type="button" class="text-btn focus-missed-close" @click="triggerPixelBurstFromEvent($event, 'accent', 5); clearFocusMissedSummary(); missedSocialError = null">
            知道了
          </button>
        </div>
        <div class="focus-missed-breakdown">{{ focusMissedBreakdown }}</div>
        <div v-if="lastFocusMissed.latestLabel" class="focus-missed-preview">{{ lastFocusMissed.latestLabel }}</div>
        <div v-if="lastFocusMissed.socialApps.length" class="focus-missed-actions">
          <button
            v-for="app in lastFocusMissed.socialApps"
            :key="app"
            type="button"
            class="copy-btn"
            @click="openMissedSocialApp(app)"
          >
            打开 {{ app }}
          </button>
        </div>
        <div v-if="missedSocialError" class="notif-action-status error" role="status">{{ missedSocialError }}</div>
      </section>
      </Transition>
      <ScreenshotShelf />
      <section v-for="group in notifGroups" :key="group.key" class="notif-group">
        <button
          type="button"
          class="group-head group-head-btn"
          :class="{ open: isGroupExpanded(group.key) }"
          :aria-expanded="isGroupExpanded(group.key)"
          @click="toggleGroupHeader(group.key)"
        >
          <span class="group-head-left">
            <span class="group-chevron" aria-hidden="true">{{ isGroupExpanded(group.key) ? '▾' : '▸' }}</span>
            <span class="group-title">{{ group.title }}</span>
            <span class="group-count">{{ group.items.length }}</span>
            <span v-if="groupUnreadCount(group.items) > 0" class="group-unread-pill">{{ groupUnreadCount(group.items) }} 未读</span>
          </span>
          <span class="group-toggle-hint">
            {{ isGroupExpanded(group.key) ? '收起' : `展开前 ${Math.min(GROUP_PAGE_STEP, group.items.length)} 条` }}
          </span>
        </button>
        <Transition name="group-fold">
        <div v-if="isGroupExpanded(group.key)" class="notif-group-body">
        <div class="notif-list">
          <div
            v-for="r in groupVisibleItems(group)"
            :key="r.id"
            :ref="el => setRecordNode(r.id, el)"
            class="notif-item"
            tabindex="0"
            role="button"
            @keydown.enter.self.prevent="openRecord(r)"
            @keydown.space.self.prevent="openRecord(r)"
            :class="{
              unread: !r.read,
              expanded: isRecordExpanded(r.id),
              focused: focusedRecordId === r.id,
            }"
            :title="r.kind === 'email' ? '阅读邮件' : '点击展开/收起'"
            @click="openRecord(r)"
          >
            <div class="notif-dot" />
            <div class="notif-body">
              <div class="notif-line">
                <span v-if="missedIdSet.has(r.id)" class="notif-missed-tag">专注时错过</span>
                <span
                  v-if="r.kind === 'system' && (r.app || isRecordBlocked(r))"
                  class="notif-app"
                >
                  <span v-if="r.app">{{ r.app }}</span>
                  <span v-if="r.kind === 'system' && isRecordBlocked(r)" class="notif-blocked">已屏蔽</span>
                </span>
                <span v-else-if="r.kind === 'email'" class="notif-app">
                  {{ formatEmailSourceTag(r.emailAccountAddress, r.emailProvider) }}
                </span>
                <span class="notif-title">{{ r.title }}</span>
                <span class="notif-time">{{ formatNotifTime(r.time) }}</span>
              </div>
              <div class="notif-detail">{{ r.detail }}</div>
              <div v-if="r.kind === 'email'" class="notif-account">收件 · {{ r.emailAccountAddress || r.emailProvider || '旧邮件账号未标记' }}</div>
              <div v-if="isRecordExpanded(r.id)" class="notif-actions" @click.stop>
                <button type="button" class="copy-btn" @click.stop="copyRecord(r)">
                  {{ copiedId === r.id ? '已复制' : '复制' }}
                </button>
                <button
                  type="button"
                  class="copy-btn"
                  :disabled="openingId === r.id"
                  @click.stop="openRecordSource(r)"
                >
                  {{ openingId === r.id ? '打开中…' : '打开来源' }}
                </button>
                <button
                  v-if="r.kind === 'system'"
                  type="button"
                  class="copy-btn"
                  :disabled="isRecordBlocked(r) || !systemNotificationSourceKey(r.app, r.aumid)"
                  @click.stop="muteRecordSource(r)"
                >
                  {{ isRecordBlocked(r) ? '已屏蔽' : '屏蔽来源' }}
                </button>
              </div>
              <div
                v-if="actionStatus && actionStatus.id === r.id"
                class="notif-action-status"
                :class="{ error: !actionStatus.ok }"
                role="status"
                aria-live="polite"
                @click.stop
              >
                {{ actionStatus.message }}
              </div>
            </div>
          </div>
        </div>
        <div class="group-footer-actions">
          <button
            v-if="group.items.length > groupVisibleCount(group.key)"
            type="button"
            class="group-more"
            @click="showMoreInGroup(group.key, group.items.length)"
          >
            再展开 {{ Math.min(GROUP_PAGE_STEP, group.items.length - groupVisibleCount(group.key)) }} 条（剩 {{ group.items.length - groupVisibleCount(group.key) }} 条）
          </button>
          <button
            type="button"
            class="group-more subtle"
            @click="collapseGroup(group.key)"
          >
            收起分组
          </button>
        </div>
        </div>
        </Transition>
      </section>
      <div v-if="!records.length && !lastFocusMissed" class="empty">还没有通知，完成番茄或收到系统通知后会记录在这里</div>
    </div>
    </div>
  </div>
</template>

<style scoped>
@reference "../styles.css";

.notif-account { font-size: 11px; font-weight: 400; color: var(--v2-secondary); margin-top: 3px; overflow-wrap: anywhere; line-height: 1.5; }

.focus-missed-card {
  padding: 11px 12px 11px 13px;
  border-radius: 12px;
  background:
    radial-gradient(ellipse at 86% 12%, var(--v2-glow), transparent 64%),
    var(--v2-surface);
  border: 1px solid color-mix(in srgb, var(--v2-accent) 28%, var(--v2-line));
  box-shadow: inset 0 1px 0 var(--v2-specular), inset 3px 0 0 var(--v2-accent);
  display: flex;
  flex-direction: column;
  gap: 5px;
  outline: none;
}

.focus-missed-card:focus-visible {
  border-color: var(--v2-accent);
}

.focus-missed-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.focus-missed-heading {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.focus-missed-badge {
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 4px;
  background-color: var(--v2-accent);
  background-image: var(--pixel-dither);
  box-shadow: var(--pixel-bevel-sm);
  color: var(--v2-on-accent);
  font-size: 10.5px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.focus-missed-title {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--v2-ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.focus-missed-close {
  flex-shrink: 0;
}

.focus-missed-breakdown {
  font-size: 11px;
  color: var(--v2-secondary);
  line-height: 1.4;
}

.focus-missed-preview {
  font-size: 11px;
  color: var(--v2-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.focus-missed-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 2px;
}

.focus-missed-actions .copy-btn {
  color: var(--v2-ink);
  border: 1px solid var(--v2-line);
}

.notif-missed-tag {
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 600;
  color: var(--v2-accent);
  background: var(--v2-accent-soft);
  padding: 1px 5px;
  border-radius: 4px;
  line-height: 1.4;
  white-space: nowrap;
}

.records-view { display: flex; flex-direction: column; flex: 1; min-height: 0; }

.notif-page {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  box-sizing: border-box;
  overflow: hidden;
  padding: 0 12px 12px;
}

.page-topbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 0;
}

.back-btn {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border: 1px solid var(--v2-line);
  border-radius: 8px;
  background: var(--ui-well);
  color: var(--v2-ink);
  cursor: pointer;
}

.back-btn svg {
  width: 14px;
  height: 14px;
}

.back-btn:hover {
  background: var(--ui-hover);
}

.page-title {
  flex: 1;
  font-size: 14px;
  font-weight: 600;
  color: var(--v2-ink);
}

.text-btn {
  border: none;
  background: transparent;
  color: var(--v2-secondary);
  font-size: 11px;
  cursor: pointer;
  padding: 3px 5px;
  border-radius: 5px;
}

.text-btn:hover {
  color: var(--v2-ink);
  background: var(--ui-well);
}

.text-btn.placeholder {
  cursor: default;
}

.volume-strip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 11px;
  margin-bottom: 10px;
  border-radius: 12px;
  background: var(--v2-surface);
  border: 1px solid var(--v2-line);
  box-shadow: inset 0 1px 0 var(--v2-specular);
  flex-shrink: 0;
}

.volume-pixel-pip {
  width: 6px;
  height: 6px;
  border-radius: 1px;
  background: var(--v2-accent);
  flex-shrink: 0;
  transition: background 180ms ease, opacity 180ms ease;
}

.volume-pixel-pip.muted {
  background: var(--v2-muted);
  opacity: 0.45;
}

.volume-label {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--v2-muted);
}

.mute-btn {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--v2-muted);
  cursor: pointer;
  flex-shrink: 0;
}

.mute-btn svg {
  width: 16px;
  height: 16px;
  image-rendering: pixelated;
}

.mute-btn:hover {
  color: var(--v2-ink);
  background: var(--ui-well);
}

.mute-btn.active {
  color: var(--v2-accent);
  background: color-mix(in srgb, var(--v2-accent) 12%, transparent);
}

.volume-slider {
  flex: 1;
  min-width: 0;
  -webkit-appearance: none;
  appearance: none;
  height: 6px;
  border-radius: 2px;
  background-image:
    repeating-linear-gradient(
      90deg,
      transparent 0 10px,
      var(--v2-surface) 10px 13px
    ),
    linear-gradient(
      90deg,
      var(--v2-accent) 0 var(--volume, 0%),
      color-mix(in srgb, var(--v2-ink) 12%, transparent) var(--volume, 0%) 100%
    );
  outline: none;
  cursor: pointer;
}

.volume-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 10px;
  height: 14px;
  border-radius: 2px;
  background: var(--v2-accent);
  border: 1px solid color-mix(in srgb, #000 18%, var(--v2-accent));
  box-shadow: var(--pixel-bevel-sm);
  cursor: pointer;
}

.volume-value {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  min-width: 28px;
  font-size: 11px;
  color: var(--v2-secondary);
  font-variant-numeric: tabular-nums;
}

.volume-hint {
  font-size: 10.5px;
  color: var(--v2-muted);
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.section-head .section-title {
  margin-bottom: 0;
}

.notif-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-right: 4px;
}

.notif-scroll::-webkit-scrollbar {
  width: 4px;
}

.notif-scroll::-webkit-scrollbar-track {
  background: transparent;
}

.notif-scroll::-webkit-scrollbar-thumb {
  background: var(--ui-hover);
  border-radius: 2px;
}

.notif-group {
  display: flex;
  flex-direction: column;
}

.group-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 2px 4px;
}

.group-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--v2-secondary);
  letter-spacing: 0.3px;
}

.group-title::before {
  content: '';
  width: 5px;
  height: 5px;
  border-radius: 1px;
  background: var(--v2-accent);
  opacity: 0.78;
  flex-shrink: 0;
}

.group-count {
  font-size: 10px;
  font-weight: 600;
  color: var(--v2-secondary);
  background: var(--v2-surface);
  border: 1px solid var(--v2-line);
  padding: 1px 6px;
  border-radius: 4px;
  font-variant-numeric: tabular-nums;
}

.notif-list {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.group-more {
  width: 100%;
  margin-top: 4px;
  padding: 6px;
  border-radius: 8px;
  background: var(--v2-surface);
  border: 1px dashed var(--v2-line);
  color: var(--v2-muted);
  font-size: 10.5px;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.2s ease;
}

.group-more:hover {
  background: var(--ui-hover);
  border-color: var(--v2-muted);
  color: var(--v2-ink);
}

.notif-item {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  box-sizing: border-box;
  min-width: 0;
  padding: 9px 11px;
  border-radius: 10px;
  border: 1px solid var(--v2-line);
  background: var(--v2-surface);
  box-shadow: inset 0 1px 0 var(--v2-specular);
  cursor: pointer;
  transition: background 0.16s ease, border-color 0.16s ease;
}

.notif-item:hover {
  background: color-mix(in srgb, var(--v2-accent) 4%, var(--v2-surface));
  border-color: color-mix(in srgb, var(--v2-accent) 30%, var(--v2-line));
}

.notif-item.unread {
  border-color: color-mix(in srgb, var(--v2-accent) 34%, var(--v2-line));
  background-color: color-mix(in srgb, var(--v2-accent) 6%, var(--v2-surface));
}

.notif-item.focused {
  border-color: color-mix(in srgb, var(--focus-color) 52%, transparent);
  background: color-mix(in srgb, var(--focus-color) 9%, transparent);
}

.notif-dot {
  width: 6px;
  height: 6px;
  border-radius: 1px;
  margin-top: 5px;
  background: var(--v2-line);
  flex-shrink: 0;
}

.notif-item.unread .notif-dot {
  background: var(--focus-color);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--focus-color) 20%, transparent);
}

.notif-body {
  flex: 1;
  min-width: 0;
}

.notif-line {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
}

.notif-title {
  flex: 1;
  min-width: 0;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--v2-ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.notif-app {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  max-width: 40%;
  font-size: 10px;
  color: var(--v2-muted);
  background: var(--ui-well);
  padding: 2px 6px;
  border-radius: 4px;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.notif-blocked {
  flex-shrink: 0;
  font-size: 10px;
  color: var(--v2-muted);
  border: 0;
  border-left: 1px solid var(--v2-line);;
  padding: 0 0 0 4px;
  line-height: 1.4;
  white-space: nowrap;
}

.notif-time {
  font-size: 10px;
  color: var(--v2-muted);
  font-variant-numeric: tabular-nums;
}

.notif-detail {
  font-size: 11px;
  line-height: 1.4;
  color: var(--v2-muted);
  margin-top: 2px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.notif-item.expanded .notif-title {
  white-space: normal;
  overflow: visible;
  text-overflow: clip;
  overflow-wrap: anywhere;
}

.notif-item.expanded .notif-detail {
  display: block;
  overflow: visible;
  -webkit-line-clamp: unset;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.notif-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
  margin-top: 6px;
}

.copy-btn {
  flex-shrink: 0;
  border: 1px solid var(--v2-line);
  background: var(--v2-surface);
  box-shadow: var(--pixel-keycap);
  color: var(--v2-secondary);
  font-size: 10.5px;
  font-family: inherit;
  padding: 3px 9px;
  border-radius: 6px;
  white-space: nowrap;
  cursor: pointer;
  transition: background-color 150ms ease, color 150ms ease, border-color 150ms ease, transform 120ms ease;
}

.copy-btn:hover {
  background: var(--ui-hover);
  border-color: color-mix(in srgb, var(--v2-accent) 32%, var(--v2-line));
  color: var(--v2-ink);
}

.copy-btn:active:not(:disabled) {
  transform: translate3d(0, 1px, 0);
  box-shadow: var(--pixel-keycap-pressed);
}

.copy-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.copy-btn:disabled:hover {
  background: var(--ui-well);
  color: var(--v2-secondary);
}

.notif-action-status {
  margin-top: 4px;
  font-size: 10.5px;
  line-height: 1.4;
  color: var(--v2-secondary);
  overflow-wrap: anywhere;
}

.notif-action-status.error {
  color: var(--alert-color);
}

/* 通知分组可折叠头 & 渐进式展开 */
.group-head-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 7px 10px;
  border-radius: 10px;
  border: 1px solid var(--v2-line);
  background: var(--v2-surface);
  color: var(--v2-ink);
  font-family: inherit;
  cursor: pointer;
  transition: background-color 160ms ease, border-color 160ms ease;
}

.group-head-btn:hover {
  background: var(--ui-hover);
  border-color: color-mix(in srgb, var(--v2-accent) 28%, var(--v2-line));
}

.group-head-left {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.group-chevron {
  font-size: 11px;
  color: var(--v2-muted);
  width: 10px;
  text-align: center;
}

.group-unread-pill {
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--v2-accent-soft);
  color: var(--v2-accent);
  font-size: 10px;
  font-weight: 600;
}

.group-toggle-hint {
  font-size: 10.5px;
  color: var(--v2-muted);
  white-space: nowrap;
}

.notif-group-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 6px;
}

.group-footer-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.group-footer-actions .group-more {
  flex: 1;
}

.group-more.subtle {
  flex: 0 0 auto;
  padding-inline: 12px;
  color: var(--v2-muted);
}

/* 模块消失与分组展开动画 */
.module-dismiss-enter-active {
  transition: opacity 240ms cubic-bezier(0.22, 1, 0.36, 1), transform 240ms cubic-bezier(0.22, 1, 0.36, 1);
}

.module-dismiss-leave-active {
  transition:
    opacity 220ms cubic-bezier(0.4, 0, 0.2, 1),
    transform 240ms cubic-bezier(0.4, 0, 0.2, 1),
    max-height 260ms cubic-bezier(0.4, 0, 0.2, 1),
    margin 260ms cubic-bezier(0.4, 0, 0.2, 1),
    padding 260ms cubic-bezier(0.4, 0, 0.2, 1);
  max-height: 260px;
  overflow: hidden;
}

.module-dismiss-enter-from {
  opacity: 0;
  transform: translate3d(0, -6px, 0) scale(0.98);
}

.module-dismiss-leave-to {
  opacity: 0;
  transform: translate3d(0, -8px, 0) scale(0.95);
  max-height: 0;
  margin-top: 0;
  margin-bottom: 0;
  padding-top: 0;
  padding-bottom: 0;
  border-width: 0;
}

.group-fold-enter-active,
.group-fold-leave-active {
  transition: opacity 200ms cubic-bezier(0.22, 1, 0.36, 1), transform 200ms cubic-bezier(0.22, 1, 0.36, 1);
}

.group-fold-enter-from,
.group-fold-leave-to {
  opacity: 0;
  transform: translate3d(0, -4px, 0);
}

.empty {
  flex: 1;
  display: grid;
  place-items: center;
  font-size: 12.5px;
  color: var(--v2-muted);
}
</style>
