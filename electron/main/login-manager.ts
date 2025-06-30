// electron/main/login-manager.ts - 登录流程管理

import { v4 as uuidv4 } from 'uuid';
import { WindowManager } from './window-manager';
import { AccountStorage } from './storage/account-storage';
import {
    LoginSession,
    BrowserAccount,
    PlatformType,
    AccountCookie,
    PlatformConfig
} from '../shared/types';

export class LoginManager {
    private windowManager: WindowManager;
    private accountStorage: AccountStorage;
    private activeSessions: Map<string, LoginSession> = new Map();
    private platformConfigs: Map<PlatformType, PlatformConfig> = new Map();

    constructor(windowManager: WindowManager, accountStorage: AccountStorage) {
        this.windowManager = windowManager;
        this.accountStorage = accountStorage;
        this.initializePlatformConfigs();
    }

    // ==================== 平台配置初始化 ====================

    private initializePlatformConfigs(): void {
        const configs: PlatformConfig[] = [
            {
                id: 'douyin',
                name: 'douyin',
                displayName: '抖音',
                icon: '🎵',
                color: '#000000',
                loginUrl: 'https://creator.douyin.com/',
                uploadUrl: 'https://creator.douyin.com/creator-micro/content/upload',
                features: {
                    autoLogin: true,
                    batchUpload: true,
                    scheduling: true
                },
                cookieValidation: {
                    checkUrl: 'https://creator.douyin.com/creator-micro/content/upload',
                    validationScript: `
            return !document.querySelector('text="手机号登录"') && 
                   !document.querySelector('text="扫码登录"');
          `
                }
            },
            {
                id: 'wechat',
                name: 'wechat',
                displayName: '微信视频号',
                icon: '💬',
                color: '#07C160',
                loginUrl: 'https://channels.weixin.qq.com/',
                uploadUrl: 'https://channels.weixin.qq.com/platform/post/create',
                features: {
                    autoLogin: true,
                    batchUpload: true,
                    scheduling: true
                },
                cookieValidation: {
                    checkUrl: 'https://channels.weixin.qq.com/platform/post/create',
                    validationScript: `
            return !document.querySelector('div.title-name:has-text("微信小店")');
          `
                }
            },
            {
                id: 'xiaohongshu',
                name: 'xiaohongshu',
                displayName: '小红书',
                icon: '📔',
                color: '#FF2442',
                loginUrl: 'https://creator.xiaohongshu.com/',
                uploadUrl: 'https://creator.xiaohongshu.com/publish/publish?from=homepage&target=video',
                features: {
                    autoLogin: true,
                    batchUpload: true,
                    scheduling: false
                },
                cookieValidation: {
                    checkUrl: 'https://creator.xiaohongshu.com/creator-micro/content/upload',
                    validationScript: `
            return !document.querySelector('text="手机号登录"') && 
                   !document.querySelector('text="扫码登录"');
          `
                }
            },
            {
                id: 'kuaishou',
                name: 'kuaishou',
                displayName: '快手',
                icon: '⚡',
                color: '#FF6600',
                loginUrl: 'https://cp.kuaishou.com',
                uploadUrl: 'https://cp.kuaishou.com/article/publish/video',
                features: {
                    autoLogin: true,
                    batchUpload: true,
                    scheduling: true
                },
                cookieValidation: {
                    checkUrl: 'https://cp.kuaishou.com/article/publish/video',
                    validationScript: `
            return !document.querySelector('div.names div.container div.name:text("机构服务")');
          `
                }
            },
            {
                id: 'bilibili',
                name: 'bilibili',
                displayName: 'B站',
                icon: '📺',
                color: '#00A1D6',
                loginUrl: 'https://www.bilibili.com',
                uploadUrl: 'https://member.bilibili.com/platform/upload/video/frame',
                features: {
                    autoLogin: true,
                    batchUpload: true,
                    scheduling: true
                },
                cookieValidation: {
                    checkUrl: 'https://member.bilibili.com/platform/upload/video/frame',
                    validationScript: `
            return document.querySelector('.bili-header-m .profile-info');
          `
                }
            }
        ];

        configs.forEach(config => {
            this.platformConfigs.set(config.id, config);
        });

        console.log(`[LoginManager] Initialized ${configs.length} platform configurations`);
    }

