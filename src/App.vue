<script setup lang="ts">
import { ref, onMounted, defineAsyncComponent } from 'vue'
import { invoke } from '@tauri-apps/api/core'

// 按窗口按需加载：灵动岛(main) 绝不加载面板(panel) 的 7 个重页面与全部依赖，显著降低 WebView2 内存占用
const Island = defineAsyncComponent(() => import('./components/Island.vue'))
const PanelApp = defineAsyncComponent(() => import('./panel/PanelApp.vue'))

function detectSyncWindowLabel(): string | null {
  const internals = (window as unknown as {
    __TAURI_INTERNALS__?: { metadata?: { currentWindow?: { label?: string } } }
  }).__TAURI_INTERNALS__
  const label = internals?.metadata?.currentWindow?.label
  return label === 'main' || label === 'panel' ? label : null
}

const windowLabel = ref<string | null>(detectSyncWindowLabel())

onMounted(async () => {
  if (!windowLabel.value) {
    try {
      const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow')
      windowLabel.value = getCurrentWebviewWindow().label || 'main'
    } catch {
      windowLabel.value = 'main'
    }
  }
  // 窗口显示后再强刷一次：部分 Windows/WebView2 组合会在 show 之后重新加回 WS_CAPTION
  void invoke('force_current_window_frameless').catch(() => {})
})
</script>

<template>
  <Island v-if="windowLabel === 'main'" />
  <PanelApp v-else-if="windowLabel === 'panel'" />
</template>
