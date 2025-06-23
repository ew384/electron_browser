// automation/llm-service/index.js - 独立LLM CDP服务入口
import express from 'express';
import cors from 'cors';
import { LLMController } from '../core/llm-controller.js';
import { getSupportedLLMProviders, getLLMProvidersStats } from '../config/llm-platforms.js';

class LLMServer {
    constructor(config = {}) {
        this.config = {
            port: config.port || 3212,
            electronApiUrl: config.electronApiUrl || 'http://localhost:9528',
            corsOrigin: config.corsOrigin || '*',
            timeout: config.timeout || 30000,
            maxConcurrentSessions: config.maxConcurrentSessions || 20,
            ...config
        };

        this.app = express();
        this.server = null;
        this.llmManager = null;
        this.llmController = null;

        // 统计信息
        this.stats = {
            totalRequests: 0,
            activeRequests: 0,
            errorCount: 0,
            startTime: Date.now()
        };

        this.setupMiddleware();
        this.setupRoutes();
        this.setupErrorHandling();
    }

    // ==================== 服务器初始化 ====================

    setupMiddleware() {
        // CORS配置
        this.app.use(cors({
            origin: this.config.corsOrigin,
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
            credentials: true
        }));

        // JSON解析中间件
        this.app.use(express.json({
            limit: '50mb',
            verify: (req, res, buf) => {
                req.rawBody = buf;
            }
        }));

        // URL编码解析
        this.app.use(express.urlencoded({
            extended: true,
            limit: '50mb'
        }));

        // 请求日志中间件
        this.app.use((req, res, next) => {
            this.stats.totalRequests++;
            this.stats.activeRequests++;

            const startTime = Date.now();
            const originalSend = res.send;

            res.send = function (data) {
                const duration = Date.now() - startTime;
                console.log(`[LLM Server] ${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
                originalSend.call(this, data);
            };

            res.on('finish', () => {
                this.stats.activeRequests--;
                if (res.statusCode >= 400) {
                    this.stats.errorCount++;
                }
            });

            next();
        });

        // API密钥验证中间件
        this.app.use('/api/llm/:apiKey/*', (req, res, next) => {
            const apiKey = req.params.apiKey;
            if (!apiKey || apiKey.length < 4) {
                return res.status(401).json({
                    success: false,
                    error: 'Invalid API key',
                    code: 'INVALID_API_KEY'
                });
            }
            req.validatedApiKey = apiKey;
            next();
        });
    }

    setupRoutes() {
        // ==================== 健康检查和系统信息 ====================

        this.app.get('/api/health', async (req, res) => {
            try {
                const debugInfo = this.llmController ?
                    await this.llmController.getLLMDebugInfo() :
                    { error: 'LLM Controller not initialized' };

                const providersStats = getLLMProvidersStats();
                const uptime = Date.now() - this.stats.startTime;

                res.json({
                    success: true,
                    service: 'LLM CDP Service',
                    version: '1.0.0',
                    timestamp: new Date().toISOString(),
                    uptime: uptime,
                    stats: {
                        ...this.stats,
                        uptimeMs: uptime,
                        uptimeHours: Math.round(uptime / 3600000 * 100) / 100
                    },
                    llm: {
                        controllerAvailable: !!this.llmController,
                        managerAvailable: !!this.llmManager,
                        ...debugInfo
                    },
                    providers: {
                        statistics: providersStats,
                        distribution: debugInfo.providerDistribution || {}
                    },
                    config: {
                        electronApiUrl: this.config.electronApiUrl,
                        maxConcurrentSessions: this.config.maxConcurrentSessions,
                        timeout: this.config.timeout
                    }
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message,
                    service: 'LLM CDP Service'
                });
            }
        });

        this.app.get('/api/providers', async (req, res) => {
            try {
                const providers = getSupportedLLMProviders();
                const stats = getLLMProvidersStats();

                res.json({
                    success: true,
                    providers: providers.map(p => ({
                        id: p.id,
                        name: p.name,
                        icon: p.icon,
                        provider: p.provider,
                        status: p.status,
                        features: p.features,
                        urls: {
                            base: p.urls.base,
                            chat: p.urls.chat
                        }
                    })),
                    statistics: stats,
                    timestamp: new Date().toISOString()
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // ==================== LLM会话管理 ====================

        // 创建LLM会话
        this.app.post('/api/llm/:apiKey/sessions', async (req, res) => {
            try {
                const { apiKey } = req.params;
                const { provider, forceNew = false } = req.body;

                if (!provider) {
                    return res.status(400).json({
                        success: false,
                        error: 'Provider is required'
                    });
                }

                const result = await this.llmManager.createSession(apiKey, provider, { forceNew });

                if (result.success) {
                    res.json({
                        success: true,
                        session: result.session,
                        created: result.created,
                        reused: result.reused
                    });
                } else {
                    res.status(500).json({
                        success: false,
                        error: result.error
                    });
                }
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // 列出用户会话
        this.app.get('/api/llm/:apiKey/sessions', async (req, res) => {
            try {
                const { apiKey } = req.params;
                const sessions = await this.llmManager.getUserSessions(apiKey);

                res.json({
                    success: true,
                    sessions: sessions,
                    total: sessions.length,
                    apiKey: apiKey
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message,
                    sessions: []
                });
            }
        });

        // 删除LLM会话
        this.app.delete('/api/llm/:apiKey/sessions/:provider', async (req, res) => {
            try {
                const { apiKey, provider } = req.params;
                const result = await this.llmManager.closeSession(apiKey, provider);

                if (result.success) {
                    res.json({
                        success: true,
                        message: `${provider} session closed`,
                        sessionId: result.sessionId
                    });
                } else {
                    res.status(404).json({
                        success: false,
                        error: result.error
                    });
                }
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // ==================== LLM对话接口 ====================

        // 发送消息到LLM
        this.app.post('/api/llm/:apiKey/chat/:provider', async (req, res) => {
            try {
                const { apiKey, provider } = req.params;
                const { prompt, files, stream = false, newChat = false } = req.body;

                if (!prompt && !files) {
                    return res.status(400).json({
                        success: false,
                        error: 'Prompt or files are required'
                    });
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
                        const streamGenerator = this.llmManager.chatStream(
                            apiKey,
                            provider,
                            { prompt, files, newChat }
                        );

                        for await (const chunk of streamGenerator) {
                            res.write(`data: ${JSON.stringify(chunk)}\n\n`);
                        }

                        res.write(`data: [DONE]\n\n`);
                        res.end();
                    } catch (streamError) {
                        res.write(`data: ${JSON.stringify({
                            type: 'error',
                            error: streamError.message
                        })}\n\n`);
                        res.end();
                    }
                } else {
                    // 非流式响应
                    const result = await this.llmManager.chat(
                        apiKey,
                        provider,
                        { prompt, files, newChat }
                    );

                    if (result.success) {
                        res.json({
                            success: true,
                            response: result.response,
                            conversationId: result.conversationId,
                            provider: provider,
                            timing: result.timing
                        });
                    } else {
                        res.status(500).json({
                            success: false,
                            error: result.error,
                            provider: provider
                        });
                    }
                }
            } catch (error) {
                if (!res.headersSent) {
                    res.status(500).json({
                        success: false,
                        error: error.message
                    });
                }
            }
        });

        // ==================== 文件上传接口 ====================

        this.app.post('/api/llm/:apiKey/upload/:provider', async (req, res) => {
            try {
                const { apiKey, provider } = req.params;
                const { fileName, base64Data, mimeType } = req.body;

                if (!fileName || !base64Data || !mimeType) {
                    return res.status(400).json({
                        success: false,
                        error: 'fileName, base64Data, and mimeType are required'
                    });
                }

                const result = await this.llmManager.uploadFile(
                    apiKey,
                    provider,
                    { fileName, base64Data, mimeType }
                );

                if (result.success) {
                    res.json({
                        success: true,
                        fileName: result.fileName,
                        fileSize: result.fileSize,
                        uploadedAt: result.uploadedAt,
                        provider: provider
                    });
                } else {
                    res.status(500).json({
                        success: false,
                        error: result.error,
                        provider: provider
                    });
                }
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // ==================== 用户状态和管理 ====================

        this.app.get('/api/llm/:apiKey/status', async (req, res) => {
            try {
                const { apiKey } = req.params;
                const status = await this.llmManager.getUserStatus(apiKey);

                res.json({
                    success: true,
                    status: status,
                    timestamp: new Date().toISOString()
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // ==================== 管理接口 ====================

        this.app.post('/api/admin/cleanup', async (req, res) => {
            try {
                const { maxAge, dryRun = false } = req.body;
                const result = await this.llmManager.cleanup(maxAge, dryRun);

                res.json({
                    success: true,
                    cleaned: result.cleaned,
                    dryRun: dryRun,
                    details: result.details
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        this.app.get('/api/admin/stats', async (req, res) => {
            try {
                const adminStats = await this.llmManager.getAdminStats();
                const uptime = Date.now() - this.stats.startTime;

                res.json({
                    success: true,
                    server: {
                        ...this.stats,
                        uptime: uptime,
                        uptimeHours: Math.round(uptime / 3600000 * 100) / 100
                    },
                    llm: adminStats,
                    timestamp: new Date().toISOString()
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // ==================== 错误处理路由 ====================

        this.app.use('/api/*', (req, res) => {
            res.status(404).json({
                success: false,
                error: 'API endpoint not found',
                path: req.path,
                method: req.method
            });
        });
    }

    setupErrorHandling() {
        // 全局错误处理
        this.app.use((error, req, res, next) => {
            console.error('[LLM Server] Unhandled error:', error);

            this.stats.errorCount++;

            if (!res.headersSent) {
                res.status(500).json({
                    success: false,
                    error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
                    timestamp: new Date().toISOString()
                });
            }
        });

        // 未捕获异常处理
        process.on('uncaughtException', (error) => {
            console.error('[LLM Server] Uncaught exception:', error);
            this.gracefulShutdown('UNCAUGHT_EXCEPTION');
        });

        process.on('unhandledRejection', (reason, promise) => {
            console.error('[LLM Server] Unhandled rejection at:', promise, 'reason:', reason);
            this.gracefulShutdown('UNHANDLED_REJECTION');
        });

        // 优雅关闭信号处理
        process.on('SIGTERM', () => this.gracefulShutdown('SIGTERM'));
        process.on('SIGINT', () => this.gracefulShutdown('SIGINT'));
    }

    // ==================== 服务器生命周期管理 ====================

    async start() {
        try {
            console.log('[LLM Server] 正在启动LLM CDP服务...');

            // 初始化LLM控制器
            this.llmController = new LLMController({
                electronApiUrl: this.config.electronApiUrl,
                timeout: this.config.timeout
            });

            // 初始化LLM管理器
            this.llmManager = new LLMManager(this.llmController, {
                maxConcurrentSessions: this.config.maxConcurrentSessions
            });

            await this.llmManager.initialize();

            // 启动HTTP服务器
            return new Promise((resolve, reject) => {
                this.server = this.app.listen(this.config.port, '0.0.0.0', (error) => {
                    if (error) {
                        reject(error);
                    } else {
                        console.log(`[LLM Server] ✅ LLM CDP服务已启动`);
                        console.log(`[LLM Server] 🌐 监听地址: http://0.0.0.0:${this.config.port}`);
                        console.log(`[LLM Server] 🔗 Electron API: ${this.config.electronApiUrl}`);
                        console.log(`[LLM Server] 📊 最大并发会话: ${this.config.maxConcurrentSessions}`);

                        // 启动定期清理任务
                        this.startMaintenanceTasks();

                        resolve();
                    }
                });

                this.server.on('error', (error) => {
                    if (error.code === 'EADDRINUSE') {
                        console.error(`[LLM Server] ❌ 端口 ${this.config.port} 已被占用`);
                    } else {
                        console.error('[LLM Server] ❌ 服务器启动失败:', error);
                    }
                    reject(error);
                });
            });

        } catch (error) {
            console.error('[LLM Server] ❌ 服务初始化失败:', error);
            throw error;
        }
    }

    startMaintenanceTasks() {
        // 每30分钟清理过期会话
        setInterval(async () => {
            try {
                console.log('[LLM Server] 🧹 执行定期清理任务...');
                const result = await this.llmManager.cleanup();
                if (result.cleaned > 0) {
                    console.log(`[LLM Server] ✅ 清理完成: ${result.cleaned} 个过期会话`);
                }
            } catch (error) {
                console.error('[LLM Server] ❌ 定期清理失败:', error);
            }
        }, 30 * 60 * 1000);

        // 每5分钟输出状态信息
        setInterval(async () => {
            try {
                const debugInfo = await this.llmController.getLLMDebugInfo();
                console.log(`[LLM Server] 📊 活跃会话: ${debugInfo.activeSessions}, 总请求: ${this.stats.totalRequests}, 错误: ${this.stats.errorCount}`);
            } catch (error) {
                // 静默处理状态检查错误
            }
        }, 5 * 60 * 1000);
    }

    async stop() {
        console.log('[LLM Server] 🛑 正在停止LLM CDP服务...');

        try {
            // 停止接受新请求
            if (this.server) {
                await new Promise((resolve) => {
                    this.server.close(() => {
                        console.log('[LLM Server] HTTP服务器已停止');
                        resolve();
                    });
                });
            }

            // 清理LLM资源
            if (this.llmManager) {
                await this.llmManager.cleanup();
                console.log('[LLM Server] LLM管理器已清理');
            }

            if (this.llmController) {
                await this.llmController.cleanup();
                console.log('[LLM Server] LLM控制器已清理');
            }

            console.log('[LLM Server] ✅ LLM CDP服务已停止');

        } catch (error) {
            console.error('[LLM Server] ❌ 服务停止过程中出错:', error);
            throw error;
        }
    }

    async gracefulShutdown(signal) {
        console.log(`[LLM Server] 🚨 收到信号 ${signal}，开始优雅关闭...`);

        try {
            // 设置关闭超时
            const shutdownTimeout = setTimeout(() => {
                console.error('[LLM Server] ⏰ 优雅关闭超时，强制退出');
                process.exit(1);
            }, 10000);

            await this.stop();
            clearTimeout(shutdownTimeout);

            console.log('[LLM Server] ✅ 优雅关闭完成');
            process.exit(0);

        } catch (error) {
            console.error('[LLM Server] ❌ 优雅关闭失败:', error);
            process.exit(1);
        }
    }

    // ==================== 工具方法 ====================

    getServerInfo() {
        const uptime = Date.now() - this.stats.startTime;

        return {
            service: 'LLM CDP Service',
            version: '1.0.0',
            port: this.config.port,
            uptime: uptime,
            stats: this.stats,
            config: {
                electronApiUrl: this.config.electronApiUrl,
                maxConcurrentSessions: this.config.maxConcurrentSessions,
                timeout: this.config.timeout
            },
            environment: {
                nodeVersion: process.version,
                platform: process.platform,
                arch: process.arch
            }
        };
    }
}

