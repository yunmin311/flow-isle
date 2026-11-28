<script setup lang="ts">
import { computed, ref, watch, nextTick, onMounted, onUnmounted, onActivated, onDeactivated } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useSettings, presetThemes, type ColorMode, type IslandDisplayMode, type PanelGlass } from '../composables/useSettings'
import { useNotifications } from '../composables/useNotifications'
import { useForkUpdate } from '../composables/useForkUpdate'
import AboutDialog from './AboutDialog.vue'
import BackButton from './BackButton.vue'
import EmailAccounts from './EmailAccounts.vue'
import HintTip from './HintTip.vue'
import StatNumber from '../components/StatNumber.vue'
import { triggerPixelBurstFromEvent } from '../utils/pixelSpark'
const settingsTab = ref('notifications')
const emailEditing = ref(false)
const settingsRoot = ref<HTMLElement | null>(null)
const settingsTabs = [{ id: 'notifications', label: '通知' }, { id: 'appearance', label: '外观' }, { id: 'focus', label: '专注' }, { id: 'general', label: '通用' }]
const settingsTabIndex = computed(() => Math.max(0, settingsTabs.findIndex(t => t.id === settingsTab.value)))

watch([settingsTab, emailEditing], () => { void nextTick(() => settingsRoot.value?.scrollTo(0, 0)) })
watch(settingsTab, (next, prev) => {
  emailEditing.value = false
  if (next === prev) return
  if (typeof window === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const nextIdx = settingsTabs.findIndex(t => t.id === next)
  const prevIdx = settingsTabs.findIndex(t => t.id === prev)
  const dir = nextIdx >= prevIdx ? 1 : -1
  void nextTick(() => {
    const sections = settingsRoot.value?.querySelectorAll<HTMLElement>('.settings-section')
    if (!sections) return
    sections.forEach((sec) => {
      if (sec.offsetParent === null || typeof sec.animate !== 'function') return
      sec.animate(
        [
          { opacity: 0.35, transform: `translate3d(${dir * 14}px, 0, 0)` },
          { opacity: 1, transform: 'translate3d(0, 0, 0)' },
        ],
        { duration: 155, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
      )
    })
  })
})

const emit = defineEmits<{ back: [] }>()

const { settings, resetSettings } = useSettings()
const { records } = useNotifications()

// 系统通知镜像：来源屏蔽（最近来源 + 已屏蔽来源合并展示，确保可撤销）
const mirrorSources = computed(() => {
  const keys: string[] = []
  const push = (value: string) => {
    const key = value.trim()
    if (key && !keys.includes(key)) keys.push(key)
  }
  for (const key of settings.value.systemNotificationKnownSources ?? []) push(key)
  for (const record of records.value) {
    if (record.kind === 'system') push(record.app || record.aumid || '')
  }
  for (const key of settings.value.systemNotificationMutedApps ?? []) push(key)
  for (const key of settings.value.systemNotificationAllowedApps ?? []) push(key)
  return keys.slice(0, 60)
})

const sourcesExpanded = ref(false)
const sourcesProbing = ref(false)
const sourcesStatus = ref('')

const sourceSummary = computed(() => {
  const total = mirrorSources.value.length
  if (total === 0) return '暂无来源'
  if ((settings.value.systemNotificationMirrorMode ?? 'all') === 'selected') {
    const allowed = (settings.value.systemNotificationAllowedApps ?? []).length
    return `${total} 个来源 · ${allowed} 个已允许`
  }
  const muted = (settings.value.systemNotificationMutedApps ?? []).length
  return `${total} 个来源 · ${muted} 个已屏蔽`
})

async function probeNotificationSources() {
  sourcesProbing.value = true
  sourcesStatus.value = '正在检测...'
  try {
    const sources = await invoke<Array<{ app: string; aumid: string }>>('probe_notification_sources')
    const names = sources.map(source => (source.app || source.aumid || '').trim()).filter(Boolean)
    const existing = settings.value.systemNotificationKnownSources ?? []
    const added = names.filter(
      name => !existing.some(entry => entry.toLowerCase() === name.toLowerCase()),
    )
    const merged = [...existing]
    for (const name of names) {
      if (!merged.some(entry => entry.toLowerCase() === name.toLowerCase())) {
        merged.push(name)
      }
    }
    settings.value.systemNotificationKnownSources = merged.slice(-80)
    sourcesStatus.value = names.length
      ? `检测到 ${names.length} 个来源${added.length ? `，新增 ${added.length} 个` : ''}`
      : '当前通知中心没有可检测的来源'
  } catch (e) {
    sourcesStatus.value = typeof e === 'string' ? e : '检测来源失败'
  } finally {
    sourcesProbing.value = false
  }
}

const focusAssistStatus = ref('')
const windowsDndMode = ref<'off' | 'priority' | 'alarms' | 'toasts-off' | 'unknown'>('unknown')
const dndRefreshing = ref(false)

const dndStatusLabel = computed(() => {
  if (windowsDndMode.value === 'priority' || windowsDndMode.value === 'alarms') return '已开启请勿打扰'
  if (windowsDndMode.value === 'toasts-off') return '系统通知总开关已关'
  if (windowsDndMode.value === 'off') return '未开启'
  return '未知'
})

const dndGuideText = computed(() => {
  if (windowsDndMode.value === 'priority' || windowsDndMode.value === 'alarms') {
    return '最佳状态：Windows 右下角原生横幅已隐藏，应用通知仍正常进入通知中心并由 FlowIsle 灵动岛接管。'
  }
  if (windowsDndMode.value === 'toasts-off') {
    return '检测到 Windows「通知」总开关已关闭，系统会停止向 FlowIsle 下发应用通知。请在系统设置中先打开最顶部的「通知」，再打开下方的「请勿打扰」。'
  }
  return '受 Windows 11 系统权限限制，应用无法直接改写「请勿打扰」。请在系统设置中保持顶部「通知」开启、并打开「请勿打扰」（或按 Win+N 点右上角铃铛/月亮图标），即可屏蔽右下角弹窗并由灵动岛接管。'
})

async function refreshWindowsDndMode(manual = false) {
  if (manual) dndRefreshing.value = true
  try {
    const mode = await invoke<string>('get_windows_dnd_mode')
    if (mode === 'off' || mode === 'priority' || mode === 'alarms' || mode === 'toasts-off') {
      windowsDndMode.value = mode
    } else {
      windowsDndMode.value = 'unknown'
    }
    if (manual) {
      focusAssistStatus.value = `状态已更新：${dndStatusLabel.value}`
    }
  } catch {
    windowsDndMode.value = 'unknown'
  } finally {
    if (manual) dndRefreshing.value = false
  }
}

async function openFocusAssistSettings() {
  focusAssistStatus.value = ''
  try {
    await invoke('open_focus_assist_settings')
    focusAssistStatus.value = '已打开 Windows 通知设置，切换后此页会自动同步状态'
  } catch (e) {
    focusAssistStatus.value = typeof e === 'string' ? e : '无法打开 Windows 通知设置'
  }
}

let focusListenerBound = false
let pageActive = false
let dndPollTimer: ReturnType<typeof setInterval> | null = null

function onWindowFocusRefreshDnd() {
  void refreshWindowsDndMode(false)
}

function syncDndLivePolling() {
  const shouldPoll = pageActive && settingsTab.value === 'notifications'
  if (shouldPoll) {
    if (dndPollTimer === null) {
      dndPollTimer = setInterval(() => {
        void refreshWindowsDndMode(false)
      }, 2000)
    }
  } else if (dndPollTimer !== null) {
    clearInterval(dndPollTimer)
    dndPollTimer = null
  }
}

watch(settingsTab, (tab) => {
  if (tab === 'notifications') void refreshWindowsDndMode(false)
  syncDndLivePolling()
})

function bindFocusListener() {
  pageActive = true
  if (!focusListenerBound) {
    window.addEventListener('focus', onWindowFocusRefreshDnd)
    focusListenerBound = true
  }
  syncDndLivePolling()
}
function unbindFocusListener() {
  pageActive = false
  if (focusListenerBound) {
    window.removeEventListener('focus', onWindowFocusRefreshDnd)
    focusListenerBound = false
  }
  syncDndLivePolling()
}

onMounted(() => {
  void refreshWindowsDndMode(false)
  bindFocusListener()
})
onActivated(() => {
  void refreshWindowsDndMode(false)
  bindFocusListener()
})
onDeactivated(() => { unbindFocusListener() })
onUnmounted(() => { unbindFocusListener() })

function isSourceMuted(source: string): boolean {
  const list = settings.value.systemNotificationMutedApps ?? []
  return list.some(key => key.toLowerCase() === source.toLowerCase())
}

function isSourceAllowed(source: string): boolean {
  const list = settings.value.systemNotificationAllowedApps ?? []
  return list.some(key => key.toLowerCase() === source.toLowerCase())
}

function toggleSourceMute(source: string) {
  const list = settings.value.systemNotificationMutedApps ?? []
  settings.value.systemNotificationMutedApps = isSourceMuted(source)
    ? list.filter(key => key.toLowerCase() !== source.toLowerCase())
    : [...list, source]
}

function toggleSourceAllowed(source: string) {
  const list = settings.value.systemNotificationAllowedApps ?? []
  settings.value.systemNotificationAllowedApps = isSourceAllowed(source)
    ? list.filter(key => key.toLowerCase() !== source.toLowerCase())
    : [...list, source]
}

function toggleSource(source: string) {
  if ((settings.value.systemNotificationMirrorMode ?? 'all') === 'selected') {
    toggleSourceAllowed(source)
  } else {
    toggleSourceMute(source)
  }
}

// ---- 邮箱通知 ----

function resetAllSettings() {
  if (!window.confirm('恢复所有设置为默认？主题、透明度、显示模式、快捷键和标语都会重置。')) return
  resetSettings()
}

// FlowIsle 更新：只检查自己的 Release，点击后跳转下载
const {
  checking: forkChecking,
  available: forkUpdateAvailable,
  statusText: forkUpdateStatus,
  check: checkForkUpdate,
  openLatest: openLatestRelease,
} = useForkUpdate()

// 标语编辑：输入时保留原始换行，失焦时再整理成有效行。
// 不能直接绑定 split/filter 的 computed，否则单独按 Enter 产生的空行会被立即过滤。
const mottoDraft = ref('')
const mottoEditing = ref(false)

function syncMottoDraft() {
  mottoDraft.value = (settings.value.idleMottos ?? []).join('\n')
}

function commitMottoDraft(normalize = false) {
  settings.value.idleMottos = mottoDraft.value
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
  if (normalize) {
    mottoDraft.value = (settings.value.idleMottos ?? []).join('\n')
  }
}

watch(
  () => settings.value.idleMottos,
  () => {
    if (!mottoEditing.value) syncMottoDraft()
  },
  { deep: true },
)


const showAbout = ref(false)
const isRecording = ref(false)

const colorModeOptions: Array<{ id: ColorMode; label: string }> = [
  { id: 'dark', label: '深色' },
  { id: 'light', label: '浅色' },
  { id: 'system', label: '跟随系统' },
]

const displayModeOptions: Array<{ id: IslandDisplayMode; label: string; hint: string }> = [
  { id: 'resident', label: '常驻', hint: '胶囊始终显示在屏幕顶部' },
  { id: 'dock', label: '边缘停靠', hint: '贴边收起为专注条，鼠标悬停时展开' },
  { id: 'hidden', label: '完全隐藏', hint: '隐藏灵动岛与刘海，仅通过快捷键或托盘打开面板' },
]

const glassOptions: Array<{ id: PanelGlass; label: string; hint: string }> = [
  { id: 'frost', label: '主题磨砂', hint: '跟随主题色的乳白雾面，颗粒更明显' },
  { id: 'bright', label: '亮面', hint: '高亮清透，桌面透出最多，带镜面高光' },
  { id: 'acrylic', label: '哑光亚克力', hint: '跟随主题色的厚实哑光玻璃，颗粒更细' },
]

const activeGlassHint = computed(
  () => glassOptions.find(opt => opt.id === settings.value.panelGlass)?.hint ?? '',
)

function formatShortcut(key: string): string {
  if (!key) return '无'
  return key.replace('CommandOrControl', navigator.userAgent.includes('Mac') ? '⌘' : 'Ctrl')
    .replace('Alt', 'Alt')
    .replace('Shift', '⇧')
    .replace('Control', 'Ctrl')
}

function startRecording() {
  isRecording.value = true
}

function stopRecording() {
  isRecording.value = false
}

let recordedKey = ''

function buildCombo(e: KeyboardEvent): string {
  const mods: string[] = []
  if (e.ctrlKey) mods.push('Control')
  if (e.altKey) mods.push('Alt')
  if (e.metaKey) mods.push('CommandOrControl')
  if (e.shiftKey) mods.push('Shift')

  const code = e.code
  let keyName: string
  if (code.startsWith('Key')) keyName = code.slice(3)
  else if (code.startsWith('Digit')) keyName = code.slice(5)
  else keyName = code

  return mods.join('+') + '+' + keyName
}

function onRecordKeydown(e: KeyboardEvent) {
  if (!isRecording.value) return
  // Skip modifier-only presses
  if (e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta' || e.key === 'Shift') return
  // Skip if no modifier is held
  if (!e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey) return

  e.preventDefault()
  e.stopPropagation()
  recordedKey = buildCombo(e)
}

function onRecordKeyup(e: KeyboardEvent) {
  if (!isRecording.value) return

  // Fallback: if keydown was intercepted (e.g. Option+Space on macOS),
  // capture the combo from keyup instead
  if (!recordedKey && (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey)) {
    if (e.key !== 'Control' && e.key !== 'Alt' && e.key !== 'Meta' && e.key !== 'Shift') {
      recordedKey = buildCombo(e)
    }
  }

  // Finalize when all modifiers are released
  if (!e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey) {
    if (recordedKey) {
      settings.value.shortcutKey = recordedKey
      recordedKey = ''
      isRecording.value = false
    } else {
      // Released all mods without hitting a key — cancel
      isRecording.value = false
    }
  }
}

function resetRecording() {
  stopRecording()
  recordedKey = ''
}

function goBack() {
  showAbout.value = false
  resetRecording()
  nextTick()
  emit('back')
}

function switchColorMode(mode: ColorMode) {
  if (settings.value.colorMode === mode) return
  settings.value.colorMode = mode
}

let recordListenersBound = false

function bindRecordListeners() {
  if (recordListenersBound) return
  document.addEventListener('keydown', onRecordKeydown, true)
  document.addEventListener('keyup', onRecordKeyup, true)
  recordListenersBound = true
}

function unbindRecordListeners() {
  if (!recordListenersBound) return
  document.removeEventListener('keydown', onRecordKeydown, true)
  document.removeEventListener('keyup', onRecordKeyup, true)
  recordListenersBound = false
}

onMounted(() => {
  bindRecordListeners()
  syncMottoDraft()
  if (settings.value.autoCheckUpdates) {
    void checkForkUpdate(false)
  }
})

onActivated(() => {
  bindRecordListeners()
  syncMottoDraft()
})

onDeactivated(() => {
  resetRecording()
  unbindRecordListeners()
})

onUnmounted(() => {
  unbindRecordListeners()
})
</script>

<template>
  <div ref="settingsRoot" class="settings-page" :class="{ 'blurred': showAbout }">
    <div class="settings-header">
      <BackButton @click="goBack" />
      <button class="about-btn" @click="showAbout = true">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
        </svg>
      </button>
    </div>

    <nav class="settings-tabs" aria-label="设置分类" :style="{ '--seg-index': settingsTabIndex }">
      <span class="settings-tab-thumb" aria-hidden="true" />
      <button v-for="tab in settingsTabs" :key="tab.id" :aria-pressed="settingsTab === tab.id" @click="settingsTab = tab.id">{{ tab.label }}</button>
    </nav>
    <div v-show="settingsTab === 'appearance'" class="settings-section">
      <div class="section-title">显示模式</div>
      <div
        class="mode-toggle"
        role="group"
        aria-label="主题模式"
        :style="{ '--seg-count': colorModeOptions.length, '--seg-index': Math.max(0, colorModeOptions.findIndex(o => o.id === settings.colorMode)) }"
      >
        <span class="seg-pixel-thumb" aria-hidden="true" />
        <button
          v-for="option in colorModeOptions"
          :key="option.id"
          type="button"
          class="mode-btn"
          :class="{ active: settings.colorMode === option.id }"
          @click="switchColorMode(option.id)"
        >
          {{ option.label }}
        </button>
      </div>

      <div class="section-subtitle">显示方式</div>
      <div
        class="mode-toggle"
        role="group"
        aria-label="灵动岛显示方式"
        :style="{ '--seg-count': displayModeOptions.length, '--seg-index': Math.max(0, displayModeOptions.findIndex(o => o.id === settings.islandDisplayMode)) }"
      >
        <span class="seg-pixel-thumb" aria-hidden="true" />
        <button
          v-for="opt in displayModeOptions"
          :key="opt.id"
          type="button"
          class="mode-btn"
          :class="{ active: settings.islandDisplayMode === opt.id }"
          @click="settings.islandDisplayMode = opt.id"
          :title="opt.hint"
        >
          {{ opt.label }}
        </button>
      </div>

      <div class="section-subtitle">玻璃质感<HintTip :text="activeGlassHint" /></div>
      <div
        class="mode-toggle"
        role="group"
        aria-label="面板玻璃质感"
        :style="{ '--seg-count': glassOptions.length, '--seg-index': Math.max(0, glassOptions.findIndex(o => o.id === settings.panelGlass)) }"
      >
        <span class="seg-pixel-thumb" aria-hidden="true" />
        <button
          v-for="opt in glassOptions"
          :key="opt.id"
          type="button"
          class="mode-btn"
          :class="{ active: settings.panelGlass === opt.id }"
          @click="settings.panelGlass = opt.id"
          :title="opt.hint"
        >
          {{ opt.label }}
        </button>
      </div>
    </div>

    <!-- 更新 -->
    <div v-show="settingsTab === 'general'" class="settings-section">
      <div class="section-title">交互</div>
      <div class="update-toggle-row">
        <div class="update-copy">
          <span class="update-label"><HintTip label="点击刘海打开面板" text="关闭后仅通过快捷键或托盘图标打开面板" /></span>
        </div>
        <label class="switch" aria-label="点击刘海打开面板">
          <input v-model="settings.notchClickOpensPanel" type="checkbox" />
          <span class="switch-track"></span>
        </label>
      </div>
    </div>
    <div v-show="settingsTab === 'general'" class="settings-section">
      <div class="section-title">声音与启动</div>
      <div class="update-toggle-row">
        <div class="update-copy">
          <span class="update-label"><HintTip label="通知提示音" text="番茄钟或休息结束时播放提示音" /></span>
        </div>
        <label class="switch" aria-label="通知提示音">
          <input v-model="settings.notificationSound" type="checkbox" />
          <span class="switch-track"></span>
        </label>
      </div>
      <div class="update-toggle-row">
        <div class="update-copy">
          <span class="update-label"><HintTip label="开机自动启动" text="系统启动时自动运行 FlowIsle" /></span>
        </div>
        <label class="switch" aria-label="开机自动启动">
          <input v-model="settings.autoLaunch" type="checkbox" />
          <span class="switch-track"></span>
        </label>
      </div>
    </div>

    <!-- 系统通知镜像 -->
    <div v-show="settingsTab === 'notifications' && !emailEditing" class="settings-section">
      <div class="section-title">系统与社交通知</div>
      <div class="update-toggle-row social-row">
        <div class="update-copy"><span class="update-label">微信 / QQ 提醒<HintTip text="仅弹出提醒，不保存到通知中心；系统通知可显示预览，任务栏闪烁提供补充提醒。点击打开应用。" /></span></div>
        <label class="switch" aria-label="微信和 QQ 提醒"><input v-model="settings.socialReminders" type="checkbox" /><span class="switch-track"></span></label>
      </div>
      <div class="update-toggle-row">
        <div class="update-copy">
          <span class="update-label">镜像 Windows 通知<HintTip text="记录到通知中心，并在岛上短暂提示；系统原生通知不受影响" /></span>
        </div>
        <label class="switch" aria-label="镜像 Windows 通知">
          <input v-model="settings.systemNotificationMirror" type="checkbox" />
          <span class="switch-track"></span>
        </label>
      </div>
      <div v-if="settings.systemNotificationMirror" class="setting-option-row">
        <span class="update-label">镜像范围</span>
        <div
          class="mode-toggle"
          :style="{ '--seg-count': 2, '--seg-index': settings.systemNotificationMirrorMode === 'selected' ? 1 : 0 }"
        >
          <span class="seg-pixel-thumb" aria-hidden="true" />
          <button
            type="button"
            class="mode-btn"
            :class="{ active: (settings.systemNotificationMirrorMode ?? 'all') === 'all' }"
            @click="settings.systemNotificationMirrorMode = 'all'"
          >
            全部
          </button>
          <button
            type="button"
            class="mode-btn"
            :class="{ active: settings.systemNotificationMirrorMode === 'selected' }"
            @click="settings.systemNotificationMirrorMode = 'selected'"
          >
            仅选中
          </button>
        </div>
      </div>
      <button
        v-if="settings.systemNotificationMirror"
        type="button"
        class="collapsible-row row-spaced"
        @click="sourcesExpanded = !sourcesExpanded"
      >
        <span class="update-copy">
          <span class="update-label">通知来源</span>
          <span class="update-hint">{{ sourceSummary }}</span>
        </span>
        <svg
          class="collapsible-chevron"
          :class="{ open: sourcesExpanded }"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      <div v-if="settings.systemNotificationMirror && sourcesExpanded" class="mirror-sources">
        <div class="mirror-sources-head">
          <span class="update-hint">
            {{ (settings.systemNotificationMirrorMode ?? 'all') === 'all' ? '点按来源可屏蔽' : '点按来源加入允许列表' }}
          </span>
          <button
            type="button"
            class="source-probe-btn"
            :disabled="sourcesProbing"
            @click="probeNotificationSources"
          >
            {{ sourcesProbing ? '检测中...' : '检测来源' }}
          </button>
        </div>
        <span v-if="sourcesStatus" class="source-status">{{ sourcesStatus }}</span>
        <span
          v-if="(settings.systemNotificationMirrorMode ?? 'all') === 'selected' && !(settings.systemNotificationAllowedApps ?? []).length"
          class="mirror-empty"
        >
          允许列表为空，当前不会镜像任何通知
        </span>
        <div class="mirror-chips">
          <button
            v-for="source in mirrorSources"
            :key="source"
            type="button"
            class="mirror-chip"
            :class="{
              muted: (settings.systemNotificationMirrorMode ?? 'all') === 'all' && isSourceMuted(source),
              selected: settings.systemNotificationMirrorMode === 'selected' && isSourceAllowed(source),
            }"
            @click="toggleSource(source)"
          >
            {{ source }}
          </button>
        </div>
        <span v-if="!mirrorSources.length" class="mirror-empty">
          还没有来源，收到通知或点「检测来源」后会出现
        </span>
      </div>
      <div class="update-toggle-row row-spaced">
        <div class="update-copy">
          <span class="update-label"><HintTip label="专注时静默" text="专注计时运行中，暂停系统通知和邮件的岛内提示，通知记录仍保留" /></span>
        </div>
        <label class="switch" aria-label="专注时静默">
          <input v-model="settings.systemNotificationSilentInFocus" type="checkbox" />
          <span class="switch-track"></span>
        </label>
      </div>
      <div class="dnd-card row-spaced" :class="{ warning: windowsDndMode === 'toasts-off', active: windowsDndMode === 'priority' || windowsDndMode === 'alarms' }">
        <div class="dnd-card-head">
          <span class="update-label">
            屏蔽 Windows 原生弹窗
            <span
              class="dnd-status-pill"
              :class="{
                active: windowsDndMode === 'priority' || windowsDndMode === 'alarms',
                warning: windowsDndMode === 'toasts-off',
              }"
            >
              {{ dndStatusLabel }}
            </span>
          </span>
          <div class="dnd-actions">
            <button type="button" class="source-probe-btn" :disabled="dndRefreshing" @click="refreshWindowsDndMode(true)">
              {{ dndRefreshing ? '检测中…' : '刷新' }}
            </button>
            <button type="button" class="source-probe-btn" @click="openFocusAssistSettings">
              系统设置
            </button>
          </div>
        </div>
        <span class="update-hint">{{ dndGuideText }}</span>
      </div>
      <span v-if="focusAssistStatus" class="source-status">{{ focusAssistStatus }}</span>
    </div>

    <!-- 邮箱通知 -->
    <div v-if="settingsTab === 'notifications'" class="settings-section email-settings-section">
      <EmailAccounts @editing="emailEditing = $event" />
    </div>

    <!-- 更新（FlowIsle） -->
    <div v-show="settingsTab === 'general'" class="settings-section">
      <div class="section-title">更新（FlowIsle）</div>
      <div class="setting-row">
        <div class="update-copy">
          <span class="update-label"><HintTip label="版本更新" text="只查询 yunmin311/flow-isle，发现新版跳转下载页" /></span>
          <span class="update-status" :class="{ error: Boolean(forkUpdateStatus.startsWith('检查失败')) }">
            {{ forkUpdateStatus }}
          </span>
        </div>
        <div class="setting-actions">
          <button
            v-if="forkUpdateAvailable"
            type="button"
            class="update-btn primary"
            @click="openLatestRelease"
          >
            前往下载
          </button>
          <button
            type="button"
            class="update-btn"
            :disabled="forkChecking"
            @click="checkForkUpdate(true)"
          >
            <span v-if="forkChecking" class="mini-spinner"></span>
            <span>{{ forkChecking ? '检查中...' : '检查更新' }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- 外观 -->
    <div v-show="settingsTab === 'appearance'" class="settings-section">
      <div class="section-title">外观</div>
      <div class="slider-row">
        <label class="slider-label">灵动岛不透明度</label>
        <input
          type="range"
          class="opacity-slider"
          min="0.4"
          max="1"
          step="0.01"
          :style="{ '--slider-pct': `${Math.round(((settings.islandOpacity - 0.4) / 0.6) * 100)}%` }"
          v-model.number="settings.islandOpacity"
        />
        <span class="opacity-value"><StatNumber :value="Math.round(settings.islandOpacity * 100)" unit="%" :size="16" inline /></span>
      </div>
      <div class="slider-row">
        <label class="slider-label">面板不透明度</label>
        <input
          type="range"
          class="opacity-slider"
          min="0.4"
          max="1"
          step="0.01"
          :style="{ '--slider-pct': `${Math.round(((settings.panelOpacity - 0.4) / 0.6) * 100)}%` }"
          v-model.number="settings.panelOpacity"
        />
        <span class="opacity-value"><StatNumber :value="Math.round(settings.panelOpacity * 100)" unit="%" :size="16" inline /></span>
      </div>
      <div class="opacity-hint">40% = 微透玻璃，100% = 完全实心</div>
      <div class="slider-row">
        <label class="slider-label">大小</label>
        <input
          type="range"
          class="opacity-slider"
          min="0.5"
          max="1.5"
          step="0.1"
          :style="{ '--slider-pct': `${Math.round(((settings.islandScale - 0.5) / 1.0) * 100)}%` }"
          v-model.number="settings.islandScale"
        />
        <span class="opacity-value"><StatNumber :value="Math.round(settings.islandScale * 100)" unit="%" :size="16" inline /></span>
      </div>
    </div>

    <!-- 标语 -->
    <div v-show="settingsTab === 'focus'" class="settings-section">
      <div class="section-title">标语</div>
      <textarea
        class="motto-editor"
        rows="4"
        placeholder="每行一条自定义标语，留空使用默认"
        v-model="mottoDraft"
        @input="commitMottoDraft()"
        @focus="mottoEditing = true"
        @blur="mottoEditing = false; commitMottoDraft(true)"
      ></textarea>
      <div class="motto-hint">空闲时在灵动岛轮播显示；每行一条，清空恢复默认</div>
    </div>
    <div v-show="settingsTab === 'focus'" class="settings-section">
      <div class="section-title">番茄钟</div>
      <div class="duration-grid">
        <div class="duration-cell">
          <label class="duration-label">专注</label>
          <div class="stepper">
            <button class="stepper-btn" @click="triggerPixelBurstFromEvent($event, 'accent', 4); settings.focusDuration = Math.max(5, Math.floor((settings.focusDuration - 1) / 5) * 5)">−</button>
            <span class="stepper-value"><StatNumber :value="settings.focusDuration" :size="16" class="stepper-pixel-num" /></span>
            <button class="stepper-btn" @click="triggerPixelBurstFromEvent($event, 'accent', 4); settings.focusDuration = Math.min(120, Math.ceil((settings.focusDuration + 1) / 5) * 5)">+</button>
          </div>
          <span class="duration-unit">分</span>
        </div>
        <div class="duration-cell">
          <label class="duration-label">休息</label>
          <div class="stepper">
            <button class="stepper-btn" @click="triggerPixelBurstFromEvent($event, 'break', 4); settings.breakDuration = Math.max(1, settings.breakDuration - 1)">−</button>
            <span class="stepper-value"><StatNumber :value="settings.breakDuration" :size="16" class="stepper-pixel-num" /></span>
            <button class="stepper-btn" @click="triggerPixelBurstFromEvent($event, 'break', 4); settings.breakDuration = Math.min(30, settings.breakDuration + 1)">+</button>
          </div>
          <span class="duration-unit">分</span>
        </div>
      </div>
    </div>

    <!-- 快捷操作 -->
    <div v-show="settingsTab === 'general'" class="settings-section">
      <div class="section-title">快捷操作</div>
      <div class="shortcut-row">
        <span class="shortcut-label">打开面板</span>
        <button
          class="shortcut-recorder"
          :class="{ recording: isRecording }"
          @click="startRecording"
          tabindex="0"
        >
          <span v-if="isRecording" class="recording-hint">按下组合键...</span>
          <span v-else>{{ formatShortcut(settings.shortcutKey) }}</span>
        </button>
        <span class="shortcut-hint" v-if="!isRecording">推荐 Ctrl+P / Alt+Space，Esc 关闭面板</span>
      </div>
    </div>

    <!-- 重置 -->
    <div v-show="settingsTab === 'general'" class="settings-section">
      <div class="section-title">重置</div>
      <div class="setting-row">
        <div class="update-copy">
          <span class="update-label"><HintTip label="恢复默认设置" text="主题、透明度、显示模式、快捷键与标语" /></span>
        </div>
        <div class="setting-actions">
          <button type="button" class="update-btn danger" @click="resetAllSettings">恢复默认设置</button>
        </div>
      </div>
    </div>

    <!-- 色彩主题 -->
    <div v-show="settingsTab === 'appearance'" class="settings-section">
      <div class="section-title">色彩主题</div>
      <div class="theme-grid">
        <button
          v-for="theme in presetThemes"
          :key="theme.id"
          class="theme-card"
          :class="{ active: settings.activeThemeId === theme.id }"
          @click="settings.activeThemeId = theme.id; triggerPixelBurstFromEvent($event, 'accent', 7)"
        >
          <div class="theme-preview" aria-hidden="true">
            <span class="preview-pill" :style="{ background: theme.focusColor }"></span>
            <span class="preview-block" :style="{ background: theme.breakColor }"></span>
            <span class="preview-bar" :style="{ background: theme.idleColor }"></span>
          </div>
          <span class="theme-name">{{ theme.name }}</span>
          <span v-if="settings.activeThemeId === theme.id" class="theme-check">✓</span>
        </button>
      </div>
    </div>
  </div>

  <!-- 关于弹窗 -->
  <AboutDialog v-if="showAbout" @close="showAbout = false" />
</template>

<style scoped>
@reference "../styles.css";

.settings-page {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  color: var(--v2-ink);
}

.settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-bottom: 1px solid var(--v2-line);;
  flex-shrink: 0;
}

.back-btn {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: var(--ui-well);
  border: 1px solid var(--v2-line);;
  color: var(--v2-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.back-btn:hover {
  background: var(--ui-hover);
  border-color: var(--v2-muted);
  color: var(--v2-ink);
}

.about-btn {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: transparent;
  border: none;
  color: var(--v2-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.about-btn:hover {
  color: var(--focus-color);
}

.settings-section {
  padding: 14px 14px 16px;
  border-bottom: 1px solid var(--v2-line);
}

.section-title {
  font-size: 12px;
  color: var(--v2-muted);
  font-weight: 600;
  letter-spacing: 0.02em;
  margin-bottom: 10px;
}

.section-subtitle {
  font-size: 11px;
  color: var(--v2-muted);
  font-weight: 500;
  letter-spacing: 0.5px;
  margin-top: 10px;
  margin-bottom: 6px;
}

.mode-toggle {
  display: flex;
  align-items: center;
  border: 1px solid color-mix(in srgb, var(--focus-color) 82%, transparent);
  border-radius: 999px;
  overflow: hidden;
  width: fit-content;
  max-width: 100%;
}

.mode-btn {
  appearance: none;
  border: none;
  background: transparent;
  color: var(--v2-ink);
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
  height: 28px;
  padding: 0 14px;
  cursor: pointer;
  transition: background 0.22s ease, color 0.22s ease;
  white-space: nowrap;
}

.mode-btn + .mode-btn {
  border-left: 1px solid color-mix(in srgb, var(--focus-color) 58%, transparent);
}

.mode-btn:hover {
  background: color-mix(in srgb, var(--focus-color) 15%, transparent);
}

.mode-btn.active {
  background-color: var(--focus-color);
  background-image: var(--pixel-dither);
  box-shadow: var(--pixel-bevel-sm);
  color: var(--v2-on-accent);
}

/* 更新 */
.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.setting-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.update-toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 4px 0;
}

.update-copy {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.update-label {
  font-size: 12.5px;
  font-weight: 500;
  line-height: 1.35;
  color: var(--v2-ink);
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.dnd-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 11px;
  border-radius: 10px;
  background: var(--ui-well);
  border: 1px solid var(--v2-line);
}

.dnd-card.active {
  border-color: color-mix(in srgb, var(--v2-break) 36%, var(--v2-line));
}

.dnd-card.warning {
  border-color: color-mix(in srgb, var(--v2-alert) 48%, var(--v2-line));
}

.dnd-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.dnd-actions {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
}

.dnd-status-pill {
  font-size: 10px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--v2-surface);
  border: 1px solid var(--v2-line);
  color: var(--v2-muted);
  line-height: 1.35;
}

.dnd-status-pill.active {
  background-color: color-mix(in srgb, var(--v2-break) 14%, transparent);
  border-color: color-mix(in srgb, var(--v2-break) 38%, var(--v2-line));
  color: var(--v2-break);
}

.dnd-status-pill.warning {
  background-color: color-mix(in srgb, var(--v2-alert) 15%, transparent);
  border-color: color-mix(in srgb, var(--v2-alert) 44%, var(--v2-line));
  color: var(--v2-alert);
}

.update-hint {
  font-size: 10.5px;
  line-height: 1.4;
  color: var(--v2-muted);
}

.switch {
  position: relative;
  display: inline-flex;
  align-items: center;
  width: 42px;
  height: 24px;
  flex-shrink: 0;
  cursor: pointer;
}

.switch input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.switch-track {
  position: relative;
  width: 42px;
  height: 24px;
  border-radius: 7px;
  background-color: var(--ui-well);
  background-image: var(--pixel-dot-grid);
  border: 1px solid var(--v2-line);
  box-shadow: var(--pixel-lcd-well);
  transition: background-color 160ms steps(4, end), border-color 160ms steps(4, end);
}

.switch-track::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 7px;
  width: 3px;
  height: 3px;
  transform: translateY(-50%);
  background: var(--v2-on-accent);
  opacity: 0;
  transition: opacity 140ms steps(2, end);
}

.switch-track::after {
  content: '';
  position: absolute;
  top: 3px;
  left: 3px;
  width: 16px;
  height: 16px;
  border-radius: 4px;
  background-color: var(--v2-surface);
  background-image: var(--pixel-dither);
  border: 1px solid var(--v2-line);
  box-shadow: var(--pixel-keycap);
  transition: transform 170ms steps(5, end), background-color 160ms steps(3, end), border-color 160ms ease;
}

.switch input:checked + .switch-track {
  background-color: var(--focus-color);
  background-image: var(--pixel-dither);
  border-color: color-mix(in srgb, #000 18%, var(--focus-color));
  box-shadow: inset 0 1px 2px color-mix(in srgb, #000 22%, transparent);
}

.switch input:checked + .switch-track::before {
  opacity: 0.88;
}

.switch input:checked + .switch-track::after {
  transform: translate3d(18px, 0, 0);
  background-color: var(--v2-on-accent);
  border-color: color-mix(in srgb, #000 14%, transparent);
}

.switch input:focus-visible + .switch-track {
  outline: 2px solid color-mix(in srgb, var(--focus-color) 80%, white);
  outline-offset: 2px;
}

.mirror-sources {
  margin-top: 8px;
}

.mirror-sources-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.source-probe-btn {
  flex-shrink: 0;
  border: none;
  background: transparent;
  color: color-mix(in srgb, var(--focus-color) 70%, #fff);
  font-size: 11px;
  font-family: inherit;
  padding: 2px 5px;
  border-radius: 4px;
  cursor: pointer;
  white-space: nowrap;
}

.source-probe-btn:hover {
  background: var(--ui-well);
}

.source-probe-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.source-status {
  display: block;
  margin-top: 4px;
  font-size: 11px;
  color: var(--v2-muted);
}

.row-spaced {
  margin-top: 8px;
}

.setting-option-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 8px;
}

.mirror-empty {
  display: block;
  margin-top: 4px;
  font-size: 11px;
  color: var(--v2-muted);
}

.mirror-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}

.mirror-chip {
  appearance: none;
  max-width: 170px;
  padding: 3px 9px;
  border-radius: 999px;
  border: 1px solid var(--v2-line);;
  background: var(--ui-well);
  color: var(--v2-secondary);
  font-size: 11px;
  font-family: inherit;
  line-height: 1.4;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: all 0.15s ease;
}

.mirror-chip:hover {
  background: var(--ui-well);
  color: var(--v2-ink);
}

.mirror-chip.muted {
  border-style: dashed;
  color: var(--v2-muted);
  text-decoration: line-through;
}

.mirror-chip.muted:hover {
  color: var(--v2-secondary);
}

.mirror-chip.selected {
  border-color: color-mix(in srgb, var(--focus-color) 55%, transparent);
  background: color-mix(in srgb, var(--focus-color) 12%, transparent);
  color: color-mix(in srgb, var(--focus-color) 85%, #fff);
}

.mirror-chip.selected:hover {
  background: color-mix(in srgb, var(--focus-color) 18%, transparent);
  color: color-mix(in srgb, var(--focus-color) 95%, #fff);
}

.collapsible-row {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0;
  border: none;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
  font-family: inherit;
}

.collapsible-row:hover .update-label {
  color: var(--v2-ink);
}

.collapsible-chevron {
  width: 14px;
  height: 14px;
  margin-right: 3px;
  color: var(--v2-muted);
  flex-shrink: 0;
  transition: transform 0.2s ease;
}

.collapsible-chevron.open {
  transform: rotate(180deg);
}

.email-form {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 6px;
}

.email-input {
  width: 100%;
  box-sizing: border-box;
  padding: 7px 10px;
  border-radius: 7px;
  border: 1px solid var(--v2-line);;
  background: var(--ui-well);
  color: var(--v2-ink);
  font-size: 12px;
  font-family: inherit;
  outline: none;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.email-input::placeholder {
  color: var(--v2-muted);
}

.email-input:focus {
  border-color: color-mix(in srgb, var(--focus-color) 50%, transparent);
  background: var(--ui-well);
}

.email-provider-options {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.email-provider-option {
  padding: 5px 10px;
  border-radius: 999px;
  border: 1px solid var(--v2-line);;
  background: var(--ui-well);
  color: var(--v2-secondary);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.15s ease;
}

.email-provider-option:hover {
  background: var(--ui-well);
  color: var(--v2-ink);
}

.email-provider-option.active {
  background-color: var(--focus-color);
  background-image: var(--pixel-dither);
  border-color: color-mix(in srgb, #000 18%, var(--focus-color));
  box-shadow: var(--pixel-bevel-sm);
  color: var(--v2-on-accent);
}

.email-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
}

.email-status {
  margin-top: 2px;
  font-size: 11px;
  color: var(--v2-muted);
  line-height: 1.4;
}

.email-status.error {
  color: var(--v2-danger);
}

.email-status.success {
  color: var(--v2-break);
}

.email-hint {
  margin-top: 3px;
  padding-top: 6px;
  border-top: 1px solid var(--v2-line);
  font-size: 10.5px;
  color: var(--v2-muted);
  line-height: 1.4;
}

.update-action-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
  min-width: 0;
}

.update-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 6px;
  border: 1px solid var(--v2-line);;
  background: var(--ui-well);
  color: var(--v2-ink);
  font-size: 12px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease, color 0.2s ease;
}

.update-btn:hover:not(:disabled) {
  background: var(--ui-hover);
  border-color: var(--v2-muted);
  color: var(--v2-ink);
}

.update-btn.primary {
  background-color: var(--focus-color);
  background-image: var(--pixel-dither);
  border-color: color-mix(in srgb, #000 18%, var(--focus-color));
  box-shadow: var(--pixel-bevel-sm);
  color: var(--v2-on-accent);
}

.update-btn.danger {
  background: rgba(248, 113, 113, 0.06);
  border-color: rgba(248, 113, 113, 0.22);
  color: rgba(248, 113, 113, 0.9);
}

.update-btn.danger:hover:not(:disabled) {
  background: rgba(248, 113, 113, 0.14);
  border-color: rgba(248, 113, 113, 0.4);
  color: #fca5a5;
}

.update-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.update-status {
  margin-top: 4px;
  font-size: 11px;
  line-height: 1.45;
  color: var(--v2-muted);
  min-width: 0;
  white-space: pre-wrap;
  word-break: break-word;
}

.update-status.success {
  color: var(--v2-break);
}

.update-status.error {
  color: var(--v2-danger);
}

.update-recovery {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 7px;
  font-size: 10px;
  line-height: 1.4;
  color: var(--v2-muted);
}

.update-link-btn {
  appearance: none;
  border: none;
  background: transparent;
  color: var(--focus-color);
  font: inherit;
  font-weight: 700;
  padding: 2px 0;
  cursor: pointer;
}

.update-link-btn:hover {
  color: color-mix(in srgb, var(--focus-color) 72%, white);
}

.mini-spinner {
  width: 11px;
  height: 11px;
  border: 2px solid var(--v2-line);;
  border-top-color: currentColor;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* 外观 - 滑块行 */
.slider-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.slider-row:last-child {
  margin-bottom: 0;
}

.slider-label {
  font-size: 12.5px;
  font-weight: 500;
  line-height: 1.4;
  color: var(--v2-ink);
  width: 100px;
  flex-shrink: 0;
}

.opacity-hint {
  margin: 0 0 6px;
  font-size: 10.5px;
  line-height: 1.4;
  color: var(--v2-muted);
}

.opacity-slider {
  flex: 1;
  min-width: 0;
  appearance: none;
  height: 6px;
  border-radius: 2px;
  background-image:
    repeating-linear-gradient(
      90deg,
      transparent 0 10px,
      var(--v2-shell) 10px 13px
    ),
    linear-gradient(
      90deg,
      var(--v2-accent) 0 var(--slider-pct, 50%),
      color-mix(in srgb, var(--v2-ink) 12%, transparent) var(--slider-pct, 50%) 100%
    );
  outline: none;
  cursor: pointer;
}

.opacity-slider::-webkit-slider-thumb {
  appearance: none;
  width: 10px;
  height: 14px;
  border-radius: 2px;
  background: var(--v2-accent);
  border: 1px solid color-mix(in srgb, #000 18%, var(--v2-accent));
  cursor: pointer;
  box-shadow: var(--pixel-bevel-sm);
}

.opacity-value {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  color: var(--v2-secondary);
  min-width: 44px;
  flex-shrink: 0;
}

/* 番茄钟 */
.duration-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

@media (max-width: 349px) {
  .duration-grid {
    grid-template-columns: 1fr;
  }
}

.duration-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.duration-label {
  font-size: 12px;
  color: var(--v2-secondary);
  flex-shrink: 0;
}

.stepper {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 2px;
  background-color: var(--ui-well);
  background-image: var(--pixel-dot-grid);
  border: 1px solid var(--v2-line);
  border-radius: 8px;
  box-shadow: var(--pixel-lcd-well);
}

.stepper-btn {
  background: var(--v2-surface);
  border: 1px solid var(--v2-line);
  border-radius: 5px;
  box-shadow: var(--pixel-keycap);
  color: var(--v2-secondary);
  font-size: 13px;
  font-weight: 700;
  width: 24px;
  height: 24px;
  cursor: pointer;
  transition: background 140ms ease, color 140ms ease, transform 120ms ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.stepper-btn:hover {
  background: var(--ui-hover);
  border-color: color-mix(in srgb, var(--v2-accent) 34%, var(--v2-line));
  color: var(--v2-ink);
}

.stepper-btn:active {
  transform: translate3d(0, 1px, 0);
  box-shadow: var(--pixel-keycap-pressed);
}

.stepper-value {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--v2-accent);
  min-width: 34px;
  padding: 0 4px;
}

.stepper-pixel-num {
  min-height: 16px;
}

.duration-unit {
  font-size: 11px;
  color: var(--v2-muted);
}

/* 快捷操作 */
.shortcut-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 2px;
}

.shortcut-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--v2-ink);
}

.shortcut-recorder {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 112px;
  height: 26px;
  padding: 0 9px;
  border: 1px solid var(--v2-line);;
  border-radius: 6px;
  background: var(--ui-well);
  color: var(--v2-ink);
  font-size: 12px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.2s;
}

.shortcut-recorder:hover {
  background: var(--ui-hover);
  border-color: var(--v2-muted);
}

.shortcut-recorder.recording {
  border-color: var(--focus-color);
  background: color-mix(in srgb, var(--focus-color) 15%, transparent);
  box-shadow: 0 0 0 1px var(--focus-color);
  animation: recorder-pulse 1.2s ease-in-out infinite;
}

@keyframes recorder-pulse {
  0%, 100% { box-shadow: 0 0 0 1px var(--focus-color); }
  50% { box-shadow: 0 0 0 2px var(--focus-color), 0 0 8px color-mix(in srgb, var(--focus-color) 40%, transparent); }
}

.recording-hint {
  color: var(--focus-color);
  font-weight: 500;
}

.shortcut-hint {
  font-size: 9.5px;
  color: var(--v2-muted);
  white-space: nowrap;
}

/* 主题 */
.theme-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.theme-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 6px 3px;
  border-radius: 8px;
  border: 1px solid var(--v2-line);
  background: var(--ui-well);
  cursor: pointer;
  transition: all 0.2s;
  text-align: center;
}

.theme-card:hover {
  background: var(--ui-well);
  border-color: var(--v2-muted);
}

.theme-card.active {
  background-color: color-mix(in srgb, var(--v2-accent) 9%, var(--v2-surface));
  background-image: repeating-conic-gradient(color-mix(in srgb, var(--v2-accent) 9%, transparent) 0% 25%, transparent 0% 50%);
  background-size: 6px 6px;
  border-color: var(--v2-accent);
  box-shadow: inset 0 -2px 0 color-mix(in srgb, var(--v2-accent) 42%, transparent);
}

.theme-preview {
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 4px 6px;
  border-radius: 6px;
  background: var(--v2-surface);
  border: 1px solid var(--v2-line);
  box-shadow: var(--pixel-lcd-well);
}

.preview-pill {
  width: 14px;
  height: 8px;
  border-radius: 2px;
  box-shadow: var(--pixel-bevel-sm);
}

.preview-block {
  width: 8px;
  height: 8px;
  border-radius: 2px;
  box-shadow: var(--pixel-bevel-sm);
}

.preview-bar {
  width: 8px;
  height: 4px;
  border-radius: 1px;
  opacity: 0.78;
}

.theme-name {
  font-size: 10px;
  color: var(--v2-ink);
  line-height: 1.2;
  white-space: nowrap;
}

.theme-check {
  position: absolute;
  top: 2px;
  right: 4px;
  font-size: 10px;
  color: var(--focus-color);
  font-weight: 700;
}

.settings-page::-webkit-scrollbar { width: 4px; }
.settings-page::-webkit-scrollbar-track { background: transparent; }
.settings-page::-webkit-scrollbar-thumb { background: var(--ui-hover); border-radius: 2px; }

/* 毛玻璃模糊效果 */
.settings-page.blurred {
  filter: blur(8px);
  opacity: 0.7;
  transition: filter 0.2s ease-out, opacity 0.2s ease-out;
}
.motto-editor {
  width: 100%;
  box-sizing: border-box;
  resize: vertical;
  min-height: 76px;
  border: 1px solid var(--v2-line);;
  background: var(--ui-well);
  border-radius: 8px;
  color: inherit;
  font: inherit;
  font-size: 11px;
  line-height: 1.6;
  padding: 8px 9px;
  outline: none;
}

.motto-editor:focus {
  border-color: var(--v2-muted);
}

.motto-hint {
  margin-top: 4px;
}
</style>
