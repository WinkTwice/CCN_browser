import { ref, watch, computed } from 'vue'

const STORAGE_KEY = 'ccn:downloads:v1'
const MAX_ENTRIES = 5000

const downloads = ref([])
const loading = ref(false)

let initialized = false
let ipcBound = false

function getApi() {
  return typeof window !== 'undefined' ? window.ccnDownloads : null
}

function readStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch (err) {
    console.warn('[useDownloads] read storage failed:', err)
    return null
  }
}

function writeStorage() {
  try {
    // 只持久化"已完成/已取消/已失败"的条目，活跃下载从主进程恢复
    const persistent = downloads.value.filter((d) =>
      ['completed', 'cancelled', 'failed'].includes(d.status),
    )
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persistent))
  } catch (err) {
    console.warn('[useDownloads] write storage failed:', err)
  }
}

function generateId() {
  return (
    'dl_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8)
  )
}

function normalizeItem(item) {
  const now = Date.now()
  return {
    id: item.id || generateId(),
    url: item.url || '',
    filename: item.filename || item.name || deriveFilename(item.url) || '未命名',
    savePath: item.savePath || '',
    mimeType: item.mimeType || '',
    totalBytes: Number(item.totalBytes) || 0,
    receivedBytes: Number(item.receivedBytes) || 0,
    speed: Number(item.speed) || 0,
    status: item.status || 'queued',
    error: item.error || '',
    startedAt: Number(item.startedAt) || now,
    updatedAt: Number(item.updatedAt) || now,
    completedAt: Number(item.completedAt) || 0,
  }
}

function deriveFilename(url) {
  if (!url) return ''
  try {
    const u = new URL(url)
    const last = u.pathname.split('/').filter(Boolean).pop() || ''
    return decodeURIComponent(last)
  } catch {
    return ''
  }
}

function initIfNeeded(force = false) {
  if (initialized && !force) return
  const data = readStorage()
  downloads.value = Array.isArray(data)
    ? data.map(normalizeItem)
    : []
  initialized = true
}

function persist() {
  writeStorage()
}

async function loadDownloads() {
  loading.value = true
  try {
    initIfNeeded(true)
    await syncFromMain()
  } finally {
    loading.value = false
  }
}

async function syncFromMain() {
  const api = getApi()
  if (!api || typeof api.list !== 'function') return
  try {
    const list = await api.list()
    if (!Array.isArray(list)) return
    const map = new Map(downloads.value.map((d) => [d.id, d]))
    for (const item of list) {
      const norm = normalizeItem(item)
      const existing = map.get(norm.id)
      if (existing) Object.assign(existing, norm, { updatedAt: Date.now() })
      else downloads.value.push(norm)
    }
  } catch (err) {
    console.warn('[useDownloads] syncFromMain failed:', err)
  }
}

function upsertLocal(item) {
  const norm = normalizeItem(item)
  const idx = downloads.value.findIndex((d) => d.id === norm.id)
  if (idx === -1) {
    downloads.value.unshift(norm)
  } else {
    Object.assign(downloads.value[idx], norm, { updatedAt: Date.now() })
  }
  if (downloads.value.length > MAX_ENTRIES) {
    downloads.value = downloads.value.slice(0, MAX_ENTRIES)
  }
}

function bindIpc() {
  if (ipcBound) return
  const api = getApi()
  if (!api) return
  ipcBound = true

  api.onCreated?.((item) => upsertLocal(item))
  api.onUpdated?.((item) => upsertLocal(item))
  api.onProgress?.((item) => upsertLocal(item))
  api.onDone?.((item) => {
    upsertLocal({ ...item, status: 'completed', completedAt: Date.now() })
    persist()
  })
  api.onError?.(({ id, error }) => {
    const item = downloads.value.find((d) => d.id === id)
    if (item) {
      item.status = 'failed'
      item.error = error || '下载失败'
      item.updatedAt = Date.now()
    }
    persist()
  })
  api.onRemoved?.((id) => {
    downloads.value = downloads.value.filter((d) => d.id !== id)
    persist()
  })
}

