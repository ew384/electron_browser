// electron/main/llm/llm-request-handler.ts - 修复版本
import * as http from 'http';
import * as url from 'url';
import * as path from 'path'; // 添加 path 导入
import { WindowManager } from '../window-manager';
import { AccountStorage } from '../storage/account-storage';
import { LLMConfigManager } from './llm-config-manager';
import { LLMUserManager } from './llm-user-manager';
import { LLMConcurrencyManager } from './llm-concurrency-manager';
import { LLMSessionMapper } from './llm-session-mapper';
import { LLMErrorResponse } from './types';

export class LLMRequestHandler {
    private llmController: any;
    private configManager!: LLMConfigManager; // 使用 ! 断言
    private userManager!: LLMUserManager;
    private concurrencyManager!: LLMConcurrencyManager;
    private sessionMapper!: LLMSessionMapper;
    private isInitialized = false;

    constructor(
        private windowManager: WindowManager,
        private accountStorage: AccountStorage
    ) {
        this.initializeAsync().catch(error => {
            console.error('[LLM RequestHandler] 异步初始化失败:', error);
        });
    }

    private async initializeAsync(): Promise<void> {
        try {
            // 修复配置文件路径
            const configPath = path.join(__dirname, '../llm-config.json');
            this.configManager = new LLMConfigManager(configPath);
            const config = this.configManager.getConfig();

            // 初始化子模块
            this.userManager = new LLMUserManager(config);
            this.concurrencyManager = new LLMConcurrencyManager(config);

            // 动态导入 LLMController - 添加类型断言
            const llmControllerModule = await import('../../../automation/core/llm-controller.js') as any;
            const LLMController = llmControllerModule.LLMController;

            this.llmController = new LLMController({
                electronApiUrl: 'http://localhost:9528',
                timeout: 30000
            });

            this.sessionMapper = new LLMSessionMapper(this.llmController);

            // 预加载发布器（可选）
            await this.sessionMapper.preloadPublishers();

            this.isInitialized = true;
            console.log('[LLM RequestHandler] 初始化完成');
            console.log('[LLM RequestHandler] 配置摘要:', this.configManager.getConfigSummary());

        } catch (error) {
            console.error('[LLM RequestHandler] 初始化失败:', error);
            throw error;
        }
    }

    /**
     * 处理LLM请求的主入口
     */
    async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
        const startTime = Date.now();

