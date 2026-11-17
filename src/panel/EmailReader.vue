<script setup lang="ts">
// Reader flow adapted from Fly Island v3.0.8 (MIT); see THIRD_PARTY_NOTICES.md.
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-shell'
import type { NotificationRecord } from '../composables/useNotifications'
import { emailInboxUrl } from '../utils/emailLinks'
import { safeMailLink, sanitizeMailHtml } from '../utils/mailHtml'

const props = defineProps<{ record: NotificationRecord }>()
const emit = defineEmits<{ back: [] }>()
type MailBody = { content: string; contentType: string; images?: [string, string][]; imageWarning?: boolean }
const body = ref<MailBody | null>(null)
const imageLoading = ref(false)
const imageError = ref('')
const loading = ref(false)
const error = ref('')
const linkError = ref('')
const remoteImages = ref(false)
const reader = ref<HTMLElement | null>(null)
let generation = 0
const html = computed(() => body.value?.contentType === 'text/html'
  ? sanitizeMailHtml(body.value.content, remoteImages.value, body.value.images) : '')
const inbox = computed(() => emailInboxUrl(props.record.emailProvider))
const timestamp = computed(() => new Date(props.record.time).toLocaleString('zh-CN'))

async function load(withImages = false) {
  const request = ++generation
  imageError.value = ''
  if (withImages) imageLoading.value = true
  else { loading.value = true; error.value = ''; body.value = null; remoteImages.value = false }
  try {
    const result = await invoke<MailBody>('read_email_body', { recordId: props.record.id, accountId: props.record.emailAccountId ?? null, accountAddress: props.record.emailAccountAddress ?? null, includeImages: withImages })
    if (request === generation) { body.value = result; remoteImages.value = withImages; if (result.imageWarning) imageError.value = '部分内嵌图片未能读取，可重试或打开网页邮箱' }
  } catch (reason) {
    if (request === generation) {
      if (withImages) { remoteImages.value = true; imageError.value = '内嵌图片加载失败，已尝试加载外部图片' }
      else error.value = typeof reason === 'string' ? reason : '正文加载失败，请重试'
    }
  } finally {
    if (request === generation) { loading.value = false; imageLoading.value = false }
  }
}
async function openLink(value: string) {
  const url = safeMailLink(value)
  if (!url) return
  linkError.value = ''
  try { await open(url) }
  catch { linkError.value = '无法打开浏览器，请稍后重试' }
}
function imageFailed(event: Event) {
  if (!(event.target instanceof HTMLImageElement)) return
  const placeholder = document.createElement('span')
  placeholder.className = 'mail-image-placeholder'
  placeholder.textContent = `${event.target.alt || '邮件图片'} · 加载失败`
  event.target.replaceWith(placeholder)
  imageError.value = '图片可能已过期、需要登录或被服务器拒绝，可打开网页邮箱查看'
}
function followLink(event: MouseEvent) {
  const link = event.target instanceof Element ? event.target.closest('a') : null
  if (!link) return
  event.preventDefault()
  void openLink(link.getAttribute('href') ?? '')
}
watch(() => props.record.id, () => {
  linkError.value = ''
  void load()
  void nextTick(() => { reader.value?.focus(); reader.value?.scrollTo(0, 0) })
}, { immediate: true })
onUnmounted(() => { ++generation })
</script>

<template>
  <section class="email-reader" aria-label="邮件阅读" @keydown.esc.stop="emit('back')">
    <header class="reader-toolbar">
      <button type="button" @click="emit('back')">← 返回列表</button>
      <button v-if="inbox" type="button" @click="openLink(inbox)">网页邮箱 ↗</button>
    </header>
    <div v-if="linkError" class="reader-error" role="alert">{{ linkError }}</div>
    <article ref="reader" class="reader-scroll" tabindex="-1" :aria-busy="loading">
      <h2>{{ record.title }}</h2>
      <div class="reader-meta"><span>收件邮箱 · {{ record.emailAccountAddress || record.emailProvider || '旧记录未标记' }}</span><span>{{ record.detail }}</span><time>{{ timestamp }}</time></div>
      <div v-if="loading" class="reader-state" role="status">正在读取邮件正文…</div>
      <div v-else-if="error" class="reader-state">
        <p class="reader-error" role="alert">{{ error }}</p>
        <button type="button" @click="load()">重新加载</button>
      </div>
      <template v-else-if="body">
        <div v-if="body.contentType === 'text/html'" class="reader-body" @error.capture="imageFailed" @click="followLink" @auxclick.prevent v-html="html || '<p>这封邮件没有可显示的文字正文。</p>'" />
        <div v-else class="reader-body reader-text">{{ body.content || '这封邮件没有文字正文。' }}</div>
      </template>
    </article>
    <p v-if="imageError" class="reader-error" role="status">{{ imageError }}</p>
    <footer class="reader-footer">
      <span>只读 · 不改变邮箱已读状态</span>
      <button v-if="body?.contentType === 'text/html'" :disabled="imageLoading" type="button" @click="load(true)" title="图片将从发件人的服务器加载，可能告知对方你已阅读">{{ imageLoading ? '图片加载中…' : remoteImages ? '重新加载图片' : '加载图片' }}</button>
    </footer>
  </section>
