<template>
  <div ref="rootRef" class="app" :class="{ 'side-open': activeSidePanel !== 'none' }">
    <div class="chrome">
      <header
        class="titlebar"
        :class="{ 'is-mac': isMac }"
        @dblclick="win.toggleMax"
      >
        <div class="titlebar-drag" />
        <div v-if="!isMac" class="window-controls">
          <button class="win-btn minimize" title="最小化" @click="win.minimize">─</button>
          <button class="win-btn maximize" title="最大化" @click="win.toggleMax">▢</button>
          <button class="win-btn close" title="关闭" @click="win.close">✕</button>
        </div>
      </header>

      <ToolBar
        :is-bookmarked="isCurrentBookmarked"
        :placeholder="urlPlaceholder"
        @navigate="onNavigate"
        @bookmark="toggleBookmark"
        @menu="toggleMenu"
        @home="goHome"
        @stop="onStop"
        @reload="onReload"
      />

      <TabBar
        @tab-change="onTabChange"
        @tab-create="onTabCreate"
        @tab-close="onTabClose"
      />
    </div>

    <div class="main">
      <aside v-if="activeSidePanel === 'bookmarks'" class="side">
        <BookmarkPanel @open="onOpenBookmark" @open-new-tab="onOpenBookmarkNewTab" />
      </aside>
      <aside v-else-if="activeSidePanel === 'history'" class="side">
        <HistoryPanel @open="onOpenHistory" @open-new-tab="onOpenHistoryNewTab" />
      </aside>

      <!--
        真正的网页内容由主进程的 WebContentsView 渲染。
        本元素只是占位，会被 WebContentsView 覆盖（其 bounds = { y: chromeH, height: winH - chromeH }）。
        当 WebContentsView 还没就绪或处于 about:blank 时，这里显示提示。
      -->
      <main class="content">
        <div v-if="!activeTab" class="empty">
          <p>没有打开的标签</p>
        </div>
        <div v-else class="page-placeholder">
          <div class="ph-inner">
            <div class="ph-logo">CCN</div>
            <div class="ph-title">{{ activeTab.title || '新标签' }}</div>
            <div class="ph-url">{{ activeTab.url }}</div>
          </div>
        </div>
      </main>

      <aside v-if="downloadsOpen && downloads.length > 0" class="downloads">
        <div class="downloads-header">
          <span>下载 ({{ activeDownloads.length }})</span>
          <div class="downloads-actions">
            <button class="text-btn" @click="clearCompletedDownloads">清空已完成</button>
            <button class="icon-btn" @click="downloadsOpen = false" title="关闭">✕</button>
          </div>
        </div>
        <ul class="downloads-list">
          <DownloadItem
            v-for="item in downloads"
            :key="item.id"
            :item="item"
            @pause="onDownloadPause"
            @resume="onDownloadResume"
            @cancel="onDownloadCancel"
            @retry="onDownloadRetry"
            @open="onDownloadOpen"
            @open-folder="onDownloadOpenFolder"
            @remove="onDownloadRemove"
          />
        </ul>
      </aside>
    </div>

    <div v-if="menuOpen" class="menu-mask" @click="menuOpen = false">
      <div class="menu" @click.stop>
        <button class="menu-item" @click="openSide('bookmarks')">书签</button>
        <button class="menu-item" @click="openSide('history')">历史</button>
        <button class="menu-item" @click="downloadsOpen = !downloadsOpen">
          下载 ({{ activeDownloads.length }})
        </button>
        <div class="menu-sep" />
        <div class="menu-label">代理：{{ proxyLabel }}</div>
        <button class="menu-item" @click="setProxyMode('system')">使用系统代理</button>
        <button class="menu-item" @click="setProxyMode('direct')">直连网络</button>
        <button class="menu-item" @click="setProxyMode('http=127.0.0.1:7890;https=127.0.0.1:7890;socks=127.0.0.1:7890')">本地代理 7890</button>
        <button class="menu-item" @click="setProxyMode('http=127.0.0.1:7897;https=127.0.0.1:7897;socks=127.0.0.1:7897')">本地代理 7897</button>
        <button class="menu-item" @click="setProxyMode('socks=127.0.0.1:10809')">SOCKS 10809</button>
        <button class="menu-item" @click="checkProxy">检测当前代理</button>
        <div v-if="proxyResolved" class="menu-hint">{{ proxyResolved }}</div>
        <div class="menu-sep" />
        <div class="menu-label">Search: {{ currentSearchEngine.name }}</div>
        <button
          v-for="engine in searchEngines"
          :key="engine.id"
          class="menu-item"
          @click="chooseSearchEngine(engine.id)"
        >
          {{ engine.id === currentSearchEngine.id ? '* ' : '' }}{{ engine.name }}
        </button>
        <div class="menu-sep" />
        <button class="menu-item" @click="newWindow">新建窗口</button>
        <button class="menu-item" @click="setHomeFromCurrent">将当前页设为主页</button>
        <button class="menu-item" @click="clearAllHistory">清除浏览历史</button>
        <div class="menu-sep" />
        <button class="menu-item" @click="closeCurrentTab">关闭当前标签</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, onActivated, watch, inject, nextTick } from 'vue'
