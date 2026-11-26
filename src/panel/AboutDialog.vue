<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { open } from '@tauri-apps/plugin-shell'
import { getName, getVersion } from '@tauri-apps/api/app'
import thirdPartyNotices from '../../THIRD_PARTY_NOTICES.md?raw'
import appIcon from '../../src-tauri/icons/128x128.png'
import { triggerPixelBurstFromEvent } from '../utils/pixelSpark'

const emit = defineEmits<{ close: [] }>()

const appName = ref('FlowIsle')
const appVersion = ref('')
const logoTapCount = ref(0)
const easterEggUnlocked = ref(false)
let logoTapResetTimer: number | null = null

function onLogoTap(event: MouseEvent) {
  logoTapCount.value += 1
  if (logoTapResetTimer !== null) window.clearTimeout(logoTapResetTimer)
  if (logoTapCount.value >= 5) {
    easterEggUnlocked.value = true
    logoTapCount.value = 0
    triggerPixelBurstFromEvent(event, 'gold', 14)
    return
  }
  triggerPixelBurstFromEvent(event, 'accent', 4)
  logoTapResetTimer = window.setTimeout(() => {
    logoTapCount.value = 0
    logoTapResetTimer = null
  }, 2400)
}

// FlowIsle：指向自己的仓库，并标注原版来源
const githubUrl = 'https://github.com/yunmin311/flow-isle'
const upstreamUrl = 'https://github.com/ipfred/focus-island'

const forkChanges = [
  'Liquid Glass × Pixel Craft 视觉语言与像素伴侣互动',
  '刘海停靠 / 完全隐藏 / 鼠标近距隐避与点击穿透',
  '专注电台：像素频谱、分段音量、M3U/PLS 与本地音频',
  'Windows 通知镜像、交互按钮跳转、剪贴板截图收集与提醒',
  'IMAP 多邮箱实时提醒与 Win11 免打扰状态实时监测',
  '支持提前结束累计真实专注时长与精准统计修复',
]

const versionLabel = computed(() => (appVersion.value ? `v${appVersion.value} · FlowIsle` : 'FlowIsle'))

onMounted(async () => {
  try {
    appName.value = await getName()
    appVersion.value = await getVersion()
  } catch {
    appName.value = 'FlowIsle'
    appVersion.value = '2.11.0'
  }
})

function openGitHub() {
  open(githubUrl)
}

function openUpstream() {
  open(upstreamUrl)
}

function openChanges() {
  open(githubUrl)
}

function onBackdropClick(event: MouseEvent) {
  if (event.target === event.currentTarget) {
    emit('close')
  }
}
</script>

<template>
  <div class="dialog-backdrop" @click="onBackdropClick">
    <div class="dialog-container" @click.stop>
      <!-- 应用图标（连点 5 次触发隐藏彩蛋） -->
      <button type="button" class="app-icon-wrapper" title="FlowIsle" @click="onLogoTap">
        <img :src="appIcon" :alt="appName" class="app-icon" />
      </button>

      <Transition name="egg-pop">
        <div v-if="easterEggUnlocked" class="easter-egg-banner" role="status">
          ✦ 发现彩蛋：愿你常保不被打扰的心流 ✦
        </div>
      </Transition>

      <!-- 应用名称和版本 -->
      <div class="app-info">
        <h2 class="app-name">{{ appName }}</h2>
        <span class="app-version">{{ versionLabel }}</span>
        <span class="app-origin">
          基于
          <button class="inline-link" @click="openUpstream">ipfred/focus-island</button>
        </span>
      </div>

      <!-- 本版改动 -->
      <div class="fork-changes">
        <div class="changes-title">本版改动</div>
        <ul class="changes-list">
          <li v-for="item in forkChanges" :key="item">{{ item }}</li>
        </ul>
      </div>

      <details class="third-party-notices">
        <summary>第三方开源许可</summary>
        <pre>{{ thirdPartyNotices }}</pre>
      </details>

      <!-- 链接 -->
      <div class="links-row">
        <button class="link-btn" @click="openGitHub">
          <svg class="icon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
          </svg>
          <span>GitHub</span>
        </button>
        <button class="link-btn ghost" @click="openChanges">
          <span>完整说明</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
