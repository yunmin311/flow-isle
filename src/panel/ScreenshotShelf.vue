<script setup lang="ts">
import { onUnmounted, ref } from 'vue'
import { useScreenshots } from '../composables/useScreenshots'
import { formatNotifTime } from '../composables/useNotifications'
const { records, enabled, error, setEnabled, copyScreenshot, removeScreenshot, clearScreenshots } = useScreenshots()
const expanded = ref(false)
const status = ref('')
const copying = ref<string | null>(null)
const clearing = ref(false)
const confirmingClear = ref(false)
let statusTimer: number | null = null

function clearStatusTimer() {
  if (statusTimer !== null) {
    window.clearTimeout(statusTimer)
    statusTimer = null
  }
}

function setStatus(msg: string) {
  clearStatusTimer()
  status.value = msg
  if (msg) {
    statusTimer = window.setTimeout(() => {
      status.value = ''
      statusTimer = null
    }, 2400)
  }
}

onUnmounted(() => {
  clearStatusTimer()
})

async function toggleCollection(event: Event) {
  setStatus('')
  await setEnabled((event.target as HTMLInputElement).checked)
}
async function copy(id: string) {
  if (copying.value) return
  copying.value = id
  setStatus('')
  try { await copyScreenshot(id); setStatus('原图已复制，可直接粘贴') }
  catch { setStatus('复制失败，原图可能已被移除，请重新截图') }
  finally { copying.value = null }
}
async function discard(id: string) {
  setStatus('')
  try { await removeScreenshot(id); setStatus('截图已移除') }
  catch { setStatus('移除失败，请重试') }
}
async function clearAll() {
  if (clearing.value) return
  clearing.value = true
  setStatus('')
  try { await clearScreenshots(); setStatus('全部截图及本机原图已清空'); expanded.value = false }
  catch { setStatus('部分截图未能清空，请重试') }
  finally { clearing.value = false; confirmingClear.value = false }
}
</script>

<template>
  <section class="screenshot-shelf" aria-label="截图">
    <div class="screenshot-heading">
      <div class="screenshot-heading-left">
        <span class="shelf-pixel-pip" :class="{ active: enabled }" aria-hidden="true"></span>
        <span class="screenshot-title" title="收集运行期间复制到剪贴板的图片（包括截图），仅保存在本机；最多 20 张，保留 7 天。不会收集启动前的图片。">截图</span>
        <span class="screenshot-count">{{ records.length }}</span>
      </div>
      <div class="screenshot-heading-actions">
        <span v-if="status" class="screenshot-status-pill" role="status">{{ status }}</span>
        <button class="clear-screenshots" :disabled="!records.length || clearing || copying !== null" @click="confirmingClear = !confirmingClear">清空全部截图</button>
      </div>
    </div>
    <div class="capture-controls">
      <label class="capture-toggle"><input class="capture-switch" type="checkbox" :checked="enabled" aria-describedby="screenshot-capture-scope" @change="toggleCollection"><span>自动收集</span></label>
      <span id="screenshot-capture-scope" class="capture-scope">默认开启 · 包含普通图片 · 仅本机保存</span>
    </div>
    <div v-if="confirmingClear" class="clear-confirmation" role="group" aria-label="确认清空截图">
      <span>移除全部 {{ records.length }} 张截图及本机原图？</span>
      <div class="clear-confirmation-actions">
        <button class="confirm-danger" :disabled="clearing || copying !== null" @click="clearAll">{{ clearing ? '清空中…' : '确认清空' }}</button>
        <button :disabled="clearing" @click="confirmingClear = false">取消</button>
      </div>
    </div>
    <div v-if="records.length" class="screenshot-grid">
      <article v-for="shot in (expanded ? records : records.slice(0, 2))" :key="shot.id" class="screenshot-card">
        <button class="screenshot-preview" :aria-label="`复制 ${formatNotifTime(shot.time)} 的截图原图`" :disabled="clearing || copying !== null" @click="copy(shot.id)">
          <img :src="shot.thumbnail" alt="截图缩略图" loading="lazy">
        </button>
        <div class="screenshot-meta"><time>{{ formatNotifTime(shot.time) }}</time><span>{{ shot.width }} × {{ shot.height }}</span></div>
        <div class="screenshot-actions">
          <button :disabled="clearing || copying !== null" @click="copy(shot.id)">{{ copying === shot.id ? '复制中…' : '复制原图' }}</button>
          <button :disabled="clearing || copying !== null" @click="discard(shot.id)">移除</button>
        </div>
      </article>
    </div>
    <p v-else class="screenshot-empty">{{ enabled ? '截图复制后会显示在这里，也支持普通图片' : '已暂停收集剪贴板图片' }}</p>
    <button v-if="records.length > 2" class="screenshot-more" @click="expanded = !expanded">{{ expanded ? '收起' : `查看其余 ${records.length - 2} 张` }}</button>
    <p v-if="error" class="screenshot-error" role="alert">{{ error }}</p>
  </section>
</template>

