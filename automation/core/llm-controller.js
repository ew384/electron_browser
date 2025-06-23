// automation/core/llm-controller.js - LLM专用控制器
// 复用electron_browser的CDP基础设施，专门处理LLM会话管理

import { ElectronBrowserAPI } from './electron-browser-api.js';
import { getLLMConfig, getLLMPlatformUrl } from '../config/llm-platforms.js';

export class LLMController {
    constructor(config = {}) {
        this.config = {
            electronApiUrl: config.electronApiUrl || 'http://localhost:9528',
            timeout: config.timeout || 30000,
            retryAttempts: config.retryAttempts || 3,
            ...config
        };

        // LLM会话管理 - 独立于视频发布会话
        // 格式: {apiKey: {provider: {sessionId, tabId, handle, status, createdAt, lastUsed}}}
        this.llmSessions = new Map();

        // 复用现有的Electron API
        this.electronAPI = new ElectronBrowserAPI({
            baseUrl: this.config.electronApiUrl,
            timeout: 10000,
            retryAttempts: 2
        });

        // 会话ID计数器
        this.sessionIdCounter = 1;
    }

    // ==================== LLM会话管理 ====================

    /**
     * 创建LLM专用会话
     * @param {string} apiKey - API密钥
     * @param {string} provider - LLM提供商 (claude, chatgpt, qwen, deepseek)
     * @returns {Object} 会话信息
     */
    async createLLMSession(apiKey, provider) {
        console.log(`🤖 创建LLM会话: ${apiKey} - ${provider}`);

        try {
            // 检查是否已有该提供商的会话
            if (this.llmSessions.has(apiKey) && this.llmSessions.get(apiKey)[provider]) {
                const existingSession = this.llmSessions.get(apiKey)[provider];

                // 验证现有会话是否仍然有效
                const isValid = await this.validateLLMSession(existingSession);
                if (isValid) {
                    console.log(`✅ 复用现有LLM会话: ${existingSession.sessionId}`);
                    existingSession.lastUsed = Date.now();
                    return existingSession;
                } else {
                    // 会话无效，清理并创建新会话
                    console.log(`🔄 现有LLM会话无效，创建新会话`);
                    await this.closeLLMSession(apiKey, provider);
                }
            }

            // 获取LLM平台配置
            const llmConfig = getLLMConfig(provider);
            if (!llmConfig) {
                throw new Error(`不支持的LLM提供商: ${provider}`);
            }

            // 获取可用的浏览器实例
            const browserInstance = await this.electronAPI.getBrowserInstanceByAccount(apiKey);
            if (!browserInstance || browserInstance.status !== 'running') {
                throw new Error(`API密钥 ${apiKey} 的浏览器实例未运行`);
            }

            // 为LLM创建专用标签页
            const chatUrl = getLLMPlatformUrl(provider, 'chat');
            const tabResponse = await this.createLLMTab(apiKey, provider, chatUrl);

            if (!tabResponse.success) {
                throw new Error(`创建LLM标签页失败: ${tabResponse.error}`);
            }

            // 创建会话对象
            const sessionId = `llm-${provider}-${apiKey}-${this.sessionIdCounter++}`;
            const session = {
                sessionId: sessionId,
                apiKey: apiKey,
                provider: provider,
                tabId: tabResponse.tabId,
                handle: tabResponse.handle,
                browserInstance: browserInstance,
                debugPort: browserInstance.debugPort,
                status: 'active',
                llmConfig: llmConfig,
                createdAt: Date.now(),
                lastUsed: Date.now(),
                messageCount: 0,
                sessionKey: tabResponse.sessionKey
            };

            // 存储会话
            if (!this.llmSessions.has(apiKey)) {
                this.llmSessions.set(apiKey, {});
            }
            this.llmSessions.get(apiKey)[provider] = session;

            console.log(`✅ LLM会话创建成功: ${sessionId}`);
            return session;

        } catch (error) {
            console.error(`❌ LLM会话创建失败: ${error.message}`);
            throw error;
        }
    }

