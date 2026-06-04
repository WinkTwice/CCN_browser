const { EventEmitter } = require('node:events')
const { app, shell } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

/**
 * DownloadManager - 拦截 session 的 will-download 事件并管理下载生命周期
 */
class DownloadManager extends EventEmitter {
  constructor(window) {
    super()
    this.window = window
    /** @type {Map<string, DownloadRecord>} */
    this.downloads = new Map()
    this._bound = false
  }

  bind() {
    if (this._bound) return
    this._bound = true
    const ses = this.window.webContents.session
    ses.on('will-download', (event, item, webContents) => {
      this._handle(event, item, webContents)
    })
  }

  _handle(event, item, webContents) {
    // 默认保存到系统下载目录
    const defaultDir = app.getPath('downloads')
    let filename = item.getFilename() || this._filenameFromURL(item.getURL())
    let savePath = path.join(defaultDir, filename)

    // 重名自动加 (n)
    if (fs.existsSync(savePath)) {
      const ext = path.extname(filename)
      const base = filename.slice(0, filename.length - ext.length)
      let i = 1
      while (fs.existsSync(savePath)) {
        savePath = path.join(defaultDir, `${base} (${i})${ext}`)
        i++
      }
      filename = path.basename(savePath)
    }

    try {
      item.setSavePath(savePath)
    } catch (err) {
      console.warn('[DownloadManager] setSavePath failed:', err)
    }

    const id = 'dl_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8)
    const record = {
      id,
      url: item.getURL(),
      filename,
      savePath,
      mimeType: item.getMimeType(),
      totalBytes: item.getTotalBytes() || 0,
      receivedBytes: 0,
      speed: 0,
      status: 'downloading',
      error: '',
      startedAt: Date.now(),
      updatedAt: Date.now(),
      completedAt: 0,
      _item: item,
      _lastSpeedCheck: Date.now(),
      _lastReceived: 0,
    }
    this.downloads.set(id, record)
    this.emit('download-created', this._serialize(record))

    let lastEmit = 0
    item.on('updated', () => {
      record.receivedBytes = item.getReceivedBytes()
      record.totalBytes = item.getTotalBytes() || record.totalBytes
      record.updatedAt = Date.now()
      if (item.getState() === 'progressing') {
        record.status = 'downloading'
        const now = Date.now()
        if (now - lastEmit > 300) {
          const elapsed = Math.max(0.1, (now - record._lastSpeedCheck) / 1000)
          const delta = record.receivedBytes - record._lastReceived
          record.speed = delta > 0 ? Math.round(delta / elapsed) : 0
          record._lastReceived = record.receivedBytes
          record._lastSpeedCheck = now
          lastEmit = now
          this.emit('download-updated', this._serialize(record))
        }
      }
    })

    item.on('done', (_event, state) => {
      record.completedAt = Date.now()
      record.updatedAt = record.completedAt
      record.speed = 0
      if (state === 'completed') {
        record.status = 'completed'
        record.receivedBytes = record.totalBytes || record.receivedBytes
        this.emit('download-updated', this._serialize(record))
        this.emit('download-done', this._serialize(record))
      } else if (state === 'cancelled') {
        record.status = 'cancelled'
        this.emit('download-updated', this._serialize(record))
      } else {
        record.status = 'failed'
        record.error = String(state || 'unknown')
        this.emit('download-error', { id, error: record.error })
        this.emit('download-updated', this._serialize(record))
      }
    })
  }

  _filenameFromURL(url) {
    try {
      const u = new URL(url)
      const last = u.pathname.split('/').filter(Boolean).pop() || 'download'
      return decodeURIComponent(last)
    } catch {
      return 'download'
    }
  }

  _serialize(d) {
    if (!d) return null
    const { _item, _lastSpeedCheck, _lastReceived, ...rest } = d
    return rest
  }

  // ---------- 对外 API ----------
  list() {
    return Array.from(this.downloads.values()).map((d) => this._serialize(d))
  }

  pause(id) {
    const d = this.downloads.get(id)
    if (!d?._item) return false
    try { d._item.pause() } catch {}
    d.status = 'paused'
    d.speed = 0
    d.updatedAt = Date.now()
    this.emit('download-updated', this._serialize(d))
    return true
  }

  resume(id) {
    const d = this.downloads.get(id)
    if (!d?._item) return false
    try { d._item.resume() } catch {}
    d.status = 'downloading'
    d._lastSpeedCheck = Date.now()
    d._lastReceived = d.receivedBytes
    d.updatedAt = Date.now()
    this.emit('download-updated', this._serialize(d))
    return true
  }

  cancel(id) {
    const d = this.downloads.get(id)
    if (!d?._item) return false
    try { d._item.cancel() } catch {}
    return true
  }

  remove(id) {
    const d = this.downloads.get(id)
    if (!d) return false
    if (d._item && d.status === 'downloading') {
      try { d._item.cancel() } catch {}
    }
    this.downloads.delete(id)
    this.emit('download-removed', { id })
    return true
  }

  retry(id) {
    const d = this.downloads.get(id)
    if (!d?.url) return false
    // 用系统浏览器重开（避免重复拦截）
    shell.openExternal(d.url)
    return true
  }

  async openFile(id) {
    const d = this.downloads.get(id)
    if (!d?.savePath) return false
    const err = await shell.openPath(d.savePath)
    return !err
  }

  openFolder(id) {
    const d = this.downloads.get(id)
    if (!d?.savePath) return false
    shell.showItemInFolder(d.savePath)
    return true
  }

  clearCompleted() {
    const toRemove = []
    for (const [id, d] of this.downloads.entries()) {
      if (['completed', 'cancelled', 'failed'].includes(d.status)) {
        toRemove.push(id)
      }
    }
    for (const id of toRemove) {
      this.downloads.delete(id)
      this.emit('download-removed', { id })
    }
    return toRemove.length
  }
}

module.exports = { DownloadManager }