async function addDownload(payload) {
  if (!payload || !payload.url) return null
  initIfNeeded()

  const optimistic = normalizeItem({
    ...payload,
    status: 'queued',
    startedAt: Date.now(),
  })
  downloads.value.unshift(optimistic)

  const api = getApi()
  if (api && typeof api.create === 'function') {
    try {
      const real = await api.create(payload)
      if (real && real.id) {
        const idx = downloads.value.findIndex((d) => d.id === optimistic.id)
        if (idx !== -1) downloads.value.splice(idx, 1)
        upsertLocal(real)
        return downloads.value.find((d) => d.id === real.id) || null
      }
    } catch (err) {
      const item = downloads.value.find((d) => d.id === optimistic.id)
      if (item) {
        item.status = 'failed'
        item.error = err?.message || String(err)
        item.updatedAt = Date.now()
      }
      persist()
      return item
    }
  }
  return optimistic
}

async function pauseDownload(id) {
  const api = getApi()
  if (api?.pause) {
    try { await api.pause(id) } catch (err) { console.warn(err) }
  }
  const item = downloads.value.find((d) => d.id === id)
  if (item && item.status === 'downloading') {
    item.status = 'paused'
    item.speed = 0
    item.updatedAt = Date.now()
  }
}

async function resumeDownload(id) {
  const api = getApi()
  if (api?.resume) {
    try { await api.resume(id) } catch (err) { console.warn(err) }
    return
  }
  const item = downloads.value.find((d) => d.id === id)
  if (item && (item.status === 'paused' || item.status === 'queued')) {
    item.status = 'downloading'
    item.updatedAt = Date.now()
  }
}

async function cancelDownload(id) {
  const api = getApi()
  if (api?.cancel) {
    try { await api.cancel(id) } catch (err) { console.warn(err) }
  }
  const item = downloads.value.find((d) => d.id === id)
  if (item) {
    item.status = 'cancelled'
    item.speed = 0
    item.updatedAt = Date.now()
    persist()
  }
}

async function retryDownload(id) {
  const item = downloads.value.find((d) => d.id === id)
  if (!item) return null
  if (item.url) {
    return addDownload({ url: item.url, filename: item.filename })
  }
  const api = getApi()
  if (api?.retry) {
    try { await api.retry(id) } catch (err) { console.warn(err) }
  }
  item.status = 'downloading'
  item.error = ''
  item.updatedAt = Date.now()
  return item
}

async function removeDownload(id) {
  const api = getApi()
  if (api?.remove) {
    try { await api.remove(id) } catch (err) { console.warn(err) }
  }
  downloads.value = downloads.value.filter((d) => d.id !== id)
  persist()
}

async function openFile(id) {
  const item = downloads.value.find((d) => d.id === id)
  if (!item) return false
  const api = getApi()
  if (api?.openFile) {
    try {
      await api.openFile(id)
      return true
    } catch (err) {
      console.warn('[useDownloads] openFile failed:', err)
    }
  }
  if (item.savePath && typeof window !== 'undefined' && window.open) {
    window.open('file://' + item.savePath, '_blank')
    return true
  }
  return false
}

async function openFolder(id) {
  const item = downloads.value.find((d) => d.id === id)
  if (!item) return false
  const api = getApi()
  if (api?.openFolder) {
    try {
      await api.openFolder(id)
      return true
    } catch (err) {
      console.warn('[useDownloads] openFolder failed:', err)
    }
  }
  if (item.savePath && typeof window !== 'undefined' && window.showDirectoryPicker) {
    console.warn('openFolder: no main process support')
  }
  return false
}

async function clearCompleted() {
  const api = getApi()
  if (api?.clearCompleted) {
    try { await api.clearCompleted() } catch (err) { console.warn(err) }
  }
  downloads.value = downloads.value.filter(
    (d) => !['completed', 'cancelled', 'failed'].includes(d.status),
  )
  persist()
}

const active = computed(() =>
  downloads.value.filter((d) =>
    ['queued', 'downloading', 'paused'].includes(d.status),
  ),
)

const completed = computed(() =>
  downloads.value.filter((d) =>
    ['completed', 'cancelled', 'failed'].includes(d.status),
  ),
)

function getByStatus(status) {
  initIfNeeded()
  return downloads.value.filter((d) => d.status === status)
}

function getRecent(limit = 20) {
  initIfNeeded()
  return downloads.value.slice(0, limit)
}

watch(downloads, persist, { deep: true })

initIfNeeded()
bindIpc()

export function useDownloads() {
  return {
    downloads,
    active,
    completed,
    loading,
    loadDownloads,
    addDownload,
    pauseDownload,
    resumeDownload,
    cancelDownload,
    retryDownload,
    removeDownload,
    openFile,
    openFolder,
    clearCompleted,
    getByStatus,
    getRecent,
  }
}
