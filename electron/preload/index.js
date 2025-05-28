"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const fingerprint_1 = require("./fingerprint");
// 在DOM加载前注入指纹
const injectFingerprints = async () => {
    try {
        const config = await electron_1.ipcRenderer.invoke('get-fingerprint-config');
        if (config) {
            console.log('[Preload] Injecting fingerprints with config:', config);
            (0, fingerprint_1.ensureInjected)(config);
        }
        else {
            console.warn('[Preload] No fingerprint config available');
        }
    }
    catch (error) {
        console.error('[Preload] Error injecting fingerprints:', error);
    }
};
// 等待DOM加载
if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectFingerprints);
    }
    else {
        injectFingerprints();
    }
}
// 暴露API给渲染进程
electron_1.contextBridge.exposeInMainWorld('electronAPI', {
    // 账号管理
    createAccount: (account) => electron_1.ipcRenderer.invoke('create-account', account),
    getAccounts: () => electron_1.ipcRenderer.invoke('get-accounts'),
    deleteAccount: (accountId) => electron_1.ipcRenderer.invoke('delete-account', accountId),
    // 浏览器实例管理
    createBrowserInstance: (accountId, config) => electron_1.ipcRenderer.invoke('create-browser-instance', accountId, config),
    closeBrowserInstance: (accountId) => electron_1.ipcRenderer.invoke('close-browser-instance', accountId),
    getBrowserInstances: () => electron_1.ipcRenderer.invoke('get-browser-instances'),
    // 指纹管理
    getFingerprintConfig: () => electron_1.ipcRenderer.invoke('get-fingerprint-config'),
    updateFingerprintConfig: (config) => electron_1.ipcRenderer.invoke('update-fingerprint-config', config),
    validateFingerprint: (config) => electron_1.ipcRenderer.invoke('validate-fingerprint', config),
    generateFingerprint: (seed) => electron_1.ipcRenderer.invoke('generate-fingerprint', seed)
});