<style scoped>
.screenshot-shelf {
  margin-bottom: 14px;
  padding: 11px 12px;
  border-radius: 12px;
  background: var(--v2-surface);
  border: 1px solid var(--v2-line);
  box-shadow: inset 0 1px 0 var(--v2-specular);
  color: var(--v2-ink);
  font-size: 12px;
}
.screenshot-heading, .screenshot-meta, .screenshot-actions { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.screenshot-heading { margin-bottom: 8px; flex-wrap: wrap; gap: 6px; }
.screenshot-heading-left, .screenshot-heading-actions { display: inline-flex; align-items: center; gap: 6px; min-width: 0; }
.shelf-pixel-pip {
  width: 6px;
  height: 6px;
  border-radius: 1px;
  background: var(--v2-muted);
  opacity: 0.45;
  flex-shrink: 0;
  transition: background 180ms ease, opacity 180ms ease;
}
.shelf-pixel-pip.active {
  background: var(--v2-accent);
  opacity: 1;
}
.screenshot-heading-actions { flex-wrap: wrap; justify-content: flex-end; }
.screenshot-title { font-size: 13px; font-weight: 600; color: var(--v2-ink); }
.screenshot-count {
  padding: 1px 6px;
  border-radius: 6px;
  background: var(--ui-well);
  font-size: 10.5px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--v2-secondary);
}
.screenshot-status-pill {
  padding: 2px 7px;
  border-radius: 6px;
  background: var(--v2-accent-soft);
  color: var(--v2-accent);
  font-size: 10.5px;
  font-weight: 500;
  line-height: 1.3;
}
.capture-controls {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 5px 10px;
  padding: 7px 9px;
  border-radius: 8px;
  background: var(--ui-well);
}
.capture-toggle { display: inline-flex; align-items: center; gap: 7px; color: var(--v2-ink); font-weight: 500; cursor: pointer; }
.capture-switch {
  appearance: none;
  -webkit-appearance: none;
  position: relative;
  width: 28px;
  height: 16px;
  margin: 0;
  border-radius: 999px;
  border: 1px solid var(--v2-line);
  background: color-mix(in srgb, var(--v2-ink) 14%, transparent);
  cursor: pointer;
  flex-shrink: 0;
  transition: background 180ms ease, border-color 180ms ease;
}
.capture-switch::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 10px;
  height: 10px;
  border-radius: 2px;
  background: var(--v2-on-accent);
  box-shadow: var(--pixel-bevel-sm);
  transition: transform 200ms cubic-bezier(0.22, 1, 0.36, 1);
}
.capture-switch:checked {
  background-color: var(--v2-accent);
  background-image: var(--pixel-dither);
  border-color: color-mix(in srgb, #000 16%, var(--v2-accent));
}
.capture-switch:checked::after {
  transform: translate3d(12px, 0, 0);
}
.capture-scope { font-size: 10.5px; color: var(--v2-muted); }
.clear-screenshots {
  padding: 3px 8px;
  border-radius: 7px;
  border: 1px solid var(--v2-line);
  background: var(--ui-well);
  color: var(--v2-secondary);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
  transition: background 140ms ease, color 140ms ease, border-color 140ms ease, transform 140ms cubic-bezier(0.34, 1.56, 0.64, 1);
}
.clear-screenshots:hover:not(:disabled) {
  background: var(--ui-hover);
  color: var(--v2-ink);
  border-color: var(--v2-accent);
}
.clear-screenshots:active:not(:disabled) { transform: scale(0.97); }
.clear-screenshots:disabled { opacity: 0.38; cursor: default; }
.clear-confirmation {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 6px 10px;
  padding: 8px 10px;
  margin-top: 8px;
  border-radius: 8px;
  background: var(--ui-well);
  border: 1px solid var(--v2-line);
  font-size: 11px;
}
.clear-confirmation-actions { display: inline-flex; gap: 6px; }
.clear-confirmation button {
  padding: 3px 9px;
  border-radius: 6px;
  border: 1px solid var(--v2-line);
  background: var(--v2-surface);
  color: var(--v2-secondary);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}
.clear-confirmation button.confirm-danger {
  border-color: color-mix(in srgb, var(--alert-color) 36%, transparent);
  background: color-mix(in srgb, var(--alert-color) 12%, transparent);
  color: var(--alert-color);
}
.screenshot-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 9px; }
.screenshot-card {
  min-width: 0;
  padding: 7px;
  border-radius: 10px;
  background: var(--ui-well);
  border: 1px solid var(--v2-line);
  transition: transform 180ms cubic-bezier(0.34, 1.56, 0.64, 1), border-color 140ms ease;
}
.screenshot-card:hover { transform: translate3d(0, -1px, 0); border-color: color-mix(in srgb, var(--v2-accent) 34%, var(--v2-line)); }
.screenshot-preview { width: 100%; height: 90px; display: flex; align-items: center; justify-content: center; border: 0; border-radius: 7px; padding: 4px; background: var(--v2-surface); cursor: copy; }
.screenshot-preview img { max-width: 100%; max-height: 100%; object-fit: contain; border-radius: 4px; }
.screenshot-meta { margin: 6px 0; font-size: 10.5px; color: var(--v2-muted); flex-wrap: wrap; gap: 2px; }
.screenshot-actions button, .screenshot-more { border: 0; background: transparent; color: var(--v2-secondary); font: inherit; cursor: pointer; padding: 3px 0; }
.screenshot-actions button:first-child { color: var(--v2-accent); font-weight: 500; }
.screenshot-more {
  width: 100%;
  margin-top: 8px;
  padding: 5px 8px;
  border-radius: 7px;
  background: var(--ui-well);
  font-size: 11px;
}
.screenshot-empty {
  margin: 8px 0 0;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--ui-well);
  border: 1px dashed var(--v2-line);
  font-size: 11px;
  color: var(--v2-muted);
  text-align: center;
  line-height: 1.5;
}
.screenshot-error { font-size: 11px; color: var(--alert-color); line-height: 1.5; margin: 8px 0 0; }
button:disabled:not(.clear-screenshots) { opacity: .5; cursor: wait; }
button:focus-visible, .capture-switch:focus-visible { outline: 2px solid var(--v2-accent); outline-offset: 2px; }
</style>