    // ==================== 登录流程管理 ====================

    async startLoginFlow(accountId: string, platform: PlatformType): Promise<string> {
        console.log(`[LoginManager] Starting login flow for ${accountId}@${platform}`);

        const account = await this.accountStorage.getAccount(accountId);
        if (!account) {
            throw new Error(`Account ${accountId} not found`);
        }

        const platformConfig = this.platformConfigs.get(platform);
        if (!platformConfig) {
            throw new Error(`Platform ${platform} not supported`);
        }

        // 创建登录会话
        const sessionId = uuidv4();
        const session: LoginSession = {
            id: sessionId,
            accountId,
            platform,
            status: 'pending',
            startTime: Date.now(),
            progress: 0
        };

        this.activeSessions.set(sessionId, session);
        await this.accountStorage.saveLoginSession(session);

        try {
            // 更新账号状态
            await this.accountStorage.updateAccount(accountId, { status: 'logging_in' });

            // 创建浏览器实例
            const browserInstance = await this.windowManager.createBrowserInstance(accountId, {
                startUrl: platformConfig.loginUrl,
                fingerprint: account.config?.fingerprint
            });

            session.browserInstanceId = browserInstance.windowId.toString();
            session.status = 'waiting_user';
            session.progress = 50;

            await this.updateSession(sessionId, session);

            console.log(`[LoginManager] Login session created: ${sessionId}`);
            return sessionId;

        } catch (error) {
            session.status = 'failed';
            session.errorMessage = error instanceof Error ? error.message : String(error);
            session.endTime = Date.now();

            await this.updateSession(sessionId, session);
            await this.accountStorage.updateAccount(accountId, { status: 'login_failed' });

            throw error;
        }
    }

    async checkLoginStatus(sessionId: string): Promise<LoginSession | null> {
        const session = this.activeSessions.get(sessionId);
        if (!session) {
            return await this.accountStorage.getLoginSession(sessionId);
        }

        // 如果会话状态是等待用户，尝试检查是否登录成功
        if (session.status === 'waiting_user') {
            const isLoggedIn = await this.checkIfUserLoggedIn(session);
            if (isLoggedIn) {
                await this.completeLoginFlow(sessionId);
            }
        }

        return session;
    }

    async completeLoginFlow(sessionId: string): Promise<void> {
        const session = this.activeSessions.get(sessionId);
        if (!session) {
            throw new Error(`Login session ${sessionId} not found`);
        }

        console.log(`[LoginManager] Completing login flow for session ${sessionId}`);

        try {
            // 提取并保存 Cookie
            await this.extractAndSaveCookie(session);

            // 更新会话状态
            session.status = 'completed';
            session.progress = 100;
            session.endTime = Date.now();

            await this.updateSession(sessionId, session);

            // 更新账号状态
            await this.accountStorage.updateAccount(session.accountId, {
                status: 'idle',
                lastLoginTime: Date.now()
            });

            // 关闭浏览器实例
            if (session.browserInstanceId) {
                await this.windowManager.closeInstance(session.accountId);
            }

            console.log(`[LoginManager] Login flow completed for ${session.accountId}@${session.platform}`);

        } catch (error) {
            session.status = 'failed';
            session.errorMessage = error instanceof Error ? error.message : String(error);
            session.endTime = Date.now();

            await this.updateSession(sessionId, session);
            await this.accountStorage.updateAccount(session.accountId, { status: 'login_failed' });

            throw error;
        } finally {
            // 清理活跃会话
            this.activeSessions.delete(sessionId);
        }
    }

    async cancelLoginFlow(sessionId: string): Promise<void> {
        const session = this.activeSessions.get(sessionId);
        if (!session) {
            return;
        }

        console.log(`[LoginManager] Cancelling login flow for session ${sessionId}`);

        // 关闭浏览器实例
        if (session.browserInstanceId) {
            await this.windowManager.closeInstance(session.accountId);
        }

        // 更新会话状态
        session.status = 'failed';
        session.errorMessage = 'Cancelled by user';
        session.endTime = Date.now();

        await this.updateSession(sessionId, session);
        await this.accountStorage.updateAccount(session.accountId, { status: 'idle' });

        this.activeSessions.delete(sessionId);
    }

