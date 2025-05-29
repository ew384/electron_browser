import { contextBridge, ipcRenderer } from 'electron';
import type { BrowserAccount, AccountConfig, FingerprintConfig } from '../shared/types';

console.log('[Preload] Loading preload script...');

// 指纹注入功能 - 延迟加载
let fingerprintModule: any = null;

const loadFingerprintModule = async () => {
  if (!fingerprintModule) {
    try {
      // 动态导入指纹模块，避免构建时的依赖问题
      fingerprintModule = await import('./fingerprint');
      console.log('[Preload] Fingerprint module loaded successfully');
    } catch (error) {
      console.warn('[Preload] Failed to load fingerprint module:', error);
      // 创建空的指纹模块作为后备
      fingerprintModule = {
        injectAllFingerprints: () => console.log('[Preload] Fingerprint injection disabled'),
        ensureInjected: () => console.log('[Preload] Fingerprint injection disabled')
      };
    }
  }
  return fingerprintModule;
};

// 指纹注入功能
const injectFingerprints = async () => {
  try {
    console.log('[Preload] Starting fingerprint injection...');

    // 获取指纹配置
    const result = await ipcRenderer.invoke('get-fingerprint-config');

    if (result?.success && result.config) {
      console.log('[Preload] Got fingerprint config, injecting...');

      // 动态加载指纹模块
      const fingerprint = await loadFingerprintModule();

      // 注入指纹
      fingerprint.ensureInjected(result.config);

      console.log('[Preload] Fingerprint injection completed');
    } else {
      console.log('[Preload] No fingerprint config available, skipping injection');
    }
  } catch (error) {
    console.warn('[Preload] Fingerprint injection failed:', error);
    // 指纹注入失败不应该影响基本功能
  }
};

// DOM 加载后执行指纹注入
const setupFingerprintInjection = () => {
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', injectFingerprints);
    } else {
      // 延迟执行，确保页面完全加载
      setTimeout(injectFingerprints, 100);
    }
  }
};

console.log('[Preload] Setting up electronAPI...');

// 创建安全的 API 接口
const electronAPI = {
  // 账号管理
  createAccount: async (account: BrowserAccount) => {
    console.log('[Preload] Creating account:', account);
    try {
      return await ipcRenderer.invoke('create-account', account);
    } catch (error) {
      console.error('[Preload] Create account error:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },

  getAccounts: async () => {
    console.log('[Preload] Getting accounts');
    try {
      return await ipcRenderer.invoke('get-accounts');
    } catch (error) {
      console.error('[Preload] Get accounts error:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error), accounts: [] };
    }
  },

  deleteAccount: async (accountId: string) => {
    console.log('[Preload] Deleting account:', accountId);
    try {
      return await ipcRenderer.invoke('delete-account', accountId);
    } catch (error) {
      console.error('[Preload] Delete account error:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },

  // 浏览器实例管理
  launchBrowser: async (accountId: string) => {
    console.log('[Preload] Launching browser for account:', accountId);
    try {
      return await ipcRenderer.invoke('create-browser-instance', accountId, {});
    } catch (error) {
      console.error('[Preload] Launch browser error:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },

  closeBrowser: async (accountId: string) => {
    console.log('[Preload] Closing browser for account:', accountId);
    try {
      return await ipcRenderer.invoke('close-browser-instance', accountId);
    } catch (error) {
      console.error('[Preload] Close browser error:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },

  createBrowserInstance: async (accountId: string, config: AccountConfig) => {
    try {
      return await ipcRenderer.invoke('create-browser-instance', accountId, config);
    } catch (error) {
      console.error('[Preload] Create browser instance error:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },

  closeBrowserInstance: async (accountId: string) => {
    try {
      return await ipcRenderer.invoke('close-browser-instance', accountId);
    } catch (error) {
      console.error('[Preload] Close browser instance error:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },

  getBrowserInstances: async () => {
    try {
      return await ipcRenderer.invoke('get-browser-instances');
    } catch (error) {
      console.error('[Preload] Get browser instances error:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error), instances: [] };
    }
  },

  // 指纹管理
  getFingerprintConfig: async () => {
    try {
      return await ipcRenderer.invoke('get-fingerprint-config');
    } catch (error) {
      console.error('[Preload] Get fingerprint config error:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },

  updateFingerprintConfig: async (config: FingerprintConfig) => {
    try {
      return await ipcRenderer.invoke('update-fingerprint-config', config);
    } catch (error) {
      console.error('[Preload] Update fingerprint config error:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },

  validateFingerprint: async (config: FingerprintConfig) => {
    try {
      return await ipcRenderer.invoke('validate-fingerprint', config);
    } catch (error) {
      console.error('[Preload] Validate fingerprint error:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },

  generateFingerprint: async (seed?: string) => {
    console.log('[Preload] Generating fingerprint with seed:', seed);
    try {
      return await ipcRenderer.invoke('generate-fingerprint', seed);
    } catch (error) {
      console.error('[Preload] Generate fingerprint error:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },

  // 窗口控制
  minimizeWindow: () => {
    try {
      ipcRenderer.send('minimize-window');
    } catch (error) {
      console.error('[Preload] Minimize window error:', error);
    }
  },

  maximizeWindow: () => {
    try {
      ipcRenderer.send('maximize-window');
    } catch (error) {
      console.error('[Preload] Maximize window error:', error);
    }
  },

  closeWindow: () => {
    try {
      ipcRenderer.send('close-window');
    } catch (error) {
      console.error('[Preload] Close window error:', error);
    }
  },

  // 应用信息
  getAppVersion: async () => {
    try {
      return await ipcRenderer.invoke('get-app-version');
    } catch (error) {
      console.error('[Preload] Get app version error:', error);
      return '1.0.0';
    }
  },

  // 指纹注入控制（用于调试）
  injectFingerprints: async () => {
    await injectFingerprints();
  }
};

// 暴露 API 给渲染进程
try {
  contextBridge.exposeInMainWorld('electronAPI', electronAPI);
  console.log('[Preload] electronAPI setup completed');
} catch (error) {
  console.error('[Preload] Failed to expose electronAPI:', error);
}

// 设置指纹注入（可选）
setupFingerprintInjection();

// 监听指纹配置更新
ipcRenderer.on('fingerprint-config-updated', async (event, config) => {
  console.log('[Preload] Fingerprint config updated, re-injecting...');
  try {
    const fingerprint = await loadFingerprintModule();
    fingerprint.injectAllFingerprints(config);
  } catch (error) {
    console.warn('[Preload] Failed to re-inject fingerprints:', error);
  }
});

console.log('[Preload] Preload script loaded successfully');