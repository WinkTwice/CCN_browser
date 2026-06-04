<template>
  <aside class="bookmark-panel" :class="{ collapsed }">
    <header class="panel-header">
      <div class="title">
        <span class="icon">★</span>
        <span>书签</span>
      </div>
      <div class="actions">
        <button class="icon-btn" title="新建书签" @click="openAddDialog">＋</button>
        <button class="icon-btn" title="收起" @click="$emit('toggle')">⇆</button>
      </div>
    </header>

    <div class="panel-toolbar">
      <input
        v-model="keyword"
        class="search-input"
        type="text"
        placeholder="搜索书签..."
        @input="onSearch"
      />
      <button class="text-btn" @click="showAll">全部</button>
    </div>

    <div class="panel-body">
      <div v-if="loading" class="state">加载中...</div>
      <div v-else-if="filteredGroups.length === 0" class="state">暂无书签</div>

      <section
        v-for="group in filteredGroups"
        :key="group.id"
        class="folder"
      >
        <div class="folder-header" @click="toggleFolder(group.id)">
          <span class="caret" :class="{ open: group.expanded }">▸</span>
          <span class="folder-icon">📁</span>
          <span class="folder-name">{{ group.name }}</span>
          <span class="folder-count">{{ group.items.length }}</span>
        </div>

        <ul v-show="group.expanded" class="bookmark-list">
          <li
            v-for="item in group.items"
            :key="item.id"
            class="bookmark-item"
            @click="openBookmark(item)"
          >
            <img
              v-if="item.favicon"
              :src="item.favicon"
              class="favicon"
              alt=""
              @error="onFaviconError"
            />
            <span v-else class="favicon fallback">🌐</span>
            <div class="meta">
              <div class="title-row">
                <span class="title-text">{{ item.title }}</span>
              </div>
              <div class="url">{{ item.url }}</div>
            </div>
            <div class="item-actions">
              <button class="icon-btn small" title="在当前标签打开" @click.stop="openInCurrent(item)">▣</button>
              <button class="icon-btn small" title="在新标签打开" @click.stop="openInNewTab(item)">↗</button>
              <button class="icon-btn small danger" title="删除" @click.stop="remove(item)">✕</button>
            </div>
          </li>
        </ul>
      </section>
    </div>

    <div v-if="dialogVisible" class="dialog-mask" @click.self="dialogVisible = false">
      <form class="dialog" @submit.prevent="onAddSubmit">
        <header class="dialog-header">新建书签</header>
        <label class="field">
          <span>标题</span>
          <input v-model="form.title" type="text" required />
        </label>
        <label class="field">
          <span>网址</span>
          <input v-model="form.url" type="url" required />
        </label>
        <label class="field">
          <span>文件夹</span>
          <select v-model="form.folderId">
            <option v-for="f in folders" :key="f.id" :value="f.id">{{ f.name }}</option>
          </select>
        </label>
        <footer class="dialog-footer">
          <button type="button" class="text-btn" @click="dialogVisible = false">取消</button>
          <button type="submit" class="text-btn primary">保存</button>
        </footer>
      </form>
    </div>
  </aside>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useBookmarks } from '../composables/useBookmarks.js'

const props = defineProps({
  collapsed: {
    type: Boolean,
    default: false,
  },
  activeFolderId: {
    type: String,
    default: 'default',
  },
})

const emit = defineEmits(['toggle', 'open', 'open-new-tab'])

const {
  bookmarks,
  folders,
  loading,
  loadBookmarks,
  addBookmark,
  removeBookmark,
  searchBookmarks,
} = useBookmarks()

const keyword = ref('')
const expanded = ref(new Set(['default']))
const dialogVisible = ref(false)
const form = reactive({
  title: '',
  url: '',
  folderId: props.activeFolderId,
})

const grouped = computed(() =>
  folders.value.map((folder) => ({
    ...folder,
    expanded: expanded.value.has(folder.id),
    items: bookmarks.value.filter((b) => (b.folderId || 'default') === folder.id),
  })),
)