// ==================== LLM管理器 ====================

class LLMManager {
    constructor(llmController, config = {}) {
        this.llmController = llmController;
        this.config = {
            maxConcurrentSessions: config.maxConcurrentSessions || 20,
            ...config
        };

        // LLM发布器映射
        this.publishers = new Map();
        this.initializePublishers();
    }

    async initializePublishers() {
        try {
            // 动态导入Claude发布器
            const { ClaudeLLMPublisher } = await import('../engines/llm-publishers/claude-llm-publisher.js');
            this.publishers.set('claude', ClaudeLLMPublisher);

            // 后续可以添加其他LLM发布器
            // const { ChatGPTLLMPublisher } = await import('../engines/llm-publishers/chatgpt-llm-publisher.js');
            // this.publishers.set('chatgpt', ChatGPTLLMPublisher);

            console.log('[LLM Manager] ✅ LLM发布器初始化完成');
        } catch (error) {
            console.error('[LLM Manager] ❌ LLM发布器初始化失败:', error);
            throw error;
        }
    }

    async initialize() {
        console.log('[LLM Manager] 初始化LLM管理器...');
        // 这里可以添加额外的初始化逻辑
        console.log('[LLM Manager] ✅ LLM管理器初始化完成');
    }

    // ==================== 会话管理方法 ====================

