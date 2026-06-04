import { createApp } from 'vue'
import App from './App.vue'

const app = createApp(App)

// 全局错误处理
app.config.errorHandler = (err, instance, info) => {
  console.error('[Vue error]', err, info)
}

// 主进程注入的窗口控制 API（preload 暴露到 window.ccnWindowControl）
// App.vue 里通过 inject('windowControl') 拿到，然后直接调用
const windowControl = (typeof window !== 'undefined' && window.ccnWindowControl) || null
app.provide('windowControl', {
  minimize: () => windowControl?.minimize?.(),
  toggleMax: () => windowControl?.toggleMax?.(),
  close: () => windowControl?.close?.(),
  isMaximized: () => windowControl?.isMaximized?.() ?? false,
  isMac: windowControl?.isMac ?? /Mac|Darwin/i.test(navigator.userAgent || ''),
})

// 调试工具：把 composables 挂到 window，方便 DevTools 调试
if (import.meta.env?.DEV) {
  Promise.all([
    import('./composables/useTabs.js'),
    import('./composables/useNavigation.js'),
    import('./composables/useBookmarks.js'),
    import('./composables/useHistory.js'),
    import('./composables/useDownloads.js'),
  ]).then(([tabs, nav, bm, hist, dl]) => {
    window.__ccn__ = {
      useTabs: tabs.useTabs,
      useNavigation: nav.useNavigation,
      useBookmarks: bm.useBookmarks,
      useHistory: hist.useHistory,
      useDownloads: dl.useDownloads,
    }
    console.info('[CCN] devtools ready: window.__ccn__')
  })
}

app.mount('#app')
