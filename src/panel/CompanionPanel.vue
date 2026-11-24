<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import CompanionScene from '../components/CompanionScene.vue'
import StatNumber from '../components/StatNumber.vue'
import { triggerPixelBurstFromEvent } from '../utils/pixelSpark'
import {
  ALBUM_MINUTES,
  approvedCompanionActions,
  collectCompanionPicture,
  companionAnimals,
  companionDisplayName,
  companionRecord,
  getCompanionStage,
  selectCompanion,
  selectedCompanion,
  setCompanionNickname,
  type CompanionAnimal,
} from '../composables/useCompanion'

interface LegacyMotif {
  id: string
  name: string
  family: 'other'
  image: string
  scene: string
  detail: string
}

const companionExpanded = ref(false)
const showScene = ref(true)
const chooser = ref<HTMLDialogElement | null>(null)
const chooserTrigger = ref<HTMLButtonElement | null>(null)
const family = ref<'all' | 'cat' | 'dog' | 'fox' | 'other'>('all')
const legacyMotifs = ref<LegacyMotif[]>([])
const loadingLegacy = ref(false)

const families = [
  { id: 'all', label: '全部动物' },
  { id: 'cat', label: '猫咪' },
  { id: 'dog', label: '狗狗' },
  { id: 'fox', label: '狐狸' },
  { id: 'other', label: '其他图案' },
] as const

async function ensureLegacyLoaded() {
  if (legacyMotifs.value.length || loadingLegacy.value) return
  loadingLegacy.value = true
  try {
    const mod = await import('../data/companionLegacyMotifs.json')
    legacyMotifs.value = mod.default as LegacyMotif[]
  } finally {
    loadingLegacy.value = false
  }
}

watch(family, (value) => {
  if (value === 'other') void ensureLegacyLoaded()
})

async function openChooser() {
  companionExpanded.value = true
  await nextTick()
  chooser.value?.showModal()
}

function closeChooser() {
  chooser.value?.close()
}

function chooserClosed() {
  companionExpanded.value = false
  chooserTrigger.value?.focus({ preventScroll: true })
}

const visibleAnimals = computed(() =>
  family.value === 'all'
    ? companionAnimals
    : family.value === 'other'
      ? []
      : companionAnimals.filter(c => c.family === family.value),
)

const activeId = computed(() => selectedCompanion.value.id)
const record = computed(() => companionRecord(activeId.value))
const stage = computed(() => getCompanionStage(record.value.minutes, record.value.collectedAt))
const ready = computed(() => record.value.minutes >= ALBUM_MINUTES)
const remaining = computed(() => Math.max(0, Math.ceil(ALBUM_MINUTES - record.value.minutes)))

const savedCompanions = computed(() =>
  companionAnimals.filter(c => Boolean(companionRecord(c.id).collectedAt)),
)

const dateLabel = (at: number | null) =>
  at ? new Date(at).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }) : ''

const announcement = ref('')
const viewer = ref<HTMLDialogElement | null>(null)
const viewed = ref<CompanionAnimal | null>(null)
let viewerTrigger: HTMLElement | null = null

function viewPicture(animal: CompanionAnimal, event: MouseEvent) {
  viewed.value = animal
  viewerTrigger = event.currentTarget as HTMLElement
  void nextTick(() => viewer.value?.showModal())
}

function closeViewer() {
  viewer.value?.close()
}

function viewerClosed() {
  viewerTrigger?.focus({ preventScroll: true })
}

const collectedStatus = ref<HTMLElement | null>(null)
const displayName = computed(() => companionDisplayName(selectedCompanion.value))

// 小动物自定义命名
const editingName = ref(false)
const nicknameDraft = ref('')
const nicknameInputRef = ref<HTMLInputElement | null>(null)

function startRenameCompanion() {
  nicknameDraft.value = record.value.nickname ?? ''
  editingName.value = true
  void nextTick(() => nicknameInputRef.value?.focus())
}

function commitRenameCompanion() {
  if (!editingName.value) return
  setCompanionNickname(activeId.value, nicknameDraft.value)
  editingName.value = false
}

function cancelRenameCompanion() {
  editingName.value = false
}