    // ==================== Cookie 管理 ====================

    async extractAndSaveCookie(session: LoginSession): Promise<void> {
        console.log(`[LoginManager] Extracting cookies for ${session.accountId}@${session.platform}`);

        const debugPort = this.windowManager.getChromeDebugPort(session.accountId);
        if (!debugPort) {
            throw new Error('Browser instance not found or not running');
        }

        try {
            // 通过 Chrome DevTools Protocol 获取 cookies
            const response = await fetch(`http://localhost:${debugPort}/json`);
            const tabs = await response.json();

            if (tabs.length === 0) {
                throw new Error('No active tabs found');
            }

            const tabId = tabs[0].id;

            // 连接到 WebSocket 获取 cookies
            const cookieData = await this.getCookiesFromBrowser(debugPort, tabId);

            // 保存 cookies 到存储
            await this.accountStorage.saveAccountCookie(session.accountId, session.platform, cookieData);

            console.log(`[LoginManager] Cookies extracted and saved for ${session.accountId}@${session.platform}`);

        } catch (error) {
            console.error(`[LoginManager] Failed to extract cookies:`, error);
            throw new Error(`Failed to extract cookies: ${error}`);
        }
    }

    private async getCookiesFromBrowser(debugPort: number, tabId: string): Promise<any> {
        return new Promise((resolve, reject) => {
            const WebSocket = require('ws');
            const ws = new WebSocket(`ws://localhost:${debugPort}/devtools/page/${tabId}`);

            let commandId = 1;
            const timeout = setTimeout(() => {
                ws.close();
                reject(new Error('Cookie extraction timeout'));
            }, 30000);

            ws.on('open', () => {
                // 发送获取所有 cookies 的命令
                ws.send(JSON.stringify({
                    id: commandId++,
                    method: 'Network.getAllCookies'
                }));
            });

            ws.on('message', (data: any) => {
                try {
                    const response = JSON.parse(data.toString());

                    if (response.id && response.result && response.result.cookies) {
                        clearTimeout(timeout);
                        ws.close();
                        resolve(response.result.cookies);
                    }
                } catch (error) {
                    clearTimeout(timeout);
                    ws.close();
                    reject(error);
                }
            });

            ws.on('error', (error: any) => {
                clearTimeout(timeout);
                reject(error);
            });
        });
    }

    async validateAccountCookie(accountId: string, platform: PlatformType): Promise<boolean> {
        console.log(`[LoginManager] Validating cookie for ${accountId}@${platform}`);

        const cookie = await this.accountStorage.getAccountCookie(accountId, platform);
        if (!cookie) {
            await this.accountStorage.updateAccount(accountId, { cookieStatus: 'invalid' });
            return false;
        }

        const platformConfig = this.platformConfigs.get(platform);
        if (!platformConfig) {
            return false;
        }

        try {
            // 创建临时浏览器实例进行验证
            const browserInstance = await this.windowManager.createBrowserInstance(accountId, {
                startUrl: platformConfig.cookieValidation.checkUrl
            });

            const debugPort = this.windowManager.getChromeDebugPort(accountId);
            if (!debugPort) {
                throw new Error('Browser instance not available');
            }

            // 设置 cookies
            await this.setCookiesInBrowser(debugPort, cookie.cookieData);

            // 导航到验证页面
            await this.navigateToValidationPage(debugPort, platformConfig.cookieValidation.checkUrl);

            // 执行验证脚本
            const isValid = await this.executeValidationScript(debugPort, platformConfig.cookieValidation.validationScript);

            // 更新 cookie 状态
            await this.accountStorage.updateCookieStatus(accountId, platform, isValid);

            // 关闭临时浏览器实例
            await this.windowManager.closeInstance(accountId);

            console.log(`[LoginManager] Cookie validation result for ${accountId}@${platform}: ${isValid}`);
            return isValid;

        } catch (error) {
            console.error(`[LoginManager] Cookie validation failed:`, error);
            await this.accountStorage.updateCookieStatus(accountId, platform, false);

            // 确保清理浏览器实例
            try {
                await this.windowManager.closeInstance(accountId);
            } catch (cleanupError) {
                console.warn(`[LoginManager] Failed to cleanup browser instance:`, cleanupError);
            }

            return false;
        }
    }