    /**
     * 创建LLM专用标签页
     * @param {string} apiKey - API密钥
     * @param {string} provider - LLM提供商
     * @param {string} url - 目标URL
     * @returns {Object} 标签页创建结果
     */
    async createLLMTab(apiKey, provider, url) {
        try {
            const response = await this.httpRequest(
                `${this.config.electronApiUrl}/api/browser/${apiKey}/tabs`,
                {
                    method: 'POST',
                    body: JSON.stringify({
                        url: url,
                        platform: provider,
                        type: 'llm'
                    })
                }
            );

            if (!response.success) {
                throw new Error(response.error);
            }

            // 等待页面加载完成
            await this.delay(3000);

            return {
                success: true,
                tabId: response.tabId,
                handle: response.tabId, // 在HTTP API中，tabId就是handle
                sessionKey: response.sessionKey || `${apiKey}-${response.tabId}`,
                url: url
            };

        } catch (error) {
            console.error(`❌ 创建LLM标签页失败: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * 验证LLM会话是否有效
     * @param {Object} session - 会话对象
     * @returns {boolean} 是否有效
     */
    async validateLLMSession(session) {
        try {
            // 检查会话是否过期（24小时）
            const maxAge = 24 * 60 * 60 * 1000; // 24小时
            if (Date.now() - session.createdAt > maxAge) {
                console.log(`⏰ LLM会话已过期: ${session.sessionId}`);
                return false;
            }

            // 检查标签页是否仍然存在
            const testScript = 'return window.location.href';
            const result = await this.executeLLMScript(session, testScript);

            if (result && result.success) {
                console.log(`✅ LLM会话验证成功: ${session.sessionId}`);
                return true;
            } else {
                console.log(`❌ LLM会话验证失败: ${session.sessionId}`);
                return false;
            }

        } catch (error) {
            console.log(`❌ LLM会话验证异常: ${error.message}`);
            return false;
        }
    }

    /**
     * 执行LLM脚本
     * @param {Object} session - LLM会话
     * @param {string} script - JavaScript脚本
     * @param {Object} options - 执行选项
     * @returns {Object} 执行结果
     */
    async executeLLMScript(session, script, options = {}) {
        console.log(`📜 执行LLM脚本: ${session.provider} (${session.sessionId})`);

        try {
            const response = await this.httpRequest(
                `${this.config.electronApiUrl}/api/browser/${session.apiKey}/tabs/${session.tabId}/execute-script`,
                {
                    method: 'POST',
                    body: JSON.stringify({
                        script: script,
                        returnByValue: options.returnByValue !== false,
                        awaitPromise: options.awaitPromise || false,
                        timeout: options.timeout || this.config.timeout
                    })
                }
            );

            if (!response.success) {
                throw new Error(response.error);
            }

            // 更新会话使用时间
            session.lastUsed = Date.now();

            return {
                success: true,
                result: response.result
            };

        } catch (error) {
            console.error(`❌ LLM脚本执行失败: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * 导航LLM标签页
     * @param {Object} session - LLM会话
     * @param {string} url - 目标URL
     * @returns {boolean} 是否成功
     */
    async navigateLLMTab(session, url) {
        try {
            console.log(`🔄 导航LLM标签页: ${session.provider} → ${url}`);

            const response = await this.httpRequest(
                `${this.config.electronApiUrl}/api/browser/${session.apiKey}/tabs/${session.tabId}/navigate`,
                {
                    method: 'POST',
                    body: JSON.stringify({ url: url })
                }
            );

            if (!response.success) {
                throw new Error(response.error);
            }

            // 等待页面加载
            await this.delay(3000);
            session.lastUsed = Date.now();

            console.log(`✅ LLM标签页导航成功: ${session.sessionId}`);
            return true;

        } catch (error) {
            console.error(`❌ LLM标签页导航失败: ${error.message}`);
            return false;
        }
    }

    /**
     * 上传文件到LLM
     * @param {Object} session - LLM会话
     * @param {string} fileName - 文件名
     * @param {string} base64Data - Base64编码的文件数据
     * @param {string} mimeType - MIME类型
     * @returns {Object} 上传结果
     */
    async uploadFileToLLM(session, fileName, base64Data, mimeType) {
        console.log(`📤 上传文件到LLM: ${session.provider} - ${fileName}`);

        try {
            // 检查LLM是否支持文件上传
            if (!session.llmConfig.features.supportFileUpload) {
                throw new Error(`${session.llmConfig.name} 不支持文件上传`);
            }

            // 检查文件大小限制
            const fileSize = base64Data.length * 0.75; // 粗略计算实际文件大小
            if (fileSize > session.llmConfig.features.maxFileSize) {
                throw new Error(`文件 ${fileName} 超过大小限制 (${session.llmConfig.features.maxFileSize / 1024 / 1024}MB)`);
            }

            // 检查文件类型支持
            const supportedTypes = session.llmConfig.features.supportedFileTypes;
            const isSupported = supportedTypes.some(type => {
                if (type.endsWith('/*')) {
                    return mimeType.startsWith(type.slice(0, -1));
                }
                return mimeType === type;
            });

            if (!isSupported) {
                throw new Error(`文件类型 ${mimeType} 不支持，支持的类型: ${supportedTypes.join(', ')}`);
            }

            const response = await this.httpRequest(
                `${this.config.electronApiUrl}/api/browser/${session.apiKey}/tabs/${session.tabId}/upload-file`,
                {
                    method: 'POST',
                    body: JSON.stringify({
                        fileName: fileName,
                        base64Data: base64Data,
                        mimeType: mimeType,
                        selector: session.llmConfig.selectors.fileInput
                    })
                }
            );

            if (!response.success) {
                throw new Error(response.error);
            }

            session.lastUsed = Date.now();
            console.log(`✅ 文件上传成功: ${fileName}`);

            return {
                success: true,
                fileName: fileName,
                fileSize: fileSize,
                uploadedAt: Date.now()
            };

        } catch (error) {
            console.error(`❌ 文件上传失败: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * 关闭LLM会话
     * @param {string} apiKey - API密钥
     * @param {string} provider - LLM提供商
     * @returns {boolean} 是否成功关闭
     */
    async closeLLMSession(apiKey, provider) {
        try {
            if (!this.llmSessions.has(apiKey) || !this.llmSessions.get(apiKey)[provider]) {
                console.log(`⚠️ LLM会话不存在: ${apiKey} - ${provider}`);
                return true;
            }

            const session = this.llmSessions.get(apiKey)[provider];
            console.log(`🔌 关闭LLM会话: ${session.sessionId}`);

            // 关闭标签页
            try {
                await this.httpRequest(
                    `${this.config.electronApiUrl}/api/browser/${session.apiKey}/tabs/${session.tabId}`,
                    { method: 'DELETE' }
                );
                console.log(`✅ LLM标签页已关闭: ${session.tabId}`);
            } catch (error) {
                console.warn(`⚠️ 关闭LLM标签页失败: ${error.message}`);
            }

            // 从会话映射中移除
            delete this.llmSessions.get(apiKey)[provider];

            // 如果该用户没有其他LLM会话，移除整个条目
            if (Object.keys(this.llmSessions.get(apiKey)).length === 0) {
                this.llmSessions.delete(apiKey);
            }

            console.log(`✅ LLM会话已清理: ${session.sessionId}`);
            return true;

        } catch (error) {
            console.error(`❌ 关闭LLM会话失败: ${error.message}`);
            return false;
        }
    }

    /**
     * 获取LLM会话
     * @param {string} apiKey - API密钥
     * @param {string} provider - LLM提供商
     * @returns {Object|null} 会话对象或null
     */
    getLLMSession(apiKey, provider) {
        if (!this.llmSessions.has(apiKey)) {
            return null;
        }
        return this.llmSessions.get(apiKey)[provider] || null;
    }

    /**
     * 获取用户的所有LLM会话
     * @param {string} apiKey - API密钥
     * @returns {Object} 用户的LLM会话
     */
    getUserLLMSessions(apiKey) {
        return this.llmSessions.get(apiKey) || {};
    }

    /**
     * 获取所有LLM会话
     * @returns {Array} 所有LLM会话列表
     */
    getAllLLMSessions() {
        const allSessions = [];
        for (const [apiKey, userSessions] of this.llmSessions.entries()) {
            for (const [provider, session] of Object.entries(userSessions)) {
                allSessions.push({
                    ...session,
                    userApiKey: apiKey,
                    providerName: provider
                });
            }
        }
        return allSessions;
    }

    /**
     * 清理过期的LLM会话
     * @param {number} maxAge - 最大存活时间（毫秒），默认24小时
     * @returns {number} 清理的会话数量
     */
    async cleanupExpiredLLMSessions(maxAge = 24 * 60 * 60 * 1000) {
        console.log('🧹 开始清理过期的LLM会话...');

        let cleanedCount = 0;
        const now = Date.now();

        for (const [apiKey, userSessions] of this.llmSessions.entries()) {
            const providersToRemove = [];

            for (const [provider, session] of Object.entries(userSessions)) {
                if (now - session.createdAt > maxAge || now - session.lastUsed > maxAge) {
                    console.log(`🗑️ 清理过期LLM会话: ${session.sessionId}`);
                    await this.closeLLMSession(apiKey, provider);
                    providersToRemove.push(provider);
                    cleanedCount++;
                }
            }

            // 移除已清理的提供商
            providersToRemove.forEach(provider => {
                delete userSessions[provider];
            });

            // 如果用户没有其他会话，移除整个用户条目
            if (Object.keys(userSessions).length === 0) {
                this.llmSessions.delete(apiKey);
            }
        }

        console.log(`✅ LLM会话清理完成，共清理 ${cleanedCount} 个会话`);
        return cleanedCount;
    }

    // ==================== 批量操作 ====================

    /**
     * 批量创建LLM会话
     * @param {Array} requests - 请求列表 [{apiKey, provider}, ...]
     * @returns {Object} 批量创建结果
     */
    async createMultipleLLMSessions(requests) {
        console.log(`🚀 批量创建LLM会话: ${requests.length} 个`);

        const results = await Promise.allSettled(
            requests.map(request =>
                this.createLLMSession(request.apiKey, request.provider)
                    .catch(error => ({ error: error.message, ...request }))
            )
        );

        const successful = results.filter(r => r.status === 'fulfilled' && !r.value.error);
        const failed = results.filter(r => r.status === 'rejected' || r.value.error);

        console.log(`✅ 批量创建完成: 成功 ${successful.length}, 失败 ${failed.length}`);

        return {
            success: successful.length > 0,
            successCount: successful.length,
            failureCount: failed.length,
            results: results.map(r => r.status === 'fulfilled' ? r.value : r.reason),
            timing: {
                completedAt: Date.now()
            }
        };
    }

    /**
     * 批量关闭LLM会话
     * @param {Array} requests - 请求列表 [{apiKey, provider}, ...]
     * @returns {Object} 批量关闭结果
     */
    async closeMultipleLLMSessions(requests) {
        console.log(`🔌 批量关闭LLM会话: ${requests.length} 个`);

        const results = await Promise.allSettled(
            requests.map(request =>
                this.closeLLMSession(request.apiKey, request.provider)
            )
        );

        const successful = results.filter(r => r.status === 'fulfilled' && r.value).length;
        const failed = results.length - successful;

        console.log(`✅ 批量关闭完成: 成功 ${successful}, 失败 ${failed}`);

        return {
            success: successful > 0,
            successCount: successful,
            failureCount: failed
        };
    }

    // ==================== 调试和监控 ====================

    /**
     * 获取LLM调试信息
     * @returns {Object} 调试信息
     */
    async getLLMDebugInfo() {
        const debugInfo = {
            apiAvailable: false,
            apiEndpoint: this.config.electronApiUrl,
            totalSessions: 0,
            activeSessions: 0,
            userSessions: {},
            providerDistribution: {},
            sessionAges: [],
            lastActivity: null
        };

        try {
            // 检查API可用性
            const electronDebugInfo = await this.electronAPI.getDebugInfo();
            debugInfo.apiAvailable = electronDebugInfo.apiAvailable;

            // 统计会话信息
            let mostRecentActivity = 0;

            for (const [apiKey, userSessions] of this.llmSessions.entries()) {
                debugInfo.userSessions[apiKey] = {
                    providers: Object.keys(userSessions),
                    sessionCount: Object.keys(userSessions).length
                };

                for (const [provider, session] of Object.entries(userSessions)) {
                    debugInfo.totalSessions++;

                    if (session.status === 'active') {
                        debugInfo.activeSessions++;
                    }

                    // 统计提供商分布
                    debugInfo.providerDistribution[provider] =
                        (debugInfo.providerDistribution[provider] || 0) + 1;

                    // 记录会话存活时间
                    const age = Date.now() - session.createdAt;
                    debugInfo.sessionAges.push({
                        sessionId: session.sessionId,
                        provider: provider,
                        ageMinutes: Math.round(age / 60000),
                        lastUsedMinutes: Math.round((Date.now() - session.lastUsed) / 60000)
                    });

                    // 记录最近活动时间
                    if (session.lastUsed > mostRecentActivity) {
                        mostRecentActivity = session.lastUsed;
                    }
                }
            }

            debugInfo.lastActivity = mostRecentActivity ? new Date(mostRecentActivity).toISOString() : null;

        } catch (error) {
            debugInfo.error = error.message;
        }

        return debugInfo;
    }

    /**
     * 清理所有LLM会话
     * @returns {boolean} 是否成功
     */
    async cleanup() {
        console.log('🧹 清理所有LLM会话...');

        try {
            const allRequests = [];
            for (const [apiKey, userSessions] of this.llmSessions.entries()) {
                for (const provider of Object.keys(userSessions)) {
                    allRequests.push({ apiKey, provider });
                }
            }

            if (allRequests.length > 0) {
                await this.closeMultipleLLMSessions(allRequests);
            }

            this.llmSessions.clear();
            console.log('✅ 所有LLM会话已清理');
            return true;

        } catch (error) {
            console.error('❌ LLM会话清理失败:', error.message);
            return false;
        }
    }

    // ==================== 工具方法 ====================

    /**
     * HTTP请求工具方法
     * @param {string} url - 请求URL
     * @param {Object} options - 请求选项
     * @returns {Object} 响应数据
     */
    async httpRequest(url, options = {}) {
        const requestOptions = {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            },
            ...options
        };

        try {
            const response = await fetch(url, requestOptions);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            return await response.json();

        } catch (error) {
            console.error(`HTTP请求失败 ${url}:`, error.message);
            throw error;
        }
    }

    /**
     * 延迟工具方法
     * @param {number} ms - 延迟时间（毫秒）
     * @returns {Promise} Promise对象
     */
    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}