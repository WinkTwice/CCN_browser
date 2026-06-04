import { ref } from 'vue'

const STORAGE_KEY = 'ccn:bookmarks:v1'

const bookmarks = ref([])
const folders = ref([])
const loading = ref(false)

let initialized = false
let ipcBound = false

function getApi() {
  return typeof window !== 'undefined' ? window.ccnBookmarks : null
}

function generateId(prefix = 'bm') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function normalizeFolder(folder = {}) {
  return {
    id: folder.id || generateId('fd'),
    name: folder.name || '默认',
    createdAt: folder.createdAt || Date.now(),
  }
}

function normalizeBookmark(item = {}) {
  return {
    id: item.id || generateId(),
    title: item.title || item.url || '未命名',
    url: item.url || '',
    folderId: item.folderId || 'default',
    favicon: item.favicon || '',
    createdAt: item.createdAt || Date.now(),
    updatedAt: item.updatedAt || Date.now(),
  }
}

function applyState(data = {}) {
  folders.value = Array.isArray(data.folders) && data.folders.length
    ? data.folders.map(normalizeFolder)
    : [normalizeFolder({ id: 'default', name: '默认' })]
  bookmarks.value = Array.isArray(data.bookmarks)
    ? data.bookmarks.map(normalizeBookmark)
    : []
}

function readFallback() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function writeFallback() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      folders: folders.value,
      bookmarks: bookmarks.value,
    }))
  } catch {}
}

function bindIpc() {
  if (ipcBound) return
  const api = getApi()
  if (!api?.onChanged) return
  ipcBound = true
  api.onChanged((data) => applyState(data))
}

async function loadBookmarks(keyword = '') {
  loading.value = true
  try {
    bindIpc()
    const api = getApi()
    if (api?.list) {
      applyState(await api.list(keyword))
    } else {
      const data = readFallback()
      applyState(data || {})
    }
    initialized = true
  } finally {
    loading.value = false
  }
}

function ensureInitialized() {
  if (!initialized) {
    const data = readFallback()
    applyState(data || {})
    initialized = true
  }
}

async function searchBookmarks(keyword) {
  const kw = String(keyword || '').trim()
  if (!kw) {
    await loadBookmarks()
    return
  }
  const api = getApi()
  if (api?.list) {
    applyState(await api.list(kw))
    return
  }
  ensureInitialized()
  const data = readFallback()
  const allItems = Array.isArray(data?.bookmarks) ? data.bookmarks.map(normalizeBookmark) : []
  const lower = kw.toLowerCase()
  bookmarks.value = allItems.filter(
    (b) => (b.title || '').toLowerCase().includes(lower) || (b.url || '').toLowerCase().includes(lower),
  )
}

async function addBookmark(payload) {
  if (!payload?.url) return null
  const api = getApi()
  if (api?.add) {
    const item = await api.add(payload)
    await loadBookmarks()
    return item
  }
  ensureInitialized()
  const folderId = payload.folderId || 'default'
  if (!folders.value.some((f) => f.id === folderId)) {
    folders.value.push(normalizeFolder({ id: folderId, name: folderId }))
  }
  const item = normalizeBookmark({ ...payload, folderId })
  bookmarks.value.push(item)
  writeFallback()
  return item
}

async function removeBookmark(id) {
  const api = getApi()
  if (api?.remove) {
    const removed = await api.remove(id)
    await loadBookmarks()
    return removed
  }
  ensureInitialized()
  const before = bookmarks.value.length
  bookmarks.value = bookmarks.value.filter((b) => b.id !== id)
  writeFallback()
  return bookmarks.value.length !== before
}

async function updateBookmark(id, patch) {
  const api = getApi()
  if (api?.update) {
    const item = await api.update(id, patch)
    await loadBookmarks()
    return item
  }
  ensureInitialized()
  const item = bookmarks.value.find((b) => b.id === id)
  if (!item) return null
  Object.assign(item, patch, { updatedAt: Date.now() })
  writeFallback()
  return item
}

async function addFolder(name) {
  const api = getApi()
  if (api?.addFolder) {
    const folder = await api.addFolder(name)
    await loadBookmarks()
    return folder
  }
  ensureInitialized()
  const folder = normalizeFolder({ name: String(name || '').trim() || '新文件夹' })
  folders.value.push(folder)
  writeFallback()
  return folder
}

async function removeFolder(id) {
  const api = getApi()
  if (api?.removeFolder) {
    const removed = await api.removeFolder(id)
    await loadBookmarks()
    return removed
  }
  ensureInitialized()
  if (id === 'default') return false
  folders.value = folders.value.filter((f) => f.id !== id)
  bookmarks.value = bookmarks.value.map((b) =>
    b.folderId === id ? { ...b, folderId: 'default', updatedAt: Date.now() } : b,
  )
  writeFallback()
  return true
}

function getByFolder(folderId) {
  ensureInitialized()
  return bookmarks.value.filter((b) => (b.folderId || 'default') === folderId)
}

bindIpc()
loadBookmarks()

export function useBookmarks() {
  return {
    bookmarks,
    folders,
    loading,
    loadBookmarks,
    addBookmark,
    removeBookmark,
    updateBookmark,
    searchBookmarks,
    addFolder,
    removeFolder,
    getByFolder,
  }
}
