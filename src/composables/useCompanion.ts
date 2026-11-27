import { computed, readonly, ref, watch } from 'vue'
import { emit, listen } from '@tauri-apps/api/event'
import { BaseDirectory, mkdir, readTextFile, writeTextFile } from '@tauri-apps/plugin-fs'
import catalog from '../data/companionCatalog.json'
import { useDailyStats } from './useDailyStats'

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

export type CompanionBackgroundCategory = 'indoor' | 'outdoor' | 'night' | 'premium'

export type CompanionBackgroundEffect =
  | 'none'
  | 'stars'
  | 'fireflies'
  | 'petals'
  | 'rain'
  | 'bubbles'
  | 'steam'
  | 'sparkle'

export interface CompanionBackgroundItem {
  id: string
  name: string
  category: CompanionBackgroundCategory
  cost: number
  url: string
  ownerAnimalId: string | null
  ownerAnimalName: string
  premium?: boolean
  effect: CompanionBackgroundEffect
  effectLabel?: string
}

export interface CompanionRecord {
  minutes: number
  collectedAt: number | null
  nickname?: string
}

export interface CompanionSyncPayload {
  selectedId: string
  records: Record<string, CompanionRecord>
  unlockedBackgrounds?: string[]
  spentBackgroundPoints?: number
  selectedBackgrounds?: Record<string, string>
}

export type CompanionReactionKind = 'mail' | 'notif' | 'task-done' | 'done'

