import { computed, readonly, ref, watch } from 'vue'
import { emit, listen } from '@tauri-apps/api/event'
import { BaseDirectory, mkdir, readTextFile, writeTextFile } from '@tauri-apps/plugin-fs'
import catalog from '../data/companionCatalog.json'

export const ALBUM_MINUTES = 120
export const COMPANION_FILE = 'focus-island/companions.json'

export interface CompanionPlacement {
  x: number
  y: number
  width: number
  height: number
}

export interface CompanionAnimal {
  id: string
  name: string
  family: 'cat' | 'dog' | 'fox'
  placement: CompanionPlacement
  sitUrl: string
  sleepUrl: string
  backgroundUrl: string
  portraitUrl: string
  badges: Record<string, string>
}

export interface ApprovedAction {
  key: string
  title: string
  animal: string
  size: [number, number]
  url: string
}

export interface CompanionRecord {
  minutes: number
  collectedAt: number | null
}

export interface CompanionSyncPayload {
  selectedId: string
  records: Record<string, CompanionRecord>
}

export interface CompanionStage {
  tier: 'new' | 'growing' | 'album' | 'bonded'
  label: string
  nextLabel: string | null
  targetMinutes: number
  remainingMinutes: number
  progressPercent: number
}

export const BADGE_ACHIEVEMENT_ORDER = [
  'star-1',
  'star-2',
  'star-3',
  'streak-1',
  'streak-2',
  'streak-3',
  'early-bird',
  'night-owl',
] as const

const nativeSprites = import.meta.glob<string>('../assets/companions/native/*.png', {
  eager: true,
  import: 'default',
})
const backgroundSprites = import.meta.glob<string>('../assets/companions/backgrounds/*.png', {
  eager: true,
  import: 'default',
})
const portraitSprites = import.meta.glob<string>('../assets/companions/portraits/*.png', {
  eager: true,
  import: 'default',
})
const actionSprites = import.meta.glob<string>('../assets/companions/actions/*.png', {
  eager: true,
  import: 'default',
})

function assetByKey(map: Record<string, string>, fileName: string): string {
  const hit = Object.entries(map).find(([key]) => key.endsWith(`/${fileName}`))
  return hit ? hit[1] : ''
}

export const companionAnimals: CompanionAnimal[] = catalog.animals.map((item) => {
  const badges: Record<string, string> = {}
  BADGE_ACHIEVEMENT_ORDER.forEach((achievementId, index) => {
    badges[achievementId] = assetByKey(nativeSprites, `${item.id}-v6-${index}.png`)
  })
  return {
    id: item.id,
    name: item.name,
    family: item.family as 'cat' | 'dog' | 'fox',
    placement: item.placement,
    sitUrl: assetByKey(nativeSprites, `${item.id}-sit.png`),
    sleepUrl: assetByKey(nativeSprites, `${item.id}-sleep.png`),
    backgroundUrl: assetByKey(backgroundSprites, `${item.id}.png`),
    portraitUrl: assetByKey(portraitSprites, `${item.id}.png`),
    badges,
  }
})

export const approvedCompanionActions: ApprovedAction[] = catalog.actions.map((item) => ({
  key: item.key,
  title: item.title,
  animal: item.animal,
  size: [item.size[0], item.size[1]],
  url: assetByKey(actionSprites, `${item.key}.png`),
}))

const DEFAULT_COMPANION_ID = companionAnimals[0]?.id ?? 'cat-orange'

const selectedId = ref<string>(DEFAULT_COMPANION_ID)
const companionRecords = ref<Record<string, CompanionRecord>>({})
const loaded = ref(false)
const statsSection = ref<'stats' | 'companions'>('stats')

let loadingPromise: Promise<void> | undefined
let pendingSave = Promise.resolve()
let suppressEmit = false
let syncListenersInstalled = false

function normalizeCompanionId(id: unknown): string {
  if (typeof id === 'string' && companionAnimals.some(a => a.id === id)) return id
  return DEFAULT_COMPANION_ID
}

function normalizeRecords(raw: unknown): Record<string, CompanionRecord> {
  if (!raw || typeof raw !== 'object') return {}
  const clean: Record<string, CompanionRecord> = {}
  for (const [id, entry] of Object.entries(raw as Record<string, unknown>)) {
    if (!companionAnimals.some(a => a.id === id)) continue
    if (!entry || typeof entry !== 'object') continue
    const rec = entry as Partial<CompanionRecord>
    const minutes = typeof rec.minutes === 'number' && Number.isFinite(rec.minutes) && rec.minutes >= 0 ? rec.minutes : 0
    const collectedAt = typeof rec.collectedAt === 'number' && Number.isFinite(rec.collectedAt) ? rec.collectedAt : null
    clean[id] = { minutes, collectedAt }
  }
  return clean
}

async function loadFromDisk() {
  try {
    const raw = await readTextFile(COMPANION_FILE, { baseDir: BaseDirectory.AppData })
    const parsed = JSON.parse(raw) as Partial<CompanionSyncPayload>
    suppressEmit = true
    selectedId.value = normalizeCompanionId(parsed.selectedId)
    companionRecords.value = normalizeRecords(parsed.records)
  } catch {
    selectedId.value = DEFAULT_COMPANION_ID
    companionRecords.value = {}
  } finally {
    suppressEmit = false
    loaded.value = true
  }
}

function saveToDisk() {
  if (!loaded.value) return
  const payload: CompanionSyncPayload = {
    selectedId: selectedId.value,
    records: companionRecords.value,
  }
  const snapshot = JSON.stringify(payload)
  pendingSave = pendingSave.then(async () => {
    try {
      await mkdir('focus-island', { baseDir: BaseDirectory.AppData, recursive: true })
      await writeTextFile(COMPANION_FILE, snapshot, { baseDir: BaseDirectory.AppData })
    } catch (err) {
      console.error('Failed to save companions', err)
    }
  })
}