const filteredGroups = computed(() => {
  if (!keyword.value.trim()) return grouped.value
  const kw = keyword.value.toLowerCase()
  return grouped.value
    .map((g) => ({
      ...g,
      items: g.items.filter(
        (b) =>
          (b.title || '').toLowerCase().includes(kw) ||
          (b.url || '').toLowerCase().includes(kw),
      ),
    }))
    .filter((g) => g.items.length > 0)
})

function toggleFolder(id) {
  const set = new Set(expanded.value)
  if (set.has(id)) set.delete(id)
  else set.add(id)
  expanded.value = set
}

function onSearch() {
  if (!keyword.value.trim()) {
    loadBookmarks()
  } else {
    searchBookmarks(keyword.value)
  }
}

function showAll() {
  keyword.value = ''
  loadBookmarks()
}

function openBookmark(item) {
  emit('open', item)
}

function openInCurrent(item) {
  emit('open', { ...item, newTab: false })
}

function openInNewTab(item) {
  emit('open-new-tab', item)
}

async function remove(item) {
  await removeBookmark(item.id)
}

function openAddDialog() {
  form.title = ''
  form.url = ''
  form.folderId = props.activeFolderId
  dialogVisible.value = true
}

async function onAddSubmit() {
  if (!form.title.trim() || !form.url.trim()) return
  await addBookmark({
    title: form.title.trim(),
    url: form.url.trim(),
    folderId: form.folderId,
  })
  dialogVisible.value = false
}

function onFaviconError(e) {
  e.target.style.display = 'none'
}

onMounted(() => {
  loadBookmarks()
})
</script>

<style scoped>
.bookmark-panel {
  display: flex;
  flex-direction: column;
  width: 280px;
  height: 100%;
  background: #f7f8fa;
  border-right: 1px solid #e4e6eb;
  transition: width 0.2s ease;
  overflow: hidden;
}
.bookmark-panel.collapsed {
  width: 40px;
}
.bookmark-panel.collapsed .panel-toolbar,
.bookmark-panel.collapsed .panel-body,
.bookmark-panel.collapsed .title span:last-child {
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
.icon {
  color: #f5a623;
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

.panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}
.state {
  padding: 16px;
  text-align: center;
  color: #86909c;
  font-size: 12px;
}

.folder-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  cursor: pointer;
  user-select: none;
  font-size: 12px;
  color: #4e5969;
}
.folder-header:hover {
  background: #eef0f3;
}
.caret {
  display: inline-block;
  transition: transform 0.15s;
  font-size: 10px;
}
.caret.open {
  transform: rotate(90deg);
}
.folder-icon {
  font-size: 13px;
}
.folder-name {
  flex: 1;
  font-weight: 500;
  color: #1f2329;
}
.folder-count {
  font-size: 11px;
  color: #86909c;
}

.bookmark-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.bookmark-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px 6px 26px;
  cursor: pointer;
  transition: background 0.1s;
}
.bookmark-item:hover {
  background: #eef0f3;
}
.bookmark-item:hover .item-actions {
  display: flex;
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
.item-actions {
  display: none;
  gap: 2px;
}

.dialog-mask {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
}
.dialog {
  width: 280px;
  background: #fff;
  border-radius: 6px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.dialog-header {
  font-weight: 600;
  font-size: 14px;
  color: #1f2329;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: #4e5969;
}
.field input,
.field select {
  height: 26px;
  padding: 0 8px;
  border: 1px solid #c9cdd4;
  border-radius: 4px;
  outline: none;
  font-size: 12px;
}
.field input:focus,
.field select:focus {
  border-color: #165dff;
}
.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  margin-top: 4px;
}
.text-btn.primary {
  background: #165dff;
  color: #fff;
  border-color: #165dff;
}
.text-btn.primary:hover {
  background: #0e42d2;
}
</style>