// 轻触陪伴动物：像素轻跳 + 暖心气泡
const petHopping = ref(false)
const petWhisper = ref<string | null>(null)
let petHopTimer: number | null = null
let petWhisperTimer: number | null = null
let petCount = 0

const FAMILY_WHISPERS: Record<'cat' | 'dog' | 'fox', string[]> = {
  cat: ['呼噜呼噜~', '蹭了蹭你的手', '蜷在暖光里陪你'],
  dog: ['摇了摇尾巴!', '乖乖等你专注', '耳朵竖起来啦'],
  fox: ['竖起耳朵听着呢', '尾巴轻轻扫过', '陪你守着这一轮'],
}

function petCompanion(event?: MouseEvent) {
  petCount += 1
  const pool = FAMILY_WHISPERS[selectedCompanion.value.family]
  petWhisper.value = pool[petCount % pool.length]
  petHopping.value = true
  triggerPixelBurstFromEvent(event, 'gold', 7)
  if (petHopTimer !== null) window.clearTimeout(petHopTimer)
  if (petWhisperTimer !== null) window.clearTimeout(petWhisperTimer)
  petHopTimer = window.setTimeout(() => { petHopping.value = false }, 360)
  petWhisperTimer = window.setTimeout(() => { petWhisper.value = null }, 2100)
}

onBeforeUnmount(() => {
  if (petHopTimer !== null) window.clearTimeout(petHopTimer)
  if (petWhisperTimer !== null) window.clearTimeout(petWhisperTimer)
})

watch(activeId, () => {
  announcement.value = ''
  showScene.value = true
  editingName.value = false
  petWhisper.value = null
})

async function collect(event?: MouseEvent) {
  collectCompanionPicture(activeId.value)
  triggerPixelBurstFromEvent(event, 'gold', 10)
  announcement.value = '纪念画已收进相册'
  await nextTick()
  collectedStatus.value?.focus({ preventScroll: true })
}
</script>

