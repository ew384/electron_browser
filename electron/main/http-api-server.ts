// electron/main/http-api-server.ts - 使用平台适配器的版本
import * as http from 'http';
import * as url from 'url';
import { WindowManager } from './window-manager';
import { AccountStorage } from './storage/account-storage';
import { PlatformAdapter } from './platform-adapter';
import { LLMRequestHandler } from './llm/llm-request-handler';

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
    private platformAdapter: PlatformAdapter;
    private commandIdCounter: number = 1; // 🔧 新增：命令ID计数器
    private llmHandler: LLMRequestHandler;
    // 🔧 新增：标签页会话缓存
    private tabSessions: Map<string, {
        accountId: string;
        tabId: string;
        platform: string;
        createdAt: number;
        lastUsed: number;
    }> = new Map();

    constructor(windowManager: WindowManager, accountStorage: AccountStorage) {
        this.windowManager = windowManager;
        this.accountStorage = accountStorage;
        this.platformAdapter = PlatformAdapter.getInstance();
        this.llmHandler = new LLMRequestHandler(windowManager, accountStorage);
    }

    async start(): Promise<void> {
        // 🔧 验证网络配置
        const networkValid = await this.platformAdapter.validateNetworkConfig();
        if (!networkValid) {
            console.warn('[HttpApiServer] ⚠️ 网络配置验证失败，使用备用配置');
        }
        return new Promise((resolve, reject) => {
            this.server = http.createServer(this.handleRequest.bind(this));

            // 🔧 使用平台适配器的网络配置
            const bindAddress = this.platformAdapter.getHTTPBindAddress();

            this.server.listen(this.port, bindAddress, () => {
                const networkMode = this.platformAdapter.shouldUseIPv4Only() ? 'IPv4-only' : 'Auto';
                console.log(`[HttpApiServer] 🚀 HTTP API Server started on http://${bindAddress}:${this.port}`);
                console.log(`[HttpApiServer] 🔧 Platform: ${process.platform}, Network: ${networkMode}`);
                resolve();
            });

            this.server.on('error', (error: any) => {
                if (error.code === 'EADDRINUSE') {
                    console.log(`[HttpApiServer] Port ${this.port} is busy, trying ${this.port + 1}...`);
                    this.port++;
                    this.server?.listen(this.port, bindAddress);
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
                    // 🔧 新增：清理LLM资源
                    try {
                        this.llmHandler.cleanup();
                        console.log('[HttpApiServer] 🧹 LLM资源已清理');
                    } catch (error) {
                        console.warn('[HttpApiServer] ⚠️ LLM资源清理失败:', error);
                    }

                    resolve();
                });
            } else {
                resolve();
            }
        });
    }

    private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
        try {
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

            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Access-Control-Allow-Origin', '*');
            if (pathname?.startsWith('/api/llm/')) {
                await this.llmHandler.handleRequest(req, res);
                return;
            } else if (method === 'POST' && pathname?.match(/^\/api\/browser\/[^/]+\/tabs$/)) {
                const pathParts = pathname.split('/');
                const accountId = pathParts[3];
                await this.handleCreateTab(req, res, accountId);
            }
            // 🔧 新增：获取标签页列表路由  
            else if (method === 'GET' && pathname?.match(/^\/api\/browser\/[^/]+\/tabs$/)) {
                const pathParts = pathname.split('/');
                const accountId = pathParts[3];
                await this.handleGetTabs(req, res, accountId);
            }
            // 路由处理（保持原有逻辑）
            if (method === 'POST' && pathname?.match(/^\/api\/browser\/[^/]+\/tabs\/[^/]+\/execute-script$/)) {
                const pathParts = pathname.split('/');
                const accountId = pathParts[3];
                const tabId = pathParts[5];
                await this.handleExecuteScriptInTab(req, res, accountId, tabId);
            } else if (method === 'GET' && pathname === '/api/health') {
                await this.handleHealthCheck(req, res);
            } else if (method === 'DELETE' && pathname?.match(/^\/api\/browser\/[^/]+\/tabs\/[^/]+$/)) {
                const pathParts = pathname.split('/');
                const accountId = pathParts[3];
                const tabId = pathParts[5];
                await this.handleCloseTab(req, res, accountId, tabId);
            }
            // 🔧 新增：标签页级操作路由
            else if (method === 'POST' && pathname?.match(/^\/api\/browser\/[^/]+\/tabs\/[^/]+\/execute-script$/)) {
                const pathParts = pathname.split('/');
                const accountId = pathParts[3];
                const tabId = pathParts[5];
                await this.handleExecuteScriptInTab(req, res, accountId, tabId);
            } else if (method === 'POST' && pathname?.match(/^\/api\/browser\/[^/]+\/tabs\/[^/]+\/navigate$/)) {
                const pathParts = pathname.split('/');
                const accountId = pathParts[3];
                const tabId = pathParts[5];
                await this.handleNavigateTab(req, res, accountId, tabId);
            } else if (method === 'POST' && pathname?.match(/^\/api\/browser\/[^/]+\/tabs\/[^/]+\/upload-file$/)) {
                const pathParts = pathname.split('/');
                const accountId = pathParts[3];
                const tabId = pathParts[5];
                await this.handleUploadFileToTab(req, res, accountId, tabId);
            }
            // 保留原有路由...
            else if (method === 'GET' && pathname === '/api/health') {
                await this.handleHealthCheck(req, res);
            } else if (method === 'GET' && pathname === '/api/accounts') {
                await this.handleGetAccounts(req, res);
            } else if (method === 'GET' && pathname === '/api/browsers') {
                await this.handleGetBrowsers(req, res);
            } else if (method === 'GET' && pathname?.startsWith('/api/browser/')) {
                const pathParts = pathname.split('/');
                const accountId = pathParts[3];

                if (pathname.endsWith('/tabs') && !pathname.includes('/tabs/')) {
                    // 已在上面处理
                } else if (pathParts.length === 4) {
                    await this.handleGetBrowser(req, res, accountId);
                } else {
                    // 404
                    res.writeHead(404);
                    res.end(JSON.stringify({ success: false, error: 'Not Found' }));
                }
            } else if (method === 'POST' && pathname?.match(/^\/api\/browser\/[^/]+\/execute-script$/)) {
                // 🔧 保留：原有的单标签页脚本执行（兼容性）
                const accountId = pathname.split('/')[3];
                await this.handleExecuteScript(req, res, accountId);
            } else if (method === 'POST' && pathname?.match(/^\/api\/browser\/[^/]+\/upload-file$/)) {
                // 🔧 保留：原有的单标签页文件上传（兼容性）
                const accountId = pathname.split('/')[3];
                await this.handleUploadFile(req, res, accountId);
            } else if (method === 'POST' && pathname?.match(/^\/api\/browser\/[^/]+\/navigate$/)) {
                // 🔧 保留：原有的单标签页导航（兼容性）
                const accountId = pathname.split('/')[3];
                await this.handleNavigate(req, res, accountId);
            } else if (method === 'POST' && pathname?.match(/^\/api\/browser\/[^/]+\/wait-for$/)) {
                // 🔧 保留：原有的等待条件（兼容性）
                const accountId = pathname.split('/')[3];
                await this.handleWaitFor(req, res, accountId);
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

    // ==================== 🔧 新增：标签页管理方法 ====================
    // 获取标签页列表 - 最小化实现
    private async handleGetTabs(req: http.IncomingMessage, res: http.ServerResponse, accountId: string): Promise<void> {
        try {
            const port = this.windowManager.getChromeDebugPort(accountId);
            if (!port) {
                res.writeHead(404);
                res.end(JSON.stringify({ success: false, error: 'Browser instance not running' }));
                return;
            }

            const tabs = await this.getChromeTabsInfo(port);

            res.writeHead(200);
            res.end(JSON.stringify({
                success: true,
                tabs: tabs,
                totalTabs: tabs.length,
                managedTabs: 0
            }));

        } catch (error) {
            console.error('[HttpApiServer] Get tabs error:', error);
            res.writeHead(500);
            res.end(JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error)
            }));
        }
    }
    // 创建新标签页 
    private async handleCreateTab(req: http.IncomingMessage, res: http.ServerResponse, accountId: string): Promise<void> {
        try {
            const port = this.windowManager.getChromeDebugPort(accountId);
            if (!port) {
                res.writeHead(404);
                res.end(JSON.stringify({ success: false, error: 'Browser instance not running' }));
                return;
            }

            const body = await this.readRequestBody(req);
            const { url, platform } = JSON.parse(body);

            // 🔧 检查是否已有相同URL的标签页
            const tabs = await this.getChromeTabsInfo(port);
            const existingTab = tabs.find(tab => tab.url === url);

            let tabInfo;
            if (existingTab) {
                console.log(`[HttpApiServer] ✅ 复用已有标签页: ${existingTab.id}`);
                console.log(`[HttpApiServer] 🔄 激活复用的标签页: ${existingTab.id}`);
                await this.activateExistingTab(port, existingTab.id);
                tabInfo = existingTab;
            } else {
                console.log(`[HttpApiServer] 🔧 创建新标签页: ${url}`);
                const newTabUrl = `http://127.0.0.1:${port}/json/new?${encodeURIComponent(url || 'about:blank')}`;
                const tabData = await this.httpRequestPUT(newTabUrl);
                tabInfo = JSON.parse(tabData);

                // 简单等待3秒
                await new Promise(resolve => setTimeout(resolve, 8000));
            }

            const sessionKey = `${accountId}-${tabInfo.id}`;
            this.tabSessions.set(sessionKey, {
                accountId,
                tabId: tabInfo.id,
                platform: platform || 'unknown',
                createdAt: Date.now(),
                lastUsed: Date.now()
            });

            res.writeHead(200);
            res.end(JSON.stringify({
                success: true,
                tabId: tabInfo.id,
                sessionKey: sessionKey,
                url: url,
                reused: !!existingTab
            }));

        } catch (error) {
            // ... 错误处理
        }
    }
    private httpRequestPUT(urlString: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const http = require('http');

            // 🔧 使用平台适配器处理URL
            const processedUrl = this.platformAdapter.shouldUseIPv4Only() ?
                urlString.replace('127.0.0.1', '127.0.0.1') : urlString;

            const urlObj = new URL(processedUrl);

            const req = http.request({
                hostname: urlObj.hostname,
                port: urlObj.port,
                path: urlObj.pathname + urlObj.search,
                method: 'PUT'
            }, (res: any) => {
                let data = '';
                res.on('data', (chunk: any) => data += chunk);
                res.on('end', () => resolve(data));
            });

            req.on('error', reject);
            req.end();
        });
    }

    // 关闭标签页
    private async handleCloseTab(req: http.IncomingMessage, res: http.ServerResponse, accountId: string, tabId: string): Promise<void> {
        try {
            const port = this.windowManager.getChromeDebugPort(accountId);
            if (!port) {
                res.writeHead(404);
                res.end(JSON.stringify({ success: false, error: 'Browser instance not running' }));
                return;
            }

            // 关闭标签页
            await this.sendCDPCommand(port, '', 'Target.closeTarget', { targetId: tabId });

            // 清理会话
            const sessionKey = `${accountId}-${tabId}`;
            this.tabSessions.delete(sessionKey);

            res.writeHead(200);
            res.end(JSON.stringify({
                success: true,
                message: 'Tab closed successfully',
                tabId: tabId
            }));

        } catch (error) {
            console.error('[HttpApiServer] Close tab error:', error);
            res.writeHead(500);
            res.end(JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error)
            }));
        }
    }

    // 在指定标签页执行脚本
    private async handleExecuteScriptInTab(req: http.IncomingMessage, res: http.ServerResponse, accountId: string, tabId: string): Promise<void> {
        try {
            const port = this.windowManager.getChromeDebugPort(accountId);
            if (!port) {
                res.writeHead(404);
                res.end(JSON.stringify({ success: false, error: 'Browser instance not running' }));
                return;
            }

            const body = await this.readRequestBody(req);
            const { script, awaitPromise = false, returnByValue = true } = JSON.parse(body);

            if (!script) {
                res.writeHead(400);
                res.end(JSON.stringify({ success: false, error: 'Script is required' }));
                return;
            }

            const sessionKey = `${accountId}-${tabId}`;
            const session = this.tabSessions.get(sessionKey);
            if (session) {
                session.lastUsed = Date.now();
            }

            const result = await this.executeScriptInTab(port, tabId, script, { awaitPromise, returnByValue });

            res.writeHead(200);
            res.end(JSON.stringify({
                success: true,
                result: result,
                tabId: tabId,
                sessionKey: sessionKey,
                platform: process.platform
            }));

        } catch (error) {
            console.error('[HttpApiServer] Execute script in tab error:', error);
            res.writeHead(500);
            res.end(JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error),
                platform: process.platform
            }));
        }
    }


    // 导航指定标签页
    private async handleNavigateTab(req: http.IncomingMessage, res: http.ServerResponse, accountId: string, tabId: string): Promise<void> {
        try {
            const port = this.windowManager.getChromeDebugPort(accountId);
            if (!port) {
                res.writeHead(404);
                res.end(JSON.stringify({ success: false, error: 'Browser instance not running' }));
                return;
            }

            const body = await this.readRequestBody(req);
            const { url } = JSON.parse(body);

            if (!url) {
                res.writeHead(400);
                res.end(JSON.stringify({ success: false, error: 'URL is required' }));
                return;
            }

            await this.sendCDPCommand(port, tabId, 'Page.navigate', { url });

            // 更新会话使用时间
            const sessionKey = `${accountId}-${tabId}`;
            const session = this.tabSessions.get(sessionKey);
            if (session) {
                session.lastUsed = Date.now();
            }

            res.writeHead(200);
            res.end(JSON.stringify({
                success: true,
                message: 'Navigation started',
                url: url,
                tabId: tabId
            }));

        } catch (error) {
            console.error('[HttpApiServer] Navigate tab error:', error);
            res.writeHead(500);
            res.end(JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error)
            }));
        }
    }

    // 在指定标签页上传文件
    private async handleUploadFileToTab(req: http.IncomingMessage, res: http.ServerResponse, accountId: string, tabId: string): Promise<void> {
        try {
            const port = this.windowManager.getChromeDebugPort(accountId);
            if (!port) {
                res.writeHead(404);
                res.end(JSON.stringify({ success: false, error: 'Browser instance not running' }));
                return;
            }

            const body = await this.readRequestBody(req);
            const { fileName, mimeType, base64Data, selector = 'input[type="file"]' } = JSON.parse(body);

            if (!base64Data) {
                res.writeHead(400);
                res.end(JSON.stringify({ success: false, error: 'File data is required' }));
                return;
            }

            const uploadScript = this.generateFileUploadScript(fileName, mimeType, base64Data, selector);
            const result = await this.executeScriptInTab(port, tabId, uploadScript, { returnByValue: true });

            // 更新会话使用时间
            const sessionKey = `${accountId}-${tabId}`;
            const session = this.tabSessions.get(sessionKey);
            if (session) {
                session.lastUsed = Date.now();
            }

            res.writeHead(200);
            res.end(JSON.stringify({
                success: true,
                result: result,
                tabId: tabId,
                fileName: fileName
            }));

        } catch (error) {
            console.error('[HttpApiServer] Upload file to tab error:', error);
            res.writeHead(500);
            res.end(JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error)
            }));
        }
    }

    // ==================== 保留原有方法 ====================

    private async activateExistingTab(port: number, tabId: string): Promise<void> {
        try {
            console.log(`[HttpApiServer] 🎯 开始激活标签页 ${tabId}...`);

            // 方法1: 使用Chrome DevTools Protocol激活标签页
            await this.sendCDPCommand(port, '', 'Target.activateTarget', { targetId: tabId });
            console.log(`[HttpApiServer] ✅ CDP激活命令已发送`);

            // 等待激活生效
            await new Promise(resolve => setTimeout(resolve, 1000));

            // 方法2: 在标签页中执行激活脚本
            const activateScript = `
                (function() {
                    try {
                        console.log('🔄 执行标签页激活脚本...');
                        
                        // 强制聚焦窗口
                        window.focus();
                        
                        // 聚焦文档
                        if (document.body) {
                            document.body.focus();
                        }
                        
                        // 触发用户活动事件
                        document.dispatchEvent(new Event('visibilitychange'));
                        document.dispatchEvent(new Event('focus'));
                        
                        // 模拟用户交互（点击页面）
                        if (document.body) {
                            const clickEvent = new MouseEvent('click', {
                                bubbles: true,
                                cancelable: true,
                                view: window
                            });
                            document.body.dispatchEvent(clickEvent);
                        }
                        
                        // 检查激活状态
                        const isActive = {
                            hasFocus: document.hasFocus(),
                            isVisible: !document.hidden,
                            visibilityState: document.visibilityState,
                            activeElement: document.activeElement ? document.activeElement.tagName : 'none'
                        };
                        
                        console.log('📊 标签页激活状态:', isActive);
                        
                        return {
                            success: true,
                            activated: true,
                            status: isActive
                        };
                    } catch (e) {
                        console.error('❌ 标签页激活脚本异常:', e);
                        return {
                            success: false,
                            error: e.message
                        };
                    }
                })()
            `;

            // 执行激活脚本
            const scriptResult = await this.sendCDPCommand(port, tabId, 'Runtime.evaluate', {
                expression: activateScript,
                returnByValue: true,
                awaitPromise: false
            });

            if (scriptResult && scriptResult.result && scriptResult.result.value) {
                const result = scriptResult.result.value;
                if (result.success) {
                    console.log(`[HttpApiServer] ✅ 标签页激活脚本执行成功`);
                    console.log(`[HttpApiServer] 📊 激活状态:`, result.status);
                } else {
                    console.log(`[HttpApiServer] ⚠️ 标签页激活脚本执行失败: ${result.error}`);
                }
            }

            // 再等待一下确保激活完全生效
            await new Promise(resolve => setTimeout(resolve, 2000));

            console.log(`[HttpApiServer] ✅ 标签页 ${tabId} 激活流程完成`);

        } catch (error) {
            console.error(`[HttpApiServer] ❌ 激活标签页 ${tabId} 失败:`, error);
            // 不抛出错误，让主流程继续
        }
    }
    // 🔧 保留：原有的执行脚本方法（兼容性）
    private async handleExecuteScript(req: http.IncomingMessage, res: http.ServerResponse, accountId: string): Promise<void> {
        try {
            const port = this.windowManager.getChromeDebugPort(accountId);
            if (!port) {
                res.writeHead(404);
                res.end(JSON.stringify({
                    success: false,
                    error: 'Browser instance not running'
                }));
                return;
            }

            // 读取请求体
            const body = await this.readRequestBody(req);
            const { script, awaitPromise = false, returnByValue = true } = JSON.parse(body);

            if (!script) {
                res.writeHead(400);
                res.end(JSON.stringify({
                    success: false,
                    error: 'Script is required'
                }));
                return;
            }

            // 获取标签页列表
            const tabs = await this.getChromeTabsInfo(port);
            if (tabs.length === 0) {
                res.writeHead(404);
                res.end(JSON.stringify({
                    success: false,
                    error: 'No active tabs found'
                }));
                return;
            }

            // 使用第一个活跃标签页
            const targetTab = tabs[0];
            const result = await this.executeScriptInTab(port, targetTab.id, script, { awaitPromise, returnByValue });

            res.writeHead(200);
            res.end(JSON.stringify({
                success: true,
                result: result,
                tabId: targetTab.id
            }));

        } catch (error) {
            console.error('[HttpApiServer] Execute script error:', error);
            res.writeHead(500);
            res.end(JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error)
            }));
        }
    }

    // 🔧 保留：原有的上传文件方法（兼容性）
    private async handleUploadFile(req: http.IncomingMessage, res: http.ServerResponse, accountId: string): Promise<void> {
        try {
            const port = this.windowManager.getChromeDebugPort(accountId);
            if (!port) {
                res.writeHead(404);
                res.end(JSON.stringify({
                    success: false,
                    error: 'Browser instance not running'
                }));
                return;
            }

            const body = await this.readRequestBody(req);
            const { filePath, fileName, mimeType, base64Data, selector = 'input[type="file"]' } = JSON.parse(body);

            if (!base64Data && !filePath) {
                res.writeHead(400);
                res.end(JSON.stringify({
                    success: false,
                    error: 'File data is required (base64Data or filePath)'
                }));
                return;
            }

            // 构建文件上传脚本
            const uploadScript = this.generateFileUploadScript(fileName, mimeType, base64Data, selector);

            // 获取活跃标签页并执行脚本
            const tabs = await this.getChromeTabsInfo(port);
            if (tabs.length === 0) {
                res.writeHead(404);
                res.end(JSON.stringify({
                    success: false,
                    error: 'No active tabs found'
                }));
                return;
            }

            const targetTab = tabs[0];
            const result = await this.executeScriptInTab(port, targetTab.id, uploadScript, { returnByValue: true });

            res.writeHead(200);
            res.end(JSON.stringify({
                success: true,
                result: result,
                tabId: targetTab.id,
                fileName: fileName
            }));

        } catch (error) {
            console.error('[HttpApiServer] Upload file error:', error);
            res.writeHead(500);
            res.end(JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error)
            }));
        }
    }

    // 🔧 保留：原有的导航方法（兼容性）
    private async handleNavigate(req: http.IncomingMessage, res: http.ServerResponse, accountId: string): Promise<void> {
        try {
            const port = this.windowManager.getChromeDebugPort(accountId);
            if (!port) {
                res.writeHead(404);
                res.end(JSON.stringify({
                    success: false,
                    error: 'Browser instance not running'
                }));
                return;
            }

            const body = await this.readRequestBody(req);
            const { url } = JSON.parse(body);

            if (!url) {
                res.writeHead(400);
                res.end(JSON.stringify({
                    success: false,
                    error: 'URL is required'
                }));
                return;
            }

            const tabs = await this.getChromeTabsInfo(port);
            if (tabs.length === 0) {
                res.writeHead(404);
                res.end(JSON.stringify({
                    success: false,
                    error: 'No active tabs found'
                }));
                return;
            }

            const targetTab = tabs[0];
            await this.sendCDPCommand(port, targetTab.id, 'Page.navigate', { url });

            res.writeHead(200);
            res.end(JSON.stringify({
                success: true,
                message: 'Navigation started',
                url: url,
                tabId: targetTab.id
            }));

        } catch (error) {
            console.error('[HttpApiServer] Navigate error:', error);
            res.writeHead(500);
            res.end(JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error)
            }));
        }
    }

    // 🔧 保留：原有的等待条件方法（兼容性）
    private async handleWaitFor(req: http.IncomingMessage, res: http.ServerResponse, accountId: string): Promise<void> {
        try {
            const port = this.windowManager.getChromeDebugPort(accountId);
            if (!port) {
                res.writeHead(404);
                res.end(JSON.stringify({
                    success: false,
                    error: 'Browser instance not running'
                }));
                return;
            }

            const body = await this.readRequestBody(req);
            const { condition, timeout = 30000, interval = 1000 } = JSON.parse(body);

            if (!condition) {
                res.writeHead(400);
                res.end(JSON.stringify({
                    success: false,
                    error: 'Condition is required'
                }));
                return;
            }

            const tabs = await this.getChromeTabsInfo(port);
            if (tabs.length === 0) {
                res.writeHead(404);
                res.end(JSON.stringify({
                    success: false,
                    error: 'No active tabs found'
                }));
                return;
            }

            const targetTab = tabs[0];
            const result = await this.waitForCondition(port, targetTab.id, condition, timeout, interval);

            res.writeHead(200);
            res.end(JSON.stringify({
                success: true,
                result: result,
                tabId: targetTab.id
            }));

        } catch (error) {
            console.error('[HttpApiServer] Wait for error:', error);
            res.writeHead(500);
            res.end(JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error)
            }));
        }
    }

    private async handleHealthCheck(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
        const platformConfig = this.platformAdapter.getConfig();

        // 🔧 新增：获取LLM状态
        let llmStatus: any = null;
        try {
            const serviceStatus = this.llmHandler.getServiceStatus();
            llmStatus = {
                available: serviceStatus.initialized,
                components: serviceStatus.components,
                providers: ['claude'], // 从配置获取
                gateway: 'integrated'
            };
        } catch (error) {
            llmStatus = {
                available: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
        res.writeHead(200);
        res.end(JSON.stringify({
            success: true,
            service: 'Electron Browser Manager HTTP API',
            timestamp: new Date().toISOString(),
            port: this.port,
            platform: {
                os: process.platform,
                arch: process.arch,
                version: process.getSystemVersion(),
                nodeVersion: process.version
            },
            networkConfig: {
                bindAddress: platformConfig.networkConfig.httpBindAddress,
                ipv4Only: platformConfig.networkConfig.useIPv4Only,
                protocol: platformConfig.networkConfig.websocketProtocol
            },
            features: {
                tabManagement: true,
                concurrentOperations: true,
                legacyCompatibility: true,
                platformOptimized: true,
                llmGateway: true, // 🔧 新增
                ...platformConfig.features
            },
            llm: llmStatus // 🔧 新增LLM状态
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
                        const versionData = await this.httpRequest(`http://127.0.0.1:${port}/json/version`);
                        const version = JSON.parse(versionData);

                        // 获取详细标签页信息
                        const tabsData = await this.httpRequest(`http://127.0.0.1:${port}/json`);
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

    // ==================== 核心辅助方法 ====================

    // 🔧 辅助方法：读取请求体
    private readRequestBody(req: http.IncomingMessage): Promise<string> {
        return new Promise((resolve, reject) => {
            let body = '';
            req.on('data', (chunk) => {
                body += chunk.toString();
            });
            req.on('end', () => {
                resolve(body);
            });
            req.on('error', reject);
        });
    }

    private async executeScriptInTab(port: number, tabId: string, script: string, options: any = {}): Promise<any> {
        console.log(`[HttpApiServer] 🎯 执行脚本 (标签页: ${tabId}, 平台: ${process.platform})`);

        return new Promise((resolve, reject) => {
            const WebSocket = require('ws');

            // 🔧 使用平台适配器格式化WebSocket URL
            const wsUrl = this.platformAdapter.formatWebSocketURL('127.0.0.1', port, `/devtools/page/${tabId}`);
            console.log(`[HttpApiServer] 🔗 WebSocket连接: ${wsUrl}`);

            const ws = new WebSocket(wsUrl);

            let resolved = false;
            let timeoutId: NodeJS.Timeout;

            const cleanup = () => {
                if (timeoutId) clearTimeout(timeoutId);
                if (ws.readyState === WebSocket.OPEN) ws.close();
            };

            const handleResolve = (result: any) => {
                if (resolved) return;
                resolved = true;
                cleanup();
                resolve(result);
            };

            const handleReject = (error: Error) => {
                if (resolved) return;
                resolved = true;
                cleanup();
                reject(error);
            };

            ws.on('open', () => {
                console.log(`[HttpApiServer] ✅ WebSocket连接成功 (${process.platform})`);
                const commandId = this.commandIdCounter++;

                const command = {
                    id: commandId,
                    method: 'Runtime.evaluate',
                    params: {
                        expression: script,
                        returnByValue: options.returnByValue !== false,
                        awaitPromise: options.awaitPromise || false,
                        timeout: 30000
                    }
                };

                ws.send(JSON.stringify(command));

                const messageHandler = (data: any) => {
                    if (resolved) return;

                    try {
                        const response = JSON.parse(data.toString());
                        if (response.id === commandId) {
                            if (response.error) {
                                handleReject(new Error(`CDP Error: ${response.error.message}`));
                            } else {
                                const simplifiedResult = response.result?.result?.value || response.result;
                                handleResolve({ value: simplifiedResult });
                            }
                        }
                    } catch (parseError) {
                        handleReject(new Error(`Response parse error: ${parseError}`));
                    }
                };

                ws.on('message', messageHandler);
            });

            ws.on('error', (error: any) => {
                console.error(`[HttpApiServer] ❌ WebSocket错误 (${process.platform}):`, error);
                handleReject(new Error(`WebSocket error: ${error.message}`));
            });

            ws.on('close', (code: number, reason: string) => {
                if (!resolved) {
                    handleReject(new Error(`WebSocket closed unexpectedly: ${code} ${reason}`));
                }
            });

            timeoutId = setTimeout(() => {
                handleReject(new Error('Script execution timeout (30s)'));
            }, 30000);
        });
    }

    private async sendCDPCommand(port: number, tabId: string, method: string, params: any = {}): Promise<any> {
        return new Promise((resolve, reject) => {
            const WebSocket = require('ws');

            // 🔧 使用平台适配器格式化URL
            const wsUrl = this.platformAdapter.formatWebSocketURL('127.0.0.1', port, `/devtools/page/${tabId}`);
            const ws = new WebSocket(wsUrl);

            let resolved = false;
            let timeoutId: NodeJS.Timeout;

            const cleanup = () => {
                if (timeoutId) clearTimeout(timeoutId);
                if (ws.readyState === WebSocket.OPEN) ws.close();
            };

            ws.on('open', () => {
                const commandId = this.commandIdCounter++;
                const command = { id: commandId, method, params };

                ws.send(JSON.stringify(command));

                const messageHandler = (data: any) => {
                    if (resolved) return;

                    try {
                        const response = JSON.parse(data.toString());
                        if (response.id === commandId) {
                            resolved = true;
                            cleanup();
                            if (response.error) {
                                reject(new Error(`CDP Error: ${response.error.message}`));
                            } else {
                                resolve(response.result);
                            }
                        }
                    } catch (parseError) {
                        reject(new Error(`Response parse error: ${parseError}`));
                    }
                };

                ws.on('message', messageHandler);
            });

            ws.on('error', (error: any) => {
                if (!resolved) {
                    resolved = true;
                    cleanup();
                    reject(new Error(`WebSocket error: ${error.message}`));
                }
            });

            timeoutId = setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    cleanup();
                    reject(new Error('CDP command timeout'));
                }
            }, 30000);
        });
    }

    // 🔧 等待条件满足
    private async waitForCondition(port: number, tabId: string, condition: string, timeout: number, interval: number): Promise<any> {
        const startTime = Date.now();

        while (Date.now() - startTime < timeout) {
            try {
                const result = await this.executeScriptInTab(port, tabId, condition, { returnByValue: true });
                if (result.value) {
                    return result;
                }
            } catch (error) {
                // 继续等待
            }

            await new Promise(resolve => setTimeout(resolve, interval));
        }

        throw new Error('Wait condition timeout');
    }

    // 🔧 生成文件上传脚本
    private generateFileUploadScript(fileName: string, mimeType: string, base64Data: string, selector: string): string {
        return `
        (function() {
            try {
                // 查找文件输入框
                let fileInput = document.querySelector('${selector}');
                
                if (!fileInput) {
                    // 尝试其他常见选择器
                    const selectors = [
                        'input[type="file"]',
                        'input[accept*="video"]',
                        'input[accept*="image"]',
                        '[data-testid*="upload"] input',
                        '.upload-input input'
                    ];
                    
                    for (const sel of selectors) {
                        fileInput = document.querySelector(sel);
                        if (fileInput) break;
                    }
                }
                
                if (!fileInput) {
                    throw new Error('File input not found');
                }
                
                // 创建File对象
                const byteCharacters = atob('${base64Data}');
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                const byteArray = new Uint8Array(byteNumbers);
                const blob = new Blob([byteArray], { type: '${mimeType}' });
                const file = new File([blob], '${fileName}', {
                    type: '${mimeType}',
                    lastModified: Date.now()
                });
                
                // 创建FileList
                const dataTransfer = new DataTransfer();
                dataTransfer.items.add(file);
                
                // 设置文件到input
                Object.defineProperty(fileInput, 'files', {
                    value: dataTransfer.files,
                    configurable: true
                });
                
                // 触发事件
                fileInput.focus();
                fileInput.dispatchEvent(new Event('change', { bubbles: true }));
                fileInput.dispatchEvent(new Event('input', { bubbles: true }));
                
                return {
                    success: true,
                    fileName: '${fileName}',
                    fileSize: ${base64Data.length},
                    mimeType: '${mimeType}'
                };
                
            } catch (error) {
                return { 
                    success: false, 
                    error: error.message 
                };
            }
        })()
    `;
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
            const versionData = await this.httpRequest(`http://127.0.0.1:${port}/json/version`);
            console.log(`[HttpApiServer] 端口 ${port} 版本信息:`, versionData.substring(0, 100) + '...');

            // 获取标签页信息
            const tabsData = await this.httpRequest(`http://127.0.0.1:${port}/json`);
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
            const tabsData = await this.httpRequest(`http://127.0.0.1:${port}/json`);
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

    private httpRequest(urlString: string, timeout: number = 3000): Promise<string> {
        return new Promise((resolve, reject) => {
            const http = require('http');

            // 🔧 使用平台适配器处理URL
            const processedUrl = this.platformAdapter.shouldUseIPv4Only() ?
                urlString.replace('127.0.0.1', '127.0.0.1') : urlString;

            console.log(`[HttpApiServer] 🔗 HTTP请求 (${process.platform}): ${processedUrl}`);

            const req = http.get(processedUrl, { timeout }, (res: any) => {
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
    getPlatformInfo() {
        return {
            platform: process.platform,
            config: this.platformAdapter.getConfig(),
            bindAddress: this.platformAdapter.getHTTPBindAddress(),
            ipv4Only: this.platformAdapter.shouldUseIPv4Only()
        };
    }
}