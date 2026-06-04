const { app, BrowserWindow, ipcMain, shell, Menu, session } = require('electron')
const path = require('node:path')
const { TabManager } = require('./tabManager')
const { DownloadManager } = require('./downloadManager')
const { DataStore } = require('./dataStore')
const { NetworkManager } = require('./networkManager')

const isDev = process.env.NODE_ENV === 'development'

/** @type {BrowserWindow|null} */
let mainWindow = null
/** @type {TabManager|null} */
let tabManager = null
/** @type {DownloadManager|null} */
let downloadManager = null
const dataStore = new DataStore()
const networkManager = new NetworkManager()

let chromeHeight = 104 // 由渲染端通过 IPC 同步
let contentLayout = { chromeHeight, left: 0, right: 0, hidden: false }
let homeUrl = 'about:blank'

function sendToAll(channel, payload) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }
}

function notifyBookmarksChanged() {
  sendToAll('ccn:bookmarks-changed', dataStore.listBookmarks())
}

function notifyHistoryChanged() {
  sendToAll('ccn:history-changed', dataStore.listHistory())
}

// 关闭硬件加速在某些机器上能避免渲染闪烁；如不需要可去掉
// app.disableHardwareAcceleration()

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 600,
    minHeight: 400,
    frame: false,
    backgroundColor: '#ffffff',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  mainWindow.once('ready-to-show', () => mainWindow.show())

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  // 拦截 window.open：用系统浏览器打开
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  // 阻止外链导航到主窗口（保留用户点击内部链接在当前 tab 打开）
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isDev && url.startsWith('http://localhost:5173')) return // 允许 HMR
    event.preventDefault()
    shell.openExternal(url)
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // 初始化管理器
  mainWindow.webContents.once('did-finish-load', () => {
    tabManager = new TabManager(mainWindow, () => contentLayout)
    downloadManager = new DownloadManager(mainWindow)
    downloadManager.bind()
    wireEvents()
    wireDownloads()
    // 推一次列表
    mainWindow.webContents.send('ccn:tab-reordered', { order: tabManager.list().map((t) => t.id) })
    // 打开初始 tab
    if (tabManager.list().length === 0) {
      tabManager.createTab({ url: 'about:blank' })
    }
  })

  // 窗口尺寸变化 → 重新布局 webview
  const onResize = () => tabManager?.relayout()
  mainWindow.on('resize', onResize)
  mainWindow.on('maximize', onResize)
  mainWindow.on('unmaximize', onResize)

  // 转发 TabManager / DownloadManager 事件给渲染端
  const wireEvents = () => {
    if (!tabManager || !mainWindow) return
    const wc = mainWindow.webContents
    const fwd = (channel) => (payload) => wc.send(channel, payload)
    tabManager.on('tab-created', fwd('ccn:tab-created'))
    tabManager.on('tab-updated', fwd('ccn:tab-updated'))
    tabManager.on('tab-closed', fwd('ccn:tab-closed'))
    tabManager.on('tab-activated', fwd('ccn:tab-activated'))
    tabManager.on('tab-reordered', fwd('ccn:tab-reordered'))
    tabManager.on('url-change', fwd('ccn:nav-url-change'))
    tabManager.on('title-change', fwd('ccn:nav-title-change'))
    tabManager.on('favicon-change', fwd('ccn:nav-favicon-change'))
    tabManager.on('nav-state', fwd('ccn:nav-state'))
    tabManager.on('loading-change', fwd('ccn:nav-loading'))
    tabManager.on('audio-change', fwd('ccn:nav-audio'))
    tabManager.on('url-change', ({ tabId, url }) => {
      const tab = tabManager.list().find((item) => item.id === tabId)
      const entry = dataStore.addHistory({
        url,
        title: tab?.title || url,
        favicon: tab?.favicon || '',
      })
      if (entry) notifyHistoryChanged()
    })
    tabManager.on('title-change', ({ tabId, title }) => {
      const tab = tabManager.list().find((item) => item.id === tabId)
      const entry = dataStore.updateHistoryByUrl(tab?.url, { title, favicon: tab?.favicon || '' })
      if (entry) notifyHistoryChanged()
    })
    tabManager.on('favicon-change', ({ tabId, url }) => {
      const tab = tabManager.list().find((item) => item.id === tabId)
      const entry = dataStore.updateHistoryByUrl(tab?.url, { favicon: url })
      if (entry) notifyHistoryChanged()
    })
  }
  // 等待 tabManager 创建后再接线
  // 同样的，downloadManager 在 did-finish-load 后创建
  const wireDownloads = () => {
    if (!downloadManager || !mainWindow) return
    const wc = mainWindow.webContents
    const fwd = (channel) => (payload) => wc.send(channel, payload)
    downloadManager.on('download-created', fwd('ccn:dl-created'))
    downloadManager.on('download-updated', fwd('ccn:dl-updated'))
    downloadManager.on('download-done', fwd('ccn:dl-done'))
    downloadManager.on('download-error', fwd('ccn:dl-error'))
    downloadManager.on('download-removed', fwd('ccn:dl-removed'))
  }
}