    private async setCookiesInBrowser(debugPort: number, cookies: any[]): Promise<void> {
        return new Promise((resolve, reject) => {
            const WebSocket = require('ws');
            const ws = new WebSocket(`ws://localhost:${debugPort}/devtools/page`);

            let commandId = 1;
            let completedCommands = 0;
            const totalCommands = cookies.length;

            const timeout = setTimeout(() => {
                ws.close();
                reject(new Error('Set cookies timeout'));
            }, 30000);

            ws.on('open', () => {
                // 为每个 cookie 发送设置命令
                cookies.forEach(cookie => {
                    ws.send(JSON.stringify({
                        id: commandId++,
                        method: 'Network.setCookie',
                        params: {
                            name: cookie.name,
                            value: cookie.value,
                            domain: cookie.domain,
                            path: cookie.path,
                            secure: cookie.secure,
                            httpOnly: cookie.httpOnly,
                            expires: cookie.expires
                        }
                    }));
                });
            });

            ws.on('message', (data: any) => {
                try {
                    const response = JSON.parse(data.toString());

                    if (response.id) {
                        completedCommands++;

                        if (completedCommands >= totalCommands) {
                            clearTimeout(timeout);
                            ws.close();
                            resolve();
                        }
                    }
                } catch (error) {
                    clearTimeout(timeout);
                    ws.close();
                    reject(error);
                }
            });

            ws.on('error', (error: any) => {
                clearTimeout(timeout);
                reject(error);
            });
        });
    }

