const fs = require('node:fs')
const path = require('node:path')
const { app } = require('electron')

const DEFAULT_FOLDER_ID = 'default'
const MAX_HISTORY_ENTRIES = 10000

function now() {
  return Date.now()
}

function createId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function safeString(value) {
  return typeof value === 'string' ? value.trim() : ''
}

class DataStore {
  constructor() {
    this.filePath = ''
    this.data = {
      folders: [{ id: DEFAULT_FOLDER_ID, name: '默认', createdAt: now() }],
      bookmarks: [],
      history: [],
    }
    this.loaded = false
  }

  load() {
    if (this.loaded) return
    this.loaded = true
    this.filePath = path.join(app.getPath('userData'), 'browser-data.json')
    try {
      if (!fs.existsSync(this.filePath)) {
        this.save()
        return
      }
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8'))
      this.data = this.normalizeData(parsed)
      this.save()
    } catch (err) {
      console.warn('[DataStore] load failed:', err)
      this.data = this.normalizeData({})
      this.save()
    }
  }

  save() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true })
    fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf8')
  }

  normalizeData(input) {
    const folders = Array.isArray(input?.folders)
      ? input.folders.map((item) => this.normalizeFolder(item))
      : []
    if (!folders.some((folder) => folder.id === DEFAULT_FOLDER_ID)) {
      folders.unshift({ id: DEFAULT_FOLDER_ID, name: '默认', createdAt: now() })
    }

    const folderIds = new Set(folders.map((folder) => folder.id))
    const bookmarks = Array.isArray(input?.bookmarks)
      ? input.bookmarks
          .map((item) => this.normalizeBookmark(item))
          .filter((item) => item.url)
          .map((item) => ({
            ...item,
            folderId: folderIds.has(item.folderId) ? item.folderId : DEFAULT_FOLDER_ID,
          }))
      : []

    const history = Array.isArray(input?.history)
      ? input.history
          .map((item) => this.normalizeHistory(item))
          .filter((item) => item.url)
          .sort((a, b) => (b.lastVisitTime || 0) - (a.lastVisitTime || 0))
          .slice(0, MAX_HISTORY_ENTRIES)
      : []

    return { folders, bookmarks, history }
  }

  normalizeFolder(folder = {}) {
    return {
      id: safeString(folder.id) || createId('fd'),
      name: safeString(folder.name) || '新文件夹',
      createdAt: Number(folder.createdAt) || now(),
    }
  }

  normalizeBookmark(item = {}) {
    const ts = now()
    return {
      id: safeString(item.id) || createId('bm'),
      title: safeString(item.title) || safeString(item.url) || '未命名',
      url: safeString(item.url),
      folderId: safeString(item.folderId) || DEFAULT_FOLDER_ID,
      favicon: safeString(item.favicon),
      createdAt: Number(item.createdAt) || ts,
      updatedAt: Number(item.updatedAt) || ts,
    }
  }

  normalizeHistory(item = {}) {
    const ts = now()
    const visitTime = Number(item.visitTime) || Number(item.lastVisitTime) || ts
    return {
      id: safeString(item.id) || createId('h'),
      url: safeString(item.url),
      title: safeString(item.title) || safeString(item.url) || '未命名',
      favicon: safeString(item.favicon),
      visitTime,
      visitCount: Math.max(1, Number(item.visitCount) || 1),
      lastVisitTime: Number(item.lastVisitTime) || visitTime,
    }
  }

  listBookmarks(keyword = '') {
    this.load()
    const kw = safeString(keyword).toLowerCase()
    const bookmarks = kw
      ? this.data.bookmarks.filter((item) =>
          item.title.toLowerCase().includes(kw) || item.url.toLowerCase().includes(kw),
        )
      : this.data.bookmarks
    return { folders: this.data.folders, bookmarks }
  }

  addBookmark(payload = {}) {
    this.load()
    const item = this.normalizeBookmark(payload)
    if (!item.url) return null
    if (!this.data.folders.some((folder) => folder.id === item.folderId)) {
      this.data.folders.push(this.normalizeFolder({ id: item.folderId, name: item.folderId }))
    }
    const existing = this.data.bookmarks.find((bookmark) => bookmark.url === item.url)
    if (existing) {
      Object.assign(existing, item, {
        id: existing.id,
        createdAt: existing.createdAt,
        updatedAt: now(),
      })
      this.save()
      return existing
    }
    this.data.bookmarks.push(item)
    this.save()
    return item
  }

  updateBookmark(id, patch = {}) {
    this.load()
    const item = this.data.bookmarks.find((bookmark) => bookmark.id === id)
    if (!item) return null
    const next = this.normalizeBookmark({ ...item, ...patch, id: item.id, createdAt: item.createdAt })
    Object.assign(item, next, { updatedAt: now() })
    this.save()
    return item
  }

  removeBookmark(id) {
    this.load()
    const before = this.data.bookmarks.length
    this.data.bookmarks = this.data.bookmarks.filter((bookmark) => bookmark.id !== id)
    const removed = this.data.bookmarks.length !== before
    if (removed) this.save()
    return removed
  }

  addFolder(name) {
    this.load()
    const folder = this.normalizeFolder({ name })
    this.data.folders.push(folder)
    this.save()
    return folder
  }

  removeFolder(id) {
    this.load()
    if (!id || id === DEFAULT_FOLDER_ID) return false
    const before = this.data.folders.length
    this.data.folders = this.data.folders.filter((folder) => folder.id !== id)
    const removed = this.data.folders.length !== before
    if (!removed) return false
    this.data.bookmarks = this.data.bookmarks.map((bookmark) =>
      bookmark.folderId === id ? { ...bookmark, folderId: DEFAULT_FOLDER_ID, updatedAt: now() } : bookmark,
    )
    this.save()
    return true
  }

  listHistory(keyword = '') {
    this.load()
    const kw = safeString(keyword).toLowerCase()
    const source = kw
      ? this.data.history.filter((item) =>
          item.title.toLowerCase().includes(kw) || item.url.toLowerCase().includes(kw),
        )
      : this.data.history
    return source.sort((a, b) => (b.lastVisitTime || 0) - (a.lastVisitTime || 0))
  }

  addHistory(payload = {}) {
    this.load()
    const url = safeString(payload.url)
    if (!/^https?:\/\//i.test(url)) return null
    const ts = now()
    const existing = this.data.history.find((entry) => entry.url === url)
    if (existing) {
      existing.visitCount = (existing.visitCount || 1) + 1
      existing.visitTime = ts
      existing.lastVisitTime = ts
      if (safeString(payload.title)) existing.title = safeString(payload.title)
      if (safeString(payload.favicon)) existing.favicon = safeString(payload.favicon)
      this.data.history = this.listHistory().slice(0, MAX_HISTORY_ENTRIES)
      this.save()
      return existing
    }
    const entry = this.normalizeHistory({
      url,
      title: payload.title,
      favicon: payload.favicon,
      visitTime: ts,
      lastVisitTime: ts,
      visitCount: 1,
    })
    this.data.history.unshift(entry)
    this.data.history = this.listHistory().slice(0, MAX_HISTORY_ENTRIES)
    this.save()
    return entry
  }

  updateHistory(id, patch = {}) {
    this.load()
    const item = this.data.history.find((entry) => entry.id === id)
    if (!item) return null
    Object.assign(item, this.normalizeHistory({ ...item, ...patch, id: item.id }))
    this.data.history = this.listHistory()
    this.save()
    return item
  }

  updateHistoryByUrl(url, patch = {}) {
    this.load()
    const target = safeString(url)
    if (!target) return null
    const item = this.data.history.find((entry) => entry.url === target)
    if (!item) return null
    const title = safeString(patch.title)
    const favicon = safeString(patch.favicon)
    if (title) item.title = title
    if (favicon) item.favicon = favicon
    this.save()
    return item
  }

  removeHistory(id) {
    this.load()
    const before = this.data.history.length
    this.data.history = this.data.history.filter((entry) => entry.id !== id)
    const removed = this.data.history.length !== before
    if (removed) this.save()
    return removed
  }

  clearHistory() {
    this.load()
    this.data.history = []
    this.save()
    return true
  }

  clearHistoryRange(from, to) {
    this.load()
    const fromTs = from ? new Date(from).getTime() : 0
    const toTs = to ? new Date(to).getTime() : now()
    this.data.history = this.data.history.filter((entry) => {
      const t = entry.lastVisitTime || entry.visitTime || 0
      return t < fromTs || t > toTs
    })
    this.save()
    return true
  }
}

module.exports = { DataStore }