// ---------- IPC: 窗口控制 ----------
ipcMain.on('ccn:window-min', (e) => BrowserWindow.fromWebContents(e.sender)?.minimize())
ipcMain.on('ccn:window-max', (e) => {
  const w = BrowserWindow.fromWebContents(e.sender)
  if (w?.isMaximized()) w.unmaximize()
  else w?.maximize()
})
ipcMain.on('ccn:window-close', (e) => BrowserWindow.fromWebContents(e.sender)?.close())
ipcMain.handle('ccn:is-mac', () => process.platform === 'darwin')

ipcMain.on('ccn:set-chrome-height', (_e, height) => {
  const h = Math.max(0, Number(height) || 0)
  if (h && h !== chromeHeight) {
    chromeHeight = h
    contentLayout = { ...contentLayout, chromeHeight }
    tabManager?.relayout()
  } else {
    chromeHeight = h || chromeHeight
    contentLayout = { ...contentLayout, chromeHeight }
  }
})

ipcMain.on('ccn:set-content-layout', (_e, layout = {}) => {
  const nextChromeHeight = Math.max(0, Number(layout.chromeHeight) || chromeHeight)
  chromeHeight = nextChromeHeight
  contentLayout = {
    chromeHeight: nextChromeHeight,
    left: Math.max(0, Number(layout.left) || 0),
    right: Math.max(0, Number(layout.right) || 0),
    hidden: Boolean(layout.hidden),
  }
  tabManager?.relayout()
})

ipcMain.handle('ccn:window-new', async () => {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    frame: false,
    backgroundColor: '#ffffff',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })
  win.once('ready-to-show', () => win.show())
  if (isDev) win.loadURL('http://localhost:5173')
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  const tm = new TabManager(win, () => 104)
  const dm = new DownloadManager(win)
  dm.bind()

  win.webContents.once('did-finish-load', () => {
    tm.createTab({ url: 'about:blank' })
    const wc = win.webContents
    const fwd = (channel) => (payload) => wc.send(channel, payload)
    tm.on('tab-created', fwd('ccn:tab-created'))
    tm.on('tab-updated', fwd('ccn:tab-updated'))
    tm.on('tab-closed', fwd('ccn:tab-closed'))
    tm.on('tab-activated', fwd('ccn:tab-activated'))
    tm.on('tab-reordered', fwd('ccn:tab-reordered'))
    tm.on('url-change', fwd('ccn:nav-url-change'))
    tm.on('title-change', fwd('ccn:nav-title-change'))
    tm.on('favicon-change', fwd('ccn:nav-favicon-change'))
    tm.on('nav-state', fwd('ccn:nav-state'))
    tm.on('loading-change', fwd('ccn:nav-loading'))
    tm.on('audio-change', fwd('ccn:nav-audio'))
    tm.on('url-change', ({ tabId, url }) => {
      const tab = tm.list().find((item) => item.id === tabId)
      const entry = dataStore.addHistory({
        url,
        title: tab?.title || url,
        favicon: tab?.favicon || '',
      })
      if (entry) notifyHistoryChanged()
    })
    tm.on('title-change', ({ tabId, title }) => {
      const tab = tm.list().find((item) => item.id === tabId)
      const entry = dataStore.updateHistoryByUrl(tab?.url, { title, favicon: tab?.favicon || '' })
      if (entry) notifyHistoryChanged()
    })
    tm.on('favicon-change', ({ tabId, url }) => {
      const tab = tm.list().find((item) => item.id === tabId)
      const entry = dataStore.updateHistoryByUrl(tab?.url, { favicon: url })
      if (entry) notifyHistoryChanged()
    })
    dm.on('download-created', fwd('ccn:dl-created'))
    dm.on('download-updated', fwd('ccn:dl-updated'))
    dm.on('download-done', fwd('ccn:dl-done'))
    dm.on('download-error', fwd('ccn:dl-error'))
    dm.on('download-removed', fwd('ccn:dl-removed'))
  })
  return true
})

// ---------- IPC: Tabs ----------
ipcMain.handle('ccn:tab-list', () => tabManager?.list() || [])
ipcMain.handle('ccn:tab-create', (_e, payload) => tabManager?.createTab(payload || {}) || null)
ipcMain.handle('ccn:tab-close', (_e, id) => tabManager?.closeTab(id) || false)
ipcMain.handle('ccn:tab-activate', (_e, id) => tabManager?.setActive(id) || false)
ipcMain.handle('ccn:tab-reorder', (_e, ids) => {
  tabManager?.reorder(ids)
  return true
})
ipcMain.handle('ccn:tab-update', (_e, id, patch) => tabManager?.updateTab(id, patch) || null)
ipcMain.handle('ccn:tab-get-active', () => tabManager?.getActive() || null)