    async createSession(apiKey, provider, options = {}) {
        try {
            console.log(`[LLM Manager] 创建会话: ${apiKey} - ${provider}`);

            // 检查并发会话限制
            const userSessions = this.llmController.getUserLLMSessions(apiKey);
            if (Object.keys(userSessions).length >= this.config.maxConcurrentSessions) {
                throw new Error(`已达到最大并发会话数限制: ${this.config.maxConcurrentSessions}`);
            }

            // 创建LLM会话
            const session = await this.llmController.createLLMSession(apiKey, provider);

            return {
                success: true,
                session: {
                    sessionId: session.sessionId,
                    provider: provider,
                    tabId: session.tabId,
                    status: session.status,
                    createdAt: session.createdAt,
                    providerName: session.llmConfig.name,
                    features: session.llmConfig.features
                },
                created: true,
                reused: false
            };

        } catch (error) {
            console.error(`[LLM Manager] 会话创建失败: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async closeSession(apiKey, provider) {
        try {
            const session = this.llmController.getLLMSession(apiKey, provider);
            if (!session) {
                return {
                    success: false,
                    error: `No session found for ${provider}`
                };
            }

            const sessionId = session.sessionId;
            const closed = await this.llmController.closeLLMSession(apiKey, provider);

            if (closed) {
                return {
                    success: true,
                    sessionId: sessionId
                };
            } else {
                return {
                    success: false,
                    error: 'Failed to close session'
                };
            }

        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async getUserSessions(apiKey) {
        try {
            const userSessions = this.llmController.getUserLLMSessions(apiKey);
            const sessions = [];

            for (const [provider, session] of Object.entries(userSessions)) {
                sessions.push({
                    sessionId: session.sessionId,
                    provider: provider,
                    providerName: session.llmConfig.name,
                    status: session.status,
                    createdAt: session.createdAt,
                    lastUsed: session.lastUsed,
                    messageCount: session.messageCount,
                    tabId: session.tabId
                });
            }

            return sessions;

        } catch (error) {
            console.error(`[LLM Manager] 获取用户会话失败: ${error.message}`);
            return [];
        }
    }

    // ==================== 对话处理方法 ====================

    async chat(apiKey, provider, options) {
        try {
            const { prompt, files, newChat } = options;

            // 获取或创建会话
            let session = this.llmController.getLLMSession(apiKey, provider);
            if (!session) {
                const createResult = await this.createSession(apiKey, provider);
                if (!createResult.success) {
                    throw new Error(createResult.error);
                }
                session = this.llmController.getLLMSession(apiKey, provider);
            }

            // 获取对应的LLM发布器
            const PublisherClass = this.publishers.get(provider);
            if (!PublisherClass) {
                throw new Error(`Unsupported LLM provider: ${provider}`);
            }

            // 创建发布器实例并发送消息
            const publisher = new PublisherClass(session, this.llmController);
            const result = await publisher.sendMessage(prompt, files, newChat, false);

            if (result.success) {
                session.messageCount++;
                session.lastUsed = Date.now();

                return {
                    success: true,
                    response: result.response,
                    conversationId: result.conversationId,
                    timing: result.timing
                };
            } else {
                throw new Error(result.error);
            }

        } catch (error) {
            console.error(`[LLM Manager] 对话处理失败: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async* chatStream(apiKey, provider, options) {
        try {
            const { prompt, files, newChat } = options;

            // 获取或创建会话
            let session = this.llmController.getLLMSession(apiKey, provider);
            if (!session) {
                const createResult = await this.createSession(apiKey, provider);
                if (!createResult.success) {
                    throw new Error(createResult.error);
                }
                session = this.llmController.getLLMSession(apiKey, provider);
            }

            // 获取对应的LLM发布器
            const PublisherClass = this.publishers.get(provider);
            if (!PublisherClass) {
                throw new Error(`Unsupported LLM provider: ${provider}`);
            }

            // 创建发布器实例并处理流式响应
            const publisher = new PublisherClass(session, this.llmController);

            for await (const chunk of publisher.handleChatStream(prompt, files, true, newChat)) {
                yield chunk;
            }

            session.messageCount++;
            session.lastUsed = Date.now();

        } catch (error) {
            console.error(`[LLM Manager] 流式对话处理失败: ${error.message}`);
            yield {
                type: 'error',
                error: error.message,
                provider: provider
            };
        }
    }

    // ==================== 其他管理方法 ====================

    async uploadFile(apiKey, provider, fileData) {
        try {
            const session = this.llmController.getLLMSession(apiKey, provider);
            if (!session) {
                throw new Error(`No session found for ${provider}`);
            }

            const { fileName, base64Data, mimeType } = fileData;
            const result = await this.llmController.uploadFileToLLM(
                session,
                fileName,
                base64Data,
                mimeType
            );

            return result;

        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async getUserStatus(apiKey) {
        try {
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
                    providerName: session.llmConfig.name
                };

                status.totalMessages += session.messageCount;
                if (session.lastUsed > mostRecentActivity) {
                    mostRecentActivity = session.lastUsed;
                }
            }

            status.lastActivity = mostRecentActivity ? new Date(mostRecentActivity).toISOString() : null;
            return status;

        } catch (error) {
            return {
                error: error.message
            };
        }
    }

    async cleanup(maxAge = 24 * 60 * 60 * 1000, dryRun = false) {
        try {
            const cleaned = await this.llmController.cleanupExpiredLLMSessions(maxAge);

            return {
                success: true,
                cleaned: cleaned,
                details: {
                    maxAge: maxAge,
                    cleanedSessions: cleaned
                }
            };

        } catch (error) {
            return {
                success: false,
                error: error.message,
                cleaned: 0
            };
        }
    }

    async getAdminStats() {
        try {
            const debugInfo = await this.llmController.getLLMDebugInfo();
            return debugInfo;
        } catch (error) {
            return {
                error: error.message
            };
        }
    }
}

// ==================== 启动服务 ====================

async function startLLMService() {
    try {
        const config = {
            port: process.env.LLM_PORT || 3212,
            electronApiUrl: process.env.ELECTRON_API_URL || 'http://localhost:9528',
            maxConcurrentSessions: parseInt(process.env.MAX_CONCURRENT_SESSIONS) || 20,
            timeout: parseInt(process.env.LLM_TIMEOUT) || 30000
        };

        console.log('[LLM Service] 🚀 启动独立LLM CDP服务...');
        console.log('[LLM Service] 📋 配置:', config);

        const server = new LLMServer(config);
        await server.start();

        console.log('[LLM Service] ✅ LLM CDP服务启动完成');

    } catch (error) {
        console.error('[LLM Service] ❌ 服务启动失败:', error);
        process.exit(1);
    }
}

// 如果直接运行此文件
if (import.meta.url === `file://${process.argv[1]}`) {
    startLLMService();
}

export { LLMServer, LLMManager };