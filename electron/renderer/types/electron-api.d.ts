// electron/renderer/types/electron-api.d.ts

export interface ElectronAPI {
    // 账号管理
    createAccount: (account: BrowserAccount) => Promise<{ success: boolean; account?: BrowserAccount; error?: string }>;
    getAccounts: () => Promise<{ success: boolean; accounts: BrowserAccount[]; error?: string }>;
    deleteAccount: (accountId: string) => Promise<{ success: boolean; error?: string }>;

    // 浏览器实例管理
    createBrowserInstance: (accountId: string, config?: AccountConfig) => Promise<{ success: boolean; instance?: BrowserInstance; error?: string }>;
    closeBrowserInstance: (accountId: string) => Promise<{ success: boolean; error?: string }>;
    getBrowserInstances: () => Promise<{ success: boolean; instances: BrowserInstance[]; error?: string }>;

    // 新增：Chrome调试端口管理
    getChromeDebugPort: (accountId: string) => Promise<{ success: boolean; port?: number; error?: string }>;

    // 指纹管理
    getFingerprintConfig: () => Promise<{ success: boolean; config?: FingerprintConfig; error?: string }>;
    updateFingerprintConfig: (config: FingerprintConfig) => Promise<{ success: boolean; error?: string }>;
    validateFingerprint: (config: FingerprintConfig) => Promise<{ success: boolean; quality?: FingerprintQuality; error?: string }>;
    generateFingerprint: (seed?: string) => Promise<{ success: boolean; config?: FingerprintConfig; quality?: FingerprintQuality; error?: string }>;

    // 预留扩展方法
    injectFingerprint?: (accountId: string, fingerprint: any) => Promise<{ success: boolean; error?: string }>;
    updateProxy?: (accountId: string, proxy: any) => Promise<{ success: boolean; error?: string }>;
    executeBehavior?: (accountId: string, behavior: any) => Promise<{ success: boolean; error?: string }>;

    // 调试相关
    debugFingerprintStatus: () => Promise<{ success: boolean; status?: any; error?: string }>;
    debugWindowInfo: () => Promise<{ success: boolean; error?: string;[key: string]: any }>;
    debugFingerprintDetailed: () => Promise<{ success: boolean; info?: any; error?: string }>;
    debugForceSetFingerprint: () => Promise<{ success: boolean; error?: string;[key: string]: any }>;

    // 应用信息
    getAppVersion: () => Promise<string>;
}

declare global {
    interface Window {
        electronAPI?: ElectronAPI;
    }
}

// 重新导出类型以便在其他地方使用
export type { BrowserAccount, BrowserInstance, AccountConfig, FingerprintConfig, FingerprintQuality } from '../../shared/types';