// ---------- IPC: 导航 ----------
ipcMain.handle('ccn:nav-back', (_e, tabId) => { tabManager?.back(tabId); return true })
ipcMain.handle('ccn:nav-forward', (_e, tabId) => { tabManager?.forward(tabId); return true })
ipcMain.handle('ccn:nav-reload', (_e, tabId) => { tabManager?.reload(tabId); return true })
ipcMain.handle('ccn:nav-stop', (_e, tabId) => { tabManager?.stop(tabId); return true })
ipcMain.handle('ccn:nav-navigate', (_e, tabId, url) => tabManager?.navigate(tabId, url) || false)
ipcMain.handle('ccn:nav-toggle-mute', (_e, tabId) => { tabManager?.toggleMute(tabId); return true })
ipcMain.handle('ccn:nav-set-home', (_e, url) => {
  if (typeof url === 'string' && url) {
    homeUrl = url
    mainWindow?.webContents.send('ccn:nav-home', url)
  }
  return homeUrl
})

// ---------- IPC: Downloads ----------
ipcMain.handle('ccn:dl-list', () => downloadManager?.list() || [])
ipcMain.handle('ccn:dl-pause', (_e, id) => downloadManager?.pause(id) || false)
ipcMain.handle('ccn:dl-resume', (_e, id) => downloadManager?.resume(id) || false)
ipcMain.handle('ccn:dl-cancel', (_e, id) => downloadManager?.cancel(id) || false)
ipcMain.handle('ccn:dl-remove', (_e, id) => downloadManager?.remove(id) || false)
ipcMain.handle('ccn:dl-retry', (_e, id) => downloadManager?.retry(id) || false)
ipcMain.handle('ccn:dl-open-file', async (_e, id) => (downloadManager ? await downloadManager.openFile(id) : false))
ipcMain.handle('ccn:dl-open-folder', (_e, id) => downloadManager?.openFolder(id) || false)
ipcMain.handle('ccn:dl-clear-completed', () => downloadManager?.clearCompleted() || 0)
ipcMain.handle('ccn:dl-create', async (_e, payload) => {
  // 主动触发下载：用主进程 session 的 downloadURL
  if (!downloadManager || !payload?.url) return null
  const ses = session.defaultSession
  // 临时拦截：使用 request 模块拉 URL（Electron 18+ 内置 net）
  // 这里采用更简单的方式：让系统浏览器处理
  await shell.openExternal(payload.url)
  return null
})

// ---------- IPC: Bookmarks ----------
ipcMain.handle('ccn:bookmarks-list', (_e, keyword) => dataStore.listBookmarks(keyword))
ipcMain.handle('ccn:bookmarks-add', (_e, payload) => {
  const item = dataStore.addBookmark(payload)
  notifyBookmarksChanged()
  return item
})
ipcMain.handle('ccn:bookmarks-update', (_e, id, patch) => {
  const item = dataStore.updateBookmark(id, patch)
  notifyBookmarksChanged()
  return item
})
ipcMain.handle('ccn:bookmarks-remove', (_e, id) => {
  const removed = dataStore.removeBookmark(id)
  if (removed) notifyBookmarksChanged()
  return removed
})
ipcMain.handle('ccn:bookmarks-folder-add', (_e, name) => {
  const folder = dataStore.addFolder(name)
  notifyBookmarksChanged()
  return folder
})
ipcMain.handle('ccn:bookmarks-folder-remove', (_e, id) => {
  const removed = dataStore.removeFolder(id)
  if (removed) notifyBookmarksChanged()
  return removed
})

// ---------- IPC: History ----------
ipcMain.handle('ccn:history-list', (_e, keyword) => dataStore.listHistory(keyword))
ipcMain.handle('ccn:history-add', (_e, payload) => {
  const entry = dataStore.addHistory(payload)
  if (entry) notifyHistoryChanged()
  return entry
})
ipcMain.handle('ccn:history-update', (_e, id, patch) => {
  const entry = dataStore.updateHistory(id, patch)
  if (entry) notifyHistoryChanged()
  return entry
})
ipcMain.handle('ccn:history-remove', (_e, id) => {
  const removed = dataStore.removeHistory(id)
  if (removed) notifyHistoryChanged()
  return removed
})
ipcMain.handle('ccn:history-clear', () => {
  dataStore.clearHistory()
  notifyHistoryChanged()
  return true
})
ipcMain.handle('ccn:history-clear-range', (_e, from, to) => {
  dataStore.clearHistoryRange(from, to)
  notifyHistoryChanged()
  return true
})

// ---------- App 生命周期 ----------
ipcMain.handle('ccn:network-get-proxy', () => networkManager.getSettings())
ipcMain.handle('ccn:network-set-proxy', async (_e, settings) => {
  const result = await networkManager.apply(settings)
  tabManager?.reload()
  return result
})
ipcMain.handle('ccn:network-resolve-proxy', (_e, url) => networkManager.resolve(url))

app.whenReady().then(async () => {
  dataStore.load()
  networkManager.load()
  await networkManager.apply(networkManager.getSettings())
  Menu.setApplicationMenu(null)
  // 单实例：避免重复打开
  const gotLock = app.requestSingleInstanceLock()
  if (!gotLock) {
    app.quit()
  } else {
    createWindow()
    app.on('second-instance', () => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore()
        mainWindow.focus()
      }
    })
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
