<script setup lang="ts">
import { computed, ref, nextTick, onDeactivated } from 'vue'
import { useRadio, CATEGORY_LABELS, type StationCategory, type RadioStation } from '../composables/useRadio'
import { triggerPixelBurstFromEvent } from '../utils/pixelSpark'
import StatNumber from '../components/StatNumber.vue'

const {
  stations, currentStation, playing, loading, error, clearError, volume,
  currentTime, duration, seekable, progress, seekTo,
  toggle, switchStation, setVolume,
  importFromUrl, importFromFile, removeCustomStation, renameCustomStation,
} = useRadio()

onDeactivated(() => {
  clearError()
  importMsg.value = null
})

const isLocalMedia = computed(() => {
  const station = currentStation.value
  if (!station) return false
  return station.streamUrl === '__LOCAL__'
    || station.streamUrl === '__RESOLVE__'
    || /\.(mp3|m4a|aac|ogg|opus|wav|flac)(\?|#|$)/i.test(station.streamUrl)
})

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const total = Math.floor(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`
}

const progressTrack = ref<HTMLElement | null>(null)
const dragging = ref(false)

function ratioFromEvent(event: PointerEvent): number {
  const el = progressTrack.value
  if (!el) return 0
  const rect = el.getBoundingClientRect()
  if (rect.width <= 0) return 0
  return Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
}

function onSeekDown(event: PointerEvent) {
  if (!seekable.value) return
  dragging.value = true
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  seekTo(ratioFromEvent(event) * duration.value)
}

function onSeekMove(event: PointerEvent) {
  if (!dragging.value) return
  seekTo(ratioFromEvent(event) * duration.value)
}

function onSeekUp(event: PointerEvent) {
  if (!dragging.value) return
  dragging.value = false
  const el = event.currentTarget as HTMLElement
  if (el.hasPointerCapture(event.pointerId)) el.releasePointerCapture(event.pointerId)
}

const renamingId = ref('')
const renamingValue = ref('')

function startRename(station: RadioStation, event: Event) {
  event.stopPropagation()
  renamingId.value = station.id
  renamingValue.value = station.name
}

function commitRename(station: RadioStation) {
  if (renamingId.value === station.id) {
    const name = renamingValue.value.trim()
    if (name && name !== station.name) renameCustomStation(station.id, name)
    renamingId.value = ''
  }
}

const stationsByCategory = computed(() => {
  const grouped = new Map<StationCategory, RadioStation[]>()
  stations.value.forEach(station => {
    if (!grouped.has(station.category)) {
      grouped.set(station.category, [])
    }
    grouped.get(station.category)!.push(station)
  })
  return grouped
})

// ---- 导入外部歌单 / 视频链接（只播音频） ----

const importUrl = ref('')
const importing = ref(false)
const importMsg = ref<string | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)

async function doImportUrl() {
  const url = importUrl.value.trim()
  if (!url || importing.value) return
  importing.value = true
  importMsg.value = null
  try {
    const n = await importFromUrl(url)
    importMsg.value = `已导入 ${n} 个条目`
    importUrl.value = ''
  } catch (e) {
    importMsg.value = typeof e === 'string' ? e : (e as Error).message || '导入失败'
  } finally {
    importing.value = false
  }
}

async function doImportFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || importing.value) return
  importing.value = true
  importMsg.value = null
  try {
    const n = await importFromFile(file)
    importMsg.value = `已导入 ${n} 个条目`
  } catch (e) {
    importMsg.value = typeof e === 'string' ? e : (e as Error).message || '导入失败'
  } finally {
    importing.value = false
  }
}

function removeStation(id: string, event: Event) {
  event.stopPropagation()
  removeCustomStation(id)
}

const scrollContainer = ref<HTMLElement | null>(null)
const showScrollToPlaying = ref(false)
const SPECTRUM_BARS = [42, 76, 58, 92, 66, 84, 52, 96, 70, 82, 48, 64]

function handleScroll() {
  if (!scrollContainer.value) return
  // 滚动超过 50px 时显示快速定位按钮
  showScrollToPlaying.value = scrollContainer.value.scrollTop > 50
}

async function scrollToPlaying() {
  if (!currentStation.value) return
  await nextTick()
  const activeItem = document.querySelector('.station-item.active')
  if (activeItem) {
    activeItem.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
}
</script>

<template>
  <div class="radio-page">
    <!-- Now Playing (Fixed) -->
    <div class="now-playing">
      <section class="radio-content" :class="{ 'is-playing': playing, 'is-loading': loading }" aria-label="专注电台播放器">
        <div class="radio-eyebrow">
          <span class="pixel-status" :class="{ active: playing, loading }" aria-hidden="true"></span>
          <span>{{ playing ? '正在播放' : loading ? '连接中…' : '专注电台' }}</span>
          <span v-if="currentStation" class="radio-mode-chip">{{ isLocalMedia ? '音频' : 'LIVE' }}</span>
        </div>
        <div class="station-info">
          <div class="station-name">{{ currentStation?.name ?? '选择一个电台' }}</div>
          <div class="station-desc">{{ currentStation?.description ?? '让音乐陪伴你的专注时光' }}</div>
        </div>
        <div class="player-controls">
          <button
            class="play-btn"
            :class="{ 'is-playing': playing }"
            :disabled="!currentStation"
            @click="!playing && triggerPixelBurstFromEvent($event, 'accent', 7); toggle()"
          >
            <svg v-if="loading" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="7" cy="12" r="1.8" opacity="0.35" />
              <circle cx="12" cy="12" r="1.8" opacity="0.65" />
              <circle cx="17" cy="12" r="1.8" />
            </svg>
            <svg v-else-if="playing" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <rect x="7" y="5" width="3.5" height="14" rx="1" />
              <rect x="13.5" y="5" width="3.5" height="14" rx="1" />
            </svg>
            <svg v-else viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M8 5.4v13.2a1 1 0 0 0 1.5.86l10.6-6.6a1 1 0 0 0 0-1.72L9.5 4.54A1 1 0 0 0 8 5.4Z" />
            </svg>
          </button>
          <div class="volume-row">
            <svg class="vol-icon" width="16" height="16" viewBox="0 0 16 16" fill="currentColor" shape-rendering="crispEdges" aria-hidden="true">
              <rect x="1" y="6" width="3" height="4" />
              <rect x="4" y="5" width="2" height="6" />
              <rect x="6" y="3" width="2" height="10" />
              <template v-if="volume === 0">
                <rect x="10" y="5" width="2" height="2" /><rect x="14" y="5" width="2" height="2" />
                <rect x="12" y="7" width="2" height="2" />
                <rect x="10" y="9" width="2" height="2" /><rect x="14" y="9" width="2" height="2" />
              </template>
              <template v-else>
                <rect x="10" y="6" width="2" height="4" />
                <rect v-if="volume > 45" x="13" y="4" width="2" height="8" />
              </template>
            </svg>
            <input
              type="range"
              class="volume-slider"
              min="0"
              max="100"
              :value="volume"
              :style="{ '--volume': `${volume}%` }"
              @input="setVolume(Number(($event.target as HTMLInputElement).value))"
            />
            <span class="vol-value"><StatNumber :value="volume" :size="16" inline /></span>
          </div>
        </div>
        <div v-if="currentStation" class="timeline">
          <template v-if="isLocalMedia">
            <span class="time-label"><StatNumber :value="formatTime(currentTime)" :size="16" inline /></span>
            <div
              ref="progressTrack"
              class="progress-track"
              :class="{ disabled: !seekable, dragging }"
              @pointerdown="onSeekDown"
              @pointermove="onSeekMove"
              @pointerup="onSeekUp"
              @pointercancel="onSeekUp"
            >
              <div class="progress-fill" :style="{ width: `${progress * 100}%` }"></div>
              <div class="progress-thumb" :style="{ left: `${progress * 100}%` }"></div>
            </div>
            <span class="time-label"><StatNumber :value="formatTime(duration)" :size="16" inline /></span>
          </template>
          <template v-else>
            <span class="live-badge">LIVE</span>
            <span class="live-divider" aria-hidden="true"></span>
            <span class="live-hint">直播流 · 不可拖动</span>
          </template>
        </div>
        <div class="radio-deck-screen" :class="{ active: playing, loading }" aria-hidden="true">
          <div class="spectrum-bars">
            <span
              v-for="(peak, idx) in SPECTRUM_BARS"
              :key="idx"
              class="spectrum-bar"
              :style="{ '--peak': `${peak}%`, '--delay': `${(idx % 6) * 0.11}s` }"
            ></span>
          </div>
          <div class="deck-readout">
            <span class="deck-tag">{{ isLocalMedia ? 'DECK' : 'FM' }}</span>
            <span class="deck-state">{{ loading ? 'LOAD' : playing ? 'PLAY' : 'IDLE' }}</span>
          </div>
        </div>
        <div v-if="error" class="error-msg" role="alert">
          <span class="error-text">{{ error }}</span>
          <button type="button" class="error-dismiss" aria-label="关闭错误提示" title="关闭" @click="clearError">×</button>
        </div>
      </section>
    </div>

    <!-- Scrollable Content -->
    <div class="station-list-wrapper" ref="scrollContainer" @scroll="handleScroll">
      <!-- 导入外部歌单 / 视频链接 -->
      <div class="import-bar glass-panel">
        <input
          v-model="importUrl"
          class="import-input"
          type="text"
          placeholder="粘贴音频直链 / M3U 歌单 / 视频·合集链接（只播音频）"
          @keydown.enter="doImportUrl"
        />
        <button class="import-btn" :disabled="importing || !importUrl.trim()" @click="doImportUrl">
          {{ importing ? '导入中…' : '导入' }}
        </button>
        <button class="import-btn ghost" :disabled="importing" @click="fileInput?.click()">文件</button>
        <input ref="fileInput" type="file" accept=".m3u,.m3u8,.pls,.txt" hidden @change="doImportFile" />
        <div v-if="importMsg" class="import-msg">{{ importMsg }}</div>
      </div>

      <!-- Station List by Category -->
      <div v-for="[category, categoryStations] in stationsByCategory" :key="category" class="category-section">
        <div class="category-title">{{ CATEGORY_LABELS[category] }}</div>
        <div class="station-list">
          <button
            v-for="station in categoryStations"
            :key="station.id"
            class="station-item"
            :class="{ active: currentStation?.id === station.id }"
            @click="switchStation(station.id)"
          >
            <div class="item-icon">
              <!-- Code Radio: pixel brackets </> -->
              <svg v-if="station.icon === 'code'" viewBox="0 0 16 16" fill="currentColor" shape-rendering="crispEdges">
                <rect x="5" y="4" width="1" height="2" /><rect x="4" y="5" width="1" height="2" />
                <rect x="3" y="7" width="1" height="2" /><rect x="4" y="9" width="1" height="2" />
                <rect x="5" y="10" width="1" height="2" />
                <rect x="10" y="4" width="1" height="2" /><rect x="11" y="5" width="1" height="2" />
                <rect x="12" y="7" width="1" height="2" /><rect x="11" y="9" width="1" height="2" />
                <rect x="10" y="10" width="1" height="2" />
                <rect x="8" y="4" width="1" height="3" /><rect x="7" y="7" width="1" height="5" />
              </svg>
              <!-- Groove Salad: pixel equalizer bars -->
              <svg v-else-if="station.icon === 'wave'" viewBox="0 0 16 16" fill="currentColor" shape-rendering="crispEdges">
                <rect x="2" y="9" width="2" height="5" opacity="0.75" />
                <rect x="5" y="6" width="2" height="8" opacity="0.9" />
                <rect x="8" y="3" width="2" height="11" />
                <rect x="11" y="7" width="2" height="7" opacity="0.8" />
              </svg>
              <!-- Drone Zone: pixel concentric ripple -->
              <svg v-else-if="station.icon === 'drone'" viewBox="0 0 16 16" fill="currentColor" shape-rendering="crispEdges">
                <rect x="7" y="7" width="2" height="2" />
                <rect x="5" y="4" width="6" height="1" opacity="0.65" /><rect x="5" y="11" width="6" height="1" opacity="0.65" />
                <rect x="4" y="5" width="1" height="6" opacity="0.65" /><rect x="11" y="5" width="1" height="6" opacity="0.65" />
                <rect x="4" y="2" width="8" height="1" opacity="0.3" /><rect x="4" y="13" width="8" height="1" opacity="0.3" />
                <rect x="2" y="4" width="1" height="8" opacity="0.3" /><rect x="13" y="4" width="1" height="8" opacity="0.3" />
              </svg>
              <!-- Deep Space One: pixel ringed planet -->
              <svg v-else-if="station.icon === 'planet'" viewBox="0 0 16 16" fill="currentColor" shape-rendering="crispEdges">
                <rect x="6" y="4" width="4" height="1" /><rect x="5" y="5" width="6" height="6" />
                <rect x="6" y="11" width="4" height="1" />
                <rect x="2" y="9" width="3" height="1" opacity="0.7" /><rect x="11" y="6" width="3" height="1" opacity="0.7" />
                <rect x="3" y="8" width="10" height="1" opacity="0.5" />
              </svg>
              <!-- Space Station: pixel 4-point star -->
              <svg v-else-if="station.icon === 'star'" viewBox="0 0 16 16" fill="currentColor" shape-rendering="crispEdges">
                <rect x="7" y="2" width="2" height="12" /><rect x="2" y="7" width="12" height="2" />
                <rect x="5" y="5" width="6" height="6" />
              </svg>
              <!-- Ambient Pill: pixel capsule -->
              <svg v-else-if="station.icon === 'pill'" viewBox="0 0 16 16" fill="currentColor" shape-rendering="crispEdges">
                <rect x="4" y="5" width="8" height="1" /><rect x="4" y="10" width="8" height="1" />
                <rect x="3" y="6" width="1" height="4" /><rect x="12" y="6" width="1" height="4" />
                <rect x="4" y="6" width="4" height="4" opacity="0.55" />
              </svg>
              <!-- Lo-Fi / Coffee: pixel coffee mug -->
              <svg v-else-if="station.icon === 'coffee'" viewBox="0 0 16 16" fill="currentColor" shape-rendering="crispEdges">
                <rect x="4" y="2" width="1" height="2" opacity="0.65" /><rect x="7" y="2" width="1" height="2" opacity="0.65" />
                <rect x="3" y="5" width="8" height="7" /><rect x="11" y="6" width="2" height="1" />
                <rect x="12" y="7" width="1" height="2" /><rect x="11" y="9" width="2" height="1" />
                <rect x="2" y="12" width="10" height="1" />
              </svg>
              <!-- Jazz: pixel eighth note -->
              <svg v-else-if="station.icon === 'jazz'" viewBox="0 0 16 16" fill="currentColor" shape-rendering="crispEdges">
                <rect x="6" y="3" width="6" height="2" />
                <rect x="6" y="5" width="2" height="6" /><rect x="11" y="5" width="2" height="5" />
                <rect x="4" y="10" width="4" height="3" /><rect x="9" y="9" width="4" height="3" />
              </svg>
              <!-- Secret Agent: pixel spy glass -->
              <svg v-else-if="station.icon === 'spy'" viewBox="0 0 16 16" fill="currentColor" shape-rendering="crispEdges">
                <rect x="5" y="3" width="4" height="1" /><rect x="5" y="10" width="4" height="1" />
                <rect x="3" y="5" width="1" height="4" /><rect x="10" y="5" width="1" height="4" />
                <rect x="4" y="4" width="1" height="1" /><rect x="9" y="4" width="1" height="1" />
                <rect x="4" y="9" width="1" height="1" /><rect x="9" y="9" width="1" height="1" />
                <rect x="6" y="6" width="2" height="2" opacity="0.65" />
                <rect x="10" y="10" width="2" height="2" /><rect x="12" y="12" width="2" height="2" />
              </svg>
              <!-- DEF CON: pixel terminal -->
              <svg v-else-if="station.icon === 'hacker'" viewBox="0 0 16 16" fill="currentColor" shape-rendering="crispEdges">
                <rect x="2" y="3" width="12" height="1" /><rect x="2" y="11" width="12" height="1" />
                <rect x="2" y="4" width="1" height="7" /><rect x="13" y="4" width="1" height="7" />
                <rect x="4" y="6" width="1" height="1" /><rect x="5" y="7" width="1" height="1" /><rect x="4" y="8" width="1" height="1" />
                <rect x="7" y="8" width="4" height="1" />
                <rect x="5" y="13" width="6" height="1" />
              </svg>
              <!-- 导入条目: pixel link -->
              <svg v-else-if="station.icon === 'link'" viewBox="0 0 16 16" fill="currentColor" shape-rendering="crispEdges">
                <rect x="3" y="6" width="4" height="1" /><rect x="3" y="9" width="4" height="1" />
                <rect x="2" y="7" width="1" height="2" />
                <rect x="9" y="6" width="4" height="1" /><rect x="9" y="9" width="4" height="1" />
                <rect x="13" y="7" width="1" height="2" />
                <rect x="6" y="7" width="4" height="2" />
              </svg>
              <!-- 本地音乐: pixel folder -->
              <svg v-else-if="station.icon === 'folder'" viewBox="0 0 16 16" fill="currentColor" shape-rendering="crispEdges">
                <rect x="2" y="4" width="5" height="2" />
                <rect x="2" y="6" width="12" height="7" />
                <rect x="4" y="8" width="8" height="1" opacity="0.35" />
              </svg>
              <div v-if="currentStation?.id === station.id && playing" class="playing-indicator">
                <span /><span /><span />
              </div>
            </div>
            <div class="item-content">
              <div class="item-header">
                <input
                  v-if="station.category === 'custom' && renamingId === station.id"
                  v-model="renamingValue"
                  class="rename-input"
                  @keydown.enter="commitRename(station)"
                  @blur="commitRename(station)"
                />
                <div
                  v-else
                  class="item-name"
                  :style="station.category === 'custom' ? 'cursor: text' : ''"
                  @dblclick="station.category === 'custom' && startRename(station, $event)"
                >
                  {{ station.name }}
                </div>
                <div class="item-tags">
                  <span v-for="tag in station.tags.slice(0, 2)" :key="tag" class="tag">{{ tag }}</span>
                </div>
              </div>
              <div class="item-desc">{{ station.description }}</div>
            </div>
            <button
              v-if="station.category === 'custom' && renamingId !== station.id"
              class="item-rename"
              title="重命名（双击名称也可）"
              @click="startRename(station, $event)"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
            </button>
            <button
              v-if="station.category === 'custom' && renamingId !== station.id"
              class="item-remove"
              title="删除"
              @click="removeStation(station.id, $event)"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </button>
        </div>
      </div>
    </div>

    <!-- Scroll to Playing Button -->
    <transition name="fade-scale">
      <button
        v-if="showScrollToPlaying && currentStation"
        class="scroll-to-playing-btn"
        @click="scrollToPlaying"
        title="定位到当前播放"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v8M8 12h8" />
        </svg>
      </button>
    </transition>
  </div>
</template>

<style scoped>
@reference "../styles.css";

.radio-page {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 0;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  position: relative;
}

.now-playing {
  position: sticky;
  top: 0;
  z-index: 10;
  background: transparent;
  border-bottom: 1px solid var(--v2-line);;
  padding: 8px 12px;
}

.import-bar {
  margin: 8px 10px 0;
  padding: 7px 8px;
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 4px;
  align-items: center;
  border-radius: 10px;
  position: relative;
}

.import-input {
  grid-column: 1 / -1;
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--v2-line);
  background: var(--ui-well);
  border-radius: 8px;
  color: var(--v2-ink);
  font-size: 10.5px;
  line-height: 1.35;
  padding: 6px 8px;
  outline: none;
}

.import-input:focus {
  border-color: var(--v2-muted);
  background: var(--ui-well);
}

.import-btn {
  border: 1px solid var(--v2-line);
  background: var(--ui-well);
  color: var(--v2-ink);
  border-radius: 7px;
  font-size: 10.5px;
  font-weight: 500;
  padding: 5px 10px;
  cursor: pointer;
  transition: background-color 180ms ease, border-color 180ms ease, color 180ms ease, box-shadow 180ms ease;
}

.import-btn:not(.ghost):not(:disabled) {
  background-color: var(--v2-accent);
  background-image: var(--pixel-dither);
  border-color: color-mix(in srgb, #000 18%, var(--v2-accent));
  box-shadow: var(--pixel-bevel-sm);
  color: var(--v2-on-accent);
  font-weight: 600;
}

.import-btn:hover:not(:disabled) {
  background: var(--ui-hover);
}

.import-btn:not(.ghost):hover:not(:disabled) {
  background-color: var(--v2-accent);
  filter: brightness(1.06);
}

.import-btn:disabled {
  opacity: 0.45;
  cursor: default;
}

.import-msg {
  grid-column: 1 / -1;
  font-size: 10px;
  color: var(--v2-secondary);
}

.item-rename {
  display: none;
  border: none;
  background: transparent;
  color: var(--v2-muted);
  width: 20px;
  height: 20px;
  padding: 2px;
  border-radius: 5px;
  cursor: pointer;
  flex-shrink: 0;
}

.item-rename svg,
.item-remove svg {
  width: 12px;
  height: 12px;
}

.station-item:hover .item-rename {
  display: block;
}

.item-rename:hover {
  color: #7cc4ff;
  background: rgba(124, 196, 255, 0.12);
}

.rename-input {
  flex: 1;
  min-width: 0;
  border: 1px solid var(--v2-line);;
  background: var(--ui-well);
  border-radius: 6px;
  color: inherit;
  font-size: 12px;
  padding: 2px 6px;
  outline: none;
}

.item-remove {
  align-self: center;
  display: none;
  border: none;
  background: transparent;
  color: var(--v2-muted);
  width: 20px;
  height: 20px;
  padding: 2px;
  border-radius: 5px;
  cursor: pointer;
  flex-shrink: 0;
}

.station-item:hover .item-remove {
  display: block;
}

.item-remove:hover {
  color: #f87171;
  background: rgba(248, 113, 113, 0.12);
}

.radio-content {
  position: relative;
  border-radius: 16px;
  padding: 15px 16px 13px;
  display: flex;
  flex-direction: column;
  gap: 11px;
  background:
    radial-gradient(ellipse at 82% 14%, var(--v2-glow), transparent 64%),
    var(--v2-surface);
  box-shadow:
    inset 0 1px 0 var(--v2-specular),
    0 8px 20px var(--v2-shadow);
  border: 1px solid var(--v2-line);
  transition: background 360ms ease, border-color 280ms ease, box-shadow 280ms ease;
}

.radio-content.is-playing {
  border-color: color-mix(in srgb, var(--v2-accent) 34%, var(--v2-line));
}

.radio-eyebrow {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--v2-secondary);
  font-size: 11px;
  min-width: 0;
}

.pixel-status {
  width: 7px;
  height: 7px;
  flex-shrink: 0;
  border-radius: 1px;
  background: var(--v2-muted);
  transition: background 240ms ease, box-shadow 240ms ease;
}

.pixel-status.active {
  background: var(--v2-accent);
  animation: radio-pixel-beat 1.8s steps(2, end) infinite;
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--v2-accent) 26%, transparent);
}

.pixel-status.loading {
  background: var(--v2-alert);
  animation: radio-pixel-beat 0.9s steps(2, end) infinite;
}

@keyframes radio-pixel-beat {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.2); opacity: 0.7; }
}

.radio-mode-chip {
  margin-left: auto;
  padding: 1px 6px;
  border-radius: 4px;
  background-color: var(--v2-accent-soft);
  background-image: repeating-conic-gradient(color-mix(in srgb, var(--v2-accent) 11%, transparent) 0% 25%, transparent 0% 50%);
  background-size: 4px 4px;
  color: var(--v2-accent);
  font-size: 9.5px;
  font-weight: 600;
  letter-spacing: 0.06em;
}

.station-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.station-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--v2-ink);
}

.station-desc {
  font-size: 12px;
  color: var(--v2-muted);
}

.radio-deck-screen {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 10px;
  height: 36px;
  padding: 6px 9px;
  border-radius: 10px;
  background-color: var(--ui-well);
  background-image: var(--pixel-dot-grid);
  border: 1px solid var(--v2-line);
  box-shadow: var(--pixel-lcd-well);
}

.spectrum-bars {
  flex: 1;
  min-width: 0;
  height: 100%;
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  align-items: end;
  gap: 3px;
}

.spectrum-bar {
  height: 4px;
  border-radius: 1px;
  background: color-mix(in srgb, var(--v2-accent) 30%, var(--v2-line));
  transition: height 200ms steps(3, end), background 220ms ease;
}

.radio-deck-screen.active .spectrum-bar {
  height: var(--peak, 68%);
  background-color: var(--v2-accent);
  background-image: repeating-linear-gradient(
    to top,
    var(--v2-accent) 0 3px,
    transparent 3px 5px
  );
  animation: deck-spectrum 0.96s steps(4, end) infinite;
  animation-delay: var(--delay, 0s);
  transform-origin: bottom;
}

.radio-deck-screen.loading .spectrum-bar {
  height: 42%;
  background: var(--v2-alert);
  animation: deck-spectrum 0.6s steps(3, end) infinite;
  animation-delay: var(--delay, 0s);
  transform-origin: bottom;
}

@keyframes deck-spectrum {
  0%, 100% { transform: scaleY(0.32); }
  50% { transform: scaleY(1); }
}

.deck-readout {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: space-between;
  height: 100%;
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}

.deck-tag {
  font-size: 8.5px;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: var(--v2-accent);
  line-height: 1;
}

.deck-state {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: var(--v2-muted);
  line-height: 1;
}

.radio-deck-screen.active .deck-state {
  color: var(--v2-accent);
}

.player-controls {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* Timeline: local / imported audio progress, live stream indicator */
.timeline {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 16px;
}

.time-label {
  min-width: 38px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--v2-muted);
  flex-shrink: 0;
}

.live-divider {
  flex: 1;
  height: 2px;
  background: repeating-linear-gradient(
    90deg,
    var(--v2-line) 0 4px,
    transparent 4px 8px
  );
}

.progress-track {
  position: relative;
  flex: 1;
  height: 16px;
  display: flex;
  align-items: center;
  cursor: pointer;
  touch-action: none;
}

.progress-track.disabled {
  cursor: default;
  opacity: 0.5;
}

.progress-track::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  height: 3px;
  border-radius: 2px;
  background: var(--ui-hover);
}

.progress-fill {
  position: absolute;
  left: 0;
  height: 4px;
  border-radius: 0;
  background: repeating-linear-gradient(
    90deg,
    var(--focus-color) 0 4px,
    transparent 4px 6px
  );
  pointer-events: none;
  transition: width 0.12s linear;
}

.progress-track.dragging .progress-fill {
  transition: none;
}

.progress-thumb {
  position: absolute;
  width: 8px;
  height: 8px;
  border-radius: 1px;
  background: var(--v2-accent);
  box-shadow: var(--pixel-bevel-sm);
  transform: translateX(-50%);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s ease;
}

.progress-track:hover .progress-thumb,
.progress-track.dragging .progress-thumb {
  opacity: 1;
}

.live-badge {
  flex-shrink: 0;
  padding: 2px 6px;
  border-radius: 4px;
  background-color: color-mix(in srgb, var(--v2-danger, #c44a3f) 14%, transparent);
  background-image: repeating-conic-gradient(color-mix(in srgb, var(--v2-danger, #c44a3f) 11%, transparent) 0% 25%, transparent 0% 50%);
  background-size: 4px 4px;
  border: 1px solid color-mix(in srgb, var(--v2-danger, #c44a3f) 34%, transparent);
  color: var(--v2-danger, #c44a3f);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.live-bars {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  height: 12px;
  flex: 1;
}

.live-bars span {
  width: 3px;
  height: 100%;
  border-radius: 1px;
  background: color-mix(in srgb, var(--v2-accent) 78%, transparent);
  animation: live-bar 0.9s steps(4, end) infinite;
  transform-origin: bottom;
}

.live-bars span:nth-child(2) {
  animation-delay: 0.15s;
}

.live-bars span:nth-child(3) {
  animation-delay: 0.3s;
}

.live-bars span:nth-child(4) {
  animation-delay: 0.45s;
}

.live-bars.paused span {
  animation-play-state: paused;
  opacity: 0.4;
}

@keyframes live-bar {
  0%, 100% { transform: scaleY(0.35); }
  50% { transform: scaleY(1); }
}

.live-hint {
  flex-shrink: 0;
  font-size: 9px;
  color: var(--v2-muted);
}

.play-btn {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--v2-surface);
  border: 1px solid var(--v2-line);
  border-radius: 11px;
  box-shadow: var(--pixel-keycap);
  color: var(--v2-ink);
  cursor: pointer;
  flex-shrink: 0;
  transition: background-color 220ms ease, border-color 220ms ease, transform 180ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 180ms ease;
  position: relative;
  overflow: hidden;
}

.play-btn:hover {
  border-color: var(--v2-accent);
  color: var(--v2-accent);
}

.play-btn:active:not(:disabled) {
  transform: translate3d(0, 2px, 0);
  box-shadow: var(--pixel-keycap-pressed);
}

.play-btn.is-playing {
  background-color: var(--focus-color);
  background-image: var(--pixel-dither-coarse);
  border-color: color-mix(in srgb, #000 20%, var(--focus-color));
  color: var(--v2-on-accent);
  box-shadow: var(--pixel-bevel);
}

.play-btn.is-playing:hover {
  filter: brightness(1.06);
}

.play-btn.is-playing:active:not(:disabled) {
  transform: translate3d(0, 2px, 0);
  box-shadow: var(--pixel-bevel-pressed);
}

.play-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
  transform: none;
}

.play-btn:disabled:hover {
  border-color: var(--v2-muted);
  color: var(--v2-ink);
  transform: none;
}

.play-btn:disabled::before {
  opacity: 0;
}

.play-btn svg {
  width: 20px;
  height: 20px;
  position: relative;
  z-index: 1;
}

.error-msg {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--v2-danger, #c44a3f) 10%, var(--ui-well));
  border: 1px solid color-mix(in srgb, var(--v2-danger, #c44a3f) 28%, var(--v2-line));
  font-size: 11px;
  line-height: 1.45;
  color: var(--v2-danger, #c44a3f);
}

.error-text {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}

.error-dismiss {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: inherit;
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  opacity: 0.72;
}

.error-dismiss:hover {
  opacity: 1;
  background: color-mix(in srgb, var(--v2-danger, #c44a3f) 14%, transparent);
}

.volume-row {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
}

.vol-icon {
  width: 16px;
  height: 16px;
  color: var(--v2-secondary);
  flex-shrink: 0;
  image-rendering: pixelated;
}

.volume-slider {
  flex: 1;
  min-width: 0;
  -webkit-appearance: none;
  appearance: none;
  height: 6px;
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
  border-radius: 2px;
  outline: none;
  cursor: pointer;
  position: relative;
}

.volume-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 10px;
  height: 14px;
  background: var(--v2-accent);
  border: 1px solid color-mix(in srgb, #000 18%, var(--v2-accent));
  border-radius: 2px;
  cursor: pointer;
  box-shadow: var(--pixel-bevel-sm);
  transition: transform 0.16s ease, filter 0.16s ease;
}

.volume-slider::-webkit-slider-thumb:hover {
  transform: scale(1.08);
  filter: brightness(1.08);
}

.volume-slider::-webkit-slider-thumb:active {
  transform: scale(1.04);
}

.vol-value {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  color: var(--v2-secondary);
  min-width: 26px;
  flex-shrink: 0;
}

.station-list-wrapper {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 10px 16px;
  overflow-y: auto;
}

.category-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.category-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 600;
  color: var(--v2-secondary);
  padding-left: 2px;
  letter-spacing: 0.3px;
}

.category-title::before {
  content: '';
  width: 5px;
  height: 5px;
  border-radius: 1px;
  background: var(--v2-accent);
  opacity: 0.72;
  flex-shrink: 0;
}

.station-list {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.station-item {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 8px 10px;
  background: var(--v2-surface);
  border: 1px solid var(--v2-line);
  border-radius: 11px;
  box-shadow: inset 0 1px 0 var(--v2-specular);
  cursor: pointer;
  transition: background-color 180ms ease, border-color 180ms ease, transform 180ms cubic-bezier(0.22, 1, 0.36, 1), color 180ms ease;
  color: var(--v2-secondary);
  text-align: left;
}

.station-item:hover {
  background: color-mix(in srgb, var(--v2-accent) 5%, var(--v2-surface));
  border-color: color-mix(in srgb, var(--v2-accent) 30%, var(--v2-line));
  color: var(--v2-ink);
}

.station-item.active {
  background-color: color-mix(in srgb, var(--focus-color) 11%, var(--v2-surface));
  background-image: repeating-conic-gradient(color-mix(in srgb, var(--focus-color) 8%, transparent) 0% 25%, transparent 0% 50%);
  background-size: 6px 6px;
  border-color: color-mix(in srgb, var(--focus-color) 42%, var(--v2-line));
  box-shadow: inset 0 1px 0 var(--v2-specular), inset 3px 0 0 var(--focus-color);
  color: var(--v2-ink);
}

.item-icon {
  position: relative;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: var(--ui-well);
  border: 1px solid var(--v2-line);
  border-radius: 7px;
  box-shadow: var(--pixel-keycap);
  color: var(--v2-secondary);
  transition: background 180ms ease, border-color 180ms ease, color 180ms ease;
}

.station-item:hover .item-icon {
  border-color: color-mix(in srgb, var(--v2-accent) 32%, var(--v2-line));
  color: var(--v2-accent);
}

.station-item.active .item-icon {
  background-color: var(--focus-color);
  background-image: var(--pixel-dither);
  border-color: color-mix(in srgb, #000 18%, var(--focus-color));
  box-shadow: var(--pixel-bevel-sm);
  color: var(--v2-on-accent);
}

.item-icon svg {
  width: 16px;
  height: 16px;
  image-rendering: pixelated;
}

.playing-indicator {
  position: absolute;
  bottom: 2px;
  right: 2px;
  display: flex;
  align-items: flex-end;
  gap: 1.5px;
  height: 8px;
}

.playing-indicator span {
  width: 2px;
  background: var(--focus-color);
  border-radius: 1px;
  animation: eq-bar 0.8s ease-in-out infinite;
}

.playing-indicator span:nth-child(1) {
  height: 3px;
  animation-delay: 0s;
}

.playing-indicator span:nth-child(2) {
  height: 6px;
  animation-delay: 0.15s;
}

.playing-indicator span:nth-child(3) {
  height: 4px;
  animation-delay: 0.3s;
}

@keyframes eq-bar {
  0%, 100% { height: 3px; }
  50% { height: 8px; }
}

.item-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.item-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.item-name {
  min-width: 0;
  font-size: 12.5px;
  font-weight: 600;
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-tags {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.tag {
  font-size: 8.5px;
  font-weight: 500;
  padding: 1px 5px;
  background: var(--ui-well);
  border-radius: 4px;
  color: var(--v2-muted);
  white-space: nowrap;
  transition: all 0.2s ease;
}

.station-item:hover .tag {
  background: var(--ui-hover);
  color: var(--v2-secondary);
}

.station-item.active .tag {
  background: color-mix(in srgb, var(--focus-color) 25%, transparent);
  color: color-mix(in srgb, var(--focus-color) 80%, white);
}

.item-desc {
  font-size: 10.5px;
  line-height: 1.3;
  color: var(--v2-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
}

.station-item.active .item-desc {
  color: var(--v2-secondary);
}

.scroll-to-playing-btn {
  position: absolute;
  bottom: 18px;
  right: 14px;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--focus-color);
  background-image: var(--pixel-dither);
  border: 1px solid color-mix(in srgb, #000 18%, var(--focus-color));
  border-radius: 10px;
  color: var(--v2-on-accent);
  cursor: pointer;
  box-shadow: var(--pixel-bevel-sm);
  transition: all 0.2s ease;
  z-index: 20;
}

.scroll-to-playing-btn:hover {
  transform: scale(1.08);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.15);
}

.scroll-to-playing-btn:active {
  transform: scale(0.95);
}

.scroll-to-playing-btn svg {
  width: 18px;
  height: 18px;
}

.fade-scale-enter-active,
.fade-scale-leave-active {
  transition: all 0.25s ease;
}

.fade-scale-enter-from,
.fade-scale-leave-to {
  opacity: 0;
  transform: scale(0.8);
}

.station-list-wrapper::-webkit-scrollbar {
  width: 4px;
}

.station-list-wrapper::-webkit-scrollbar-track {
  background: transparent;
}

.station-list-wrapper::-webkit-scrollbar-thumb {
  background: var(--ui-hover);
  border-radius: 2px;
}
</style>
