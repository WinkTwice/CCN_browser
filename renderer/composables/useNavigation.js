import { ref, computed, watch } from 'vue'

/**
 * useNavigation
 * 渲染端镜像主进程 webview 的导航状态，并把用户操作回传到主进程。
 * 主进程通过 preload 在 window.ccnNavigation 暴露以下接口（全部可选）：
 *   - back(tabId) / forward(tabId) / reload(tabId) / stop(tabId)
 *   - navigate(tabId, url)
 *   - setHome(url)
 *   - toggleMute(tabId)
 *   - onUrlChange / onTitleChange / onFaviconChange / onNavState /
 *     onLoadingChange / onAudioChange / onHomeChange(cb)
 *     每个 cb 收到 { tabId, ...payload }，tabId 为空表示全局。
 */

const STORAGE_KEY = 'ccn:navigation:v1'
const DEFAULT_HOME = 'about:blank'

// ---------- 状态 ----------
const currentUrl = ref('')
const currentTitle = ref('')
const favicon = ref('')
const canGoBack = ref(false)
const canGoForward = ref(false)
const loading = ref(false)
const progress = ref(0)
const audible = ref(false)
const muted = ref(false)
const activeTabId = ref(null)
const homeUrl = ref(DEFAULT_HOME)

// ---------- 工具 ----------
function getApi() {
  return typeof window !== 'undefined' ? window.ccnNavigation : null
}

function readSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function writeSettings() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ homeUrl: homeUrl.value }),
    )
  } catch {}
}

function normalizeUrl(value) {
  if (!value) return ''
  const v = String(value).trim()
  if (!v) return ''
  // 已有协议（http/https/file/ftp/...）直接放行
  if (/^[a-z][a-z0-9+.-]*:/i.test(v)) return v
  // 形如 localhost[:port][/path] 或 主机.域名 视为 URL
  if (/^([a-z0-9-]+\.)+[a-z]{2,}(:\d+)?(\/.*)?$/i.test(v)) return 'https://' + v
  if (/^localhost(:\d+)?(\/.*)?$/i.test(v)) return 'http://' + v
  return ''
}

// ---------- 初始化 ----------
let initialized = false
function initSettings() {
  if (initialized) return
  const s = readSettings()
  if (s?.homeUrl) homeUrl.value = s.homeUrl
  initialized = true
}

// ---------- IPC 绑定 ----------
let ipcBound = false
function shouldApply(tabId) {
  // 事件没带 tabId 表示全局；否则只接受当前激活 tab 的事件
  return !tabId || !activeTabId.value || tabId === activeTabId.value
}

function bindIpc() {
  if (ipcBound) return
  const api = getApi()
  if (!api) return
  ipcBound = true

  api.onUrlChange?.(({ tabId, url } = {}) => {
    if (shouldApply(tabId)) currentUrl.value = url || ''
  })
  api.onTitleChange?.(({ tabId, title } = {}) => {
    if (shouldApply(tabId)) currentTitle.value = title || ''
  })
  api.onFaviconChange?.(({ tabId, url } = {}) => {
    if (shouldApply(tabId)) favicon.value = url || ''
  })
  api.onNavState?.(({ tabId, canGoBack: b, canGoForward: f } = {}) => {
    if (!shouldApply(tabId)) return
    canGoBack.value = Boolean(b)
    canGoForward.value = Boolean(f)
  })
  api.onLoadingChange?.(({ tabId, isLoading, lprogress } = {}) => {
    if (!shouldApply(tabId)) return
    loading.value = Boolean(isLoading)
    progress.value = isLoading ? Math.max(0, Math.min(100, lprogress || 0)) : 0
  })
  api.onAudioChange?.(({ tabId, isAudible, isMuted } = {}) => {
    if (!shouldApply(tabId)) return
    audible.value = Boolean(isAudible)
    if (typeof isMuted === 'boolean') muted.value = isMuted
  })
  api.onHomeChange?.((url) => {
    if (url) homeUrl.value = url
  })
}

// ---------- 操作 ----------
function withApi(method, ...args) {
  const api = getApi()
  if (api && typeof api[method] === 'function') {
    try { api[method](...args) } catch (err) { console.warn('[useNavigation]', method, err) }
  }
}

function goBack() {
  if (!canGoBack.value) return
  withApi('back', activeTabId.value)
}

function goForward() {
  if (!canGoForward.value) return
  withApi('forward', activeTabId.value)
}

function reload() {
  withApi('reload', activeTabId.value)
}

function stop() {
  withApi('stop', activeTabId.value)
  loading.value = false
  progress.value = 0
}

function navigate(value) {
  const target = normalizeUrl(value)
  if (!target) return null
  currentUrl.value = target
  withApi('navigate', activeTabId.value, target)
  return target
}

function goHome() {
  return navigate(homeUrl.value)
}

function setHomeUrl(url) {
  const target = normalizeUrl(url) || DEFAULT_HOME
  homeUrl.value = target
  writeSettings()
  withApi('setHome', target)
}

function toggleMute() {
  muted.value = !muted.value
  withApi('toggleMute', activeTabId.value)
}

function setActiveTabId(id) {
  activeTabId.value = id
}

// ---------- 派生 ----------
const isSecure = computed(() => /^https:\/\//i.test(currentUrl.value || ''))

// ---------- 启动 ----------
watch(homeUrl, writeSettings)
initSettings()
bindIpc()

// ---------- 导出 ----------
export function useNavigation() {
  return {
    // 状态
    currentUrl,
    currentTitle,
    favicon,
    canGoBack,
    canGoForward,
    loading,
    progress,
    audible,
    muted,
    isSecure,
    homeUrl,
    activeTabId,
    // 操作
    goBack,
    goForward,
    reload,
    stop,
    navigate,
    goHome,
    setHomeUrl,
    toggleMute,
    setActiveTabId,
  }
}