</template>

<style scoped>
.email-reader { display: flex; flex-direction: column; flex: 1; min-height: 0; min-width: 0; color: var(--v2-ink); }
.reader-toolbar { display: flex; justify-content: space-between; gap: 8px; padding: 4px 0 10px; border-bottom: 1px solid var(--v2-line); }
button { font: inherit; font-size: 11px; color: var(--v2-secondary); border: 0; border-radius: 6px; background: var(--ui-well); padding: 6px 8px; cursor: pointer; }
button:hover { background: var(--ui-hover); color: var(--v2-ink); }
button:focus-visible { outline: 2px solid var(--v2-accent); outline-offset: 2px; }
.reader-scroll { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; padding: 16px 4px 20px; scrollbar-width: thin; overflow-wrap: anywhere; }
.reader-scroll:focus { outline: none; }
h2 { font-size: 18px; font-weight: 600; line-height: 1.5; margin: 0 0 12px; }
.reader-meta { display: flex; flex-direction: column; gap: 4px; color: var(--v2-secondary); font-size: 11px; line-height: 1.6; margin-bottom: 22px; }
.reader-meta time { color: var(--v2-muted); font-variant-numeric: tabular-nums; }
.reader-state { padding: 24px 4px; font-size: 12px; line-height: 1.7; color: var(--v2-secondary); }
.reader-error { color: var(--alert-color); font-size: 12px; overflow-wrap: anywhere; }
.reader-body { font-size: 13px; line-height: 1.75; overflow-wrap: anywhere; }
.reader-text { white-space: pre-wrap; }
.reader-body :deep(p) { margin: 0 0 1em; }
.reader-body :deep(h1), .reader-body :deep(h2), .reader-body :deep(h3) { font-size: 16px; font-weight: 600; line-height: 1.6; }
.reader-body :deep(a) { color: var(--v2-accent); text-decoration: underline; }
.reader-body :deep(img) { max-width: 100%; height: auto; object-fit: contain; }
.reader-body :deep(.mail-image-placeholder) { display: block; box-sizing: border-box; padding: 7px 9px; margin: 5px 0; border-radius: 6px; background: var(--ui-well); color: var(--v2-secondary); font-size: 11px; line-height: 1.6; }
.reader-body :deep(table) { border-collapse: collapse; font-size: inherit; }
/* Newsletter tables describe layout, not data. Let columns wrap without adding
   nested cell padding or decorative rules that squeeze narrow mail panels. */
.reader-body :deep(.mail-layout-table),
.reader-body :deep(.mail-layout-table > :is(thead, tbody, tfoot)) { display: block; width: 100%; min-width: 0; }
.reader-body :deep(.mail-layout-table > tr),
.reader-body :deep(.mail-layout-table > :is(thead, tbody, tfoot) > tr) { display: flex; flex-wrap: wrap; gap: 8px 12px; }
.reader-body :deep(.mail-layout-table > tr > :is(td, th)),
.reader-body :deep(.mail-layout-table > :is(thead, tbody, tfoot) > tr > :is(td, th)) { display: block; flex: 1 1 140px; min-width: 0; max-width: 100%; padding: 0; border: 0; }
.reader-body :deep(.mail-layout-table td:empty) { display: none; }
.reader-body :deep(.mail-data-table) { max-width: 100%; overflow-x: auto; margin: 8px 0 14px; }
.reader-body :deep(.mail-data-table > table) { width: max-content; min-width: 100%; font-size: 12px; overflow-wrap: normal; word-break: normal; }
.reader-body :deep(.mail-data-table > table > :is(thead, tbody, tfoot) > tr > :is(th, td)) { padding: 6px 8px; border-bottom: 1px solid var(--v2-line); }
.reader-body :deep(.mail-data-table:focus-visible) { outline: 1px solid var(--v2-accent); outline-offset: -1px; }
.reader-body :deep(pre) { overflow-x: auto; white-space: pre-wrap; background: var(--ui-well); padding: 10px; border-radius: 6px; }
.reader-body :deep(blockquote) { margin: 12px 0; border-left: 2px solid var(--v2-line); padding-left: 12px; color: var(--v2-secondary); }
.reader-footer { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 5px; border-top: 1px solid var(--v2-line); padding-top: 8px; font-size: 10px; color: var(--v2-muted); }
</style>