function broadcastState() {
  const payload: CompanionSyncPayload = {
    selectedId: selectedId.value,
    records: companionRecords.value,
  }
  emit('companion-state-update', payload).catch(() => {})
}

watch(
  [selectedId, companionRecords],
  () => {
    if (suppressEmit) {
      suppressEmit = false
      return
    }
    saveToDisk()
    broadcastState()
  },
  { deep: true },
)

export function companionRecord(id: string): CompanionRecord {
  return companionRecords.value[id] ?? { minutes: 0, collectedAt: null }
}

export function getCompanionStage(minutes: number, collectedAt: number | null): CompanionStage {
  const mins = Math.max(0, Math.floor(minutes))
  if (mins >= 300) {
    return {
      tier: 'bonded',
      label: '常伴搭档',
      nextLabel: null,
      targetMinutes: 300,
      remainingMinutes: 0,
      progressPercent: 100,
    }
  }
  if (mins >= ALBUM_MINUTES) {
    return {
      tier: 'album',
      label: collectedAt ? '已收藏场景' : '可收藏场景',
      nextLabel: '常伴搭档',
      targetMinutes: 300,
      remainingMinutes: 300 - mins,
      progressPercent: Math.round((mins / 300) * 100),
    }
  }
  if (mins >= 30) {
    return {
      tier: 'growing',
      label: '慢慢熟络',
      nextLabel: '收藏场景画',
      targetMinutes: ALBUM_MINUTES,
      remainingMinutes: ALBUM_MINUTES - mins,
      progressPercent: Math.round((mins / ALBUM_MINUTES) * 100),
    }
  }
  return {
    tier: 'new',
    label: '初遇时刻',
    nextLabel: mins > 0 ? '熟悉彼此' : '开始第一段陪伴',
    targetMinutes: 30,
    remainingMinutes: Math.max(0, 30 - mins),
    progressPercent: Math.min(100, Math.round((mins / ALBUM_MINUTES) * 100)),
  }
}

export function selectCompanion(id: string) {
  if (!companionAnimals.some(a => a.id === id)) return
  selectedId.value = id
}

export function recordCompanionMinutes(id: string, minutes: number) {
  if (!companionAnimals.some(a => a.id === id)) return
  if (!Number.isFinite(minutes) || minutes <= 0) return
  const prev = companionRecord(id)
  companionRecords.value = {
    ...companionRecords.value,
    [id]: {
      ...prev,
      minutes: prev.minutes + minutes,
    },
  }
}

export function collectCompanionPicture(id: string) {
  const prev = companionRecord(id)
  if (!companionAnimals.some(a => a.id === id)) return
  if (prev.minutes < ALBUM_MINUTES || prev.collectedAt) return
  companionRecords.value = {
    ...companionRecords.value,
    [id]: {
      ...prev,
      collectedAt: Date.now(),
    },
  }
}

/** Deterministic zero-polling mood selector (xiaotang-daozai pattern using FlowIsle assets). */
export function resolveIslandCompanionSprite(
  animal: CompanionAnimal,
  mode: 'idle' | 'hover' | 'focus' | 'break' | 'alert' | 'done',
  minuteBucket = 0,
): { url: string; width: number; height: number } {
  if (mode === 'done' || mode === 'break') {
    const restAction = approvedCompanionActions.find(
      a => a.animal === animal.id && (a.key.endsWith('-rest') || a.key.endsWith('-curl') || a.key.endsWith('-bow')),
    )
    if (restAction && mode === 'done') {
      return { url: restAction.url, width: Math.round((restAction.size[0] / restAction.size[1]) * 18), height: 18 }
    }
    return { url: animal.sleepUrl, width: 18, height: 18 }
  }
  if (mode === 'alert') {
    return { url: animal.sleepUrl, width: 18, height: 18 }
  }
  if (mode === 'idle') {
    // Calm periodic resting glance every 4th minute without extra timers
    const hash = Math.abs((minuteBucket * 2654435761) | 0) % 7
    return {
      url: hash === 0 ? animal.sleepUrl : animal.sitUrl,
      width: 18,
      height: 18,
    }
  }
  return { url: animal.sitUrl, width: 18, height: 18 }
}

export function applyExternalCompanionState(payload: Partial<CompanionSyncPayload>) {
  suppressEmit = true
  selectedId.value = normalizeCompanionId(payload.selectedId)
  companionRecords.value = normalizeRecords(payload.records)
  loaded.value = true
}

export function installCompanionSyncResponder() {
  if (syncListenersInstalled) return
  syncListenersInstalled = true
  listen('companion-state-request', () => {
    broadcastState()
  }).catch(() => {})
}

export const selectedCompanion = computed<CompanionAnimal>(
  () => companionAnimals.find(a => a.id === selectedId.value) ?? companionAnimals[0],
)

export const selectedBadges = computed<Record<string, string>>(
  () => selectedCompanion.value?.badges ?? {},
)

export function useCompanion() {
  if (!loaded.value) loadingPromise ??= loadFromDisk()
  return {
    animals: companionAnimals,
    actions: approvedCompanionActions,
    selectedId: readonly(selectedId),
    selectedCompanion,
    selectedBadges,
    records: readonly(companionRecords),
    statsSection,
    loaded: readonly(loaded),
    companionRecord,
    getCompanionStage,
    selectCompanion,
    recordCompanionMinutes,
    collectCompanionPicture,
    applyExternalCompanionState,
    installCompanionSyncResponder,
  }
}