export interface CompanionReaction {
  kind: CompanionReactionKind
  whisper: string
  id: number
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
const premiumSprites = import.meta.glob<string>('../assets/companions/premium/*.png', {
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

const BACKGROUND_META: Record<string, { name: string; category: Exclude<CompanionBackgroundCategory, 'premium'>; cost: number; effect?: CompanionBackgroundEffect; effectLabel?: string }> = {
  'cat-orange': { name: '阳光窗台', category: 'indoor', cost: 30 },
  'cat-calico': { name: '小花房', category: 'indoor', cost: 40 },
  'cat-tuxedo': { name: '静谧书店', category: 'indoor', cost: 45 },
  'cat-silver': { name: '雨天窗边', category: 'indoor', cost: 45, effect: 'rain', effectLabel: '细雨' },
  'cat-ragdoll': { name: '云朵卧室', category: 'indoor', cost: 50 },
  'cat-siamese': { name: '午后茶歇', category: 'indoor', cost: 40, effect: 'steam', effectLabel: '茶雾' },
  'cat-black': { name: '月光阁楼', category: 'night', cost: 60, effect: 'stars', effectLabel: '星光' },
  'cat-white': { name: '樱花信笺', category: 'outdoor', cost: 60, effect: 'petals', effectLabel: '落樱' },
  'dog-shiba': { name: '秋日林道', category: 'outdoor', cost: 40 },
  'dog-corgi': { name: '草坪邮局', category: 'outdoor', cost: 45 },
  'dog-golden': { name: '湖畔栈桥', category: 'outdoor', cost: 50 },
  'dog-collie': { name: '牧场木栏', category: 'outdoor', cost: 40 },
  'dog-husky': { name: '初雪松林', category: 'outdoor', cost: 60, effect: 'sparkle', effectLabel: '微雪' },
  'dog-bichon': { name: '暖香面包房', category: 'indoor', cost: 50, effect: 'steam', effectLabel: '暖雾' },
  'dog-dachshund': { name: '午后庭院', category: 'outdoor', cost: 40 },
  'dog-dalmatian': { name: '微风海湾', category: 'outdoor', cost: 60, effect: 'bubbles', effectLabel: '海风' },
  'fox-red': { name: '枫林小径', category: 'outdoor', cost: 50, effect: 'petals', effectLabel: '落叶' },
  'fox-arctic': { name: '极光小屋', category: 'night', cost: 90, effect: 'stars', effectLabel: '极光星' },
  'fox-fennec': { name: '星夜沙丘', category: 'night', cost: 75, effect: 'stars', effectLabel: '星夜' },
  'fox-silver': { name: '月亮湖畔', category: 'night', cost: 75, effect: 'stars', effectLabel: '月华' },
  'fox-cross': { name: '苔藓森林', category: 'outdoor', cost: 50, effect: 'fireflies', effectLabel: '萤火' },
  'fox-sand': { name: '风车花田', category: 'outdoor', cost: 60, effect: 'petals', effectLabel: '微风' },
}

const PREMIUM_BACKGROUND_SPECS: Array<{
  id: string
  file: string
  name: string
  cost: number
  effect: CompanionBackgroundEffect
  effectLabel: string
}> = [
  { id: 'motif-star', file: 'motif-star.png', name: '星际信号', cost: 120, effect: 'stars', effectLabel: '流星闪烁' },
  { id: 'motif-camp', file: 'motif-camp.png', name: '篝火营地', cost: 100, effect: 'fireflies', effectLabel: '营火萤光' },
  { id: 'motif-night', file: 'motif-night.png', name: '月夜梦境', cost: 110, effect: 'stars', effectLabel: '月夜星芒' },
  { id: 'motif-crystal', file: 'motif-crystal.png', name: '晶石收藏', cost: 120, effect: 'sparkle', effectLabel: '晶石微尘' },
  { id: 'motif-sea', file: 'motif-sea.png', name: '海底来信', cost: 110, effect: 'bubbles', effectLabel: '海蓝气泡' },
  { id: 'motif-island', file: 'motif-island.png', name: '海岸灯塔', cost: 90, effect: 'bubbles', effectLabel: '海风微光' },
  { id: 'motif-weather', file: 'motif-weather.png', name: '雨后天气', cost: 90, effect: 'rain', effectLabel: '晴雨虹光' },
  { id: 'motif-flower', file: 'motif-flower.png', name: '花事慢开', cost: 90, effect: 'petals', effectLabel: '花瓣轻飘' },
  { id: 'motif-sprout', file: 'motif-sprout.png', name: '森林幼苗', cost: 80, effect: 'fireflies', effectLabel: '林间萤点' },
  { id: 'motif-mountain', file: 'motif-mountain.png', name: '山野旅程', cost: 90, effect: 'sparkle', effectLabel: '山风微雪' },
  { id: 'motif-coffee', file: 'motif-coffee.png', name: '咖啡手账', cost: 80, effect: 'steam', effectLabel: '咖啡热气' },
  { id: 'motif-tea', file: 'motif-tea.png', name: '茶室清欢', cost: 80, effect: 'steam', effectLabel: '竹影茶雾' },
  { id: 'motif-tomato', file: 'motif-tomato.png', name: '番茄温室', cost: 60, effect: 'sparkle', effectLabel: '温室日光' },
  { id: 'motif-post', file: 'motif-post.png', name: '信笺邮局', cost: 70, effect: 'petals', effectLabel: '微风信笺' },
  { id: 'motif-game', file: 'motif-game.png', name: '复古存档', cost: 100, effect: 'sparkle', effectLabel: '像素星光' },
  { id: 'motif-paper', file: 'motif-paper.png', name: '纸船远行', cost: 80, effect: 'bubbles', effectLabel: '涟漪微光' },
  { id: 'motif-cat', file: 'motif-cat.png', name: '猫舍小窗', cost: 70, effect: 'steam', effectLabel: '暖阳微尘' },
  { id: 'motif-rabbit', file: 'motif-rabbit.png', name: '兔兔花园', cost: 70, effect: 'petals', effectLabel: '花园落瓣' },
]

export const companionPremiumBackgrounds: CompanionBackgroundItem[] = PREMIUM_BACKGROUND_SPECS.map((spec) => ({
  id: spec.id,
  name: spec.name,
  category: 'premium',
  cost: spec.cost,
  url: assetByKey(premiumSprites, spec.file),
  ownerAnimalId: null,
  ownerAnimalName: '高级动态背景',
  premium: true,
  effect: spec.effect,
  effectLabel: spec.effectLabel,
}))

export const companionBackgrounds: CompanionBackgroundItem[] = [
  ...companionAnimals.map((animal) => {
    const meta = BACKGROUND_META[animal.id] ?? { name: animal.name, category: 'outdoor' as const, cost: 45 }
    return {
      id: animal.id,
      name: meta.name,
      category: meta.category as CompanionBackgroundCategory,
      cost: meta.cost,
      url: animal.backgroundUrl,
      ownerAnimalId: animal.id,
      ownerAnimalName: animal.name,
      premium: false,
      effect: meta.effect ?? 'none',
      effectLabel: meta.effectLabel,
    }
  }),
  ...companionPremiumBackgrounds,
]

const DEFAULT_COMPANION_ID = companionAnimals[0]?.id ?? 'cat-orange'

const selectedId = ref<string>(DEFAULT_COMPANION_ID)
const companionRecords = ref<Record<string, CompanionRecord>>({})
const unlockedBackgrounds = ref<string[]>([])
const spentBackgroundPoints = ref<number>(0)
const selectedBackgrounds = ref<Record<string, string>>({})
const loaded = ref(false)
const statsSection = ref<'stats' | 'companions'>('stats')

let loadingPromise: Promise<void> | undefined
let pendingSave = Promise.resolve()
let suppressEmit = false
let syncListenersInstalled = false
let reactionListenerInstalled = false
let reactionTimer: ReturnType<typeof setTimeout> | null = null
let reactionSeq = 0

const activeReaction = ref<CompanionReaction | null>(null)

const REACTION_WHISPERS: Record<CompanionReactionKind, Record<'cat' | 'dog' | 'fox', string>> = {
  mail: {
    cat: '叼来一封新邮件',
    dog: '汪！有新邮件到了',
    fox: '竖起耳朵：收到新邮件',
  },
  notif: {
    cat: '竖起耳朵望了望通知',
    dog: '提醒你：有新消息哦',
    fox: '轻点尾巴提醒有消息',
  },
  'task-done': {
    cat: '呼噜呼噜 · 做得真棒',
    dog: '开心摇尾巴 · 又完成一件!',
    fox: '满意点头 · 推进顺利',
  },
  done: {
    cat: '蹭蹭你 · 这一轮很棒',
    dog: '辛苦啦 · 休息一下吧',
    fox: '暖光相伴 · 专注达成',
  },
}

function applyCompanionReaction(kind: CompanionReactionKind, customWhisper?: string) {
  const family = selectedCompanion.value?.family ?? 'cat'
  const whisper = customWhisper?.trim() || REACTION_WHISPERS[kind][family]
  reactionSeq += 1
  activeReaction.value = { kind, whisper, id: reactionSeq }
  if (reactionTimer !== null) clearTimeout(reactionTimer)
  const duration = kind === 'mail' || kind === 'done' ? 4200 : 3200
  reactionTimer = setTimeout(() => {
    activeReaction.value = null
    reactionTimer = null
  }, duration)
}

export function triggerCompanionReaction(kind: CompanionReactionKind, customWhisper?: string) {
  applyCompanionReaction(kind, customWhisper)
  emit('companion-reaction', { kind, whisper: customWhisper }).catch(() => {})
}

export function installCompanionReactionListener() {
  if (reactionListenerInstalled) return
  reactionListenerInstalled = true
  listen<{ kind: CompanionReactionKind; whisper?: string }>('companion-reaction', (event) => {
    if (event.payload?.kind) {
      applyCompanionReaction(event.payload.kind, event.payload.whisper)
    }
  }).catch(() => {})
  if (typeof window !== 'undefined') {
    window.addEventListener('flowisle:companion-reaction', (event: Event) => {
      const detail = (event as CustomEvent<{ kind?: CompanionReactionKind; whisper?: string }>).detail
      if (detail?.kind) {
        triggerCompanionReaction(detail.kind, detail.whisper)
      }
    })
  }
}

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
    const nickname = typeof rec.nickname === 'string' && rec.nickname.trim() ? rec.nickname.trim().slice(0, 16) : undefined
    clean[id] = nickname ? { minutes, collectedAt, nickname } : { minutes, collectedAt }
  }
  return clean
}

function normalizeUnlockedBackgrounds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const valid = new Set(companionBackgrounds.map(b => b.id))
  const unique: string[] = []
  for (const id of raw) {
    if (typeof id === 'string' && valid.has(id) && !unique.includes(id)) unique.push(id)
  }
  return unique
}

