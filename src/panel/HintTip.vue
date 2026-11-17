<script setup lang="ts">
import { nextTick, ref } from 'vue'
const props = defineProps<{ text: string; label?: string }>()
const visible = ref(false)
const anchor = ref<HTMLButtonElement | null>(null)
const bubble = ref<HTMLElement | null>(null)
const position = ref({ left: '12px', top: '12px' })
const id = `hint-${crypto.randomUUID()}`
async function show() {
  visible.value = true
  await nextTick()
  const a = anchor.value?.getBoundingClientRect(), b = bubble.value?.getBoundingClientRect()
  if (!a || !b) return
  position.value = {
    left: `${Math.max(12, Math.min(a.left, window.innerWidth - b.width - 12))}px`,
    top: `${a.bottom + b.height + 16 < window.innerHeight ? a.bottom + 7 : Math.max(8, a.top - b.height - 7)}px`,
  }
}
</script>
<template>
  <button ref="anchor" type="button" class="hint-trigger" :class="{ 'hint-text': props.label }" :aria-label="props.label || `说明：${props.text}`" :aria-describedby="visible ? id : undefined"
    @mouseenter="show" @mouseleave="visible = false" @focus="show" @blur="visible = false" @click="show" @keydown.esc.stop="visible = false">
    <span v-if="props.label">{{ props.label }}</span>
    <svg v-else viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><circle cx="8" cy="8" r="6.5" fill="currentColor" opacity=".65"/><path d="M8 7v4M8 4.5v.4" stroke="var(--v2-shell)" stroke-width="1.6" stroke-linecap="round"/></svg>
  </button>
  <Teleport to="body"><div v-if="visible" :id="id" ref="bubble" role="tooltip" class="settings-hint-bubble" :style="position">{{ props.text }}</div></Teleport>
</template>
<style scoped>
.hint-trigger { display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 24px; padding: 0; margin: 0 0 0 3px; border: 0; background: transparent; color: var(--v2-secondary); vertical-align: middle; cursor: help; flex-shrink: 0; }
.hint-trigger.hint-text { width: auto; height: auto; min-height: 24px; margin: 0; justify-content: flex-start; text-align: left; font: inherit; color: inherit; line-height: inherit; }
.hint-text:hover { text-decoration: underline dotted; text-underline-offset: 4px; text-decoration-color: var(--v2-muted); }
.hint-trigger:focus-visible { outline: 1px solid var(--v2-accent); border-radius: 3px; }
.settings-hint-bubble { position: fixed; z-index: 10000; max-width: min(240px, calc(100vw - 24px)); box-sizing: border-box; padding: 9px 11px; border: 1px solid var(--v2-line); border-radius: 7px; background: var(--v2-shell); color: var(--v2-ink); box-shadow: 0 3px 14px #0002; font-family: 'Segoe UI', 'Microsoft YaHei', sans-serif; font-size: 11px; font-weight: 400; line-height: 1.65; pointer-events: none; overflow-wrap: anywhere; }
</style>