@reference "../styles.css";
.third-party-notices { margin: 12px 0; font-size: 11px; color: var(--v2-secondary); }
.third-party-notices summary { cursor: pointer; }
.third-party-notices pre { max-height: 160px; overflow: auto; white-space: pre-wrap; font: inherit; }

.dialog-backdrop {
  position: fixed;
  inset: 0;
  border-radius: 22px;
  overflow: clip;
  background: color-mix(in srgb, #000 24%, transparent);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: fade-in 0.16s ease-out;
}

@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

.dialog-container {
  width: 280px;
  padding: 24px 22px;
  background: var(--v2-popover);
  border-radius: 16px;
  border: 1px solid var(--v2-line);
  box-shadow: 0 16px 40px var(--v2-shadow);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  animation: dialog-rise 0.18s cubic-bezier(0.22, 1, 0.36, 1);
}

@keyframes dialog-rise {
  from {
    opacity: 0;
    transform: translate3d(0, 8px, 0);
  }
  to {
    opacity: 1;
    transform: translate3d(0, 0, 0);
  }
}

.app-icon-wrapper {
  width: 72px;
  height: 72px;
  padding: 0;
  border: none;
  background: transparent;
  border-radius: 16px;
  overflow: hidden;
  cursor: pointer;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.22);
  transition: transform 140ms cubic-bezier(0.22, 1.2, 0.36, 1);
}

.app-icon-wrapper:active {
  transform: scale(0.93);
}

.easter-egg-banner {
  padding: 5px 10px;
  border-radius: 999px;
  background: var(--v2-accent-soft);
  border: 1px solid color-mix(in srgb, var(--v2-accent) 32%, var(--v2-line));
  color: var(--v2-accent);
  font-size: 11px;
  font-weight: 600;
  text-align: center;
}

.egg-pop-enter-active,
.egg-pop-leave-active {
  transition: opacity 220ms ease, transform 240ms cubic-bezier(0.22, 1.2, 0.36, 1);
}

.egg-pop-enter-from,
.egg-pop-leave-to {
  opacity: 0;
  transform: translate3d(0, -4px, 0) scale(0.92);
}

.app-icon {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.app-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.app-name {
  font-size: 18px;
  font-weight: 600;
  color: var(--v2-ink);
  margin: 0;
}

.app-version {
  font-size: 12px;
  color: var(--v2-muted);
}

.app-origin {
  font-size: 10px;
  color: var(--v2-muted);
  display: flex;
  align-items: center;
  gap: 3px;
}

.inline-link {
  border: none;
  background: transparent;
  padding: 0;
  color: var(--v2-muted);
  font-size: 10px;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.inline-link:hover {
  color: var(--focus-color);
}

.fork-changes {
  width: 100%;
  padding: 8px 10px;
  border-radius: 10px;
  background: var(--ui-well);
  border: 1px solid var(--v2-line);;
}

.changes-title {
  font-size: 10px;
  font-weight: 600;
  color: var(--v2-muted);
  margin-bottom: 4px;
}

.changes-list {
  margin: 0;
  padding-left: 14px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.changes-list li {
  font-size: 10px;
  line-height: 1.5;
  color: var(--v2-secondary);
}

.links-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

.link-btn.ghost {
  color: var(--v2-muted);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.link-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 16px;
  background: transparent;
  border: none;
  color: var(--v2-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: color 0.2s;
}

.link-btn:hover {
  color: var(--focus-color);
}

.link-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.link-btn .icon {
  width: 16px;
  height: 16px;
}
</style>
