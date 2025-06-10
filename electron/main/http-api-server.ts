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
    private commandIdCounter: number = 1; // 🔧 新增：命令ID计数器
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
                const pathParts = pathname.split('/');
                const accountId = pathParts[3];

                if (pathname.endsWith('/tabs')) {
                    await this.handleGetBrowserTabs(req, res, accountId);
                } else if (pathParts.length === 4) {
                    await this.handleGetBrowser(req, res, accountId);
                } else {
                    // 404
                    res.writeHead(404);
                    res.end(JSON.stringify({ success: false, error: 'Not Found' }));
                }
            } else if (method === 'POST' && pathname?.match(/^\/api\/browser\/[^/]+\/execute-script$/)) {
                // 🔧 新增：执行脚本
                const accountId = pathname.split('/')[3];
                await this.handleExecuteScript(req, res, accountId);
            } else if (method === 'POST' && pathname?.match(/^\/api\/browser\/[^/]+\/upload-file$/)) {
                // 🔧 新增：上传文件
                const accountId = pathname.split('/')[3];
                await this.handleUploadFile(req, res, accountId);
            } else if (method === 'POST' && pathname?.match(/^\/api\/browser\/[^/]+\/navigate$/)) {
                // 🔧 新增：导航页面
                const accountId = pathname.split('/')[3];
                await this.handleNavigate(req, res, accountId);
            } else if (method === 'POST' && pathname?.match(/^\/api\/browser\/[^/]+\/wait-for$/)) {
                // 🔧 新增：等待元素
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

    // 🔧 新增：执行脚本的处理器
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

    // 🔧 新增：上传文件的处理器
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

    // 🔧 新增：导航页面的处理器
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

    // 🔧 新增：等待条件的处理器
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

    // 🔧 新增：辅助方法 - 读取请求体
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

    // 🔧 新增：在指定标签页执行脚本
    private async executeScriptInTab(port: number, tabId: string, script: string, options: any = {}): Promise<any> {
        return new Promise((resolve, reject) => {
            const WebSocket = require('ws');
            const ws = new WebSocket(`ws://localhost:${port}/devtools/page/${tabId}`);

            let resolved = false;
            let timeoutId: NodeJS.Timeout;

            const cleanup = () => {
                if (timeoutId) {
                    clearTimeout(timeoutId);
                }
                if (ws.readyState === WebSocket.OPEN) {
                    ws.close();
                }
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
                console.log(`[HttpApiServer] ✅ WebSocket连接成功到标签页: ${tabId}`);

                // 🔧 修复：使用简单的递增整数作为命令ID
                const commandId = this.commandIdCounter++;
                const command = {
                    id: commandId,
                    method: 'Runtime.evaluate',
                    params: {
                        expression: script,
                        returnByValue: options.returnByValue !== false,
                        awaitPromise: options.awaitPromise || false
                    }
                };

                console.log(`[HttpApiServer] 📤 发送CDP命令 (ID: ${commandId}):`, JSON.stringify(command, null, 2));
                ws.send(JSON.stringify(command));

                const messageHandler = (data: any) => {
                    if (resolved) return;

                    try {
                        const response = JSON.parse(data.toString());
                        console.log(`[HttpApiServer] 📥 收到CDP响应:`, JSON.stringify(response, null, 2));

                        if (response.id === commandId) {
                            if (response.error) {
                                console.error(`[HttpApiServer] ❌ CDP命令错误:`, response.error);
                                handleReject(new Error(`CDP Error: ${response.error.message}`));
                            } else {
                                console.log(`[HttpApiServer] ✅ CDP命令成功执行`);
                                handleResolve(response.result);
                            }
                        }
                    } catch (parseError) {
                        console.error(`[HttpApiServer] ❌ JSON解析错误:`, parseError);
                        handleReject(new Error(`Response parse error: ${parseError}`));
                    }
                };

                ws.on('message', messageHandler);
            });

            ws.on('error', (error: any) => {
                console.error(`[HttpApiServer] ❌ WebSocket连接错误:`, error);
                handleReject(new Error(`WebSocket error: ${error.message}`));
            });

            ws.on('close', (code: number, reason: string) => {
                console.log(`[HttpApiServer] 🔌 WebSocket连接已关闭: ${tabId}, code: ${code}, reason: ${reason}`);
                if (!resolved) {
                    handleReject(new Error(`WebSocket closed unexpectedly: ${code} ${reason}`));
                }
            });

            // 设置60秒超时
            timeoutId = setTimeout(() => {
                console.error(`[HttpApiServer] ⏰ 脚本执行超时: ${tabId}`);
                handleReject(new Error('Script execution timeout (60s)'));
            }, 60000);
        });
    }

    // 🔧 修复：sendCDPCommand方法也需要同样的修复
    private async sendCDPCommand(port: number, tabId: string, method: string, params: any = {}): Promise<any> {
        return new Promise((resolve, reject) => {
            const WebSocket = require('ws');
            const ws = new WebSocket(`ws://localhost:${port}/devtools/page/${tabId}`);

            let resolved = false;
            let timeoutId: NodeJS.Timeout;

            const cleanup = () => {
                if (timeoutId) {
                    clearTimeout(timeoutId);
                }
                if (ws.readyState === WebSocket.OPEN) {
                    ws.close();
                }
            };

            ws.on('open', () => {
                // 🔧 修复：使用简单的递增整数作为命令ID
                const commandId = this.commandIdCounter++;
                const command = {
                    id: commandId,
                    method: method,
                    params: params
                };

                console.log(`[HttpApiServer] 📤 发送CDP命令 (${method}, ID: ${commandId}):`, JSON.stringify(command));
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

            // 30秒超时
            timeoutId = setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    cleanup();
                    reject(new Error('CDP command timeout'));
                }
            }, 30000);
        });
    }


    // 🔧 新增：等待条件满足
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

    // 🔧 新增：生成文件上传脚本
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