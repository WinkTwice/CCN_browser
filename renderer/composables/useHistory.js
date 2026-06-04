import { computed, ref } from 'vue'

const STORAGE_KEY = 'ccn:history:v1'
const MAX_ENTRIES = 10000

const history = ref([])
const loading = ref(false)

let initialized = false
let ipcBound = false

function getApi() {
  return typeof window !== 'undefined' ? window.ccnHistory : null
}

function generateId() {
  return `h_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function normalizeEntry(item = {}) {
  const now = Date.now()
  return {
    id: item.id || generateId(),
    url: item.url || '',
    title: item.title || item.url || '未命名',
    favicon: item.favicon || '',
    visitTime: Number(item.visitTime) || now,
    visitCount: Number(item.visitCount) || 1,
    lastVisitTime: Number(item.lastVisitTime) || Number(item.visitTime) || now,
  }
}

function sortByLastVisit(list) {
  return [...list].sort((a, b) => (b.lastVisitTime || 0) - (a.lastVisitTime || 0))
}

function applyState(list) {
  history.value = Array.isArray(list)
    ? sortByLastVisit(list.map(normalizeEntry))
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history.value))
  } catch {}
}

function bindIpc() {
  if (ipcBound) return
  const api = getApi()
  if (!api?.onChanged) return
  ipcBound = true
  api.onChanged((list) => applyState(list))
}

async function loadHistory(keyword = '') {
  loading.value = true
  try {
    bindIpc()
    const api = getApi()
    if (api?.list) {
      applyState(await api.list(keyword))
    } else {
      applyState(readFallback())
    }
    initialized = true
  } finally {
    loading.value = false
  }
}

function ensureInitialized() {
  if (!initialized) {
    applyState(readFallback())
    initialized = true
  }
}

async function searchHistory(keyword) {
  const kw = String(keyword || '').trim()
  if (!kw) {
    await loadHistory()
    return
  }
  const api = getApi()
  if (api?.list) {
    applyState(await api.list(kw))
    return
  }
  ensureInitialized()
  const allItems = Array.isArray(readFallback()) ? sortByLastVisit(readFallback().map(normalizeEntry)) : []
  const lower = kw.toLowerCase()
  history.value = allItems.filter(
    (e) => (e.title || '').toLowerCase().includes(lower) || (e.url || '').toLowerCase().includes(lower),
  )
}

async function addEntry(payload) {
  if (!payload?.url) return null
  const api = getApi()
  if (api?.add) {
    const entry = await api.add(payload)
    await loadHistory()
    return entry
  }
  ensureInitialized()
  const url = String(payload.url || '').trim()
  if (!url) return null
  const now = Date.now()
  const existing = history.value.find((e) => e.url === url)
  if (existing) {
    existing.visitCount = (existing.visitCount || 1) + 1
    existing.lastVisitTime = now
    existing.visitTime = now
    if (payload.title) existing.title = payload.title
    if (payload.favicon) existing.favicon = payload.favicon
    history.value = sortByLastVisit(history.value)
    writeFallback()
    return existing
  }
  const entry = normalizeEntry({
    url,
    title: payload.title,
    favicon: payload.favicon,
    visitTime: now,
    lastVisitTime: now,
    visitCount: 1,
  })
  history.value.unshift(entry)
  history.value = history.value.slice(0, MAX_ENTRIES)
  writeFallback()
  return entry
}

async function removeEntry(id) {
  const api = getApi()
  if (api?.remove) {
    const removed = await api.remove(id)
    await loadHistory()
    return removed
  }
  ensureInitialized()
  const before = history.value.length
  history.value = history.value.filter((e) => e.id !== id)
  writeFallback()
  return history.value.length !== before
}

async function updateEntry(id, patch) {
  const api = getApi()
  if (api?.update) {
    const entry = await api.update(id, patch)
    await loadHistory()
    return entry
  }
  ensureInitialized()
  const entry = history.value.find((e) => e.id === id)
  if (!entry) return null
  Object.assign(entry, patch)
  history.value = sortByLastVisit(history.value)
  writeFallback()
  return entry
}

async function clearHistory() {
  const api = getApi()
  if (api?.clear) {
    await api.clear()
    await loadHistory()
    return true
  }
  history.value = []
  writeFallback()
  return true
}

async function clearRange(from, to) {
  const api = getApi()
  if (api?.clearRange) {
    await api.clearRange(from, to)
    await loadHistory()
    return true
  }
  ensureInitialized()
  const fromTs = from ? new Date(from).getTime() : 0
  const toTs = to ? new Date(to).getTime() : Date.now()
  history.value = history.value.filter((e) => {
    const t = e.lastVisitTime || e.visitTime || 0
    return t < fromTs || t > toTs
  })
  writeFallback()
  return true
}

function getRecent(limit = 10) {
  ensureInitialized()
  return history.value.slice(0, limit)
}

function getByUrl(url) {
  ensureInitialized()
  return history.value.find((e) => e.url === url) || null
}

function startOfDay(ts) {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

const groupedByDate = computed(() => {
  ensureInitialized()
  const todayStart = startOfDay(Date.now())
  const yesterdayStart = todayStart - 24 * 60 * 60 * 1000
  const weekStart = todayStart - 7 * 24 * 60 * 60 * 1000
  const monthStart = todayStart - 30 * 24 * 60 * 60 * 1000

  const groups = {
    today: { key: 'today', label: '今天', items: [] },
    yesterday: { key: 'yesterday', label: '昨天', items: [] },
    thisWeek: { key: 'thisWeek', label: '本周更早', items: [] },
    thisMonth: { key: 'thisMonth', label: '本月更早', items: [] },
    earlier: { key: 'earlier', label: '更早', items: [] },
  }

  for (const entry of history.value) {
    const t = entry.lastVisitTime || entry.visitTime || 0
    if (t >= todayStart) groups.today.items.push(entry)
    else if (t >= yesterdayStart) groups.yesterday.items.push(entry)
    else if (t >= weekStart) groups.thisWeek.items.push(entry)
    else if (t >= monthStart) groups.thisMonth.items.push(entry)
    else groups.earlier.items.push(entry)
  }

  return Object.values(groups).filter((g) => g.items.length > 0)
})

bindIpc()
loadHistory()

export function useHistory() {
  return {
    history,
    loading,
    groupedByDate,
    loadHistory,
    addEntry,
    removeEntry,
    updateEntry,
    searchHistory,
    clearHistory,
    clearRange,
    getRecent,
    getByUrl,
  }
}