import ToolBar from './components/ToolBar.vue'
import TabBar from './components/TabBar.vue'
import BookmarkPanel from './components/BookmarkPanel.vue'
import HistoryPanel from './components/HistoryPanel.vue'
import DownloadItem from './components/DownloadItem.vue'

import { useTabs } from './composables/useTabs.js'
import { useNavigation } from './composables/useNavigation.js'
import { useBookmarks } from './composables/useBookmarks.js'
import { useHistory } from './composables/useHistory.js'
import { useDownloads } from './composables/useDownloads.js'
import { useBrowserSettings } from './composables/useBrowserSettings.js'

const win = inject('windowControl', {
  minimize: () => {},
  toggleMax: () => {},
  close: () => {},
  isMac: /Mac|Darwin/i.test(navigator.userAgent || ''),
})
const chromeApi = (typeof window !== 'undefined' && window.ccnChrome) || null

// ---------- 平台 ----------
const isMac = ref(win.isMac)

// ---------- DOM 引用 ----------
const rootRef = ref(null)

// ---------- 状态 ----------
const activeSidePanel = ref('none')
const menuOpen = ref(false)
const downloadsOpen = ref(false)
const proxySettings = ref({ mode: 'system', proxyRules: '' })
const proxyResolved = ref('')

// ---------- Composables ----------
const { tabs, activeId, activeTab, loadTabs, createTab, closeTab, selectTab, updateTab } = useTabs()
const { currentUrl, goHome: navGoHome, navigate, stop: navStop, reload: navReload } = useNavigation()
const { bookmarks, addBookmark, removeBookmark } = useBookmarks()
const { clearHistory: clearAllHist } = useHistory()
const { searchEngines, currentSearchEngine, setSearchEngine } = useBrowserSettings()
const {
  downloads,
  active: activeDownloads,
  loadDownloads,
  pauseDownload,
  resumeDownload,
  cancelDownload,
  retryDownload,
  removeDownload,
  openFile,
  openFolder,
  clearCompleted: clearCompletedDownloads,
} = useDownloads()

// ---------- 派生 ----------
const urlPlaceholder = computed(() => '搜索或输入网址')

const isCurrentBookmarked = computed(() => {
  const url = activeTab.value?.url
  if (!url) return false
  return bookmarks.value.some(
    (b) => b.url === url && (b.folderId || 'default') === 'default',
  )
})

const proxyLabel = computed(() => {
  if (proxySettings.value.mode === 'direct') return '直连'
  if (proxySettings.value.mode === 'manual') return proxySettings.value.proxyRules || '手动'
  return '系统'
})

// ---------- chrome 高度上报 ----------
function reportChromeHeight() {
  if (!chromeApi || !rootRef.value) return
  const chromeEl = rootRef.value.querySelector('.chrome')
  if (!chromeEl) return
  const rect = chromeEl.getBoundingClientRect()
  const h = Math.round(rect.height)
  if (h <= 0) return
  const layout = {
    chromeHeight: h,
    left: activeSidePanel.value !== 'none' ? 280 : 0,
    right: downloadsOpen.value && downloads.value.length > 0 ? 320 : 0,
    hidden: menuOpen.value,
  }
  if (chromeApi.setLayout) chromeApi.setLayout(layout)
  else chromeApi.setHeight(h)
}

// ---------- 路由：地址栏提交 ----------
async function onNavigate(url) {
  if (!url) return
  if (!activeTab.value) {
    createTab({ url, title: url })
    navigate(url)
    return
  }
  // 立即更新本地 tab UI（让工具栏立刻反应）
  updateTab(activeTab.value.id, { url, title: url, loading: true })
  // 让主进程真正加载
  navigate(url)
}

