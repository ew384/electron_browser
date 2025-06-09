// electron/main/http-api-server.ts - 修复类型错误版本
import * as http from 'http';
import * as url from 'url';
import { WindowManager } from './window-manager';
import { AccountStorage } from './storage/account-storage';

// 定义浏览器信息接口
interface BrowserInfo {
    id: string;
    name: string;
    accountId: string;
    group: string | null;
    status: string;
    debugPort: number | null;
    url: string | null;
    tabsCount: number;
    chromeVersion: string | null;
    lastActive: string | null;
    createdAt: number | null;
    config: any;
}

export class HttpApiServer {
    private server: http.Server | null = null;
    private port: number = 9528; // 使用一个固定端口
    private windowManager: WindowManager;
    private accountStorage: AccountStorage;

    constructor(windowManager: WindowManager, accountStorage: AccountStorage) {
        this.windowManager = windowManager;
        this.accountStorage = accountStorage;
    }

    async start(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.server = http.createServer(this.handleRequest.bind(this));

            this.server.listen(this.port, 'localhost', () => {
                console.log(`[HttpApiServer] 🚀 HTTP API Server started on http://localhost:${this.port}`);
                resolve();
            });

            this.server.on('error', (error: any) => {
                if (error.code === 'EADDRINUSE') {
                    console.log(`[HttpApiServer] Port ${this.port} is busy, trying ${this.port + 1}...`);
                    this.port++;
                    this.server?.listen(this.port, 'localhost');
                } else {
                    console.error('[HttpApiServer] Server error:', error);
                    reject(error);
                }
            });
        });
    }

    async stop(): Promise<void> {
        return new Promise((resolve) => {
            if (this.server) {
                this.server.close(() => {
                    console.log('[HttpApiServer] 📤 HTTP API Server stopped');
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }

    private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
        try {
            // 处理CORS预检请求
            if (req.method === 'OPTIONS') {
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
                res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
                res.writeHead(200);
                res.end();
                return;
            }

            const parsedUrl = url.parse(req.url || '', true);
            const pathname = parsedUrl.pathname;
            const method = req.method;

            console.log(`[HttpApiServer] ${method} ${pathname}`);

            // 设置响应头
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Access-Control-Allow-Origin', '*');

            // 路由处理
            if (method === 'GET' && pathname === '/api/health') {
                await this.handleHealthCheck(req, res);
            } else if (method === 'GET' && pathname === '/api/accounts') {
                await this.handleGetAccounts(req, res);
            } else if (method === 'GET' && pathname === '/api/browsers') {
                await this.handleGetBrowsers(req, res);
            } else if (method === 'GET' && pathname?.startsWith('/api/browser/')) {
                const accountId = pathname.split('/')[3];
                await this.handleGetBrowser(req, res, accountId);
            } else if (method === 'GET' && pathname?.startsWith('/api/browser/') && pathname.endsWith('/tabs')) {
                const accountId = pathname.split('/')[3];
                await this.handleGetBrowserTabs(req, res, accountId);
            } else if (method === 'POST' && pathname === '/api/browsers/refresh') {
                await this.handleRefreshBrowsers(req, res);
            } else if (method === 'GET' && pathname === '/api/debug/chrome-ports') {
                await this.handleDebugChromePorts(req, res);
            } else {
                // 404
                res.writeHead(404);
                res.end(JSON.stringify({
                    success: false,
                    error: 'Not Found',
                    path: pathname
                }));
            }
        } catch (error) {
            console.error('[HttpApiServer] Request handling error:', error);

            // 确保没有重复发送响应
            if (!res.headersSent) {
                res.writeHead(500);
                res.end(JSON.stringify({
                    success: false,
                    error: error instanceof Error ? error.message : String(error)
                }));
            }
        }
    }

    private async handleHealthCheck(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
        res.writeHead(200);
        res.end(JSON.stringify({
            success: true,
            service: 'Electron Browser Manager HTTP API',
            timestamp: new Date().toISOString(),
            port: this.port
        }));
    }

    private async handleGetAccounts(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
        try {
            const accounts = await this.accountStorage.getAllAccounts();

            // 同步实例状态和端口信息
            for (const account of accounts) {
                const instance = this.windowManager.getInstance(account.id);
                if (instance) {
                    (account as any).status = instance.status === 'running' ? 'running' : 'idle';
                    const port = this.windowManager.getChromeDebugPort(account.id);
                    (account as any).debugPort = port || undefined;
                } else {
                    (account as any).status = 'idle';
                    (account as any).debugPort = undefined;
                }
            }

            res.writeHead(200);
            res.end(JSON.stringify({
                success: true,
                accounts,
                timestamp: new Date().toISOString()
            }));
        } catch (error) {
            res.writeHead(500);
            res.end(JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error),
                accounts: []
            }));
        }
    }

    private async handleGetBrowsers(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
        try {
            const accounts = await this.accountStorage.getAllAccounts();
            const browsers: BrowserInfo[] = [];

            for (const account of accounts) {
                const instance = this.windowManager.getInstance(account.id);

                const browserInfo: BrowserInfo = {
                    id: account.id,
                    name: account.name || `浏览器 ${account.id}`,
                    accountId: account.id,
                    group: (account as any).group || null, // 类型断言处理
                    status: 'stopped',
                    debugPort: null,
                    url: null,
                    tabsCount: 0,
                    chromeVersion: null,
                    lastActive: (account as any).lastActive || null, // 类型断言处理
                    createdAt: account.createdAt || null,
                    config: account.config || {}
                };

                // 获取实时状态
                if (instance) {
                    browserInfo.status = instance.status === 'running' ? 'running' : 'stopped';
                    const port = this.windowManager.getChromeDebugPort(account.id);
                    browserInfo.debugPort = port; // 修复：允许 number | null

                    // 如果有端口，验证Chrome实例并获取标签页信息
                    if (port) {
                        try {
                            const validation = await this.validateChromeInstance(port);
                            if (validation.isRunning) {
                                browserInfo.tabsCount = validation.tabs || 0;
                                browserInfo.chromeVersion = validation.version?.Browser || null;
                                browserInfo.url = validation.currentUrl || null; // 修复：将 undefined 转换为 null
                            } else {
                                browserInfo.status = 'stopped';
                                browserInfo.debugPort = null;
                            }
                        } catch (validationError) {
                            console.log(`[HttpApiServer] Chrome validation failed for port ${port}:`, validationError);
                            browserInfo.status = 'stopped';
                            browserInfo.debugPort = null;
                        }
                    }
                }

                browsers.push(browserInfo);
            }

            // 按状态排序：运行中的在前面
            browsers.sort((a, b) => {
                if (a.status === 'running' && b.status !== 'running') return -1;
                if (a.status !== 'running' && b.status === 'running') return 1;
                return 0;
            });

            const runningCount = browsers.filter(b => b.status === 'running').length;

            res.writeHead(200);
            res.end(JSON.stringify({
                success: true,
                browsers,
                statistics: {
                    total: browsers.length,
                    running: runningCount,
                    stopped: browsers.length - runningCount
                },
                timestamp: new Date().toISOString(),
                source: 'electron-http-api'
            }));
        } catch (error) {
            res.writeHead(500);
            res.end(JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error),
                browsers: []
            }));
        }
    }

    private async handleGetBrowser(req: http.IncomingMessage, res: http.ServerResponse, accountId: string): Promise<void> {
        try {
            const account = await this.accountStorage.getAccount(accountId);
            if (!account) {
                res.writeHead(404);
                res.end(JSON.stringify({
                    success: false,
                    error: 'Browser instance not found'
                }));
                return;
            }

            const instance = this.windowManager.getInstance(accountId);
            const browserInfo = {
                id: account.id,
                name: account.name,
                status: instance?.status || 'stopped',
                debugPort: this.windowManager.getChromeDebugPort(accountId),
                config: account.config || {},
                fingerprint: account.config?.fingerprint || null
            };

            res.writeHead(200);
            res.end(JSON.stringify({
                success: true,
                browser: browserInfo
            }));
        } catch (error) {
            res.writeHead(500);
            res.end(JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error)
            }));
        }
    }

    private async handleGetBrowserTabs(req: http.IncomingMessage, res: http.ServerResponse, accountId: string): Promise<void> {
        try {
            const port = this.windowManager.getChromeDebugPort(accountId);
            if (!port) {
                res.writeHead(404);
                res.end(JSON.stringify({
                    success: false,
                    error: 'Browser instance not running or port not found'
                }));
                return;
            }

            const tabs = await this.getChromeTabsInfo(port);

            res.writeHead(200);
            res.end(JSON.stringify({
                success: true,
                browserId: accountId,
                debugPort: port,
                tabs: tabs.map(tab => ({
                    id: tab.id,
                    title: tab.title,
                    url: tab.url,
                    type: tab.type,
                    webSocketDebuggerUrl: tab.webSocketDebuggerUrl
                }))
            }));
        } catch (error) {
            res.writeHead(500);
            res.end(JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error)
            }));
        }
    }

    private async handleRefreshBrowsers(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
        try {
            // 刷新所有实例状态
            const accounts = await this.accountStorage.getAllAccounts();

            res.writeHead(200);
            res.end(JSON.stringify({
                success: true,
                message: 'Browser instances refreshed',
                count: accounts.length,
                timestamp: new Date().toISOString()
            }));
        } catch (error) {
            res.writeHead(500);
            res.end(JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error)
            }));
        }
    }

    // 辅助方法：验证Chrome实例
    private async validateChromeInstance(port: number): Promise<{
        isRunning: boolean;
        version?: any;
        tabs?: number;
        currentUrl?: string;
    }> {
        try {
            console.log(`[HttpApiServer] 验证Chrome实例端口 ${port}...`);

            // 获取版本信息
            const versionData = await this.httpRequest(`http://localhost:${port}/json/version`);
            console.log(`[HttpApiServer] 端口 ${port} 版本信息:`, versionData.substring(0, 100) + '...');

            // 获取标签页信息
            const tabsData = await this.httpRequest(`http://localhost:${port}/json`);
            const tabs: any[] = JSON.parse(tabsData);

            console.log(`[HttpApiServer] 端口 ${port} 标签页数量: ${tabs.length}`);
            tabs.forEach((tab: any, index: number) => {
                console.log(`[HttpApiServer] 标签页 ${index + 1}: ${tab.title} - ${tab.url}`);
            });

            // 查找活跃标签页
            const activeTab = tabs.find((tab: any) => tab.type === 'page' && !tab.url.startsWith('chrome://'));
            const currentUrl = activeTab ? activeTab.url : (tabs.length > 0 ? tabs[0].url : undefined);

            console.log(`[HttpApiServer] 端口 ${port} 当前活跃页面: ${currentUrl}`);

            return {
                isRunning: true,
                version: JSON.parse(versionData),
                tabs: tabs.filter((tab: any) => tab.type === 'page' && !tab.url.startsWith('chrome://')).length, // 只计算实际页面标签页
                currentUrl: currentUrl
            };
        } catch (error: any) {
            console.error(`[HttpApiServer] 验证Chrome实例失败 端口 ${port}:`, error?.message || String(error));
            return { isRunning: false };
        }
    }

    // 辅助方法：获取Chrome标签页信息（用于详细调试）
    private async getChromeTabsInfo(port: number): Promise<any[]> {
        try {
            console.log(`[HttpApiServer] 获取端口 ${port} 的标签页详情...`);
            const tabsData = await this.httpRequest(`http://localhost:${port}/json`);
            const tabs: any[] = JSON.parse(tabsData);

            console.log(`[HttpApiServer] 端口 ${port} 所有标签页:`);
            tabs.forEach((tab: any, index: number) => {
                console.log(`[HttpApiServer] ${index + 1}. [${tab.type}] ${tab.title}`);
                console.log(`    URL: ${tab.url}`);
                console.log(`    ID: ${tab.id}`);
            });

            // 只返回实际的页面标签页
            const pageTabsOnly = tabs.filter((tab: any) => tab.type === 'page' && !tab.url.startsWith('chrome://'));
            console.log(`[HttpApiServer] 端口 ${port} 实际页面标签页数量: ${pageTabsOnly.length}`);

            return pageTabsOnly;
        } catch (error) {
            console.error('[HttpApiServer] Failed to get tabs info:', error);
            return [];
        }
    }

    private async handleDebugChromePorts(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
        try {
            console.log('[HttpApiServer] === Chrome端口调试信息 ===');

            const accounts = await this.accountStorage.getAllAccounts();
            const instances = this.windowManager.getAllInstances();

            const debugInfo: any = {
                accounts: accounts.map(acc => ({
                    id: acc.id,
                    name: acc.name,
                    status: (acc as any).status
                })),
                instances: instances.map(inst => ({
                    accountId: inst.accountId,
                    windowId: inst.windowId,
                    status: inst.status,
                    debugPort: this.windowManager.getChromeDebugPort(inst.accountId)
                })),
                portValidation: []
            };

            // 验证每个端口
            for (const instance of instances) {
                const port = this.windowManager.getChromeDebugPort(instance.accountId);
                if (port) {
                    try {
                        console.log(`[HttpApiServer] 详细检查端口 ${port} (账号: ${instance.accountId})`);

                        // 获取版本信息
                        const versionData = await this.httpRequest(`http://localhost:${port}/json/version`);
                        const version = JSON.parse(versionData);

                        // 获取详细标签页信息
                        const tabsData = await this.httpRequest(`http://localhost:${port}/json`);
                        const allTabs: any[] = JSON.parse(tabsData);

                        // 分类标签页
                        const pageTabs = allTabs.filter((tab: any) => tab.type === 'page' && !tab.url.startsWith('chrome://'));
                        const wechatTabs = pageTabs.filter((tab: any) =>
                            tab.url.includes('channels.weixin.qq.com') ||
                            tab.url.includes('weixin.qq.com')
                        );

                        console.log(`[HttpApiServer] 端口 ${port} 详情:`);
                        console.log(`  Chrome版本: ${version.Browser}`);
                        console.log(`  所有标签页: ${allTabs.length}`);
                        console.log(`  页面标签页: ${pageTabs.length}`);
                        console.log(`  微信相关标签页: ${wechatTabs.length}`);

                        pageTabs.forEach((tab: any, index: number) => {
                            console.log(`  ${index + 1}. ${tab.title}`);
                            console.log(`     ${tab.url}`);
                        });

                        debugInfo.portValidation.push({
                            accountId: instance.accountId,
                            port: port,
                            isValid: true,
                            chromeVersion: version.Browser,
                            totalTabs: allTabs.length,
                            pageTabs: pageTabs.length,
                            wechatTabs: wechatTabs.length,
                            tabs: pageTabs.map((tab: any) => ({
                                title: tab.title,
                                url: tab.url,
                                id: tab.id
                            }))
                        });

                    } catch (error: any) {
                        console.error(`[HttpApiServer] 端口 ${port} 验证失败:`, error?.message || String(error));
                        debugInfo.portValidation.push({
                            accountId: instance.accountId,
                            port: port,
                            isValid: false,
                            error: error?.message || String(error)
                        });
                    }
                }
            }

            res.writeHead(200);
            res.end(JSON.stringify(debugInfo, null, 2));
        } catch (error: any) {
            res.writeHead(500);
            res.end(JSON.stringify({
                success: false,
                error: error?.message || String(error)
            }));
        }
    }

    // 辅助方法：HTTP请求
    private httpRequest(url: string, timeout: number = 3000): Promise<string> {
        return new Promise((resolve, reject) => {
            const http = require('http');
            const req = http.get(url, { timeout }, (res: any) => {
                let data = '';
                res.on('data', (chunk: any) => data += chunk);
                res.on('end', () => resolve(data));
            });

            req.on('error', reject);
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });
        });
    }

    getPort(): number {
        return this.port;
    }
}