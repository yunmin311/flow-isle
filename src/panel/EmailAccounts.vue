<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useSettings, type EmailAccount, type EmailProvider } from '../composables/useSettings'
const emit = defineEmits<{ editing: [value: boolean] }>()
const { settings } = useSettings()
const providers: { id: EmailProvider; label: string }[] = [
  { id: 'qq', label: 'QQ 邮箱' }, { id: '163', label: '163 邮箱' }, { id: '126', label: '126 邮箱' },
  { id: 'gmail', label: 'Gmail' }, { id: 'outlook', label: 'Outlook' }, { id: 'custom', label: '自定义 IMAP' },
]
const draft = ref<EmailAccount | null>(null)
const code = ref('')
const busy = ref(false)
const status = ref('')
const statusError = ref(false)
const saved = ref(false)
const credentials = ref<Record<string, boolean | undefined>>({})
let generation = 0
const providerHelp = computed(() => {
  switch (draft.value?.provider) {
    case 'gmail': return '使用 Google 应用专用密码。账号必须允许应用专用密码登录。'
    case 'outlook': return 'Outlook.com 和多数学校 Microsoft 365 邮箱需要 OAuth2，当前版本尚不支持。已登录 Outlook 不代表能使用授权码。'
    case 'custom': return '填写管理员提供的 IMAP 主机名，使用 TLS 端口 993。只支持授权码或应用专用密码，不支持 OAuth2。'
    default: return '在网页版邮箱开启 IMAP，生成客户端授权码。这里不能填写邮箱登录密码。'
  }
})
const endpoint = (account: EmailAccount) => ({ email: account.address.trim(), provider: account.provider, host: account.provider === 'custom' ? account.host.trim() : '' })
async function refreshList() {
  const list = [...settings.value.emailAccounts]
  await Promise.all(list.map(async account => {
    try { credentials.value[account.id] = await invoke<boolean>('email_credential_status', endpoint(account)) }
    catch { credentials.value[account.id] = undefined }
  }))
}
function edit(account?: EmailAccount) {
  if (busy.value) return
  emit('editing', true)
  draft.value = account ? { ...account } : { id: crypto.randomUUID(), address: '', provider: 'qq', host: '', enabled: true }
  code.value = ''; status.value = ''; statusError.value = false
}
function back() { if (!busy.value) { draft.value = null; code.value = ''; status.value = ''; emit('editing', false) } }
watch(() => draft.value && [draft.value.provider, draft.value.address, draft.value.host], async () => {
  const request = ++generation
  saved.value = false; code.value = ''; status.value = ''
  if (!draft.value?.address.trim()) return
  try {
    const result = await invoke<boolean>('email_credential_status', endpoint(draft.value))
    if (request === generation) saved.value = result
  } catch { /* An unavailable credential is shown, never assumed saved. */ }
})
watch(() => settings.value.emailAccounts.map(a => `${a.id}:${a.provider}:${a.address}:${a.host}`).join('|'), refreshList)
onMounted(refreshList)
async function run(action: 'save' | 'test' | 'clear') {
  if (!draft.value || busy.value) return
  const account = { ...draft.value, address: draft.value.address.trim(), host: draft.value.host.trim() }
  if (!account.address || !account.address.includes('@')) { status.value = '请填写完整邮箱地址'; statusError.value = true; return }
  busy.value = true; status.value = ''; statusError.value = false
  try {
    if (action === 'clear') {
      if (!window.confirm('只清除此账号的本机授权码？其他邮箱不受影响。')) return
      await invoke('delete_email_credential', endpoint(account))
      saved.value = false; code.value = ''
      const existing = settings.value.emailAccounts.find(a => a.id === account.id)
      if (existing) existing.enabled = false
      draft.value.enabled = false
      status.value = '已清除此账号的授权码，并暂停监听'
    } else if (action === 'test') {
      status.value = await invoke<string>('test_email_connection', { ...endpoint(account), password: code.value.trim() || null })
    } else {
      const duplicate = settings.value.emailAccounts.find(a => a.id !== account.id && a.provider === account.provider && a.address.toLowerCase() === account.address.toLowerCase() && a.host.toLowerCase() === account.host.toLowerCase())
      if (duplicate) throw '这个邮箱已在列表中，请返回编辑原账号'
      if (code.value.trim()) await invoke('save_email_credential', { ...endpoint(account), password: code.value.trim() })
      else if (!saved.value) throw '请填写此邮箱的授权码'
      const index = settings.value.emailAccounts.findIndex(a => a.id === account.id)
      if (index < 0 && settings.value.emailAccounts.length >= 10) throw '最多添加 10 个邮箱'
      if (index < 0) settings.value.emailAccounts.push(account)
      else settings.value.emailAccounts[index] = account
      code.value = ''; saved.value = true
      status.value = '账号已保存，可与其他邮箱同时监听'
    }
    await refreshList()
  } catch (error) { status.value = typeof error === 'string' ? error : '操作失败，请重试'; statusError.value = true }
  finally { busy.value = false }
}
</script>