// ---------- 标签操作 ----------
function onTabChange(tab) { selectTab(tab.id) }
function onTabCreate() { /* TabBar 内部已 create */ }
function onTabClose(tab) { closeTab(tab.id) }
function closeCurrentTab() {
  if (activeTab.value) closeTab(activeTab.value.id)
  menuOpen.value = false
}

// ---------- 书签 / 历史 ----------
function toggleBookmark() {
  const tab = activeTab.value
  if (!tab?.url) return
  const existing = bookmarks.value.find((b) => b.url === tab.url)
  if (existing) {
    removeBookmark(existing.id)
  } else {
    addBookmark({ title: tab.title || tab.url, url: tab.url, folderId: 'default' })
  }
}

function onOpenBookmark(item) {
  if (activeTab.value) {
    updateTab(activeTab.value.id, { url: item.url, title: item.title })
    navigate(item.url)
  } else {
    createTab({ url: item.url, title: item.title })
  }
  activeSidePanel.value = 'none'
}
function onOpenBookmarkNewTab(item) {
  createTab({ url: item.url, title: item.title })
  activeSidePanel.value = 'none'
}
function onOpenHistory(item) {
  if (activeTab.value) {
    updateTab(activeTab.value.id, { url: item.url, title: item.title })
    navigate(item.url)
  } else {
    createTab({ url: item.url, title: item.title })
  }
  activeSidePanel.value = 'none'
}
function onOpenHistoryNewTab(item) {
  createTab({ url: item.url, title: item.title })
  activeSidePanel.value = 'none'
}

function clearAllHistory() {
  clearAllHist()
  menuOpen.value = false
}

// ---------- 下载 ----------
function onDownloadPause(item) { pauseDownload(item.id) }
function onDownloadResume(item) { resumeDownload(item.id) }
function onDownloadCancel(item) { cancelDownload(item.id) }
function onDownloadRetry(item) { retryDownload(item.id) }
function onDownloadOpen(item) { openFile(item.id) }
function onDownloadOpenFolder(item) { openFolder(item.id) }
function onDownloadRemove(item) { removeDownload(item.id) }

// ---------- 导航操作 ----------
function goHome() { navGoHome() }
function onStop() { navStop() }
function onReload() { navReload() }

function setHomeFromCurrent() {
  if (activeTab.value?.url) {
    const { setHomeUrl } = useNavigation()
    setHomeUrl(activeTab.value.url)
  }
  menuOpen.value = false
}

// ---------- 菜单 / 侧栏 ----------
function toggleMenu() { menuOpen.value = !menuOpen.value }
function openSide(panel) {
  activeSidePanel.value = activeSidePanel.value === panel ? 'none' : panel
  menuOpen.value = false
}

function chooseSearchEngine(id) {
  setSearchEngine(id)
  menuOpen.value = false
}

async function loadProxySettings() {
  const settings = await window.ccnNetwork?.getProxy?.()
  if (settings) proxySettings.value = settings
}

async function setProxyMode(modeOrRules) {
  const settings = modeOrRules === 'system' || modeOrRules === 'direct'
    ? { mode: modeOrRules, proxyRules: '' }
    : { mode: 'manual', proxyRules: modeOrRules, proxyBypassRules: '<local>' }
  const result = await window.ccnNetwork?.setProxy?.(settings)
  if (result) proxySettings.value = result
  proxyResolved.value = ''
  menuOpen.value = false
  if (activeTab.value) onReload()
}

async function checkProxy() {
  proxyResolved.value = await window.ccnNetwork?.resolveProxy?.('https://www.google.com') || ''
}

function newWindow() {
  window.ccnWindow?.newWindow?.()
  menuOpen.value = false
}

// ---------- 初始化 ----------
onMounted(async () => {
  await loadTabs()
  await loadDownloads()
  await loadProxySettings()
  await nextTick()
  reportChromeHeight()
})

onActivated(() => {
  nextTick(reportChromeHeight)
})

onBeforeUnmount(() => {})

// 窗口尺寸变化时重新上报
const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => {
  reportChromeHeight()
}) : null
onMounted(() => {
  if (ro && rootRef.value) {
    // 监听 titlebar + toolbar + tabbar 整体高度变化
    const target = rootRef.value.querySelector('.chrome')
    if (target) ro.observe(target)
  }
})
onBeforeUnmount(() => { ro?.disconnect() })

// 联动 useNavigation
const { setActiveTabId } = useNavigation()
watch(activeId, (id) => setActiveTabId(id), { immediate: true })

