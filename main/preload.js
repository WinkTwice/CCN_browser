const { contextBridge, ipcRenderer } = require('electron')

// 事件订阅：返回 unsubscribe 函数
function makeSubscriber(channel) {
  return (cb) => {
    const handler = (_event, ...args) => {
      try { cb(...args) } catch (err) { console.error('[preload]', channel, err) }
    }
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.off(channel, handler)
  }
}

// ---------- 窗口控制 ----------
contextBridge.exposeInMainWorld('ccnWindowControl', {
  minimize: () => ipcRenderer.send('ccn:window-min'),
  toggleMax: () => ipcRenderer.send('ccn:window-max'),
  close: () => ipcRenderer.send('ccn:window-close'),
  isMaximized: () => false,
  isMac: process.platform === 'darwin',
})

// 渲染端向主进程同步 chrome（标题栏+工具栏+标签栏）高度
contextBridge.exposeInMainWorld('ccnChrome', {
  setHeight: (px) => ipcRenderer.send('ccn:set-chrome-height', px),
  setLayout: (layout) => ipcRenderer.send('ccn:set-content-layout', layout),
})

// ---------- 标签 ----------
contextBridge.exposeInMainWorld('ccnTabs', {
  list: () => ipcRenderer.invoke('ccn:tab-list'),
  create: (payload) => ipcRenderer.invoke('ccn:tab-create', payload),
  close: (id) => ipcRenderer.invoke('ccn:tab-close', id),
  activate: (id) => ipcRenderer.invoke('ccn:tab-activate', id),
  reorder: (ids) => ipcRenderer.invoke('ccn:tab-reorder', ids),
  update: (id, patch) => ipcRenderer.invoke('ccn:tab-update', id, patch),
  getActive: () => ipcRenderer.invoke('ccn:tab-get-active'),

  onCreated: makeSubscriber('ccn:tab-created'),
  onUpdated: makeSubscriber('ccn:tab-updated'),
  onClosed: makeSubscriber('ccn:tab-closed'),
  onActivated: makeSubscriber('ccn:tab-activated'),
  onReordered: makeSubscriber('ccn:tab-reordered'),
  onLoadingChange: makeSubscriber('ccn:nav-loading'),
  onAudioChange: makeSubscriber('ccn:nav-audio'),
  onUrlChange: makeSubscriber('ccn:nav-url-change'),
  onTitleChange: makeSubscriber('ccn:nav-title-change'),
  onFaviconChange: makeSubscriber('ccn:nav-favicon-change'),
})

// ---------- 导航 ----------
contextBridge.exposeInMainWorld('ccnNavigation', {
  back: (tabId) => ipcRenderer.invoke('ccn:nav-back', tabId),
  forward: (tabId) => ipcRenderer.invoke('ccn:nav-forward', tabId),
  reload: (tabId) => ipcRenderer.invoke('ccn:nav-reload', tabId),
  stop: (tabId) => ipcRenderer.invoke('ccn:nav-stop', tabId),
  navigate: (tabId, url) => ipcRenderer.invoke('ccn:nav-navigate', tabId, url),
  toggleMute: (tabId) => ipcRenderer.invoke('ccn:nav-toggle-mute', tabId),
  setHome: (url) => ipcRenderer.invoke('ccn:nav-set-home', url),

  onUrlChange: makeSubscriber('ccn:nav-url-change'),
  onTitleChange: makeSubscriber('ccn:nav-title-change'),
  onFaviconChange: makeSubscriber('ccn:nav-favicon-change'),
  onNavState: makeSubscriber('ccn:nav-state'),
  onLoadingChange: makeSubscriber('ccn:nav-loading'),
  onAudioChange: makeSubscriber('ccn:nav-audio'),
  onHomeChange: makeSubscriber('ccn:nav-home'),
})

// ---------- 下载 ----------
contextBridge.exposeInMainWorld('ccnDownloads', {
  list: () => ipcRenderer.invoke('ccn:dl-list'),
  create: (payload) => ipcRenderer.invoke('ccn:dl-create', payload),
  pause: (id) => ipcRenderer.invoke('ccn:dl-pause', id),
  resume: (id) => ipcRenderer.invoke('ccn:dl-resume', id),
  cancel: (id) => ipcRenderer.invoke('ccn:dl-cancel', id),
  remove: (id) => ipcRenderer.invoke('ccn:dl-remove', id),
  retry: (id) => ipcRenderer.invoke('ccn:dl-retry', id),
  openFile: (id) => ipcRenderer.invoke('ccn:dl-open-file', id),
  openFolder: (id) => ipcRenderer.invoke('ccn:dl-open-folder', id),
  clearCompleted: () => ipcRenderer.invoke('ccn:dl-clear-completed'),

  onCreated: makeSubscriber('ccn:dl-created'),
  onUpdated: makeSubscriber('ccn:dl-updated'),
  onDone: makeSubscriber('ccn:dl-done'),
  onError: makeSubscriber('ccn:dl-error'),
  onRemoved: makeSubscriber('ccn:dl-removed'),
})

// ---------- 多窗口 ----------
// ---------- 书签 ----------
contextBridge.exposeInMainWorld('ccnBookmarks', {
  list: (keyword) => ipcRenderer.invoke('ccn:bookmarks-list', keyword),
  add: (payload) => ipcRenderer.invoke('ccn:bookmarks-add', payload),
  update: (id, patch) => ipcRenderer.invoke('ccn:bookmarks-update', id, patch),
  remove: (id) => ipcRenderer.invoke('ccn:bookmarks-remove', id),
  addFolder: (name) => ipcRenderer.invoke('ccn:bookmarks-folder-add', name),
  removeFolder: (id) => ipcRenderer.invoke('ccn:bookmarks-folder-remove', id),

  onChanged: makeSubscriber('ccn:bookmarks-changed'),
})

// ---------- 历史记录 ----------
contextBridge.exposeInMainWorld('ccnHistory', {
  list: (keyword) => ipcRenderer.invoke('ccn:history-list', keyword),
  add: (payload) => ipcRenderer.invoke('ccn:history-add', payload),
  update: (id, patch) => ipcRenderer.invoke('ccn:history-update', id, patch),
  remove: (id) => ipcRenderer.invoke('ccn:history-remove', id),
  clear: () => ipcRenderer.invoke('ccn:history-clear'),
  clearRange: (from, to) => ipcRenderer.invoke('ccn:history-clear-range', from, to),

  onChanged: makeSubscriber('ccn:history-changed'),
})

// ---------- 网络 ----------
contextBridge.exposeInMainWorld('ccnNetwork', {
  getProxy: () => ipcRenderer.invoke('ccn:network-get-proxy'),
  setProxy: (settings) => ipcRenderer.invoke('ccn:network-set-proxy', settings),
  resolveProxy: (url) => ipcRenderer.invoke('ccn:network-resolve-proxy', url),
})

contextBridge.exposeInMainWorld('ccnWindow', {
  newWindow: () => ipcRenderer.invoke('ccn:window-new'),
})