    private async navigateToValidationPage(debugPort: number, url: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const WebSocket = require('ws');
            const ws = new WebSocket(`ws://localhost:${debugPort}/devtools/page`);

            const timeout = setTimeout(() => {
                ws.close();
                reject(new Error('Navigation timeout'));
            }, 15000);

            ws.on('open', () => {
                ws.send(JSON.stringify({
                    id: 1,
                    method: 'Page.navigate',
                    params: { url }
                }));
            });

            ws.on('message', (data: any) => {
                try {
                    const response = JSON.parse(data.toString());

                    if (response.method === 'Page.loadEventFired') {
                        clearTimeout(timeout);
                        ws.close();
                        resolve();
                    }
                } catch (error) {
                    clearTimeout(timeout);
                    ws.close();
                    reject(error);
                }
            });

            ws.on('error', (error: any) => {
                clearTimeout(timeout);
                reject(error);
            });
        });
    }

    private async executeValidationScript(debugPort: number, script: string): Promise<boolean> {
        return new Promise((resolve, reject) => {
            const WebSocket = require('ws');
            const ws = new WebSocket(`ws://localhost:${debugPort}/devtools/page`);

            const timeout = setTimeout(() => {
                ws.close();
                reject(new Error('Script execution timeout'));
            }, 10000);

            ws.on('open', () => {
                ws.send(JSON.stringify({
                    id: 1,
                    method: 'Runtime.evaluate',
                    params: {
                        expression: `(function() { ${script} })()`,
                        returnByValue: true
                    }
                }));
            });

            ws.on('message', (data: any) => {
                try {
                    const response = JSON.parse(data.toString());

                    if (response.id === 1 && response.result) {
                        clearTimeout(timeout);
                        ws.close();

                        const result = response.result.result?.value;
                        resolve(Boolean(result));
                    }
                } catch (error) {
                    clearTimeout(timeout);
                    ws.close();
                    reject(error);
                }
            });

            ws.on('error', (error: any) => {
                clearTimeout(timeout);
                reject(error);
            });
        });
    }

    // ==================== 批量操作 ====================

    async batchLogin(accountIds: string[], platform: PlatformType): Promise<{
        sessionIds: string[];
        results: { accountId: string; sessionId?: string; error?: string }[];
    }> {
        console.log(`[LoginManager] Starting batch login for ${accountIds.length} accounts on ${platform}`);

        const results: { accountId: string; sessionId?: string; error?: string }[] = [];
        const sessionIds: string[] = [];

        // 限制并发数量，避免系统过载
        const maxConcurrent = 3;
        const chunks = [];

        for (let i = 0; i < accountIds.length; i += maxConcurrent) {
            chunks.push(accountIds.slice(i, i + maxConcurrent));
        }

        for (const chunk of chunks) {
            const promises = chunk.map(async (accountId) => {
                try {
                    const sessionId = await this.startLoginFlow(accountId, platform);
                    sessionIds.push(sessionId);
                    return { accountId, sessionId };
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    return { accountId, error: errorMessage };
                }
            });

            const chunkResults = await Promise.all(promises);
            results.push(...chunkResults);

            // 批次间延迟，避免过快创建实例
            if (chunks.indexOf(chunk) < chunks.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }

        console.log(`[LoginManager] Batch login initiated: ${sessionIds.length} sessions created`);
        return { sessionIds, results };
    }

    async batchValidateCookies(accountIds: string[]): Promise<{
        results: { accountId: string; platform: PlatformType; isValid: boolean; error?: string }[];
    }> {
        console.log(`[LoginManager] Starting batch cookie validation for ${accountIds.length} accounts`);

        const results: { accountId: string; platform: PlatformType; isValid: boolean; error?: string }[] = [];

        // 串行验证，避免资源冲突
        for (const accountId of accountIds) {
            try {
                const account = await this.accountStorage.getAccount(accountId);
                if (!account || !account.platform) {
                    results.push({
                        accountId,
                        platform: 'douyin', // 默认值
                        isValid: false,
                        error: 'Account not found or platform not set'
                    });
                    continue;
                }

                const isValid = await this.validateAccountCookie(accountId, account.platform);
                results.push({
                    accountId,
                    platform: account.platform,
                    isValid
                });

                // 验证间延迟
                await new Promise(resolve => setTimeout(resolve, 1000));

            } catch (error) {
                const account = await this.accountStorage.getAccount(accountId);
                results.push({
                    accountId,
                    platform: account?.platform || 'douyin',
                    isValid: false,
                    error: error instanceof Error ? error.message : String(error)
                });
            }
        }

        console.log(`[LoginManager] Batch cookie validation completed`);
        return { results };
    }

    // ==================== 私有辅助方法 ====================

    private async checkIfUserLoggedIn(session: LoginSession): Promise<boolean> {
        const debugPort = this.windowManager.getChromeDebugPort(session.accountId);
        if (!debugPort) {
            return false;
        }

        const platformConfig = this.platformConfigs.get(session.platform);
        if (!platformConfig) {
            return false;
        }

        try {
            // 简单检查：看当前URL是否不再是登录页面
            const response = await fetch(`http://localhost:${debugPort}/json`);
            const tabs = await response.json();

            if (tabs.length > 0) {
                const currentUrl = tabs[0].url;
                const loginUrl = platformConfig.loginUrl;

                // 如果当前URL包含了上传页面的路径，说明已经登录成功
                return currentUrl.includes('upload') ||
                    currentUrl.includes('creator') ||
                    currentUrl.includes('platform') ||
                    !currentUrl.includes(new URL(loginUrl).hostname);
            }

            return false;
        } catch (error) {
            console.warn(`[LoginManager] Failed to check login status:`, error);
            return false;
        }
    }

    private async updateSession(sessionId: string, session: LoginSession): Promise<void> {
        this.activeSessions.set(sessionId, session);
        await this.accountStorage.saveLoginSession(session);
    }

    // ==================== 获取器方法 ====================

    getPlatformConfigs(): PlatformConfig[] {
        return Array.from(this.platformConfigs.values());
    }

    getPlatformConfig(platform: PlatformType): PlatformConfig | undefined {
        return this.platformConfigs.get(platform);
    }

    getActiveSessions(): LoginSession[] {
        return Array.from(this.activeSessions.values());
    }

    async getSessionsByAccount(accountId: string): Promise<LoginSession[]> {
        return Array.from(this.activeSessions.values()).filter(
            session => session.accountId === accountId
        );
    }

    // ==================== 清理方法 ====================

    async cleanup(): Promise<void> {
        console.log('[LoginManager] Cleaning up active sessions...');

        // 取消所有活跃的登录会话
        const sessionIds = Array.from(this.activeSessions.keys());
        await Promise.all(sessionIds.map(sessionId => this.cancelLoginFlow(sessionId)));

        console.log(`[LoginManager] Cleaned up ${sessionIds.length} active sessions`);
    }
}