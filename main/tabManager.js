const { WebContentsView } = require('electron')
const { EventEmitter } = require('node:events')

function getBrowserLikeUserAgent(webContents) {
  return webContents.getUserAgent().replace(/\sElectron\/[^\s]+/i, '')
}

/**
 * TabManager - 每个 tab 对应一个 WebContentsView，叠加在主窗口 chrome 之下
 * 事件约定：所有 payload 形如 { tabId, ... } 或 { id, ... }，由调用方协商
 */
class TabManager extends EventEmitter {
  constructor(window, getContentLayout) {
    super()
    this.window = window
    this.getContentLayout = getContentLayout
    /** @type {Map<string, { id, url, title, favicon, loading, audible, muted, canGoBack, canGoForward, view }>} */
    this.tabs = new Map()
    /** @type {string|null} */
    this.activeId = null
  }

  // ---------- 布局 ----------
  relayout() {
    if (!this.window || this.window.isDestroyed()) return
    const [width, height] = this.window.getSize()
    const layout = this.getContentLayout?.() || {}
    const chromeH = Math.max(0, Number(layout.chromeHeight) || 0)
    const left = Math.max(0, Number(layout.left) || 0)
    const right = Math.max(0, Number(layout.right) || 0)
    const hidden = Boolean(layout.hidden)
    const bounds = {
      x: hidden ? 0 : left,
      y: chromeH,
      width: hidden ? 0 : Math.max(0, width - left - right),
      height: hidden ? 0 : Math.max(0, height - chromeH),
    }
    for (const [id, tab] of this.tabs.entries()) {
      if (!tab.view.isDestroyed?.()) {
        try { tab.view.setBounds(bounds) } catch {}
        try { tab.view.setVisible(!hidden && id === this.activeId) } catch {}
      }
    }
  }

  // ---------- 序列化 ----------
  serialize(tab) {
    if (!tab) return null
    return {
      id: tab.id,
      url: tab.url,
      title: tab.title,
      favicon: tab.favicon,
      loading: tab.loading,
      audible: tab.audible,
      muted: tab.muted,
      canGoBack: tab.canGoBack,
      canGoForward: tab.canGoForward,
      pinned: tab.pinned || false,
    }
  }

