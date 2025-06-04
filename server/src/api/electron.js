// Electron API 桥接
export function launchBrowser(browserId) {
  if (window.electronAPI) {
    return window.electronAPI.launchBrowser(browserId)
  }
  return Promise.reject(new Error('Electron API not available'))
}

export function closeBrowser(browserId) {
  if (window.electronAPI) {
    return window.electronAPI.closeBrowser(browserId)
  }
  return Promise.reject(new Error('Electron API not available'))
}

export function getBrowserInstances() {
  if (window.electronAPI) {
    return window.electronAPI.getBrowserInstances()
  }
  return Promise.resolve([])
}
export async function getChromeDebugPort(accountId) {
  if (window.electronAPI) {
    return window.electronAPI.getChromeDebugPort(accountId)
  }
  return Promise.reject(new Error('Electron API not available'))
}
