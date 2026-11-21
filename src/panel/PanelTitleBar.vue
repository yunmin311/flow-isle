<script setup lang="ts">
import { computed } from 'vue'
import { useCompanion } from '../composables/useCompanion'
import PixelIcon from '../components/PixelIcon.vue'

const { selectedCompanion } = useCompanion()

const props = defineProps<{
  title?: string
  iconPaths?: string[]
  searchQuery?: string
  searchPlaceholder?: string
  showSearch?: boolean
}>()

const emit = defineEmits<{
  close: []
  openCompanion: []
  'update:searchQuery': [value: string]
}>()

const fallbackIconPaths = ['M2 2h12v2H2z', 'M2 12h12v2H2z', 'M2 4h2v8H2z', 'M12 4h2v8h-2z']
const displayIconPaths = computed(() => props.iconPaths?.length ? props.iconPaths : fallbackIconPaths)
</script>

<template>
  <div class="titlebar">
    <div class="titlebar-main">
      <span class="titlebar-icon" aria-hidden="true">
        <svg viewBox="0 0 16 16" fill="currentColor" shape-rendering="crispEdges">
          <path
            v-for="(path, index) in displayIconPaths"
            :key="`title-icon-${index}`"
            :d="path"
          />
        </svg>
      </span>
      <span class="titlebar-title">{{ title || 'TODO' }}</span>
    </div>

    <div v-if="showSearch" class="titlebar-search">
      <PixelIcon name="search" :size="12" class="search-icon" />
      <input
        :value="searchQuery"
        type="text"
        class="search-input"
        :placeholder="searchPlaceholder || '搜索当前分类...'"
        @input="emit('update:searchQuery', ($event.target as HTMLInputElement).value)"
      />
      <button
        v-if="searchQuery"
        class="search-clear"
        type="button"
        aria-label="清除搜索"
        @click="emit('update:searchQuery', '')"
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
    <div v-else class="titlebar-spacer"></div>

    <div class="titlebar-actions">
      <button
        type="button"
        class="companion-button"
        :aria-label="`查看${selectedCompanion.name}陪伴相册`"
        :title="selectedCompanion.name"
        @click="emit('openCompanion')"
      >
        <img :src="selectedCompanion.sitUrl" alt="" width="18" height="18" />
      </button>
      <button class="btn-close" @click="$emit('close')" title="关闭">✕</button>
    </div>
  </div>
</template>

<style scoped>
.titlebar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  height: 40px;
  padding: 0 12px 0 16px;
  background: transparent;
  border-bottom: 1px solid var(--v2-line);;
  cursor: default;
  user-select: none;
  -webkit-user-select: none;
  flex-shrink: 0;
}

.titlebar-main {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex-shrink: 0;
}

.titlebar-icon {
  width: 14px;
  height: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--v2-ink);
  flex-shrink: 0;
}

.titlebar-icon svg {
  width: 100%;
  height: 100%;
  stroke-width: 1.8;
}

.titlebar-title {
  font-size: 14px;
  font-weight: 650;
  color: var(--v2-ink);
  letter-spacing: 0.01em;
  white-space: nowrap;
}

.titlebar-spacer {
  flex: 1;
}

.titlebar-search {
  flex: 0 1 260px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  height: 26px;
  background: var(--ui-well);
  border: 1px solid var(--v2-line);;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.06);
  transition: all 0.2s;
}

.titlebar-search:focus-within {
  background: var(--ui-hover);
  border-color: color-mix(in srgb, var(--focus-color) 55%, transparent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--focus-color) 14%, transparent), 0 2px 8px rgba(0, 0, 0, 0.3);
}

.search-icon {
  color: var(--v2-muted);
  flex-shrink: 0;
}

.titlebar-search:focus-within .search-icon {
  color: color-mix(in srgb, var(--focus-color) 80%, transparent);
}

.search-input {
  flex: 1;
  min-width: 0;
  background: transparent;
  border: none;
  outline: none;
  color: var(--v2-ink);
  font-size: 12px;
  font-family: inherit;
  padding: 0;
}

.search-input::placeholder {
  color: var(--v2-muted);
}

.search-clear {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: none;
  background: var(--ui-hover);
  color: var(--v2-muted);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  flex-shrink: 0;
  transition: all 0.15s;
}

.search-clear:hover {
  background: rgba(255, 255, 255, 0.22);
  color: var(--v2-ink);
}

.titlebar-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.titlebar-actions button {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 0;
  background: transparent;
  color: var(--v2-muted);
  font-size: 13px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  transition: background-color 160ms ease, color 160ms ease;
}

.titlebar-actions .companion-button {
  border-radius: 8px;
}

.titlebar-actions .companion-button img {
  display: block;
  width: 18px;
  height: 18px;
  image-rendering: pixelated;
}

.titlebar-actions .companion-button:hover {
  background: var(--ui-hover);
}

.titlebar-actions .btn-close {
  background: var(--ui-well);
  color: var(--v2-muted);
  font-size: 12px;
  line-height: 1;
}

.titlebar-actions .btn-close:hover {
  background: var(--ui-hover);
  color: var(--v2-ink);
}
</style>
