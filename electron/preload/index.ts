import { contextBridge, ipcRenderer } from 'electron';

// 暴露 API 给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  launchBrowser: (browserId: string) => ipcRenderer.invoke('launch-browser', browserId),
  closeBrowser: (browserId: string) => ipcRenderer.invoke('close-browser', browserId),
  getBrowserInstances: () => ipcRenderer.invoke('get-browser-instances')
});

// 如果存在指纹配置，注入指纹伪装代码
ipcRenderer.on('inject-fingerprint', (event, config) => {
  if (typeof window !== 'undefined') {
    // 注入指纹伪装代码
    const script = document.createElement('script');
    script.textContent = `
      window.__FINGERPRINT_CONFIG__ = ${JSON.stringify(config)};
      // 这里添加指纹伪装的具体实现
    `;
    document.documentElement.appendChild(script);
  }
});