        try {
            // 确保已初始化
            if (!this.isInitialized) {
                throw new Error('LLM服务正在初始化中，请稍后重试');
            }

            const parsedUrl = url.parse(req.url || '', true);
            const pathname = parsedUrl.pathname || '';
            const method = req.method || 'GET';

            console.log(`[LLM RequestHandler] ${method} ${pathname}`);

            // 路由分发
            if (method === 'GET' && pathname === '/api/llm/health') {
                await this.handleHealthCheck(req, res);
            } else if (method === 'GET' && pathname === '/api/llm/providers') {
                await this.handleGetProviders(req, res);
            } else if (method === 'GET' && pathname === '/api/llm/stats') {
                await this.handleGetStats(req, res);
            } else if (pathname.match(/^\/api\/llm\/[^/]+\/sessions$/)) {
                const apiKey = this.extractApiKey(pathname);
                if (method === 'POST') {
                    await this.handleCreateSession(req, res, apiKey);
                } else if (method === 'GET') {
                    await this.handleListSessions(req, res, apiKey);
                }
            } else if (pathname.match(/^\/api\/llm\/[^/]+\/sessions\/[^/]+$/)) {
                const { apiKey, provider } = this.extractSessionParams(pathname);
                if (method === 'DELETE') {
                    await this.handleDeleteSession(req, res, apiKey, provider);
                }
            } else if (pathname.match(/^\/api\/llm\/[^/]+\/chat\/[^/]+$/)) {
                const { apiKey, provider } = this.extractChatParams(pathname);
                await this.handleChat(req, res, apiKey, provider);
            } else if (pathname.match(/^\/api\/llm\/[^/]+\/upload\/[^/]+$/)) {
                const { apiKey, provider } = this.extractUploadParams(pathname);
                await this.handleUpload(req, res, apiKey, provider);
            } else if (method === 'GET' && pathname === '/api/llm/admin/cleanup') {
                await this.handleAdminCleanup(req, res);
            } else if (method === 'GET' && pathname === '/api/llm/admin/concurrency') {
                await this.handleAdminConcurrency(req, res);
            } else {
                this.sendNotFound(res);
            }

        } catch (error) {
            await this.handleError(res, error);
        } finally {
            const duration = Date.now() - startTime;
            console.log(`[LLM RequestHandler] 请求完成，耗时: ${duration}ms`);
        }
    }

    // ==================== 系统级接口 ====================

    private async handleHealthCheck(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
        try {
            const debugInfo = await this.llmController.getLLMDebugInfo();
            const concurrencyStatus = this.concurrencyManager.getSystemStatus();

            res.writeHead(200);
            res.end(JSON.stringify({
                success: true,
                service: 'LLM Gateway',
                timestamp: new Date().toISOString(),
                version: '1.0.0',
                status: 'healthy',
                llm: debugInfo,
                concurrency: concurrencyStatus,
                infrastructure: {
                    windowManager: !!this.windowManager,
                    accountStorage: !!this.accountStorage,
                    llmController: !!this.llmController,
                    initialized: this.isInitialized
                },
                config: this.configManager.getConfigSummary()
            }));
        } catch (error) {
            await this.handleError(res, error);
        }
    }

    private async handleGetProviders(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
        try {
            // 导入LLM平台配置 - 添加类型断言
            const llmPlatformsModule = await import('../../../automation/config/llm-platforms.js') as any;
            const { getSupportedLLMProviders, getLLMProvidersStats } = llmPlatformsModule;

            const providers = getSupportedLLMProviders();
            const stats = getLLMProvidersStats();
            const supportedProviders = this.sessionMapper.getSupportedProviders();

            res.writeHead(200);
            res.end(JSON.stringify({
                success: true,
                providers: providers.map((p: any) => ({
                    id: p.id,
                    name: p.name,
                    icon: p.icon,
                    status: p.status,
                    features: p.features,
                    implemented: supportedProviders.includes(p.id)
                })),
                statistics: stats,
                implementation: {
                    supportedProviders,
                    totalSupported: supportedProviders.length,
                    totalAvailable: providers.length
                },
                timestamp: new Date().toISOString()
            }));
        } catch (error) {
            await this.handleError(res, error);
        }
    }

    private async handleGetStats(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
        try {
            const concurrencyStatus = this.concurrencyManager.getSystemStatus();
            const userStats = this.userManager.getUserStats();
            const cacheStatus = this.sessionMapper.getCacheStatus();

            res.writeHead(200);
            res.end(JSON.stringify({
                success: true,
                stats: {
                    concurrency: concurrencyStatus,
                    users: userStats,
                    cache: cacheStatus,
                    system: {
                        uptime: process.uptime(),
                        memoryUsage: process.memoryUsage(),
                        platform: process.platform
                    }
                },
                timestamp: new Date().toISOString()
            }));
        } catch (error) {
            await this.handleError(res, error);
        }
    }

    // ==================== 会话管理接口 ====================

    private async handleCreateSession(req: http.IncomingMessage, res: http.ServerResponse, apiKey: string): Promise<void> {
        try {
            // 1. API密钥验证
            const keyValidation = this.userManager.validateApiKey(apiKey);
            if (!keyValidation.valid) {
                this.sendErrorResponse(res, 401, 'INVALID_API_KEY', keyValidation.reason || 'Invalid API key');
                return;
            }

            // 2. 并发限制检查
            const concurrencyCheck = this.concurrencyManager.canCreateSession(apiKey);
            if (!concurrencyCheck.allowed) {
                this.sendErrorResponse(res, 429, 'CONCURRENT_LIMIT_EXCEEDED', concurrencyCheck.reason!, {
                    currentSessions: concurrencyCheck.currentCount,
                    maxAllowed: concurrencyCheck.maxAllowed
                });
                return;
            }

            const body = await this.readRequestBody(req);
            const { provider, forceNew = false } = JSON.parse(body);

            if (!provider) {
                this.sendErrorResponse(res, 400, 'PROVIDER_NOT_FOUND', 'Provider is required');
                return;
            }

            // 3. 检查提供商支持
            if (!this.sessionMapper.isProviderSupported(provider)) {
                this.sendErrorResponse(res, 400, 'PROVIDER_NOT_FOUND', `Provider '${provider}' is not supported`);
                return;
            }

            // 4. 创建LLM会话
            const session = await this.llmController.createLLMSession(apiKey, provider);

            // 5. 注册并发控制
            const registered = this.concurrencyManager.registerSession(apiKey, session.sessionId, provider);
            if (!registered) {
                // 理论上不会到这里，但防御性编程
                await this.llmController.closeLLMSession(apiKey, provider);
                throw new Error('并发注册失败');
            }

            res.writeHead(200);
            res.end(JSON.stringify({
                success: true,
                session: {
                    sessionId: session.sessionId,
                    provider: provider,
                    status: session.status,
                    createdAt: session.createdAt,
                    userType: keyValidation.userType,
                    permissions: keyValidation.permissions,
                    concurrency: {
                        current: concurrencyCheck.currentCount + 1,
                        max: concurrencyCheck.maxAllowed
                    },
                    features: session.llmConfig.features
                }
            }));

        } catch (error) {
            await this.handleError(res, error);
        }
    }

    private async handleListSessions(req: http.IncomingMessage, res: http.ServerResponse, apiKey: string): Promise<void> {
        try {
            const keyValidation = this.userManager.validateApiKey(apiKey);
            if (!keyValidation.valid) {
                this.sendErrorResponse(res, 401, 'INVALID_API_KEY', 'Invalid API key');
                return;
            }

            const userSessions = this.llmController.getUserLLMSessions(apiKey);
            const sessions = Object.entries(userSessions).map(([provider, session]: [string, any]) => ({
                sessionId: session.sessionId,
                provider: provider,
                status: session.status,
                createdAt: session.createdAt,
                lastUsed: session.lastUsed,
                messageCount: session.messageCount,
                providerName: session.llmConfig?.name || provider
            }));

            const concurrencyStatus = this.concurrencyManager.getSystemStatus();
            const userConcurrency = concurrencyStatus.userBreakdown.find(u => u.apiKey === apiKey);

            res.writeHead(200);
            res.end(JSON.stringify({
                success: true,
                sessions: sessions,
                total: sessions.length,
                apiKey: apiKey,
                userInfo: this.userManager.getUserInfo(apiKey),
                concurrency: userConcurrency || {
                    apiKey,
                    activeSessions: 0,
                    maxSessions: this.getMaxSessionsForUser(apiKey), // 修复：使用本地方法
                    sessions: []
                }
            }));
        } catch (error) {
            await this.handleError(res, error);
        }
    }

    private async handleDeleteSession(req: http.IncomingMessage, res: http.ServerResponse, apiKey: string, provider: string): Promise<void> {
        try {
            const keyValidation = this.userManager.validateApiKey(apiKey);
            if (!keyValidation.valid) {
                this.sendErrorResponse(res, 401, 'INVALID_API_KEY', 'Invalid API key');
                return;
            }

            const session = this.llmController.getLLMSession(apiKey, provider);
            if (!session) {
                this.sendErrorResponse(res, 404, 'SESSION_ERROR', 'Session not found');
                return;
            }

            const sessionId = session.sessionId;

            // 关闭LLM会话
            const closed = await this.llmController.closeLLMSession(apiKey, provider);

            if (closed) {
                // 注销并发控制
                this.concurrencyManager.unregisterSession(apiKey, sessionId);

                res.writeHead(200);
                res.end(JSON.stringify({
                    success: true,
                    sessionId: sessionId,
                    provider: provider,
                    message: 'Session closed successfully'
                }));
            } else {
                this.sendErrorResponse(res, 500, 'SESSION_ERROR', 'Failed to close session');
            }

        } catch (error) {
            await this.handleError(res, error);
        }
    }

    // ==================== 对话接口 ====================

    private async handleChat(req: http.IncomingMessage, res: http.ServerResponse, apiKey: string, provider: string): Promise<void> {
        try {
            const keyValidation = this.userManager.validateApiKey(apiKey);
            if (!keyValidation.valid) {
                this.sendErrorResponse(res, 401, 'INVALID_API_KEY', 'Invalid API key');
                return;
            }

            const body = await this.readRequestBody(req);
            const { prompt, files, stream = false, newChat = false } = JSON.parse(body);

            if (!prompt && !files) {
                this.sendErrorResponse(res, 400, 'SESSION_ERROR', 'Prompt or files are required');
                return;
            }

            // 更新会话活动时间
            const session = this.llmController.getLLMSession(apiKey, provider);
            if (session) {
                this.concurrencyManager.updateSessionActivity(session.sessionId);
            }

            if (stream) {
                // 流式响应
                res.writeHead(200, {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    'Connection': 'keep-alive',
                    'Access-Control-Allow-Origin': '*'
                });

                try {
                    const streamResult = this.sessionMapper.handleChatStream(
                        apiKey, provider, { prompt, files, newChat }
                    );

                    for await (const chunk of streamResult) {
                        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
                    }

                    res.write(`data: [DONE]\n\n`);
                    res.end();
                } catch (streamError) {
                    res.write(`data: ${JSON.stringify({
                        type: 'error',
                        error: streamError instanceof Error ? streamError.message : String(streamError)
                    })}\n\n`);
                    res.end();
                }
            } else {
                // 非流式响应
                const result = await this.sessionMapper.handleChat(
                    apiKey, provider, { prompt, files, newChat }
                );

                if (result.success) {
                    res.writeHead(200);
                    res.end(JSON.stringify({
                        success: true,
                        response: result.response,
                        conversationId: result.conversationId,
                        provider: provider,
                        timing: result.timing
                    }));
                } else {
                    this.sendErrorResponse(res, 500, 'SESSION_ERROR', result.error!);
                }
            }
        } catch (error) {
            if (!res.headersSent) {
                await this.handleError(res, error);
            }
        }
    }

    private async handleUpload(req: http.IncomingMessage, res: http.ServerResponse, apiKey: string, provider: string): Promise<void> {
        try {
            const keyValidation = this.userManager.validateApiKey(apiKey);
            if (!keyValidation.valid) {
                this.sendErrorResponse(res, 401, 'INVALID_API_KEY', 'Invalid API key');
                return;
            }

            const body = await this.readRequestBody(req);
            const { fileName, base64Data, mimeType } = JSON.parse(body);

            if (!fileName || !base64Data || !mimeType) {
                this.sendErrorResponse(res, 400, 'SESSION_ERROR', 'fileName, base64Data, and mimeType are required');
                return;
            }

            const result = await this.sessionMapper.handleFileUpload(
                apiKey, provider, { fileName, base64Data, mimeType }
            );

            if (result.success) {
                res.writeHead(200);
                res.end(JSON.stringify({
                    success: true,
                    fileName: result.fileName,
                    fileSize: result.fileSize,
                    provider: provider
                }));
            } else {
                this.sendErrorResponse(res, 500, 'SESSION_ERROR', result.error!);
            }
        } catch (error) {
            await this.handleError(res, error);
        }
    }

    // ==================== 管理接口 ====================

    private async handleAdminCleanup(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
        try {
            const cleanedSessions = this.concurrencyManager.cleanupExpiredSessions();
            const llmCleanup = await this.llmController.cleanupExpiredLLMSessions();

            res.writeHead(200);
            res.end(JSON.stringify({
                success: true,
                cleaned: {
                    concurrencySessions: cleanedSessions,
                    llmSessions: llmCleanup
                },
                timestamp: new Date().toISOString()
            }));
        } catch (error) {
            await this.handleError(res, error);
        }
    }

    private async handleAdminConcurrency(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
        try {
            const status = this.concurrencyManager.getSystemStatus();

            res.writeHead(200);
            res.end(JSON.stringify({
                success: true,
                concurrency: status,
                timestamp: new Date().toISOString()
            }));
        } catch (error) {
            await this.handleError(res, error);
        }
    }

    // ==================== 工具方法 ====================

    private extractApiKey(pathname: string): string {
        const parts = pathname.split('/');
        return parts[3]; // /api/llm/{apiKey}/sessions
    }

    private extractSessionParams(pathname: string): { apiKey: string; provider: string } {
        const parts = pathname.split('/');
        return {
            apiKey: parts[3], // /api/llm/{apiKey}/sessions/{provider}
            provider: parts[5]
        };
    }

    private extractChatParams(pathname: string): { apiKey: string; provider: string } {
        const parts = pathname.split('/');
        return {
            apiKey: parts[3], // /api/llm/{apiKey}/chat/{provider}
            provider: parts[5]
        };
    }

    private extractUploadParams(pathname: string): { apiKey: string; provider: string } {
        const parts = pathname.split('/');
        return {
            apiKey: parts[3], // /api/llm/{apiKey}/upload/{provider}
            provider: parts[5]
        };
    }

    private async readRequestBody(req: http.IncomingMessage): Promise<string> {
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

    private sendNotFound(res: http.ServerResponse): void {
        this.sendErrorResponse(res, 404, 'INTERNAL_ERROR', 'LLM API endpoint not found');
    }

    private sendErrorResponse(res: http.ServerResponse, statusCode: number, code: string, message: string, details?: any): void {
        const errorResponse: LLMErrorResponse = {
            success: false,
            error: message,
            code: code as any,
            details,
            timestamp: new Date().toISOString()
        };

        res.writeHead(statusCode);
        res.end(JSON.stringify(errorResponse));
    }

    private async handleError(res: http.ServerResponse, error: any): Promise<void> {
        console.error('[LLM RequestHandler] Error:', error);

        if (!res.headersSent) {
            this.sendErrorResponse(res, 500, 'INTERNAL_ERROR',
                error instanceof Error ? error.message : String(error)
            );
        }
    }

    // ==================== 私有辅助方法 ====================

    /**
     * 获取用户的最大会话数限制（本地方法，避免访问私有属性）
     */
    private getMaxSessionsForUser(apiKey: string): number {
        const config = this.configManager.getConcurrencyConfig();
        return config.userLimits[apiKey] || config.defaultMaxSessions;
    }

    // ==================== 公共方法 ====================

    /**
     * 获取服务状态
     */
    getServiceStatus(): {
        initialized: boolean;
        components: {
            configManager: boolean;
            userManager: boolean;
            concurrencyManager: boolean;
            sessionMapper: boolean;
            llmController: boolean;
        };
    } {
        return {
            initialized: this.isInitialized,
            components: {
                configManager: !!this.configManager,
                userManager: !!this.userManager,
                concurrencyManager: !!this.concurrencyManager,
                sessionMapper: !!this.sessionMapper,
                llmController: !!this.llmController
            }
        };
    }

    /**
     * 强制用户下线（管理功能）
     */
    async forceUserLogout(apiKey: string): Promise<{
        success: boolean;
        closedSessions: string[];
        error?: string;
    }> {
        try {
            const sessionIds = this.concurrencyManager.forceCloseUserSessions(apiKey);

            // 关闭LLM层的会话
            const userSessions = this.llmController.getUserLLMSessions(apiKey);
            for (const provider of Object.keys(userSessions)) {
                await this.llmController.closeLLMSession(apiKey, provider);
            }

            return {
                success: true,
                closedSessions: sessionIds
            };
        } catch (error) {
            return {
                success: false,
                closedSessions: [],
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    /**
     * 更新用户并发限制（管理功能）
     */
    updateUserConcurrencyLimit(apiKey: string, newLimit: number): void {
        this.concurrencyManager.updateUserSessionLimit(apiKey, newLimit);
        this.configManager.updateConcurrencyLimit(apiKey, newLimit);
    }

    /**
     * 清理资源
     */
    async cleanup(): Promise<void> {
        console.log('[LLM RequestHandler] 开始清理资源...');

        try {
            // 清理所有会话
            if (this.llmController) {
                await this.llmController.cleanup();
            }

            // 清理缓存
            if (this.sessionMapper) {
                this.sessionMapper.clearCache();
            }

            console.log('[LLM RequestHandler] 资源清理完成');
        } catch (error) {
            console.error('[LLM RequestHandler] 资源清理失败:', error);
        }
    }
}