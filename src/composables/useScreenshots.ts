import { readonly, ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { emitTo, listen } from '@tauri-apps/api/event'
import { readImage } from '@tauri-apps/plugin-clipboard-manager'
import { BaseDirectory, exists, mkdir, readTextFile, remove, writeTextFile } from '@tauri-apps/plugin-fs'

export interface ScreenshotRecord {
  id: string
  time: number
  width: number
  height: number
  thumbnail: string
}
interface ClipboardState { sequence: number; has_image: boolean }
const DIR = 'focus-island/screenshots'
const INDEX = `${DIR}/index.json`
const options = { baseDir: BaseDirectory.AppData }
const MAX_ITEMS = 20
const TTL = 7 * 86400000
const validId = (id: string) => /^[a-f0-9]{64}$/.test(id)
const records = ref<ScreenshotRecord[]>([])
const enabled = ref(true)
const error = ref('')
let ready: Promise<void> | undefined
let queue = Promise.resolve()
let unlisten: (() => void) | undefined
let selfWrittenSequence: number | undefined

function serial<T>(task: () => Promise<T>): Promise<T> {
  const result = queue.then(task)
  queue = result.then(() => {}, () => {})
  return result
}
async function persist(items = records.value, active = enabled.value) {
  await mkdir(DIR, { ...options, recursive: true })
  await writeTextFile(INDEX, JSON.stringify({ enabled: active, records: items }), options)
}
async function deleteFiles(items: ScreenshotRecord[]) {
  for (const item of items) {
    if (validId(item.id)) await remove(`${DIR}/${item.id}.json`, options).catch(() => {})
  }
}
async function prune() {
  const keep = records.value.filter(r => Date.now() - r.time <= TTL).slice(0, MAX_ITEMS)
  if (keep.length === records.value.length) return
  await persist(keep)
  const removed = records.value.filter(r => !keep.includes(r))
  records.value = keep
  await deleteFiles(removed)
}
async function load() {
  try {
    const data = JSON.parse(await readTextFile(INDEX, options))
    enabled.value = data.enabled !== false
    records.value = (Array.isArray(data.records) ? data.records : []).filter((r: ScreenshotRecord) =>
      typeof r.id === 'string' && validId(r.id) && Number.isFinite(r.time)
      && r.width > 0 && r.height > 0 && typeof r.thumbnail === 'string'
      && r.thumbnail.startsWith('data:image/png;base64,'))
    await prune()
  } catch { /* First launch has no screenshot history. */ }
}

async function capture(state: ClipboardState) {
  if (state.sequence === selfWrittenSequence) return
  if (!enabled.value || !state.has_image) return
  // Windows Snipping Tool (Win+Shift+S) often writes clipboard metadata twice in ~150ms,
  // incrementing sequence mid-capture. Read the latest image as long as has_image is true.
  for (let attempt = 0; attempt < 3; attempt++) {
    let image: Awaited<ReturnType<typeof readImage>> | undefined
    try {
      const before = await invoke<ClipboardState>('clipboard_image_state')
      if (!enabled.value || !before.has_image || before.sequence === selfWrittenSequence) return
      image = await readImage()
      const { width, height } = await image.size()
      if (!width || !height || width * height > 20_000_000) {
        error.value = '图片超过 2000 万像素，未收集'
        return
      }
      const rgba = await image.rgba()
      if (!enabled.value) return
      const canvas = document.createElement('canvas')
      const thumb = document.createElement('canvas')
      try {
        canvas.width = width; canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('Canvas unavailable')
        ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0)
        const original = canvas.toDataURL('image/png')
        if (original.length > 16 * 1024 * 1024) {
          error.value = '图片编码后超过 16 MB，未收集'
          return
        }
        const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(original))
        const id = Array.from(new Uint8Array(hash), n => n.toString(16).padStart(2, '0')).join('')
        await prune()
        if (records.value.some(r => r.id === id)) return // Includes copying our own saved image.
        const scale = Math.min(1, 320 / width, 180 / height)
        thumb.width = Math.max(1, Math.round(width * scale))
        thumb.height = Math.max(1, Math.round(height * scale))
        thumb.getContext('2d')!.drawImage(canvas, 0, 0, thumb.width, thumb.height)
        if (!enabled.value) return
        const record = { id, time: Date.now(), width, height, thumbnail: thumb.toDataURL('image/png') }
        await mkdir(DIR, { ...options, recursive: true })
        await writeTextFile(`${DIR}/${id}.json`, JSON.stringify(original), options)
        const next = [record, ...records.value].slice(0, MAX_ITEMS)
        try { await persist(next) } catch (reason) { await deleteFiles([record]); throw reason }
        const evicted = records.value.filter(r => !next.includes(r))
        records.value = next
        await deleteFiles(evicted)
        error.value = ''
        // 通知顶部灵动岛展示带缩略图的截图提醒
        void emitTo('main', 'screenshot-captured', record).catch(() => {})
        return
      } finally {
        // 立即归零大分辨率 Canvas，释放 4K 截图占用的临时 GPU/RAM 缓冲
        canvas.width = 0; canvas.height = 0
        thumb.width = 0; thumb.height = 0
      }
    } catch {
      if (attempt === 2) error.value = '截图读取或保存失败，请重新复制图片后重试'
      else await new Promise(resolve => setTimeout(resolve, 220))
    } finally { await image?.close().catch(() => {}) }
  }
}