<template>
  <div class="companion-panel">
    <div class="companion-heading">
      <div class="companion-current">
        <span class="companion-avatar-tile">
          <img :src="selectedCompanion.sitUrl" alt="" width="36" height="36" class="heading-sprite" />
        </span>
        <div class="companion-title-col">
          <p>正在陪伴 · {{ stage.label }}<template v-if="record.nickname"> · {{ selectedCompanion.name }}</template></p>
          <div v-if="editingName" class="rename-row">
            <input
              ref="nicknameInputRef"
              v-model="nicknameDraft"
              class="nickname-input"
              maxlength="16"
              :placeholder="selectedCompanion.name"
              @keydown.enter.prevent="commitRenameCompanion"
              @keydown.esc.prevent="cancelRenameCompanion"
              @blur="commitRenameCompanion"
            />
          </div>
          <div v-else class="companion-name-row">
            <h2>{{ displayName }}</h2>
            <button
              type="button"
              class="rename-companion-btn"
              title="给伙伴起个名字"
              aria-label="给伙伴起个名字"
              @click="startRenameCompanion"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" shape-rendering="crispEdges" aria-hidden="true">
                <rect x="8" y="1" width="2" height="2" /><rect x="6" y="3" width="2" height="2" />
                <rect x="4" y="5" width="2" height="2" /><rect x="2" y="7" width="2" height="2" />
                <rect x="1" y="9" width="2" height="2" /><rect x="5" y="10" width="6" height="1" />
              </svg>
            </button>
          </div>
        </div>
      </div>
      <button
        ref="chooserTrigger"
        class="quiet-button"
        :aria-expanded="companionExpanded"
        aria-haspopup="dialog"
        aria-controls="companion-options"
        @click="openChooser"
      >
        换一位
      </button>
    </div>

    <div class="collection-preview">
      <div class="collection-visual">
        <button
          type="button"
          class="collection-art-frame"
          :class="{ 'is-hopping': petHopping }"
          :title="`轻拍 ${displayName}`"
          @click="petCompanion($event)"
        >
          <div class="collection-art">
            <CompanionScene
              :name="displayName"
              :background-url="selectedCompanion.backgroundUrl"
              :portrait-url="selectedCompanion.portraitUrl"
              :placement="selectedCompanion.placement"
              :family="selectedCompanion.family"
              :hopping="petHopping"
              :mode="showScene ? 'scene' : 'detail'"
              :size="216"
            />
          </div>
          <transition name="whisper-pop">
            <span v-if="petWhisper" class="pet-whisper">{{ petWhisper }}</span>
          </transition>
        </button>
        <div class="visual-tools">
          <button class="text-button" :aria-pressed="!showScene" @click="showScene = !showScene">
            {{ showScene ? '查看立绘' : '查看场景' }}
          </button>
        </div>
      </div>

      <div class="collection-copy">
        <h3>{{ record.collectedAt ? '已经收藏' : ready ? '可以收藏了' : '一起度过的时间' }}</h3>
        <p class="companion-time">
          <StatNumber :value="Math.floor(record.minutes)" :size="24" inline class="companion-pixel-mins" />
          <span class="companion-time-unit">分钟</span>
        </p>
        <p class="hint collection-status">
          {{
            record.collectedAt
              ? `${dateLabel(record.collectedAt)} · 收进相册`
              : ready
                ? '把这段陪伴留在相册里。'
                : record.minutes
                  ? `再专注 ${remaining} 分钟，收藏这幅场景。`
                  : '从下一次专注开始记录。'
          }}
        </p>
        <div class="stage-meter" aria-hidden="true">
          <div class="stage-bar"><span :style="{ width: `${stage.progressPercent}%` }" /></div>
          <span class="stage-caption">
            {{
              stage.nextLabel
                ? `下一阶段「${stage.nextLabel}」还差 ${stage.remainingMinutes} 分钟`
                : '已完成全部陪伴成长阶段'
            }}
          </span>
        </div>
        <button v-if="ready && !record.collectedAt" class="collect-button" @click="collect($event)">收进相册</button>
        <span
          v-else-if="record.collectedAt"
          ref="collectedStatus"
          class="collected-label"
          tabindex="-1"
        >
          ✓ 已收藏
        </span>
        <span v-else class="collection-rule">每幅场景记录 2 小时陪伴 · 伙伴始终完整</span>
      </div>
    </div>

    <p class="sr-only" role="status" aria-live="polite">{{ announcement }}</p>

    <dialog
      ref="chooser"
      id="companion-options"
      class="companion-chooser"
      aria-labelledby="chooser-title"
      @close="chooserClosed"
      @keydown.esc.stop
      @click="($event.target === chooser) && closeChooser()"
    >
      <template v-if="companionExpanded">
        <div class="chooser-header">
          <h3 id="chooser-title">选择陪伴</h3>
          <button class="quiet-button chooser-close" @click="closeChooser">完成</button>
        </div>
        <p class="choice-note">选一位陪你专注</p>
        <div class="family-filters" role="group" aria-label="图案分类">
          <button
            v-for="item in families"
            :key="item.id"
            :aria-pressed="family === item.id"
            @click="family = item.id"
          >
            {{ item.label }}
          </button>
        </div>
        <div class="chooser-content">
          <div v-if="family !== 'other'" class="companion-grid" role="group" aria-label="选择陪伴动物">
            <button
              v-for="animal in visibleAnimals"
              :key="animal.id"
              type="button"
              class="companion-option"
              :aria-pressed="activeId === animal.id"
              :aria-label="animal.name"
              @click="selectCompanion(animal.id)"
            >
              <CompanionScene
                :name="animal.name"
                :background-url="animal.backgroundUrl"
                :portrait-url="animal.portraitUrl"
                :placement="animal.placement"
                mode="scene"
                :size="72"
              />
              <span class="option-name">{{ animal.name }}</span>
              <span class="option-mins">{{ Math.floor(companionRecord(animal.id).minutes) }} 分</span>
              <span class="companion-check" aria-hidden="true">{{ activeId === animal.id ? '✓' : '' }}</span>
            </button>
          </div>
          <div v-else class="companion-grid" role="group" aria-label="经典桌面图案参考">
            <p v-if="loadingLegacy" class="legacy-hint">加载经典图案中…</p>
            <div v-for="motif in legacyMotifs" :key="motif.id" class="companion-option legacy-card">
              <img :src="motif.scene" :alt="motif.name" width="72" height="72" />
              <span class="option-name">{{ motif.name }}</span>
              <span class="option-mins">经典纪念图</span>
            </div>
          </div>
        </div>
        <p class="chooser-note">
          {{ selectedCompanion.name }} · 已选中<br />
          专注中更换，本轮仍记给开始时的伙伴
        </p>
      </template>
    </dialog>

    <section class="saved-album" aria-label="已收藏的纪念画">
      <div class="album-heading">
        <h3>我的相册</h3>
        <span>{{ savedCompanions.length }} / {{ companionAnimals.length }} 张纪念画</span>
      </div>
      <p v-if="!savedCompanions.length" class="album-empty">第一张纪念画，会从一起度过的时间开始。</p>
      <div class="album-grid">
        <div v-for="animal in savedCompanions" :key="animal.id" class="album-entry">
          <button
            class="picture-button"
            :aria-label="`查看${animal.name}纪念画`"
            @click="viewPicture(animal, $event)"
          >
            <CompanionScene
              class="album-thumbnail"
              :name="animal.name"
              :background-url="animal.backgroundUrl"
              :portrait-url="animal.portraitUrl"
              :placement="animal.placement"
              mode="scene"
              :size="144"
            />
            <span aria-hidden="true">放大查看 ↗</span>
          </button>
          <div class="album-entry-copy">
            <h3>{{ animal.name }}</h3>
            <p>{{ dateLabel(companionRecord(animal.id).collectedAt) }} 收藏</p>
            <span v-if="activeId === animal.id" class="album-current">正在陪伴</span>
            <button v-else class="quiet-button" @click="selectCompanion(animal.id)">换它陪伴</button>
          </div>
        </div>
      </div>
    </section>

    <dialog
      ref="viewer"
      class="picture-viewer"
      aria-labelledby="picture-title"
      @close="viewerClosed"
      @keydown.esc.stop
      @click="($event.target === viewer) && closeViewer()"
    >
      <div v-if="viewed" class="picture-sheet">
        <button class="viewer-close quiet-button" aria-label="关闭纪念画" @click="closeViewer">✕</button>
        <CompanionScene
          :name="viewed.name"
          :background-url="viewed.backgroundUrl"
          :portrait-url="viewed.portraitUrl"
          :placement="viewed.placement"
          mode="scene"
          :size="216"
        />
        <h3 id="picture-title">{{ viewed.name }}</h3>
        <p>{{ dateLabel(companionRecord(viewed.id).collectedAt) }} · 共相伴 {{ Math.floor(companionRecord(viewed.id).minutes) }} 分钟</p>
      </div>
    </dialog>

    <details class="album-rules">
      <summary>纪念画怎样收藏？</summary>
      <p>
        选择一位伙伴，完成的专注时间只记给开始时的伙伴。累计 120 分钟（2 小时）后，可以收藏它的场景纪念画；中断不清零，切换也不会丢失。动物在任何阶段都始终完整陪伴，不会残缺呈现。
      </p>
      <p>个人成就随专注次数与连续天数单独记录，切换伙伴也会完整保留。</p>
    </details>

    <details class="approved-actions">
      <summary>陪伴瞬间 <span>{{ approvedCompanionActions.length }}</span></summary>
      <div class="action-grid">
        <figure v-for="action in approvedCompanionActions" :key="action.key">
          <div class="action-art">
            <img
              :src="action.url"
              :width="action.size[0] * 2"
              :height="action.size[1] * 2"
              :alt="action.title"
            />
          </div>
          <figcaption>{{ action.title }}</figcaption>
        </figure>
      </div>
    </details>
  </div>
