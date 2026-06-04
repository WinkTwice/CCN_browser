<template>
  <aside class="history-panel" :class="{ collapsed }">
    <header class="panel-header">
      <div class="title">
        <span class="icon">🕘</span>
        <span>历史</span>
        <span class="count">{{ history.length }}</span>
      </div>
      <div class="actions">
        <button class="icon-btn" title="收起" @click="$emit('toggle')">⇆</button>
      </div>
    </header>

    <div class="panel-toolbar">
      <input
        v-model="keyword"
        class="search-input"
        type="text"
        placeholder="搜索历史..."
        @input="onSearch"
      />
      <button class="text-btn" @click="showAll">全部</button>
    </div>

    <div class="panel-body">
      <div v-if="loading" class="state">加载中...</div>
      <div v-else-if="groups.length === 0" class="state">暂无历史</div>

      <section
        v-for="group in groups"
        :key="group.key"
        class="group"
      >
        <div class="group-header">
          <span class="group-name">{{ group.label }}</span>
          <span class="group-count">{{ group.items.length }}</span>
        </div>

        <ul class="history-list">
          <li
            v-for="item in group.items"
            :key="item.id"
            class="history-item"
            @click="open(item)"
          >
            <img
              v-if="item.favicon && !faviconFailed[item.id]"
              :src="item.favicon"
              class="favicon"
              alt=""
              @error="markFaviconFailed(item.id)"
            />
            <span v-else class="favicon fallback">🌐</span>
            <div class="meta">
              <div class="title-row">
                <span class="title-text">{{ item.title || item.url }}</span>
              </div>
              <div class="url">{{ shortUrl(item.url) }}</div>
            </div>
            <div class="time">{{ formatTime(item.lastVisitTime || item.visitTime) }}</div>
            <div class="item-actions">
              <button class="icon-btn small" title="在当前标签打开" @click.stop="open(item)">▣</button>
              <button class="icon-btn small" title="在新标签打开" @click.stop="openInNewTab(item)">↗</button>
              <button class="icon-btn small danger" title="从历史移除" @click.stop="remove(item)">✕</button>
            </div>
          </li>
        </ul>
      </section>
    </div>

    <footer class="panel-footer">
      <button class="text-btn danger" @click="confirmClear">清除全部历史</button>
    </footer>
  </aside>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useHistory } from '../composables/useHistory.js'

defineProps({
  collapsed: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['toggle', 'open', 'open-new-tab'])

const {
  history,
  groupedByDate,
  loading,
  loadHistory,
  removeEntry,
  searchHistory,
  clearHistory,
} = useHistory()

const keyword = ref('')
const faviconFailed = ref({})

const groups = computed(() => {
  if (!keyword.value.trim()) return groupedByDate.value
  const kw = keyword.value.toLowerCase()
  return [
    {
      key: 'search',
      label: '搜索结果',
      items: history.value.filter(
        (e) =>
          (e.title || '').toLowerCase().includes(kw) ||
          (e.url || '').toLowerCase().includes(kw),
      ),
    },
  ].filter((g) => g.items.length > 0)
})

function onSearch() {
  searchHistory(keyword.value)
}

function showAll() {
  keyword.value = ''
  loadHistory()
}

function open(item) {
  emit('open', item)
}

function openInNewTab(item) {
  emit('open-new-tab', item)
}

async function remove(item) {
  await removeEntry(item.id)
}

function markFaviconFailed(id) {
  faviconFailed.value = { ...faviconFailed.value, [id]: true }
}

function confirmClear() {
  if (window.confirm('确定要清除所有浏览历史吗？此操作不可撤销。')) {
    clearHistory()
  }
}

function shortUrl(url) {
  if (!url) return ''
  try {
    const u = new URL(url)
    return u.host + (u.pathname.length > 1 ? u.pathname : '')
  } catch {
    return url
  }
}

function formatTime(ts) {
  if (!ts) return ''
  const date = new Date(ts)
  const now = new Date()
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  if (sameDay) return `${hh}:${mm}`
  const mo = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${mo}-${d} ${hh}:${mm}`
}

onMounted(() => {
  loadHistory()
})
</script>

<style scoped>
.history-panel {
  display: flex;
  flex-direction: column;
  width: 280px;
  height: 100%;
  background: #f7f8fa;
  border-right: 1px solid #e4e6eb;
  transition: width 0.2s ease;
  overflow: hidden;
}
.history-panel.collapsed {
  width: 40px;
}
.history-panel.collapsed .panel-toolbar,
.history-panel.collapsed .panel-body,
.history-panel.collapsed .panel-footer,
.history-panel.collapsed .title span:not(.icon) {
  display: none;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border-bottom: 1px solid #e4e6eb;
  background: #fff;
}
.title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  color: #1f2329;
}
.count {
  font-size: 11px;
  font-weight: 400;
  color: #86909c;
  background: #eef0f3;
  padding: 1px 6px;
  border-radius: 8px;
}
.actions {
  display: flex;
  gap: 4px;
}
.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  border-radius: 4px;
  cursor: pointer;
  color: #4e5969;
  font-size: 14px;
}
.icon-btn:hover {
  background: #e8eaef;
}
.icon-btn.small {
  width: 22px;
  height: 22px;
  font-size: 12px;
}
.icon-btn.danger:hover {
  background: #ffece8;
  color: #d93025;
}

.panel-toolbar {
  display: flex;
  gap: 6px;
  padding: 8px 10px;
  border-bottom: 1px solid #e4e6eb;
  background: #fff;
}
.search-input {
  flex: 1;
  height: 26px;
  padding: 0 8px;
  border: 1px solid #c9cdd4;
  border-radius: 4px;
  outline: none;
  font-size: 12px;
}
.search-input:focus {
  border-color: #165dff;
}
.text-btn {
  height: 26px;
  padding: 0 8px;
  border: 1px solid #c9cdd4;
  background: #fff;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  color: #4e5969;
}
.text-btn:hover {
  background: #f2f3f5;
}
.text-btn.danger {
  color: #d93025;
  border-color: #f5c2c0;
}
.text-btn.danger:hover {
  background: #ffece8;
}

.panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0 8px;
}
.state {
  padding: 16px;
  text-align: center;
  color: #86909c;
  font-size: 12px;
}

.group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px 4px;
  font-size: 11px;
  font-weight: 600;
  color: #86909c;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.group-count {
  font-weight: 400;
  color: #c9cdd4;
}

.history-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.history-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  cursor: pointer;
  transition: background 0.1s;
}
.history-item:hover {
  background: #eef0f3;
}
.history-item:hover .item-actions {
  display: flex;
}
.history-item:hover .time {
  display: none;
}

.favicon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  border-radius: 2px;
  object-fit: contain;
}
.favicon.fallback {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
}
.meta {
  flex: 1;
  min-width: 0;
}
.title-row {
  display: flex;
  align-items: center;
  gap: 4px;
}
.title-text {
  font-size: 12px;
  color: #1f2329;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.url {
  font-size: 11px;
  color: #86909c;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.time {
  flex-shrink: 0;
  font-size: 11px;
  color: #86909c;
  font-variant-numeric: tabular-nums;
}
.item-actions {
  display: none;
  gap: 2px;
  flex-shrink: 0;
}

.panel-footer {
  padding: 8px 10px;
  border-top: 1px solid #e4e6eb;
  background: #fff;
  display: flex;
  justify-content: center;
}
</style>
