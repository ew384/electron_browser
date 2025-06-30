// electron/renderer/types/electron-api.d.ts - 扩展前端API类型定义

import {
    BrowserAccount,
    AccountGroup,
    LoginSession,
    PlatformType,
    AccountCookie,
    PlatformConfig,
    AccountApiResponse
} from '../../shared/types';

declare global {
    interface Window {
        electronAPI: {
            // ==================== 原有方法 ====================

            // 账号管理
            createAccount: (account: any) => Promise<{ success: boolean; account?: any; error?: string }>;
            getAccounts: () => Promise<{ success: boolean; accounts: any[]; error?: string }>;
            deleteAccount: (accountId: string) => Promise<{ success: boolean; error?: string }>;

            // 浏览器实例管理
            createBrowserInstance: (accountId: string, config?: any) => Promise<any>;
            closeBrowserInstance: (accountId: string) => Promise<any>;
            getBrowserInstances: () => Promise<any>;

            // Chrome调试
            getChromeDebugPort: (accountId: string) => Promise<any>;
            getAllDebugPorts: () => Promise<any>;

            // 指纹管理
            getFingerprintConfig: () => Promise<any>;
            updateFingerprintConfig: (config: any) => Promise<any>;
            validateFingerprint: (config: any) => Promise<any>;
            generateFingerprint: (seed?: string) => Promise<any>;

            // 应用信息
            getAppVersion: () => Promise<string>;

            // ==================== 扩展方法 ====================

            // 扩展账号管理
            createAccountExtended: (accountData: Partial<BrowserAccount>) => Promise<AccountApiResponse<BrowserAccount>>;
            updateAccount: (accountId: string, updates: Partial<BrowserAccount>) => Promise<AccountApiResponse>;
            getAccountsByPlatform: (platform: PlatformType) => Promise<AccountApiResponse<BrowserAccount[]>>;
            searchAccounts: (query: string) => Promise<AccountApiResponse<BrowserAccount[]>>;
            getAccountStats: () => Promise<AccountApiResponse<{
                total: number;
                byPlatform: Record<string, number>;
                byStatus: Record<string, number>;
                byCookieStatus: Record<string, number>;
            }>>;

            // 登录流程管理
            startLoginFlow: (accountId: string, platform: PlatformType) => Promise<AccountApiResponse<{ sessionId: string }>>;
            checkLoginStatus: (sessionId: string) => Promise<AccountApiResponse<{ session: LoginSession }>>;
            completeLoginFlow: (sessionId: string) => Promise<AccountApiResponse>;
            cancelLoginFlow: (sessionId: string) => Promise<AccountApiResponse>;
            batchLogin: (accountIds: string[], platform: PlatformType) => Promise<AccountApiResponse<{
                sessionIds: string[];
                results: { accountId: string; sessionId?: string; error?: string }[];
            }>>;

            // Cookie管理
            validateAccountCookie: (accountId: string, platform: PlatformType) => Promise<AccountApiResponse<{ isValid: boolean }>>;
            batchValidateCookies: (accountIds: string[]) => Promise<AccountApiResponse<{
                results: { accountId: string; platform: PlatformType; isValid: boolean; error?: string }[];
            }>>;
            getAccountCookie: (accountId: string, platform: PlatformType) => Promise<AccountApiResponse<{ cookie: AccountCookie }>>;
            deleteAccountCookies: (accountId: string) => Promise<AccountApiResponse>;

            // 分组管理
            createGroup: (groupData: Partial<AccountGroup>) => Promise<AccountApiResponse<AccountGroup>>;
            getAllGroups: () => Promise<AccountApiResponse<AccountGroup[]>>;
            getGroup: (groupId: string) => Promise<AccountApiResponse<{ group: AccountGroup }>>;
            addAccountToGroup: (accountId: string, groupId: string) => Promise<AccountApiResponse>;
            removeAccountFromGroup: (accountId: string, groupId: string) => Promise<AccountApiResponse>;
            deleteGroup: (groupId: string) => Promise<AccountApiResponse>;

            // 平台配置
            getPlatformConfigs: () => Promise<AccountApiResponse<PlatformConfig[]>>;
            getPlatformConfig: (platform: PlatformType) => Promise<AccountApiResponse<{ config: PlatformConfig }>>;

            // 会话管理
            getActiveLoginSessions: () => Promise<AccountApiResponse<LoginSession[]>>;
            getAccountLoginSessions: (accountId: string) => Promise<AccountApiResponse<LoginSession[]>>;

            // 批量操作
            batchUpdateAccounts: (accountIds: string[], updates: Partial<BrowserAccount>) => Promise<AccountApiResponse>;
            batchDeleteAccounts: (accountIds: string[]) => Promise<AccountApiResponse>;

            // 导入导出
            exportAccounts: (accountIds?: string[]) => Promise<AccountApiResponse<Partial<BrowserAccount>[]>>;
            importAccounts: (accountsData: Partial<BrowserAccount>[]) => Promise<AccountApiResponse<{
                results: { success: boolean; accountId?: string; error?: string }[];
                successCount: number;
            }>>;

            // 应用生命周期
            cleanupLoginManager: () => Promise<AccountApiResponse>;

            // 调试相关
            debugWindowInfo: () => Promise<any>;
            debugFingerprintStatus: () => Promise<any>;
            debugFingerprintDetailed: () => Promise<any>;
        };
    }
}

export { };