</template>

<style scoped>
.companion-panel {
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-width: 0;
  color: var(--v2-ink);
}

h2, h3, p, figure {
  margin: 0;
}

h2, h3 {
  font-size: 13px;
  font-weight: 600;
  line-height: 1.5;
}

p {
  font-size: 12px;
  line-height: 1.6;
  color: var(--v2-secondary);
}

img {
  image-rendering: pixelated;
  flex-shrink: 0;
}

button {
  font: inherit;
  cursor: pointer;
  transition: background-color 160ms ease, border-color 160ms ease;
}

button:focus-visible, summary:focus-visible {
  outline: 2px solid var(--v2-accent);
  outline-offset: 2px;
}

.quiet-button {
  font-size: 12px;
  font-weight: 500;
  color: var(--v2-ink);
  padding: 5px 10px;
  border: 1px solid var(--v2-line);
  border-radius: 7px;
  background: var(--v2-surface);
  box-shadow: var(--pixel-keycap);
  flex-shrink: 0;
  transition: background-color 160ms ease, border-color 160ms ease, transform 120ms ease;
}

.quiet-button:hover {
  background: var(--ui-hover);
  border-color: color-mix(in srgb, var(--v2-accent) 34%, var(--v2-line));
}

.quiet-button:active {
  transform: translate3d(0, 1px, 0);
  box-shadow: var(--pixel-keycap-pressed);
}

