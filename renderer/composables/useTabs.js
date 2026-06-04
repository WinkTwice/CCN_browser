import { ref, watch, computed } from 'vue'

const STORAGE_KEY = 'ccn:tabs:v1'

const tabs = ref([])
const activeId = ref(null)
const loading = ref(false)

let initialized = false
let ipcBound = false

function getApi() {
  return typeof window !== 'undefined' ? window.ccnTabs : null
}

function readStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function writeStorage() {
  try {
    // 持久化"标签 + 当前激活 id"
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ tabs: tabs.value, activeId: activeId.value }),
    )
  } catch {}
}

function generateId() {
  return (
    'tab_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8)
  )
}

function normalizeTab(tab) {
  const now = Date.now()
  return {
    id: tab.id || generateId(),
    title: tab.title || '',
    url: tab.url || '',
    favicon: tab.favicon || '',
    tooltip: tab.tooltip || '',
    loading: Boolean(tab.loading),
    pinned: Boolean(tab.pinned),
    audible: Boolean(tab.audible),
    muted: Boolean(tab.muted),
    modified: Boolean(tab.modified),
    createdAt: Number(tab.createdAt) || now,
    updatedAt: Number(tab.updatedAt) || now,
  }
}

function initIfNeeded(force = false) {
  if (initialized && !force) return
  if (getApi()) {
    tabs.value = []
    activeId.value = null
    initialized = true
    return
  }
  const data = readStorage()
  if (data && Array.isArray(data.tabs)) {
    tabs.value = data.tabs.map(normalizeTab)
    activeId.value =
      data.activeId && tabs.value.some((t) => t.id === data.activeId)
        ? data.activeId
        : tabs.value[0]?.id || null
  } else {
    tabs.value = []
    activeId.value = null
  }
  initialized = true
}

function persist() {
  writeStorage()
}

function ensureAtLeastOne() {
  if (getApi()) return
  if (tabs.value.length === 0) {
    const tab = normalizeTab({ url: 'about:blank', title: '新标签' })
    tabs.value.push(tab)
    activeId.value = tab.id
  }
}

async function loadTabs() {
  loading.value = true
  try {
    initIfNeeded(true)
    await syncFromMain()
    ensureAtLeastOne()
  } finally {
    loading.value = false
  }
}

async function syncFromMain() {
  const api = getApi()
  if (!api || typeof api.list !== 'function') return
  try {
    const list = await api.list()
    if (!Array.isArray(list) || list.length === 0) return
    const map = new Map(tabs.value.map((t) => [t.id, t]))
    const next = list.map(normalizeTab)
    tabs.value = next
    const active = await api.getActive?.()
    const activeTabIdFromMain = typeof active === 'string' ? active : active?.id
    if (activeTabIdFromMain && tabs.value.some((t) => t.id === activeTabIdFromMain)) {
      activeId.value = activeTabIdFromMain
    } else if (!activeId.value || !tabs.value.some((t) => t.id === activeId.value)) {
      activeId.value = tabs.value[0]?.id || null
    }
  } catch (err) {
    console.warn('[useTabs] syncFromMain failed:', err)
  }
}

function upsertLocal(tab) {
  const norm = normalizeTab(tab)
  const idx = tabs.value.findIndex((t) => t.id === norm.id)
  if (idx === -1) tabs.value.push(norm)
  else tabs.value[idx] = { ...tabs.value[idx], ...norm, updatedAt: Date.now() }
}

function removeLocal(id) {
  const idx = tabs.value.findIndex((t) => t.id === id)
  if (idx === -1) return
  tabs.value.splice(idx, 1)
  if (activeId.value === id) {
    const next = tabs.value[idx] || tabs.value[idx - 1] || null
    activeId.value = next ? next.id : null
  }
}

function bindIpc() {
  if (ipcBound) return
  const api = getApi()
  if (!api) return
  ipcBound = true

  api.onCreated?.((tab) => {
    upsertLocal(tab)
    if (tab?.id) activeId.value = tab.id
    ensureAtLeastOne()
  })
  api.onUpdated?.((tab) => upsertLocal(tab))
  api.onClosed?.(({ id }) => {
    removeLocal(id)
    ensureAtLeastOne()
  })
  api.onActivated?.(({ id }) => {
    if (tabs.value.some((t) => t.id === id)) {
      activeId.value = id
    }
  })
  api.onReordered?.((order) => {
    if (!Array.isArray(order)) return
    const map = new Map(tabs.value.map((t) => [t.id, t]))
    const next = []
    for (const id of order) {
      if (map.has(id)) {
        next.push(map.get(id))
        map.delete(id)
      }
    }
    for (const t of map.values()) next.push(t)
    tabs.value = next
  })
  api.onAudioChange?.(({ id, tabId, isAudible, isMuted }) => {
    const targetId = tabId || id
    const t = tabs.value.find((x) => x.id === targetId)
    if (!t) return
    t.audible = Boolean(isAudible)
    if (typeof isMuted === 'boolean') t.muted = isMuted
  })
  api.onLoadingChange?.(({ id, tabId, isLoading, lprogress }) => {
    const targetId = tabId || id
    const t = tabs.value.find((x) => x.id === targetId)
    if (!t) return
    t.loading = Boolean(isLoading)
    if (typeof lprogress === 'number') t.favicon = t.favicon // 触发响应式（可扩展进度）
  })
  api.onUrlChange?.(({ id, tabId, url }) => {
    const targetId = tabId || id
    const t = tabs.value.find((x) => x.id === targetId)
    if (t) t.url = url || ''
  })
  api.onTitleChange?.(({ id, tabId, title }) => {
    const targetId = tabId || id
    const t = tabs.value.find((x) => x.id === targetId)
    if (t) t.title = title || ''
  })
  api.onFaviconChange?.(({ id, tabId, url }) => {
    const targetId = tabId || id
    const t = tabs.value.find((x) => x.id === targetId)
    if (t) t.favicon = url || ''
  })
}

