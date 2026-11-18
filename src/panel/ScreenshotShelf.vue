<script setup lang="ts">
import { ref } from 'vue'
import { useScreenshots } from '../composables/useScreenshots'
import { formatNotifTime } from '../composables/useNotifications'
const { records, enabled, error, setEnabled, copyScreenshot, removeScreenshot, clearScreenshots } = useScreenshots()
const expanded = ref(false)
const status = ref('')
const copying = ref<string | null>(null)
const clearing = ref(false)
const confirmingClear = ref(false)
async function toggleCollection(event: Event) {
  status.value = ''
  await setEnabled((event.target as HTMLInputElement).checked)
}
async function copy(id: string) {
  if (copying.value) return
  copying.value = id
  status.value = ''
  try { await copyScreenshot(id); status.value = '原图已复制，可直接粘贴' }
  catch { status.value = '复制失败，原图可能已被移除，请重新截图' }
  finally { copying.value = null }
}
async function discard(id: string) {
  status.value = ''
  try { await removeScreenshot(id); status.value = '截图已移除' }
  catch { status.value = '移除失败，请重试' }
}
async function clearAll() {
  if (clearing.value) return
  clearing.value = true
  status.value = ''
  try { await clearScreenshots(); status.value = '全部截图及本机原图已清空'; expanded.value = false }
  catch { status.value = '部分截图未能清空，请重试' }
  finally { clearing.value = false; confirmingClear.value = false }
}
</script>

<template>
  <section class="screenshot-shelf" aria-label="截图">
    <div class="screenshot-heading">
      <span class="screenshot-title" title="收集运行期间复制到剪贴板的图片（包括截图），仅保存在本机；最多 20 张，保留 7 天。不会收集启动前的图片。">截图 <span class="screenshot-count">{{ records.length }}</span></span>
      <button class="clear-screenshots" :disabled="!records.length || clearing || copying !== null" @click="confirmingClear = !confirmingClear">清空全部截图</button>
    </div>
    <div class="capture-controls">
      <label class="capture-toggle"><input type="checkbox" :checked="enabled" aria-describedby="screenshot-capture-scope" @change="toggleCollection">自动收集</label>
      <span id="screenshot-capture-scope" class="capture-scope">默认开启 · 包含普通图片 · 仅本机保存</span>
    </div>
    <div v-if="confirmingClear" class="clear-confirmation" role="group" aria-label="确认清空截图">
      <span>移除全部 {{ records.length }} 张截图及本机原图？</span>
      <button :disabled="clearing || copying !== null" @click="clearAll">{{ clearing ? '清空中…' : '确认清空' }}</button>
      <button :disabled="clearing" @click="confirmingClear = false">取消</button>
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
    <p v-if="error" class="screenshot-status" role="alert">{{ error }}</p>
    <p v-if="status" class="screenshot-status" role="status">{{ status }}</p>
  </section>
</template>

<style scoped>
.screenshot-shelf { margin-bottom: 16px; color: var(--v2-ink); font-size: 12px; }
.screenshot-heading, .screenshot-meta, .screenshot-actions { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.screenshot-heading { margin-bottom: 8px; }
.screenshot-title { font-weight: 600; }
.screenshot-count { margin-left: 4px; font-size: 11px; font-weight: 400; color: var(--v2-muted); }
.capture-toggle { display: flex; align-items: center; gap: 5px; color: var(--v2-secondary); cursor: pointer; }
.capture-toggle input { margin: 0; accent-color: var(--focus-color); }
.capture-controls { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 10px; margin-bottom: 8px; }
.capture-scope { font-size: 11px; color: var(--v2-secondary); }
.clear-confirmation { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; padding: 8px; margin-bottom: 8px; border-radius: 6px; background: var(--ui-well); }
.screenshot-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.screenshot-card { min-width: 0; padding: 7px; border-radius: 8px; background: var(--v2-surface); border: 1px solid var(--v2-line); }
.screenshot-preview { width: 100%; height: 90px; display: flex; align-items: center; justify-content: center; border: 0; border-radius: 4px; padding: 4px; background: var(--ui-well); cursor: copy; }
.screenshot-preview img { max-width: 100%; max-height: 100%; object-fit: contain; }
.screenshot-meta { margin: 6px 0; font-size: 11px; color: var(--v2-secondary); flex-wrap: wrap; gap: 2px; }
.screenshot-actions button, .screenshot-more, .clear-screenshots, .clear-confirmation button { border: 0; background: transparent; color: var(--v2-secondary); font: inherit; cursor: pointer; padding: 3px 0; }
.screenshot-actions button:first-child { color: var(--focus-color); }
.screenshot-more { width: 100%; margin-top: 6px; }
.screenshot-empty, .screenshot-status { font-size: 11px; color: var(--v2-secondary); line-height: 1.5; margin: 6px 0; }
button:disabled { opacity: .5; cursor: wait; }
button:focus-visible { outline: 2px solid var(--focus-color); outline-offset: 2px; }
</style>