.companion-heading, .companion-current {
  display: flex;
  align-items: center;
  gap: 10px;
}

.companion-heading {
  justify-content: space-between;
}

.companion-current {
  min-width: 0;
}

.companion-avatar-tile {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background-color: var(--ui-well);
  background-image: var(--pixel-dot-grid);
  border: 1px solid var(--v2-line);
  box-shadow: var(--pixel-lcd-well);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.heading-sprite {
  display: block;
  width: 36px;
  height: 36px;
  image-rendering: pixelated;
  animation: companion-idle-bob 2.6s steps(2, end) infinite;
}

.companion-title-col {
  min-width: 0;
}

.companion-current p {
  font-size: 11px;
  color: var(--v2-muted);
}

.companion-name-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.companion-current h2 {
  font-size: 17px;
  overflow-wrap: anywhere;
}

.rename-companion-btn {
  width: 22px;
  height: 22px;
  padding: 0;
  border-radius: 5px;
  border: 1px solid var(--v2-line);
  background: var(--v2-surface);
  box-shadow: var(--pixel-keycap);
  color: var(--v2-muted);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.rename-companion-btn:hover {
  color: var(--v2-accent);
  border-color: color-mix(in srgb, var(--v2-accent) 34%, var(--v2-line));
}

.rename-row {
  margin-top: 2px;
}

.nickname-input {
  width: 150px;
  max-width: 100%;
  height: 26px;
  padding: 0 8px;
  border-radius: 6px;
  border: 1px solid var(--v2-accent);
  background: var(--v2-surface);
  color: var(--v2-ink);
  font-size: 13px;
  font-weight: 600;
  outline: none;
}

.collection-preview {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 15px;
  border: 1px solid var(--v2-line);
  border-radius: 16px;
  background:
    radial-gradient(ellipse at 50% 15%, var(--v2-glow), transparent 65%),
    var(--v2-surface);
  box-shadow: inset 0 1px 0 var(--v2-specular), 0 6px 16px var(--v2-shadow);
}

.collection-visual {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 4px 0 2px;
}

.collection-art-frame {
  position: relative;
  padding: 10px;
  border-radius: 14px;
  border: 1px solid var(--v2-line);
  background-color: var(--ui-well);
  background-image: var(--pixel-dot-grid);
  box-shadow: var(--pixel-lcd-well);
  cursor: pointer;
  transition: border-color 180ms ease, transform 140ms steps(2, end);
}

.collection-art-frame:hover {
  border-color: color-mix(in srgb, var(--v2-accent) 38%, var(--v2-line));
}

.collection-art-frame.is-hopping .collection-art {
  animation: companion-happy-hop 320ms steps(2, end);
}

.collection-art {
  display: flex;
  justify-content: center;
}

.pet-whisper {
  position: absolute;
  top: 8px;
  left: 50%;
  transform: translateX(-50%);
  padding: 3px 9px;
  border-radius: 6px;
  background: var(--v2-popover);
  border: 1px solid color-mix(in srgb, var(--v2-accent) 42%, var(--v2-line));
  box-shadow: var(--pixel-keycap), 0 4px 10px var(--v2-shadow);
  color: var(--v2-ink);
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  pointer-events: none;
}

.whisper-pop-enter-active,
.whisper-pop-leave-active {
  transition: opacity 180ms ease, transform 180ms steps(3, end);
}

.whisper-pop-enter-from,
.whisper-pop-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(4px);
}

@keyframes companion-idle-bob {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-1px); }
}

@keyframes companion-happy-hop {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-4px); }
}

@media (prefers-reduced-motion: reduce) {
  .heading-sprite,
  .collection-art-frame.is-hopping .collection-art {
    animation: none;
  }
}

.visual-tools {
  display: flex;
  align-items: center;
  gap: 8px;
}