export function startScreenshotCollection() {
  ready ??= (async () => {
    await load()
    unlisten = await listen<ClipboardState>('clipboard-image-changed', ({ payload }) => {
      // Check the switch immediately as well as inside the serialized job.
      if (enabled.value) void serial(() => capture(payload)).catch(() => { error.value = '截图收集失败' })
    })
    await invoke('start_clipboard_watch')
  })().catch(() => { unlisten?.(); error.value = '截图监听未能启动' })
  return ready
}

async function setEnabled(value: boolean) {
  error.value = ''
  const previous = enabled.value
  enabled.value = value
  try { await serial(() => { error.value = ''; return persist() }) } catch { enabled.value = previous; error.value = '收集开关保存失败' }
}
async function removeScreenshot(id: string) {
  error.value = ''
  await serial(async () => {
    error.value = ''
    const removed = records.value.filter(r => r.id === id)
    const next = records.value.filter(r => r.id !== id)
    await persist(next)
    records.value = next
    await deleteFiles(removed)
  })
}
async function clearScreenshots() {
  error.value = ''
  await serial(async () => {
    error.value = ''
    const failed: ScreenshotRecord[] = []
    for (const record of records.value) {
      try {
        const path = `${DIR}/${record.id}.json`
        if (await exists(path, options)) await remove(path, options)
      } catch { failed.push(record) }
    }
    await persist(failed)
    records.value = failed
    if (failed.length) throw new Error('Some screenshot files could not be removed')
  })
}
async function copyScreenshot(id: string) {
  error.value = ''
  await serial(async () => {
    error.value = ''
    if (!validId(id)) throw new Error('Invalid screenshot')
    const data: string = JSON.parse(await readTextFile(`${DIR}/${id}.json`, options))
    if (!data.startsWith('data:image/png;base64,')) throw new Error('Invalid image')
    const png = Array.from(atob(data.slice('data:image/png;base64,'.length)), c => c.charCodeAt(0))
    // Capture events queue behind this operation, including events delivered before
    // the native write returns. Skip only its sequence, never the next external image.
    selfWrittenSequence = await invoke<number>('copy_screenshot_image', { png })
  })
}

export function useScreenshots() {
  void startScreenshotCollection()
  return { records: readonly(records), enabled: readonly(enabled), error: readonly(error), setEnabled, removeScreenshot, clearScreenshots, copyScreenshot }
}