function normalizeSelectedBackgrounds(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object') return {}
  const validAnimals = new Set(companionAnimals.map(a => a.id))
  const validBgs = new Set(companionBackgrounds.map(b => b.id))
  const clean: Record<string, string> = {}
  for (const [animalId, bgId] of Object.entries(raw as Record<string, unknown>)) {
    if (validAnimals.has(animalId) && typeof bgId === 'string' && validBgs.has(bgId) && bgId !== animalId) {
      clean[animalId] = bgId
    }
  }
  return clean
}

function normalizeSpentPoints(raw: unknown): number {
  return typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 0
}

async function loadFromDisk() {
  try {
    const raw = await readTextFile(COMPANION_FILE, { baseDir: BaseDirectory.AppData })
    const parsed = JSON.parse(raw) as Partial<CompanionSyncPayload>
    suppressEmit = true
    selectedId.value = normalizeCompanionId(parsed.selectedId)
    companionRecords.value = normalizeRecords(parsed.records)
    unlockedBackgrounds.value = normalizeUnlockedBackgrounds(parsed.unlockedBackgrounds)
    spentBackgroundPoints.value = normalizeSpentPoints(parsed.spentBackgroundPoints)
    selectedBackgrounds.value = normalizeSelectedBackgrounds(parsed.selectedBackgrounds)
  } catch {
    selectedId.value = DEFAULT_COMPANION_ID
    companionRecords.value = {}
    unlockedBackgrounds.value = []
    spentBackgroundPoints.value = 0
    selectedBackgrounds.value = {}
  } finally {
    suppressEmit = false
    loaded.value = true
  }
}