.collection-copy {
  width: 100%;
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 6px 12px;
  align-items: center;
}

.collection-copy h3 {
  font-size: 12px;
  font-weight: 500;
  color: var(--v2-secondary);
}

.companion-time {
  grid-column: 2;
  grid-row: 1 / 3;
  margin: 0;
  display: inline-flex;
  align-items: baseline;
  gap: 5px;
  font-variant-numeric: tabular-nums;
}

.companion-pixel-mins {
  color: var(--v2-accent);
}

.companion-time-unit {
  font-size: 11px;
  color: var(--v2-muted);
}

.collection-status {
  margin: 0;
  font-size: 12px;
}

.stage-meter {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin-top: 2px;
}

.stage-bar {
  height: 6px;
  padding: 1px;
  border-radius: 2px;
  background: var(--ui-well);
  border: 1px solid var(--v2-line);
  overflow: hidden;
}

.stage-bar span {
  display: block;
  height: 100%;
  background: repeating-linear-gradient(
    90deg,
    var(--v2-accent) 0 6px,
    transparent 6px 8px
  );
  transition: width 260ms cubic-bezier(0.22, 1, 0.36, 1);
}

.stage-caption {
  font-size: 11px;
  color: var(--v2-muted);
}

.collection-rule {
  grid-column: 1 / -1;
  font-size: 11px;
  color: var(--v2-muted);
}

.text-button {
  font-size: 11.5px;
  font-weight: 500;
  padding: 4px 10px;
  border: 1px solid var(--v2-line);
  border-radius: 6px;
  color: var(--v2-accent);
  background: var(--v2-surface);
  box-shadow: var(--pixel-keycap);
}

.text-button:hover {
  background: var(--ui-hover);
  border-color: color-mix(in srgb, var(--v2-accent) 36%, var(--v2-line));
}

.text-button:active {
  transform: translate3d(0, 1px, 0);
  box-shadow: var(--pixel-keycap-pressed);
}

.collect-button {
  grid-column: 1 / -1;
  justify-self: start;
  font-size: 12px;
  font-weight: 600;
  margin-top: 4px;
  padding: 7px 14px;
  border: 1px solid color-mix(in srgb, #000 18%, var(--v2-accent));
  border-radius: 7px;
  background-color: var(--v2-accent);
  background-image: var(--pixel-dither);
  box-shadow: var(--pixel-bevel-sm);
  color: var(--v2-on-accent);
}

.collect-button:hover {
  filter: brightness(1.06);
}

.collect-button:active {
  transform: translate3d(0, 1px, 0);
  box-shadow: var(--pixel-bevel-pressed);
}

.collected-label {
  grid-column: 1 / -1;
  font-size: 12px;
  font-weight: 600;
  color: var(--v2-accent);
}

.album-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}

.album-heading h3 {
  font-size: 14px;
}

.album-heading span, .album-current {
  font-size: 12px;
  color: var(--v2-secondary);
}

.album-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.album-entry {
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: stretch;
  min-width: 0;
}

.album-entry-copy {
  text-align: center;
  min-width: 0;
}