  // ---------- 创建 / 关闭 ----------
  createTab(payload = {}) {
    const id = 'tab_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8)
    const url = payload.url || 'about:blank'

    const view = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        javascript: true,
        webSecurity: true,
      },
    })

    this.window.contentView.addChildView(view)

    const tab = {
      id,
      url: '',
      title: '',
      favicon: '',
      loading: false,
      audible: false,
      muted: false,
      canGoBack: false,
      canGoForward: false,
      pinned: Boolean(payload.pinned),
      view,
    }
    this.tabs.set(id, tab)
    this._bind(tab)
    view.webContents.setUserAgent(getBrowserLikeUserAgent(view.webContents))

    // 设置初始 bounds（先放在 0,0,0,0 看不见，等 layout）
    view.setBounds({ x: 0, y: 0, width: 0, height: 0 })

    if (url && url !== 'about:blank') {
      view.webContents.loadURL(url)
    } else {
      tab.url = 'about:blank'
      tab.title = '新标签'
    }

    this.setActive(id)
    this.relayout()
    this.emit('tab-created', this.serialize(tab))
    return this.serialize(tab)
  }

  closeTab(id) {
    const tab = this.tabs.get(id)
    if (!tab) return false
    if (!tab.view.isDestroyed?.()) {
      try { this.window.contentView.removeChildView(tab.view) } catch {}
      try { tab.view.webContents.close() } catch {}
    }
    this.tabs.delete(id)
    this.emit('tab-closed', { id })

    if (this.activeId === id) {
      this.activeId = null
      const remaining = Array.from(this.tabs.keys())
      if (remaining.length > 0) {
        this.setActive(remaining[remaining.length - 1])
      } else {
        // 至少保留一个标签
        this.createTab({ url: 'about:blank' })
      }
    }
    return true
  }

  // ---------- 切换 ----------
  setActive(id) {
    if (!this.tabs.has(id)) return false
    for (const [tid, t] of this.tabs.entries()) {
      if (t.view.isDestroyed?.()) continue
      const layout = this.getContentLayout?.() || {}
      try { t.view.setVisible(!layout.hidden && tid === id) } catch {}
    }
    const tab = this.tabs.get(id)
    this.activeId = id
    this.emit('tab-activated', { id })
    // 切换时同步推送当前 tab 的状态给渲染端
    this._emitNavState(tab)
    return true
  }

  // ---------- 导航 ----------
  navigate(id, url) {
    const tab = this.tabs.get(id)
    if (!tab) return false
    if (!url) return false
    tab.view.webContents.loadURL(url)
    return true
  }

  back(id) {
    const tab = this.tabs.get(id || this.activeId)
    if (tab && tab.view.webContents.canGoBack()) tab.view.webContents.goBack()
  }

  forward(id) {
    const tab = this.tabs.get(id || this.activeId)
    if (tab && tab.view.webContents.canGoForward()) tab.view.webContents.goForward()
  }

  reload(id) {
    const tab = this.tabs.get(id || this.activeId)
    if (tab) tab.view.webContents.reload()
  }

  stop(id) {
    const tab = this.tabs.get(id || this.activeId)
    if (tab) tab.view.webContents.stop()
  }

  toggleMute(id) {
    const tab = this.tabs.get(id || this.activeId)
    if (!tab) return
    tab.muted = !tab.muted
    tab.view.webContents.setAudioMuted(tab.muted)
    this.emit('audio-change', { tabId: tab.id, isAudible: tab.audible, isMuted: tab.muted })
  }

  // ---------- 顺序 ----------
  reorder(ids) {
    if (!Array.isArray(ids)) return
    const newMap = new Map()
    for (const id of ids) {
      const tab = this.tabs.get(id)
      if (tab) newMap.set(id, tab)
    }
    // 兜底：补回未在 ids 中的
    for (const [id, tab] of this.tabs.entries()) {
      if (!newMap.has(id)) newMap.set(id, tab)
    }
    this.tabs = newMap
    this.emit('tab-reordered', { order: ids })
  }

  // ---------- 列表 ----------
  list() {
    return Array.from(this.tabs.values()).map((t) => this.serialize(t))
  }

  getActive() {
    return this.activeId ? this.serialize(this.tabs.get(this.activeId)) : null
  }

  updateTab(id, patch) {
    const tab = this.tabs.get(id)
    if (!tab) return null
    if (patch.pinned !== undefined) tab.pinned = Boolean(patch.pinned)
    if (patch.muted !== undefined) {
      tab.muted = Boolean(patch.muted)
      tab.view.webContents.setAudioMuted(tab.muted)
    }
    this.emit('tab-updated', this.serialize(tab))
    return this.serialize(tab)
  }

  // ---------- 内部：事件绑定 ----------
  _bind(tab) {
    const wc = tab.view.webContents
    wc.setWindowOpenHandler(({ url }) => {
      if (!url || url === 'about:blank') return { action: 'deny' }
      if (/^https?:\/\//i.test(url)) {
        this.createTab({ url })
        return { action: 'deny' }
      }
      return { action: 'deny' }
    })

    wc.on('will-redirect', (_e, url) => {
      if (url) {
        tab.url = url
        this._emitNavState(tab)
      }
    })

    wc.on('did-start-loading', () => {
      tab.loading = true
      this.emit('loading-change', { tabId: tab.id, isLoading: true })
    })
    wc.on('did-stop-loading', () => {
      tab.loading = false
      this.emit('loading-change', { tabId: tab.id, isLoading: false })
    })
    wc.on('did-fail-load', (_e, errorCode, errorDescription, validatedUrl) => {
      tab.loading = false
      if (validatedUrl) tab.url = validatedUrl
      this.emit('loading-change', { tabId: tab.id, isLoading: false })
      this.emit('tab-updated', { ...this.serialize(tab), error: errorDescription || String(errorCode) })
    })
    wc.on('did-navigate', (_e, url) => {
      tab.url = url
      this._emitNavState(tab)
    })
    wc.on('did-navigate-in-page', (_e, url) => {
      tab.url = url
      this._emitNavState(tab)
    })
    wc.on('did-finish-load', () => {
      tab.canGoBack = wc.canGoBack()
      tab.canGoForward = wc.canGoForward()
      this.emit('nav-state', {
        tabId: tab.id,
        canGoBack: tab.canGoBack,
        canGoForward: tab.canGoForward,
      })
    })
    wc.on('page-title-updated', (_e, title) => {
      tab.title = title
      this.emit('title-change', { tabId: tab.id, title })
    })
    wc.on('page-favicon-updated', (_e, favicons) => {
      tab.favicon = Array.isArray(favicons) ? favicons[0] : ''
      this.emit('favicon-change', { tabId: tab.id, url: tab.favicon })
    })
    wc.on('media-started-playing', () => {
      tab.audible = true
      this.emit('audio-change', { tabId: tab.id, isAudible: true, isMuted: tab.muted })
    })
    wc.on('media-paused', () => {
      tab.audible = false
      this.emit('audio-change', { tabId: tab.id, isAudible: false, isMuted: tab.muted })
    })
    wc.on('render-process-gone', (_e, details) => {
      this.emit('tab-updated', { ...this.serialize(tab), error: details.reason })
    })
  }

  _emitNavState(tab) {
    this.emit('url-change', { tabId: tab.id, url: tab.url })
    this.emit('title-change', { tabId: tab.id, title: tab.title })
    this.emit('favicon-change', { tabId: tab.id, url: tab.favicon })
  }
}

module.exports = { TabManager }