// currentUrl 变化时同步到 tab 状态（来自主进程的 url-change 事件）
watch(currentUrl, (url) => {
  if (activeTab.value && activeTab.value.url !== url) {
    updateTab(activeTab.value.id, { url })
  }
})

// 键盘快捷键
watch([activeSidePanel, downloadsOpen, menuOpen, () => downloads.value.length], () => {
  nextTick(reportChromeHeight)
})

function onKeydown(e) {
  if (!(e.ctrlKey || e.metaKey)) return
  if (e.key === 't' || e.key === 'T') {
    e.preventDefault()
    createTab()
  } else if (e.key === 'w' || e.key === 'W') {
    e.preventDefault()
    if (activeTab.value) closeTab(activeTab.value.id)
  } else if (e.key === 'd' || e.key === 'D') {
    e.preventDefault()
    toggleBookmark()
  } else if (e.key === 'r' || e.key === 'R') {
    e.preventDefault()
    onReload()
  }
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  background: #ffffff;
  color: #1f2329;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
}

.titlebar {
  position: relative;
  height: 28px;
  flex-shrink: 0;
  background: #f2f3f5;
  border-bottom: 1px solid #e4e6eb;
}
.titlebar.is-mac {
  height: 22px;
  background: transparent;
  border-bottom: none;
}
.chrome {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}
.titlebar-drag {
  position: absolute;
  inset: 0;
  -webkit-app-region: drag;
}
.window-controls {
  position: absolute;
  right: 0;
  top: 0;
  height: 100%;
  display: flex;
  align-items: center;
  gap: 0;
  -webkit-app-region: no-drag;
}
.win-btn {
  width: 36px;
  height: 100%;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 11px;
  color: #4e5969;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.win-btn:hover { background: #e4e6eb; }
.win-btn.close:hover { background: #d93025; color: #fff; }

.main {
  flex: 1;
  min-height: 0;
  display: flex;
}

.side {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid #e4e6eb;
  background: #f7f8fa;
}

.content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: #ffffff;
  position: relative;
  /* 真实的 web 内容在主进程的 WebContentsView 里，这里只是占位 */
  pointer-events: none; /* 事件穿透到下层 webview */
}
.content > * {
  pointer-events: auto;
}

.empty,
.page-placeholder {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #86909c;
  font-size: 13px;
  padding: 20px;
}
.ph-inner {
  text-align: center;
  max-width: 480px;
}
.ph-logo {
  font-size: 36px;
  font-weight: 700;
  color: #165dff;
  letter-spacing: 4px;
  margin-bottom: 12px;
}
.ph-title {
  font-size: 16px;
  font-weight: 600;
  color: #1f2329;
  margin-bottom: 6px;
  word-break: break-all;
}
.ph-url {
  font-size: 12px;
  color: #4e5969;
  word-break: break-all;
  margin-bottom: 12px;
}

.downloads {
  width: 320px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-left: 1px solid #e4e6eb;
  background: #ffffff;
}
.downloads-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border-bottom: 1px solid #e4e6eb;
  font-weight: 600;
  font-size: 13px;
  color: #1f2329;
}
.downloads-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}
.text-btn {
  height: 24px;
  padding: 0 8px;
  border: 1px solid #c9cdd4;
  background: #fff;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  color: #4e5969;
}
.text-btn:hover { background: #f2f3f5; }
.icon-btn {
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  color: #4e5969;
}
.icon-btn:hover { background: #f2f3f5; }

.downloads-list {
  list-style: none;
  margin: 0;
  padding: 0;
  flex: 1;
  overflow-y: auto;
}

.menu-mask {
  position: fixed;
  inset: 0;
  z-index: 100;
}
.menu {
  position: absolute;
  top: 70px;
  right: 12px;
  min-width: 200px;
  background: #fff;
  border: 1px solid #e4e6eb;
  border-radius: 6px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  padding: 4px;
  display: flex;
  flex-direction: column;
}
.menu-item {
  text-align: left;
  padding: 6px 10px;
  border: none;
  background: transparent;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  color: #1f2329;
}
.menu-item:hover { background: #f2f3f5; }
.menu-sep {
  height: 1px;
  background: #e4e6eb;
  margin: 4px 0;
}
.menu-label,
.menu-hint {
  padding: 5px 10px;
  font-size: 11px;
  color: #86909c;
  word-break: break-all;
}
.menu-label {
  color: #4e5969;
  font-weight: 600;
}
</style>