.album-entry-copy h3 {
  font-size: 13px;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.album-entry-copy p {
  font-size: 11px;
  margin-top: 2px;
}

.album-entry-copy .quiet-button,
.album-current {
  display: inline-block;
  margin-top: 8px;
}

.album-empty {
  padding: 12px 0;
}

.picture-button {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding: 8px 0;
  background: var(--v2-surface);
  border: 1px solid var(--v2-line);
  border-radius: 12px;
  cursor: zoom-in;
  transition: transform 160ms ease, background-color 160ms ease;
}

.picture-button:hover {
  transform: translateY(-2px);
  background: color-mix(in srgb, var(--v2-glow) 60%, var(--v2-surface));
}

.picture-button span {
  position: absolute;
  bottom: 8px;
  left: 50%;
  transform: translateX(-50%);
  white-space: nowrap;
  padding: 3px 6px;
  background: var(--v2-popover);
  color: var(--v2-ink);
  font-size: 10px;
  border-radius: 4px;
  opacity: 0;
  transition: opacity 160ms ease;
}

.picture-button:hover span,
.picture-button:focus-visible span {
  opacity: 1;
}

.picture-viewer,
.companion-chooser {
  position: fixed;
  inset: 0;
  margin: auto;
  padding: 0;
  border: 1px solid var(--v2-line);
  border-radius: 16px;
  background: var(--v2-popover);
  color: var(--v2-ink);
  max-width: calc(100% - 24px);
  max-height: calc(100% - 24px);
  overflow: auto;
  box-shadow: 0 16px 40px var(--v2-shadow);
}

.picture-viewer::backdrop,
.companion-chooser::backdrop {
  border-radius: 22px;
  background: color-mix(in srgb, #000 24%, transparent);
}

.picture-sheet {
  position: relative;
  display: flex;
  align-items: center;
  flex-direction: column;
  gap: 8px;
  padding: 40px 18px 18px;
}

.viewer-close {
  position: absolute;
  right: 10px;
  top: 10px;
}

.companion-chooser {
  width: 384px;
  box-sizing: border-box;
  overflow: hidden;
}

.companion-chooser[open] {
  display: flex;
  flex-direction: column;
}

.chooser-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 16px 0;
  flex-shrink: 0;
}

.chooser-header h3 {
  font-size: 14px;
}

.choice-note {
  padding: 4px 16px 8px;
  flex-shrink: 0;
}

.family-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 0 12px 12px;
  flex-shrink: 0;
}

.family-filters button {
  font-size: 12px;
  padding: 5px 9px;
  border-radius: 6px;
  background: transparent;
  color: var(--v2-secondary);
  border: 1px solid transparent;
}

.family-filters button:hover {
  background: var(--ui-hover);
}

.family-filters button[aria-pressed='true'] {
  color: var(--v2-on-accent);
  background: var(--v2-accent);
}

.chooser-content {
  min-height: 0;
  overflow-y: auto;
  padding: 4px 12px 12px;
  overscroll-behavior: contain;
}

.companion-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.companion-option {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  min-width: 0;
  padding: 8px 4px;
  border: 1px solid var(--v2-line);
  border-radius: 10px;
  background: var(--v2-surface);
  color: var(--v2-ink);
  font-size: 11px;
  text-align: center;
}

.companion-option:hover {
  background: var(--ui-hover);
}

.companion-option[aria-pressed='true'] {
  border-color: var(--v2-accent);
  background: color-mix(in srgb, var(--v2-accent) 12%, transparent);
}

.option-name {
  line-height: 1.4;
  min-height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow-wrap: anywhere;
}

.option-mins {
  font-size: 10px;
  color: var(--v2-muted);
}

.companion-check {
  position: absolute;
  right: 4px;
  top: 4px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  font-size: 10px;
  line-height: 16px;
  color: var(--v2-on-accent);
}

.companion-option[aria-pressed='true'] .companion-check {
  background: var(--v2-accent);
}

.legacy-hint {
  grid-column: 1 / -1;
  text-align: center;
  padding: 16px 0;
}

.legacy-card {
  cursor: default;
}

.chooser-note {
  padding: 8px 16px 12px;
  border-top: 1px solid var(--v2-line);
  flex-shrink: 0;
  font-size: 11px;
}

.album-rules summary {
  font-size: 12px;
  line-height: 1.6;
  color: var(--v2-secondary);
  cursor: pointer;
}

.album-rules summary:hover {
  color: var(--v2-ink);
}

.album-rules p {
  margin-top: 8px;
}

.approved-actions {
  border-block: 1px solid var(--v2-line);
  padding: 8px 0;
}

.approved-actions summary {
  font-size: 12px;
  cursor: pointer;
  line-height: 2;
}

.approved-actions summary span {
  font-size: 11px;
  color: var(--v2-muted);
  margin-left: 6px;
}

.action-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  padding: 8px 0;
}

.action-grid figure {
  text-align: center;
  min-width: 0;
}

.action-art {
  height: 72px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.action-art img {
  max-width: 100%;
  object-fit: contain;
}

.action-grid figcaption {
  font-size: 11px;
  color: var(--v2-secondary);
  line-height: 1.5;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}

@media (max-width: 359px) {
  .companion-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .album-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (prefers-reduced-motion: reduce) {
  button,
  .picture-button,
  .picture-button span,
  .stage-bar span {
    transition: none;
  }
}
</style>
