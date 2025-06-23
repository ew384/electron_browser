// electron/main/http-api-server.ts - 集成LLM扩展的完整版本
import * as http from 'http';
import * as url from 'url';
import { WindowManager } from './window-manager';
import { AccountStorage } from './storage/account-storage';
import { PlatformAdapter } from './platform-adapter';

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
    
    // 🔧 LLM控制器 - 新增
    private llmController: any = null;

    // 🔧 扩展：标签页会话缓存（支持LLM）
    private tabSessions: Map<string, {
        accountId: string;
        tabId: string;
        platform: string;
        createdAt: number;
        lastUsed: number;
        type?: string; // 'general', 'llm', 'automation'
        provider?: string | null; // LLM提供商
        llmData?: any; // LLM特定数据
    }

    // ==================== 🔧 标签页管理方法 ====================
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
                const newTabUrl = `http://localhost:${port}/json/new?${encodeURIComponent(url || 'about:blank')}`;
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
            console.error('[HttpApiServer] Create tab error:', error);
            res.writeHead(500);
            res.end(JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error)
            }));
        }
    }

    private httpRequestPUT(urlString: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const http = require('http');
            
            // 🔧 使用平台适配器处理URL
            const processedUrl = this.platformAdapter.shouldUseIPv4Only() ? 
                urlString.replace('localhost', '127.0.0.1') : urlString;
            
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

    private httpRequest(urlString: string, timeout: number = 3000): Promise<string> {
        return new Promise((resolve, reject) => {
            const http = require('http');
            
            // 🔧 使用平台适配器处理URL
            const processedUrl = this.platformAdapter.shouldUseIPv4Only() ? 
                urlString.replace('localhost', '127.0.0.1') : urlString;
            
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
            ipv4Only: this.platformAdapter.shouldUseIPv4Only(),
            llmSupport: !!this.llmController
        };
    }
}❌ 激活标签页 ${tabId} 失败:`, error);
            // 不抛出错误，让主流程继续
        }
    }

    // ==================== 保留原有方法 ====================

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
                llmSupport: !!this.llmController,
                ...platformConfig.features
            }
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
                    group: (account as any).group || null,
                    status: 'stopped',
                    debugPort: null,
                    url: null,
                    tabsCount: 0,
                    chromeVersion: null,
                    lastActive: (account as any).lastActive || null,
                    createdAt: account.createdAt || null,
                    config: account.config || {}
                };

                // 获取实时状态
                if (instance) {
                    browserInfo.status = instance.status === 'running' ? 'running' : 'stopped';
                    const port = this.windowManager.getChromeDebugPort(account.id);
                    browserInfo.debugPort = port;

                    // 如果有端口，验证Chrome实例并获取标签页信息
                    if (port) {
                        try {
                            const validation = await this.validateChromeInstance(port);
                            if (validation.isRunning) {
                                browserInfo.tabsCount = validation.tabs || 0;
                                browserInfo.chromeVersion = validation.version?.Browser || null;
                                browserInfo.url = validation.currentUrl || null;
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
            const wsUrl = this.platformAdapter.formatWebSocketURL('localhost', port, `/devtools/page/${tabId}`);
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
            const wsUrl = this.platformAdapter.formatWebSocketURL('localhost', port, `/devtools/page/${tabId}`);
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
                tabs: tabs.filter((tab: any) => tab.type === 'page' && !tab.url.startsWith('chrome://')).length,
                currentUrl: currentUrl
            };
        } catch (error: any) {
            console.error(`[HttpApiServer] > = new Map();

    constructor(windowManager: WindowManager, accountStorage: AccountStorage) {
        this.windowManager = windowManager;
        this.accountStorage = accountStorage;
        this.platformAdapter = PlatformAdapter.getInstance();
    }

    async start(): Promise<void> {
        // 🔧 验证网络配置
        const networkValid = await this.platformAdapter.validateNetworkConfig();
        if (!networkValid) {
            console.warn('[HttpApiServer] ⚠️ 网络配置验证失败，使用备用配置');
        }

        // 🔧 初始化LLM支持
        await this.initializeLLMSupport();

        return new Promise((resolve, reject) => {
            this.server = http.createServer(this.handleRequest.bind(this));

            // 🔧 使用平台适配器的网络配置
            const bindAddress = this.platformAdapter.getHTTPBindAddress();
            
            this.server.listen(this.port, bindAddress, () => {
                const networkMode = this.platformAdapter.shouldUseIPv4Only() ? 'IPv4-only' : 'Auto';
                console.log(`[HttpApiServer] 🚀 HTTP API Server started on http://${bindAddress}:${this.port}`);
                console.log(`[HttpApiServer] 🔧 Platform: ${process.platform}, Network: ${networkMode}`);
                console.log(`[HttpApiServer] 🤖 LLM Support: ${this.llmController ? 'Enabled' : 'Disabled'}`);
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
        // 🔧 清理LLM资源
        await this.cleanupLLMSupport();

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

            // ==================== 🤖 LLM路由处理 ====================
            // LLM标签页管理路由
            if (method === 'POST' && pathname?.match(/^\/api\/llm\/[^/]+\/tabs$/)) {
                const pathParts = pathname.split('/');
                const apiKey = pathParts[3];
                await this.handleCreateLLMTab(req, res, apiKey);
            }
            else if (method === 'GET' && pathname?.match(/^\/api\/llm\/[^/]+\/tabs$/)) {
                const pathParts = pathname.split('/');
                const apiKey = pathParts[3];
                await this.handleListLLMTabs(req, res, apiKey);
            }
            else if (method === 'DELETE' && pathname?.match(/^\/api\/llm\/[^/]+\/tabs\/[^/]+$/)) {
                const pathParts = pathname.split('/');
                const apiKey = pathParts[3];
                const provider = pathParts[5];
                await this.handleCloseLLMTab(req, res, apiKey, provider);
            }
            // LLM对话路由
            else if (method === 'POST' && pathname?.match(/^\/api\/llm\/[^/]+\/chat\/[^/]+$/)) {
                const pathParts = pathname.split('/');
                const apiKey = pathParts[3];
                const provider = pathParts[5];
                await this.handleLLMChat(req, res, apiKey, provider);
            }
            // LLM文件上传路由
            else if (method === 'POST' && pathname?.match(/^\/api\/llm\/[^/]+\/upload\/[^/]+$/)) {
                const pathParts = pathname.split('/');
                const apiKey = pathParts[3];
                const provider = pathParts[5];
                await this.handleLLMUpload(req, res, apiKey, provider);
            }
            // LLM脚本执行路由
            else if (method === 'POST' && pathname?.match(/^\/api\/llm\/[^/]+\/execute\/[^/]+$/)) {
                const pathParts = pathname.split('/');
                const apiKey = pathParts[3];
                const provider = pathParts[5];
                await this.handleLLMExecuteScript(req, res, apiKey, provider);
            }
            // LLM健康检查和状态路由
            else if (method === 'GET' && pathname === '/api/llm/health') {
                await this.handleLLMHealthCheck(req, res);
            }
            else if (method === 'GET' && pathname === '/api/llm/providers') {
                await this.handleLLMProviders(req, res);
            }
            else if (method === 'GET' && pathname?.match(/^\/api\/llm\/[^/]+\/status$/)) {
                const pathParts = pathname.split('/');
                const apiKey = pathParts[3];
                await this.handleLLMUserStatus(req, res, apiKey);
            }

            // ==================== 🔧 原有路由处理 ====================
            // 标签页级操作路由
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
            } else if (method === 'DELETE' && pathname?.match(/^\/api\/browser\/[^/]+\/tabs\/[^/]+$/)) {
                const pathParts = pathname.split('/');
                const accountId = pathParts[3];
                const tabId = pathParts[5];
                await this.handleCloseTab(req, res, accountId, tabId);
            } else if (method === 'GET' && pathname?.match(/^\/api\/browser\/[^/]+\/tabs$/)) {
                const pathParts = pathname.split('/');
                const accountId = pathParts[3];
                await this.handleGetTabs(req, res, accountId);
            } else if (method === 'POST' && pathname?.match(/^\/api\/browser\/[^/]+\/tabs$/)) {
                const pathParts = pathname.split('/');
                const accountId = pathParts[3];
                await this.handleCreateTab(req, res, accountId);
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

    // ==================== 🤖 LLM路由处理方法 ====================

    /**
     * 初始化LLM控制器 - 添加到构造函数中
     */
    private async initializeLLMController() {
        try {
            // 动态导入LLM控制器
            const { LLMController } = await import('../../automation/core/llm-controller.js');
            this.llmController = new LLMController({
                electronApiUrl: `http://localhost:${this.port}`,
                timeout: 30000
            });
            console.log('[LLM] ✅ LLM控制器初始化成功');
        } catch (error) {
            console.warn('[LLM] ⚠️ LLM控制器初始化失败，LLM功能将不可用:', error);
            this.llmController = null;
        }
    }

    /**
     * 创建LLM标签页
     * POST /api/llm/{apiKey}/tabs
     */
    private async handleCreateLLMTab(req: http.IncomingMessage, res: http.ServerResponse, apiKey: string): Promise<void> {
        try {
            if (!this.llmController) {
                res.writeHead(503);
                res.end(JSON.stringify({
                    success: false,
                    error: 'LLM service not available'
                }));
                return;
            }

            console.log(`[LLM] 创建标签页请求: ${apiKey}`);

            const body = await this.readRequestBody(req);
            const { provider, forceNew = false } = JSON.parse(body);

            if (!provider) {
                res.writeHead(400);
                res.end(JSON.stringify({
                    success: false,
                    error: 'Provider is required'
                }));
                return;
            }

            // 验证提供商支持
            const { getLLMConfig } = await import('../../automation/config/llm-platforms.js');
            const llmConfig = getLLMConfig(provider);
            if (!llmConfig) {
                res.writeHead(400);
                res.end(JSON.stringify({
                    success: false,
                    error: `Unsupported LLM provider: ${provider}`
                }));
                return;
            }

            // 如果不强制创建新会话，先检查现有会话
            if (!forceNew) {
                const existingSession = this.llmController.getLLMSession(apiKey, provider);
                if (existingSession) {
                    // 验证现有会话
                    const isValid = await this.llmController.validateLLMSession(existingSession);
                    if (isValid) {
                        console.log(`[LLM] 复用现有会话: ${existingSession.sessionId}`);
                        res.writeHead(200);
                        res.end(JSON.stringify({
                            success: true,
                            sessionId: existingSession.sessionId,
                            provider: provider,
                            tabId: existingSession.tabId,
                            status: 'existing',
                            url: existingSession.llmConfig.urls.chat,
                            createdAt: existingSession.createdAt,
                            lastUsed: existingSession.lastUsed
                        }));
                        return;
                    }
                }
            }

            // 创建新的LLM会话
            const session = await this.llmController.createLLMSession(apiKey, provider);

            res.writeHead(200);
            res.end(JSON.stringify({
                success: true,
                sessionId: session.sessionId,
                provider: provider,
                tabId: session.tabId,
                status: 'created',
                url: session.llmConfig.urls.chat,
                createdAt: session.createdAt,
                config: {
                    name: session.llmConfig.name,
                    features: session.llmConfig.features
                }
            }));

        } catch (error) {
            console.error('[LLM] 创建标签页失败:', error);
            res.writeHead(500);
            res.end(JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error)
            }));
        }
    }

    /**
     * 列出用户的LLM标签页
     * GET /api/llm/{apiKey}/tabs
     */
    private async handleListLLMTabs(req: http.IncomingMessage, res: http.ServerResponse, apiKey: string): Promise<void> {
        try {
            if (!this.llmController) {
                res.writeHead(503);
                res.end(JSON.stringify({
                    success: false,
                    error: 'LLM service not available',
                    tabs: []
                }));
                return;
            }

            console.log(`[LLM] 列出标签页: ${apiKey}`);

            const userSessions = this.llmController.getUserLLMSessions(apiKey);
            const tabs = [];

            for (const [provider, session] of Object.entries(userSessions)) {
                tabs.push({
                    sessionId: session.sessionId,
                    provider: provider,
                    tabId: session.tabId,
                    status: session.status,
                    providerName: session.llmConfig.name,
                    createdAt: session.createdAt,
                    lastUsed: session.lastUsed,
                    messageCount: session.messageCount,
                    url: session.llmConfig.urls.chat
                });
            }

            res.writeHead(200);
            res.end(JSON.stringify({
                success: true,
                tabs: tabs,
                totalTabs: tabs.length,
                apiKey: apiKey
            }));

        } catch (error) {
            console.error('[LLM] 列出标签页失败:', error);
            res.writeHead(500);
            res.end(JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error),
                tabs: []
            }));
        }
    }

    /**
     * 关闭LLM标签页
     * DELETE /api/llm/{apiKey}/tabs/{provider}
     */
    private async handleCloseLLMTab(req: http.IncomingMessage, res: http.ServerResponse, apiKey: string, provider: string): Promise<void> {
        try {
            if (!this.llmController) {
                res.writeHead(503);
                res.end(JSON.stringify({
                    success: false,
                    error: 'LLM service not available'
                }));
                return;
            }

            console.log(`[LLM] 关闭标签页: ${apiKey} - ${provider}`);

            const session = this.llmController.getLLMSession(apiKey, provider);
            if (!session) {
                res.writeHead(404);
                res.end(JSON.stringify({
                    success: false,
                    error: `No session found for ${provider}`
                }));
                return;
            }

            const closed = await this.llmController.closeLLMSession(apiKey, provider);
            
            if (closed) {
                res.writeHead(200);
                res.end(JSON.stringify({
                    success: true,
                    message: `${provider} session closed`,
                    sessionId: session.sessionId
                }));
            } else {
                res.writeHead(500);
                res.end(JSON.stringify({
                    success: false,
                    error: 'Failed to close session'
                }));
            }

        } catch (error) {
            console.error('[LLM] 关闭标签页失败:', error);
            res.writeHead(500);
            res.end(JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error)
            }));
        }
    }

    /**
     * LLM对话处理
     * POST /api/llm/{apiKey}/chat/{provider}
     */
    private async handleLLMChat(req: http.IncomingMessage, res: http.ServerResponse, apiKey: string, provider: string): Promise<void> {
        try {
            if (!this.llmController) {
                res.writeHead(503);
                res.end(JSON.stringify({
                    success: false,
                    error: 'LLM service not available'
                }));
                return;
            }

            console.log(`[LLM] 对话请求: ${apiKey} - ${provider}`);

            const body = await this.readRequestBody(req);
            const { prompt, files, stream = false, newChat = false } = JSON.parse(body);

            if (!prompt && !files) {
                res.writeHead(400);
                res.end(JSON.stringify({
                    success: false,
                    error: 'Prompt or files are required'
                }));
                return;
            }

            // 获取或创建会话
            let session = this.llmController.getLLMSession(apiKey, provider);
            if (!session) {
                console.log(`[LLM] 会话不存在，创建新会话: ${provider}`);
                session = await this.llmController.createLLMSession(apiKey, provider);
            }

            // 验证会话有效性
            const isValid = await this.llmController.validateLLMSession(session);
            if (!isValid) {
                console.log(`[LLM] 会话无效，重新创建: ${session.sessionId}`);
                await this.llmController.closeLLMSession(apiKey, provider);
                session = await this.llmController.createLLMSession(apiKey, provider);
            }

            // 增加消息计数
            session.messageCount++;

            // 设置响应头
            if (stream) {
                res.writeHead(200, {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    'Connection': 'keep-alive',
                    'Access-Control-Allow-Origin': '*'
                });
            }

            // 构建聊天脚本 - 这里需要集成具体的LLM发布器
            const chatScript = await this.buildLLMChatScript(session, {
                prompt,
                files,
                newChat,
                stream
            });

            // 执行聊天脚本
            const result = await this.llmController.executeLLMScript(session, chatScript, {
                awaitPromise: true,
                timeout: session.llmConfig.timing.responseTimeout
            });

            if (stream) {
                // 流式响应处理
                res.write(`data: ${JSON.stringify({
                    type: 'start',
                    sessionId: session.sessionId,
                    provider: provider
                })}\n\n`);

                // 这里需要实现流式响应逻辑
                // 由于WebSocket限制，我们先返回完整响应
                if (result.success) {
                    res.write(`data: ${JSON.stringify({
                        type: 'content',
                        content: result.result,
                        finished: true
                    })}\n\n`);
                } else {
                    res.write(`data: ${JSON.stringify({
                        type: 'error',
                        error: result.error
                    })}\n\n`);
                }

                res.write(`data: [DONE]\n\n`);
                res.end();
            } else {
                // 非流式响应
                if (result.success) {
                    res.writeHead(200);
                    res.end(JSON.stringify({
                        success: true,
                        sessionId: session.sessionId,
                        provider: provider,
                        response: result.result,
                        messageCount: session.messageCount,
                        timing: {
                            respondedAt: Date.now()
                        }
                    }));
                } else {
                    res.writeHead(500);
                    res.end(JSON.stringify({
                        success: false,
                        error: result.error,
                        sessionId: session.sessionId
                    }));
                }
            }

        } catch (error) {
            console.error('[LLM] 对话处理失败:', error);
            if (!res.headersSent) {
                res.writeHead(500);
                res.end(JSON.stringify({
                    success: false,
                    error: error instanceof Error ? error.message : String(error)
                }));
            }
        }
    }

    /**
     * LLM文件上传
     * POST /api/llm/{apiKey}/upload/{provider}
     */
    private async handleLLMUpload(req: http.IncomingMessage, res: http.ServerResponse, apiKey: string, provider: string): Promise<void> {
        try {
            if (!this.llmController) {
                res.writeHead(503);
                res.end(JSON.stringify({
                    success: false,
                    error: 'LLM service not available'
                }));
                return;
            }

            console.log(`[LLM] 文件上传: ${apiKey} - ${provider}`);

            const body = await this.readRequestBody(req);
            const { fileName, base64Data, mimeType } = JSON.parse(body);

            if (!fileName || !base64Data || !mimeType) {
                res.writeHead(400);
                res.end(JSON.stringify({
                    success: false,
                    error: 'fileName, base64Data, and mimeType are required'
                }));
                return;
            }

            // 获取会话
            const session = this.llmController.getLLMSession(apiKey, provider);
            if (!session) {
                res.writeHead(404);
                res.end(JSON.stringify({
                    success: false,
                    error: `No session found for ${provider}`
                }));
                return;
            }

            // 上传文件
            const uploadResult = await this.llmController.uploadFileToLLM(
                session, 
                fileName, 
                base64Data, 
                mimeType
            );

            if (uploadResult.success) {
                res.writeHead(200);
                res.end(JSON.stringify({
                    success: true,
                    sessionId: session.sessionId,
                    provider: provider,
                    fileName: uploadResult.fileName,
                    fileSize: uploadResult.fileSize,
                    uploadedAt: uploadResult.uploadedAt
                }));
            } else {
                res.writeHead(500);
                res.end(JSON.stringify({
                    success: false,
                    error: uploadResult.error,
                    sessionId: session.sessionId
                }));
            }

        } catch (error) {
            console.error('[LLM] 文件上传失败:', error);
            res.writeHead(500);
            res.end(JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error)
            }));
        }
    }

    /**
     * LLM脚本执行
     * POST /api/llm/{apiKey}/execute/{provider}
     */
    private async handleLLMExecuteScript(req: http.IncomingMessage, res: http.ServerResponse, apiKey: string, provider: string): Promise<void> {
        try {
            if (!this.llmController) {
                res.writeHead(503);
                res.end(JSON.stringify({
                    success: false,
                    error: 'LLM service not available'
                }));
                return;
            }

            console.log(`[LLM] 脚本执行: ${apiKey} - ${provider}`);

            const body = await this.readRequestBody(req);
            const { script, options = {} } = JSON.parse(body);

            if (!script) {
                res.writeHead(400);
                res.end(JSON.stringify({
                    success: false,
                    error: 'Script is required'
                }));
                return;
            }

            // 获取会话
            const session = this.llmController.getLLMSession(apiKey, provider);
            if (!session) {
                res.writeHead(404);
                res.end(JSON.stringify({
                    success: false,
                    error: `No session found for ${provider}`
                }));
                return;
            }

            // 执行脚本
            const result = await this.llmController.executeLLMScript(session, script, options);

            if (result.success) {
                res.writeHead(200);
                res.end(JSON.stringify({
                    success: true,
                    sessionId: session.sessionId,
                    provider: provider,
                    result: result.result,
                    executedAt: Date.now()
                }));
            } else {
                res.writeHead(500);
                res.end(JSON.stringify({
                    success: false,
                    error: result.error,
                    sessionId: session.sessionId
                }));
            }

        } catch (error) {
            console.error('[LLM] 脚本执行失败:', error);
            res.writeHead(500);
            res.end(JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error)
            }));
        }
    }

    /**
     * LLM健康检查
     * GET /api/llm/health
     */
    private async handleLLMHealthCheck(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
        try {
            if (!this.llmController) {
                res.writeHead(503);
                res.end(JSON.stringify({
                    success: false,
                    error: 'LLM service not available',
                    service: 'LLM CDP Service',
                    timestamp: new Date().toISOString()
                }));
                return;
            }

            const debugInfo = await this.llmController.getLLMDebugInfo();
            const { getSupportedLLMProviders, getLLMProvidersStats } = await import('../../automation/config/llm-platforms.js');
            
            const providersStats = getLLMProvidersStats();
            const supportedProviders = getSupportedLLMProviders();

            res.writeHead(200);
            res.end(JSON.stringify({
                success: true,
                service: 'LLM CDP Service',
                timestamp: new Date().toISOString(),
                api: {
                    available: debugInfo.apiAvailable,
                    endpoint: debugInfo.apiEndpoint
                },
                sessions: {
                    total: debugInfo.totalSessions,
                    active: debugInfo.activeSessions,
                    lastActivity: debugInfo.lastActivity
                },
                providers: {
                    supported: supportedProviders.map(p => ({
                        id: p.id,
                        name: p.name,
                        status: p.status,
                        features: p.features
                    })),
                    statistics: providersStats,
                    distribution: debugInfo.providerDistribution
                },
                platform: {
                    os: process.platform,
                    arch: process.arch,
                    nodeVersion: process.version
                }
            }));

        } catch (error) {
            console.error('[LLM] 健康检查失败:', error);
            res.writeHead(500);
            res.end(JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error),
                service: 'LLM CDP Service',
                timestamp: new Date().toISOString()
            }));
        }
    }

    /**
     * LLM提供商列表
     * GET /api/llm/providers
     */
    private async handleLLMProviders(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
        try {
            const { getSupportedLLMProviders, getAvailableLLMProviders } = await import('../../automation/config/llm-platforms.js');
            
            const allProviders = getSupportedLLMProviders();
            const availableProviders = getAvailableLLMProviders();

            res.writeHead(200);
            res.end(JSON.stringify({
                success: true,
                providers: allProviders.map(provider => ({
                    id: provider.id,
                    name: provider.name,
                    icon: provider.icon,
                    provider: provider.provider,
                    status: provider.status,
                    features: provider.features,
                    timing: provider.timing,
                    urls: {
                        base: provider.urls.base,
                        chat: provider.urls.chat
                    }
                })),
                available: availableProviders.map(p => p.id),
                total: allProviders.length,
                availableCount: availableProviders.length
            }));

        } catch (error) {
            console.error('[LLM] 获取提供商列表失败:', error);
            res.writeHead(500);
            res.end(JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error),
                providers: []
            }));
        }
    }

    /**
     * 用户LLM状态
     * GET /api/llm/{apiKey}/status
     */
    private async handleLLMUserStatus(req: http.IncomingMessage, res: http.ServerResponse, apiKey: string): Promise<void> {
        try {
            if (!this.llmController) {
                res.writeHead(503);
                res.end(JSON.stringify({
                    success: false,
                    error: 'LLM service not available'
                }));
                return;
            }

            console.log(`[LLM] 用户状态查询: ${apiKey}`);

            const userSessions = this.llmController.getUserLLMSessions(apiKey);
            const status = {
                apiKey: apiKey,
                activeSessions: Object.keys(userSessions).length,
                sessions: {},
                totalMessages: 0,
                lastActivity: null
            };

            let mostRecentActivity = 0;

            for (const [provider, session] of Object.entries(userSessions)) {
                status.sessions[provider] = {
                    sessionId: session.sessionId,
                    status: session.status,
                    createdAt: session.createdAt,
                    lastUsed: session.lastUsed,
                    messageCount: session.messageCount,
                    providerName: session.llmConfig.name,
                    debugPort: session.debugPort,
                    tabId: session.tabId
                };

                status.totalMessages += session.messageCount;
                if (session.lastUsed > mostRecentActivity) {
                    mostRecentActivity = session.lastUsed;
                }
            }

            status.lastActivity = mostRecentActivity ? new Date(mostRecentActivity).toISOString() : null;

            res.writeHead(200);
            res.end(JSON.stringify({
                success: true,
                status: status,
                timestamp: new Date().toISOString()
            }));

        } catch (error) {
            console.error('[LLM] 用户状态查询失败:', error);
            res.writeHead(500);
            res.end(JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error)
            }));
        }
    }

    // ==================== 🤖 LLM辅助方法 ====================

    /**
     * 构建LLM聊天脚本
     * @param {Object} session - LLM会话
     * @param {Object} chatData - 聊天数据
     * @returns {string} JavaScript脚本
     */
    private async buildLLMChatScript(session: any, chatData: any): Promise<string> {
        const { prompt, files, newChat, stream } = chatData;
        const { selectors, timing } = session.llmConfig;

        // 这是一个基础脚本模板，实际实现会根据具体的LLM发布器来生成
        return `
            (async function() {
                const config = ${JSON.stringify(session.llmConfig)};
                const chatData = ${JSON.stringify(chatData)};
                
                try {
                    console.log('[LLM Script] 开始处理聊天请求:', '${session.provider}');
                    
                    // 基础的聊天处理逻辑
                    // 这里需要根据具体的LLM提供商实现不同的逻辑
                    
                    if (chatData.newChat) {
                        console.log('[LLM Script] 开始新对话');
                        // 新对话逻辑
                        const newChatButton = document.querySelector(config.selectors.newChatButton);
                        if (newChatButton) {
                            newChatButton.click();
                            await new Promise(resolve => setTimeout(resolve, 2000));
                        }
                    }
                    
                    if (chatData.files && chatData.files.length > 0) {
                        console.log('[LLM Script] 处理文件上传');
                        // 文件上传逻辑
                        // 这里需要调用具体的文件上传实现
                    }
                    
                    if (chatData.prompt) {
                        console.log('[LLM Script] 发送消息');
                        
                        // 查找输入框
                        const textarea = document.querySelector(config.selectors.promptTextarea);
                        if (!textarea) {
                            throw new Error('未找到输入框');
                        }
                        
                        // 输入消息
                        textarea.focus();
                        textarea.value = chatData.prompt;
                        
                        // 触发输入事件
                        textarea.dispatchEvent(new Event('input', { bubbles: true }));
                        textarea.dispatchEvent(new Event('change', { bubbles: true }));
                        
                        // 等待发送按钮可用
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        
                        // 点击发送按钮
                        const sendButton = document.querySelector(config.selectors.sendButton);
                        if (!sendButton || sendButton.disabled) {
                            throw new Error('发送按钮不可用');
                        }
                        
                        sendButton.click();
                        
                        // 等待响应
                        console.log('[LLM Script] 等待响应...');
                        const startTime = Date.now();
                        const timeout = config.timing.responseTimeout || 120000;
                        
                        while (Date.now() - startTime < timeout) {
                            // 检查响应是否完成
                            const isComplete = document.querySelector(config.selectors.responseComplete.regenerateButton) || 
                                             !document.querySelector(config.selectors.thinkingIndicator);
                            
                            if (isComplete) {
                                console.log('[LLM Script] 响应完成');
                                break;
                            }
                            
                            await new Promise(resolve => setTimeout(resolve, 1000));
                        }
                        
                        // 提取响应内容
                        const responseContainer = document.querySelector(config.selectors.responseContainer);
                        if (responseContainer) {
                            const responseText = responseContainer.textContent || responseContainer.innerText;
                            return {
                                success: true,
                                response: responseText.trim(),
                                provider: '${session.provider}',
                                timestamp: Date.now()
                            };
                        } else {
                            throw new Error('未找到响应内容');
                        }
                    }
                    
                    return {
                        success: true,
                        message: '操作完成',
                        provider: '${session.provider}',
                        timestamp: Date.now()
                    };
                    
                } catch (error) {
                    console.error('[LLM Script] 错误:', error);
                    return {
                        success: false,
                        error: error.message,
                        provider: '${session.provider}',
                        timestamp: Date.now()
                    };
                }
            })()
        `;
    }

    /**
     * 扩展tabSessions以支持LLM会话
     * 在现有的 tabSessions Map 基础上添加LLM支持
     */
    private extendTabSessionsForLLM(): void {
        // 修改现有的 tabSessions 结构以支持LLM类型
        // 原有结构：{sessionKey: {accountId, tabId, platform, createdAt, lastUsed}}
        // 扩展结构：{sessionKey: {accountId, tabId, platform, createdAt, lastUsed, type, provider, llmData}}
        
        // 保存标签页会话时添加类型标识
        const originalSave = this.saveTabSession?.bind(this);
        
        if (originalSave) {
            this.saveTabSession = (sessionKey: string, sessionData: any) => {
                // 扩展会话数据以支持LLM
                const extendedSessionData = {
                    ...sessionData,
                    type: sessionData.type || 'general', // 'general', 'llm', 'automation'
                    provider: sessionData.provider || null, // LLM提供商
                    llmData: sessionData.llmData || null // LLM特定数据
                };
                
                return originalSave(sessionKey, extendedSessionData);
            };
        }
    }

    /**
     * 保存标签页会话（如果不存在则创建）
     */
    private saveTabSession(sessionKey: string, sessionData: any): boolean {
        try {
            this.tabSessions.set(sessionKey, sessionData);
            return true;
        } catch (error) {
            console.error('[HttpApiServer] 保存标签页会话失败:', error);
            return false;
        }
    }

    /**
     * 清理LLM会话 - 添加到现有的清理逻辑中
     */
    private async cleanupLLMSessions(): Promise<{ llmSessions: number; tabSessions: number }> {
        try {
            if (!this.llmController) {
                return { llmSessions: 0, tabSessions: 0 };
            }

            console.log('[LLM] 开始清理LLM会话...');
            
            // 清理过期的LLM会话
            const cleanedCount = await this.llmController.cleanupExpiredLLMSessions();
            
            // 同步更新tabSessions
            const llmSessionKeys = [];
            for (const [sessionKey, sessionData] of this.tabSessions.entries()) {
                if (sessionData.type === 'llm') {
                    // 检查对应的LLM会话是否还存在
                    const llmSession = this.llmController.getLLMSession(sessionData.accountId, sessionData.provider);
                    if (!llmSession) {
                        llmSessionKeys.push(sessionKey);
                    }
                }
            }
            
            // 移除无效的LLM标签页会话
            llmSessionKeys.forEach(sessionKey => {
                this.tabSessions.delete(sessionKey);
            });
            
            console.log(`[LLM] LLM会话清理完成: ${cleanedCount} 个LLM会话, ${llmSessionKeys.length} 个标签页会话`);
            
            return {
                llmSessions: cleanedCount,
                tabSessions: llmSessionKeys.length
            };
            
        } catch (error) {
            console.error('[LLM] LLM会话清理失败:', error);
            return { llmSessions: 0, tabSessions: 0 };
        }
    }

    // ==================== 🤖 启动时集成 ====================

    /**
     * 在 HttpApiServer 启动时初始化LLM支持
     * 添加到 start() 方法中
     */
    private async initializeLLMSupport(): Promise<void> {
        try {
            console.log('[LLM] 初始化LLM支持...');
            
            // 初始化LLM控制器
            await this.initializeLLMController();
            
            // 扩展标签页会话管理
            this.extendTabSessionsForLLM();
            
            // 设置定期清理
            setInterval(() => {
                this.cleanupLLMSessions();
            }, 60 * 60 * 1000); // 每小时清理一次
            
            console.log('[LLM] ✅ LLM支持初始化完成');
            
        } catch (error) {
            console.error('[LLM] ❌ LLM支持初始化失败:', error);
            // 不抛出错误，让主服务继续运行
        }
    }

    /**
     * 在 HttpApiServer 关闭时清理LLM资源
     * 添加到 stop() 方法中
     */
    private async cleanupLLMSupport(): Promise<void> {
        try {
            console.log('[LLM] 清理LLM资源...');
            
            if (this.llmController) {
                await this.llmController.cleanup();
            }
            
            console.log('[LLM] ✅ LLM资源清理完成');
            
        } catch (error) {
            console.error('[LLM] ❌ LLM资源清理失败:', error);
        }
    }