<template>
  <div class="email-accounts">
    <template v-if="!draft">
      <div class="account-heading"><h3>邮箱通知</h3><button :disabled="settings.emailAccounts.length >= 10" @click="edit()">添加邮箱 ＋</button></div>
      <p class="account-caption">每个账号独立保存、同时监听。打开邮件时显示收件邮箱。</p>
      <p v-if="!settings.emailAccounts.length" class="account-empty">添加第一个邮箱，接收新邮件与近期离线邮件。</p>
      <div v-for="account in settings.emailAccounts" :key="account.id" class="account-row">
        <button class="account-copy" @click="edit(account)">
          <span class="account-address">{{ account.address }}</span>
          <span class="account-caption">{{ providers.find(p => p.id === account.provider)?.label }} · {{ credentials[account.id] === true ? '授权码已保存' : credentials[account.id] === false ? '需要授权码' : '正在检查凭据' }}</span>
        </button>
        <label class="switch" :aria-label="`${account.address} 邮件提醒`"><input v-model="account.enabled" type="checkbox" /><span class="switch-track" /></label>
      </div>
      <p class="account-caption account-note">旧版只保存一个授权码。仍存在的凭据会自动迁移；被覆盖的授权码需重新录入。</p>
    </template>
    <template v-else>
      <div class="account-heading"><button :disabled="busy" @click="back">← 邮箱列表</button><h3>账号设置</h3></div>
      <fieldset class="account-form" :disabled="busy">
        <label>邮箱服务<select v-model="draft.provider" aria-label="邮箱服务"><option v-for="p in providers" :key="p.id" :value="p.id">{{ p.label }}</option></select></label>
        <label>收件邮箱<input aria-label="收件邮箱" v-model="draft.address" type="email" autocomplete="off" placeholder="name@example.com" /></label>
        <label v-if="draft.provider === 'custom'">IMAP 服务器<input aria-label="IMAP 服务器" v-model="draft.host" autocomplete="off" placeholder="imap.example.com" /></label>
        <label>授权码<input aria-label="授权码" v-model="code" type="password" autocomplete="new-password" :placeholder="saved ? '已保存；留空保留原授权码' : '仅保存到 Windows 凭据管理器'" /></label>
        <details class="account-help"><summary>如何配置 {{ providers.find(p => p.id === draft?.provider)?.label }}</summary><p>{{ providerHelp }}</p></details>
        <div class="account-actions"><button class="account-primary" @click="run('save')">保存账号</button><button @click="run('test')">测试连接</button></div>
        <button v-if="saved" class="account-clear" @click="run('clear')">清除此账号授权码</button>
      </fieldset>
      <p v-if="busy || status" class="account-status" :class="{ error: statusError }" role="status">{{ busy ? '正在处理，请稍候…' : status }}</p>
    </template>
  </div>
</template>

<style scoped>
.email-accounts { min-width: 0; }
.account-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
h3 { font: inherit; font-size: 12px; font-weight: 650; margin: 0; color: var(--v2-ink); }
button, input, select { font: inherit; font-size: 12px; }
button { cursor: pointer; border: 0; color: var(--v2-secondary); background: transparent; padding: 6px 0; }
button:hover { color: var(--v2-accent); }
button:disabled { opacity: .5; cursor: default; }
.account-caption { font-size: 11px; line-height: 1.6; color: var(--v2-secondary); margin: 0; overflow-wrap: anywhere; }
.account-row { display: flex; align-items: center; gap: 12px; padding: 14px 0; border-bottom: 1px solid var(--v2-line); }
.account-copy { display: flex; flex-direction: column; gap: 4px; text-align: left; min-width: 0; flex: 1; }
.account-address { color: var(--v2-ink); font-weight: 500; overflow-wrap: anywhere; }
.account-note { margin-top: 14px; }
.account-empty { padding: 18px 0; font-size: 12px; color: var(--v2-secondary); }
.account-form { padding: 6px 0 0; margin: 0; border: 0; display: flex; flex-direction: column; gap: 16px; }
.account-form > label { display: flex; flex-direction: column; gap: 7px; font-size: 12px; color: var(--v2-ink); }
input, select { width: 100%; box-sizing: border-box; padding: 9px 10px; border: 1px solid var(--v2-line); border-radius: 7px; background: var(--ui-well); color: var(--v2-ink); outline: none; }
input:focus, select:focus { border-color: var(--v2-accent); }
select option { background: var(--v2-shell); color: var(--v2-ink); }
.account-help { color: var(--v2-secondary); font-size: 11px; line-height: 1.7; }
summary { cursor: pointer; }
.account-help p { margin: 8px 0 0; }
.account-actions { display: flex; gap: 12px; }
.account-actions button { padding: 8px 12px; border-radius: 7px; background: var(--ui-well); }
.account-actions .account-primary { color: var(--v2-accent); background: var(--ui-hover); }
.account-clear { align-self: flex-start; font-size: 11px; }
.account-status { margin-top: 14px; color: var(--v2-secondary); font-size: 11px; line-height: 1.6; }
.account-status.error { color: var(--alert-color); }
.switch { position: relative; width: 38px; height: 22px; flex-shrink: 0; }
.switch input { position: absolute; opacity: 0; width: 100%; height: 100%; margin: 0; }
.switch-track { display: block; width: 100%; height: 100%; border-radius: 12px; background: var(--ui-hover); border: 1px solid var(--v2-line); box-sizing: border-box; transition: background-color 200ms ease, border-color 200ms ease; }
.switch-track::after { content: ''; position: absolute; width: 14px; height: 14px; top: 4px; left: 4px; border-radius: 3px; background: var(--v2-muted); box-shadow: var(--pixel-bevel-sm); transition: transform .18s cubic-bezier(0.22, 1, 0.36, 1), background .18s ease; }
.switch input:checked + .switch-track { background-color: var(--v2-accent); background-image: var(--pixel-dither); border-color: color-mix(in srgb, #000 16%, var(--v2-accent)); }
.switch input:checked + .switch-track::after { transform: translateX(16px); background: var(--v2-on-accent); }
.switch input:focus-visible + .switch-track { outline: 2px solid var(--v2-accent); outline-offset: 3px; }
</style>
