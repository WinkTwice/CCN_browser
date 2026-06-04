const fs = require('node:fs')
const path = require('node:path')
const { app, session } = require('electron')

const DEFAULT_SETTINGS = {
  mode: 'system',
  proxyRules: '',
  proxyBypassRules: '<local>',
}

class NetworkManager {
  constructor() {
    this.filePath = ''
    this.settings = { ...DEFAULT_SETTINGS }
    this.loaded = false
  }

  load() {
    if (this.loaded) return
    this.loaded = true
    this.filePath = path.join(app.getPath('userData'), 'network-settings.json')
    try {
      if (fs.existsSync(this.filePath)) {
        const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8'))
        this.settings = this.normalize(parsed)
      }
    } catch (err) {
      console.warn('[NetworkManager] load failed:', err)
      this.settings = { ...DEFAULT_SETTINGS }
    }
  }

  save() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true })
    fs.writeFileSync(this.filePath, JSON.stringify(this.settings, null, 2), 'utf8')
  }

  normalize(input = {}) {
    const allowedModes = new Set(['system', 'direct', 'manual'])
    const mode = allowedModes.has(input.mode) ? input.mode : DEFAULT_SETTINGS.mode
    return {
      mode,
      proxyRules: typeof input.proxyRules === 'string' ? input.proxyRules.trim() : '',
      proxyBypassRules: typeof input.proxyBypassRules === 'string'
        ? input.proxyBypassRules.trim()
        : DEFAULT_SETTINGS.proxyBypassRules,
    }
  }

  async apply(settings = this.settings) {
    this.load()
    this.settings = this.normalize(settings)
    const config = this.toElectronProxyConfig(this.settings)
    await session.defaultSession.setProxy(config)
    if (typeof session.defaultSession.forceReloadProxyConfig === 'function') {
      await session.defaultSession.forceReloadProxyConfig()
    }
    this.save()
    return this.getSettings()
  }

  toElectronProxyConfig(settings) {
    if (settings.mode === 'direct') {
      return { mode: 'direct' }
    }
    if (settings.mode === 'manual' && settings.proxyRules) {
      return {
        mode: 'fixed_servers',
        proxyRules: settings.proxyRules,
        proxyBypassRules: settings.proxyBypassRules || DEFAULT_SETTINGS.proxyBypassRules,
      }
    }
    return { mode: 'system' }
  }

  getSettings() {
    this.load()
    return { ...this.settings }
  }

  async resolve(url = 'https://www.google.com') {
    this.load()
    try {
      return await session.defaultSession.resolveProxy(url)
    } catch (err) {
      return String(err?.message || err)
    }
  }
}

module.exports = { NetworkManager }
