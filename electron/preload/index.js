import { contextBridge, ipcRenderer } from 'electron';
import { ensureInjected } from './fingerprint';
import type { BrowserAccount, AccountConfig, FingerprintConfig } from '../shared/types';

// 在DOM加载前注入指纹
const injectFingerprints = async () => {
    try {
        const result = await ipcRenderer.invoke('get-fingerprint-config');
        if (result?.success && result.config) {
            console.log('[Preload] Injecting fingerprints with config:', result.config);
            ensureInjected(result.config);
        } else {
            console.warn('[Preload] No fingerprint config available');
        }
    } catch (error) {
        console.error('[Preload] Error injecting fingerprints:', error);
    }
};

// 等待DOM加载
if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectFingerprints);
    } else {
        injectFingerprints();
    }
}

// 暴露API给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
    // 账号管理
    createAccount: (account: BrowserAccount) => ipcRenderer.invoke('create-account', account),
    getAccounts: () => ipcRenderer.invoke('get-accounts'),
    deleteAccount: (accountId: string) => ipcRenderer.invoke('delete-account', accountId),

    // 浏览器实例管理 - 统一接口名称
    launchBrowser: (accountId: string) => {
        console.log('[Preload] Launching browser for account:', accountId);
        return ipcRenderer.invoke('create-browser-instance', accountId, {});
    },
    closeBrowser: (accountId: string) => {
        console.log('[Preload] Closing browser for account:', accountId);
        return ipcRenderer.invoke('close-browser-instance', accountId);
    },
    createBrowserInstance: (accountId: string, config: AccountConfig) =>
        ipcRenderer.invoke('create-browser-instance', accountId, config),
    closeBrowserInstance: (accountId: string) =>
        ipcRenderer.invoke('close-browser-instance', accountId),
    getBrowserInstances: () => ipcRenderer.invoke('get-browser-instances'),

    // 指纹管理
    getFingerprintConfig: () => ipcRenderer.invoke('get-fingerprint-config'),
    updateFingerprintConfig: (config: FingerprintConfig) =>
        ipcRenderer.invoke('update-fingerprint-config', config),
    validateFingerprint: (config: FingerprintConfig) =>
        ipcRenderer.invoke('validate-fingerprint', config),
    generateFingerprint: (seed?: string) => ipcRenderer.invoke('generate-fingerprint', seed),

    // 窗口控制（如果需要）
    minimizeWindow: () => ipcRenderer.send('minimize-window'),
    maximizeWindow: () => ipcRenderer.send('maximize-window'),
    closeWindow: () => ipcRenderer.send('close-window'),

    // 应用信息
    getAppVersion: () => ipcRenderer.invoke('get-app-version')
});