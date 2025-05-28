// Vue 端的 Electron API 桥接模块
// 放置在 server/src/utils/electron-bridge.js

class ElectronBridge {
  constructor() {
    this.isElectron = this.checkElectron()
  }

  checkElectron() {
    return typeof window !== 'undefined' && window.electronAPI
  }

  // 账号管理
  async createAccount(account) {
    if (!this.isElectron) {
      console.warn('Electron API not available, using mock data')
      return { success: true, account: { ...account, id: Date.now().toString() } }
    }
    return window.electronAPI.createAccount(account)
  }

  async getAccounts() {
    if (!this.isElectron) {
      return { success: true, accounts: [] }
    }
    return window.electronAPI.getAccounts()
  }

  async deleteAccount(accountId) {
    if (!this.isElectron) {
      return { success: true }
    }
    return window.electronAPI.deleteAccount(accountId)
  }

  // 浏览器实例管理
  async launchBrowser(accountId) {
    if (!this.isElectron) {
      console.warn('Cannot launch browser without Electron')
      return { success: false, error: 'Electron required' }
    }
    return window.electronAPI.launchBrowser(accountId)
  }

  async closeBrowser(accountId) {
    if (!this.isElectron) {
      return { success: true }
    }
    return window.electronAPI.closeBrowser(accountId)
  }

  async getBrowserInstances() {
    if (!this.isElectron) {
      return { success: true, instances: [] }
    }
    return window.electronAPI.getBrowserInstances()
  }

  // 指纹管理
  async generateFingerprint(seed) {
    if (!this.isElectron) {
      // 返回模拟数据
      return {
        success: true,
        config: {
          canvas: { noise: 0.1, enabled: true },
          webgl: { vendor: 'Mock Vendor', renderer: 'Mock Renderer', enabled: true },
          navigator: { platform: 'Win32', language: 'en-US', languages: ['en-US', 'en'] },
          screen: { width: 1920, height: 1080, pixelRatio: 1 }
        }
      }
    }
    return window.electronAPI.generateFingerprint(seed)
  }

  async getFingerprintConfig(accountId) {
    if (!this.isElectron) {
      return { success: false, error: 'Electron required' }
    }
    return window.electronAPI.getFingerprintConfig(accountId)
  }
}

export default new ElectronBridge()
