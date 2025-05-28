import type { BrowserAccount, AccountConfig, FingerprintConfig } from '../../shared/types';

declare global {
    interface Window {
        electronAPI: {
            // 账号管理
            createAccount: (account: BrowserAccount) => Promise<{ success: boolean; account?: BrowserAccount; error?: string }>;
            getAccounts: () => Promise<{ success: boolean; accounts: BrowserAccount[]; error?: string }>;
            deleteAccount: (accountId: string) => Promise<{ success: boolean; error?: string }>;

            // 浏览器实例管理
            launchBrowser: (accountId: string) => Promise<{ success: boolean; instance?: any; error?: string }>;
            closeBrowser: (accountId: string) => Promise<{ success: boolean; error?: string }>;
            createBrowserInstance: (accountId: string, config: AccountConfig) => Promise<{ success: boolean; instance?: any; error?: string }>;
            closeBrowserInstance: (accountId: string) => Promise<{ success: boolean; error?: string }>;
            destroyBrowserInstance: (accountId: string) => Promise<{ success: boolean; error?: string }>;
            getBrowserInstances: () => Promise<{ success: boolean; instances: any[]; error?: string }>;

            // 指纹管理
            getFingerprintConfig: () => Promise<{ success: boolean; config?: FingerprintConfig; error?: string }>;
            updateFingerprintConfig: (config: FingerprintConfig) => Promise<{ success: boolean; error?: string }>;
            validateFingerprint: (config: FingerprintConfig) => Promise<{ success: boolean; quality?: any; error?: string }>;
            generateFingerprint: (seed?: string) => Promise<{ success: boolean; config?: FingerprintConfig; quality?: any; error?: string }>;
            injectFingerprint: (accountId: string, fingerprint: any) => Promise<{ success: boolean; error?: string }>;

            // 代理和行为
            updateProxy: (accountId: string, proxy: any) => Promise<{ success: boolean; error?: string }>;
            executeBehavior: (accountId: string, behavior: any) => Promise<{ success: boolean; error?: string }>;

            // 窗口控制
            minimizeWindow: () => void;
            maximizeWindow: () => void;
            closeWindow: () => void;

            // 应用信息
            getAppVersion: () => Promise<string>;
        };
    }
}

export { };