<template>
  <div class="toolbar">
    <div class="nav-group">
      <button
        class="icon-btn"
        :disabled="!canGoBack"
        title="后退 (Alt+←)"
        @click="goBack"
      >←</button>
      <button
        class="icon-btn"
        :disabled="!canGoForward"
        title="前进 (Alt+→)"
        @click="goForward"
      >→</button>
      <button
        class="icon-btn"
        :title="loading ? '停止 (Esc)' : '刷新 (Ctrl+R)'"
        @click="onReloadClick"
      >
        <span v-if="loading" class="stop">✕</span>
        <span v-else class="reload">↻</span>
      </button>
      <button
        class="icon-btn"
        title="主页"
        @click="goHome"
      >🏠</button>
    </div>

    <form class="url-form" @submit.prevent="onSubmit">
      <span v-if="isSecure" class="lock" title="安全连接">🔒</span>
      <span v-else-if="showInsecure" class="lock insecure" title="不安全">⚠</span>
      <span v-else class="lock empty" />

      <input
        ref="urlInputRef"
        v-model="urlDraft"
        class="url-input"
        type="text"
        :placeholder="placeholder"
        spellcheck="false"
        autocomplete="off"
        @focus="onFocus"
        @blur="onBlur"
        @keydown="onKeydown"
      />

      <button
        v-if="urlDraft && isFocused"
        type="button"
        class="clear-btn"
        title="清空"
        @click="clearInput"
      >✕</button>
    </form>

    <div class="action-group">
      <button
        class="icon-btn"
        :class="{ active: isBookmarked }"
        :title="isBookmarked ? '编辑书签' : '添加书签 (Ctrl+D)'"
        @click="$emit('bookmark')"
      >★</button>
      <button
        v-if="showMenu"
        class="icon-btn"
        title="菜单"
        @click="$emit('menu')"
      >⋮</button>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, computed, onMounted } from 'vue'
import { useNavigation } from '../composables/useNavigation.js'
import { useBrowserSettings } from '../composables/useBrowserSettings.js'

const props = defineProps({
  showMenu: { type: Boolean, default: true },
  showInsecure: { type: Boolean, default: false },
  isBookmarked: { type: Boolean, default: false },
  placeholder: { type: String, default: '搜索或输入网址' },
})

const emit = defineEmits(['navigate', 'bookmark', 'menu', 'home', 'stop', 'reload'])

const {
  currentUrl,
  canGoBack,
  canGoForward,
  loading,
  goBack,
  goForward,
  reload,
  stop,
  goHome: navHome,
} = useNavigation()
const { currentSearchEngine } = useBrowserSettings()

const urlInputRef = ref(null)
const urlDraft = ref('')
const isFocused = ref(false)

function syncDraftFromUrl() {
  urlDraft.value = currentUrl.value || ''
}

function onFocus() {
  isFocused.value = true
  setTimeout(() => urlInputRef.value?.select(), 0)
}

function onBlur() {
  isFocused.value = false
  syncDraftFromUrl()
}

function clearInput() {
  urlDraft.value = ''
  urlInputRef.value?.focus()
}

function isLikelyUrl(value) {
  if (!value) return false
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return true
  if (/\s/.test(value)) return false
  return /^([a-z0-9-]+\.)+[a-z]{2,}(:\d+)?(\/.*)?$/i.test(value)
    || /^localhost(:\d+)?(\/.*)?$/i.test(value)
}

function normalizeInput(value) {
  if (!value) return ''
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return value
  if (/^localhost(:\d+)?(\/.*)?$/i.test(value)) return 'http://' + value
  if (/^([a-z0-9-]+\.)+[a-z]{2,}(:\d+)?(\/.*)?$/i.test(value)) return 'https://' + value
  return value
}

function onSubmit() {
  const value = urlDraft.value.trim()
  if (!value) return
  const target = isLikelyUrl(value)
    ? normalizeInput(value)
    : currentSearchEngine.value.searchUrl.replace('{query}', encodeURIComponent(value))
  emit('navigate', target)
  urlInputRef.value?.blur()
}

function onKeydown(e) {
  if (e.key === 'Escape') {
    urlDraft.value = currentUrl.value || ''
    urlInputRef.value?.blur()
  } else if (e.key === 'Enter') {
    // 让 form 的 submit 触发
  }
}

function onReloadClick() {
  if (loading.value) {
    stop()
    emit('stop')
  } else {
    reload()
    emit('reload')
  }
}

function goHome() {
  emit('home')
  navHome()
}

const isSecure = computed(() => /^https:\/\//i.test(currentUrl.value || ''))

watch(currentUrl, () => {
  if (!isFocused.value) syncDraftFromUrl()
})

onMounted(() => {
  syncDraftFromUrl()
})
</script>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 40px;
  padding: 0 8px;
  background: #ffffff;
  border-bottom: 1px solid #e4e6eb;
  flex-shrink: 0;
}

.nav-group,
.action-group {
  display: flex;
  align-items: center;
  gap: 2px;
}

.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  border-radius: 4px;
  cursor: pointer;
  color: #4e5969;
  font-size: 14px;
  line-height: 1;
  transition: background 0.1s;
}
.icon-btn:hover:not(:disabled) {
  background: #f2f3f5;
  color: #1f2329;
}
.icon-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.icon-btn.active {
  color: #f5a623;
}

.reload,
.stop {
  display: inline-block;
  font-size: 13px;
}

.url-form {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  height: 28px;
  padding: 0 8px;
  background: #f2f3f5;
  border: 1px solid transparent;
  border-radius: 14px;
  transition: background 0.1s, border-color 0.1s, box-shadow 0.1s;
}
.url-form:focus-within {
  background: #ffffff;
  border-color: #165dff;
  box-shadow: 0 0 0 3px rgba(22, 93, 255, 0.12);
}

.lock {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  font-size: 11px;
  line-height: 1;
  flex-shrink: 0;
  margin-right: 6px;
}
.lock.empty::before {
  content: '';
}
.lock.insecure {
  color: #d97706;
}

.url-input {
  flex: 1;
  min-width: 0;
  height: 100%;
  border: none;
  outline: none;
  background: transparent;
  font-size: 13px;
  color: #1f2329;
  padding: 0;
}
.url-input::placeholder {
  color: #86909c;
}

.clear-btn {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: none;
  background: transparent;
  border-radius: 50%;
  cursor: pointer;
  color: #86909c;
  font-size: 10px;
  line-height: 1;
}
.clear-btn:hover {
  background: #e4e6eb;
  color: #1f2329;
}
</style>