function buildSyncPayload(): CompanionSyncPayload {
  return {
    selectedId: selectedId.value,
    records: companionRecords.value,
    unlockedBackgrounds: unlockedBackgrounds.value,
    spentBackgroundPoints: spentBackgroundPoints.value,
    selectedBackgrounds: selectedBackgrounds.value,
  }
}

function saveToDisk() {
  if (!loaded.value) return
  const snapshot = JSON.stringify(buildSyncPayload())
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
  emit('companion-state-update', buildSyncPayload()).catch(() => {})
}

watch(
  [selectedId, companionRecords, unlockedBackgrounds, spentBackgroundPoints, selectedBackgrounds],
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

export function setCompanionNickname(id: string, rawNickname: string) {
  if (!companionAnimals.some(a => a.id === id)) return
  const prev = companionRecord(id)
  const clean = rawNickname.trim().slice(0, 16)
  const next: CompanionRecord = { minutes: prev.minutes, collectedAt: prev.collectedAt }
  if (clean) next.nickname = clean
  companionRecords.value = {
    ...companionRecords.value,
    [id]: next,
  }
}

export function companionDisplayName(animal: CompanionAnimal): string {
  const custom = companionRecord(animal.id).nickname?.trim()
  return custom || animal.name
}

export const totalCompanionMinutes = computed(() =>
  Object.values(companionRecords.value).reduce((sum, rec) => sum + Math.floor(rec.minutes || 0), 0),
)

export function isBackgroundUnlockedFor(animalId: string, bgId: string): boolean {
  return bgId === animalId || unlockedBackgrounds.value.includes(bgId)
}

export function effectiveBackgroundId(animalId: string): string {
  const chosen = selectedBackgrounds.value[animalId]
  if (chosen && isBackgroundUnlockedFor(animalId, chosen)) return chosen
  return animalId
}

export function effectiveBackgroundItem(animalId: string): CompanionBackgroundItem {
  const bgId = effectiveBackgroundId(animalId)
  return companionBackgrounds.find(b => b.id === bgId)
    ?? companionBackgrounds.find(b => b.id === animalId)
    ?? companionBackgrounds[0]
}

export function effectiveBackgroundUrl(animal: CompanionAnimal): string {
  return effectiveBackgroundItem(animal.id)?.url || animal.backgroundUrl
}

export function effectiveBackgroundName(animalId: string): string {
  return effectiveBackgroundItem(animalId)?.name ?? ''
}

export function equipBackground(animalId: string, bgId: string): boolean {
  if (!companionAnimals.some(a => a.id === animalId)) return false
  if (!isBackgroundUnlockedFor(animalId, bgId)) return false
  const next = { ...selectedBackgrounds.value }
  if (bgId === animalId) {
    delete next[animalId]
  } else {
    next[animalId] = bgId
  }
  selectedBackgrounds.value = next
  return true
}

export function resetBackground(animalId: string) {
  if (!(animalId in selectedBackgrounds.value)) return
  const next = { ...selectedBackgrounds.value }
  delete next[animalId]
  selectedBackgrounds.value = next
}

export function redeemBackground(bgId: string, availablePoints: number): boolean {
  const item = companionBackgrounds.find(b => b.id === bgId)
  if (!item) return false
  if (unlockedBackgrounds.value.includes(bgId)) return true
  if (availablePoints < item.cost) return false
  unlockedBackgrounds.value = [...unlockedBackgrounds.value, bgId]
  spentBackgroundPoints.value += item.cost
  return true
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
  if (payload.unlockedBackgrounds !== undefined) {
    unlockedBackgrounds.value = normalizeUnlockedBackgrounds(payload.unlockedBackgrounds)
  }
  if (payload.spentBackgroundPoints !== undefined) {
    spentBackgroundPoints.value = normalizeSpentPoints(payload.spentBackgroundPoints)
  }
  if (payload.selectedBackgrounds !== undefined) {
    selectedBackgrounds.value = normalizeSelectedBackgrounds(payload.selectedBackgrounds)
  }
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
  const { allTimeStats } = useDailyStats()
  const totalFocusPoints = computed(() =>
    Math.max(Math.floor(allTimeStats.value.focusMinutes || 0), totalCompanionMinutes.value),
  )
  const availableFocusPoints = computed(() =>
    Math.max(0, totalFocusPoints.value - spentBackgroundPoints.value),
  )
  return {
    animals: companionAnimals,
    backgrounds: companionBackgrounds,
    actions: approvedCompanionActions,
    selectedId: readonly(selectedId),
    selectedCompanion,
    selectedBadges,
    activeReaction: readonly(activeReaction),
    records: readonly(companionRecords),
    unlockedBackgrounds: readonly(unlockedBackgrounds),
    selectedBackgrounds: readonly(selectedBackgrounds),
    spentBackgroundPoints: readonly(spentBackgroundPoints),
    totalFocusPoints,
    availableFocusPoints,
    statsSection,
    loaded: readonly(loaded),
    companionRecord,
    getCompanionStage,
    selectCompanion,
    recordCompanionMinutes,
    collectCompanionPicture,
    setCompanionNickname,
    companionDisplayName,
    isBackgroundUnlockedFor,
    effectiveBackgroundId,
    effectiveBackgroundItem,
    effectiveBackgroundUrl,
    effectiveBackgroundName,
    equipBackground,
    resetBackground,
    redeemBackground,
    triggerCompanionReaction,
    installCompanionReactionListener,
    applyExternalCompanionState,
    installCompanionSyncResponder,
  }
}