function findAdjacent(id, direction) {
  const idx = tabs.value.findIndex((t) => t.id === id)
  if (idx === -1) return null
  return tabs.value[idx + direction] || null
}

function pickNextActiveAfterClose(id) {
  return findAdjacent(id, 1) || findAdjacent(id, -1) || null
}

async function createTab(payload = {}) {
  initIfNeeded()

  const optimistic = normalizeTab({
    ...payload,
    url: payload.url || 'about:blank',
    title: payload.title || '新标签',
    loading: true,
  })
  tabs.value.push(optimistic)
  activeId.value = optimistic.id

  const api = getApi()
  if (api?.create) {
    try {
      const real = await api.create(payload)
      if (real && real.id) {
        const idx = tabs.value.findIndex((t) => t.id === optimistic.id)
        if (idx !== -1) {
          tabs.value.splice(idx, 1)
          upsertLocal(real)
          activeId.value = real.id
        }
        persist()
        return tabs.value.find((t) => t.id === real.id) || null
      }
    } catch (err) {
      optimistic.loading = false
      console.warn('[useTabs] create via main failed:', err)
    }
  }
  persist()
  return optimistic
}

async function closeTab(id) {
  initIfNeeded()
  if (!id) return false
  if (tabs.value.length === 1 && tabs.value[0].id === id) {
    const api = getApi()
    if (api?.close) {
      try { await api.close(id) } catch (err) { console.warn(err) }
      return true
    }
    // 至少保留一个标签
    tabs.value[0] = normalizeTab({ url: 'about:blank', title: '新标签' })
    activeId.value = tabs.value[0].id
    persist()
    return true
  }

  const wasActive = activeId.value === id
  const api = getApi()
  if (api?.close) {
    try { await api.close(id) } catch (err) { console.warn(err) }
  }
  removeLocal(id)
  if (wasActive) {
    const next = pickNextActiveAfterClose(id)
    if (next) {
      activeId.value = next.id
      api?.activate?.(next.id)
    }
  }
  ensureAtLeastOne()
  persist()
  return true
}

async function selectTab(id) {
  initIfNeeded()
  if (!id || activeId.value === id) return
  if (!tabs.value.some((t) => t.id === id)) return
  activeId.value = id
  const api = getApi()
  if (api?.activate) {
    try { await api.activate(id) } catch (err) { console.warn(err) }
  }
}

async function moveTab(from, to) {
  initIfNeeded()
  if (from === to) return
  if (from < 0 || from >= tabs.value.length) return
  if (to < 0 || to >= tabs.value.length) return
  const [moved] = tabs.value.splice(from, 1)
  tabs.value.splice(to, 0, moved)
  const api = getApi()
  if (api?.reorder) {
    try {
      await api.reorder(tabs.value.map((t) => t.id))
    } catch (err) {
      console.warn('[useTabs] reorder failed:', err)
    }
  }
  persist()
}

async function updateTab(id, patch) {
  initIfNeeded()
  const t = tabs.value.find((x) => x.id === id)
  if (!t) return null
  Object.assign(t, patch, { updatedAt: Date.now() })
  const api = getApi()
  if (api?.update) {
    try { await api.update(id, patch) } catch (err) { console.warn(err) }
  }
  persist()
  return t
}

async function pinTab(id, pinned = true) {
  return updateTab(id, { pinned: Boolean(pinned) })
}

function getActiveTab() {
  initIfNeeded()
  return tabs.value.find((t) => t.id === activeId.value) || null
}

const activeTab = computed(() => getActiveTab())

watch([tabs, activeId], persist, { deep: true })

initIfNeeded()
bindIpc()

export function useTabs() {
  return {
    tabs,
    activeId,
    activeTab,
    loading,
    loadTabs,
    createTab,
    closeTab,
    selectTab,
    moveTab,
    updateTab,
    pinTab,
    getActiveTab,
  }
}
