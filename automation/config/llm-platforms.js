// automation/config/llm-platforms.js - LLM平台独立配置
// 完全独立于platforms.js，专门用于LLM服务

export const LLM_PLATFORM_CONFIGS = {
    claude: {
        id: 'claude',
        name: 'Claude AI',
        icon: '🤖',
        provider: 'Anthropic',
        status: 'stable',

        urls: {
            base: 'https://claude.ai',
            chat: 'https://claude.ai/new',
            login: 'https://claude.ai/login',
            api: 'https://claude.ai/api'
        },

        selectors: {
            // 登录检测
            loginButton: 'button:has-text("Log in")',
            loggedInIndicator: 'a[href="/new"]',

            // 聊天界面
            newChatButton: 'a[href="/new"]',
            promptTextarea: '.ProseMirror, div[contenteditable="true"]',
            sendButton: 'button[aria-label*="send" i], button[aria-label*="Send Message"]',
            responseContainer: '[data-message-author-role="assistant"]',
            thinkingIndicator: '[data-testid="conversation-turn-loading"], .animate-pulse',

            // 文件上传
            uploadButton: '[aria-label*="upload" i]',
            fileInput: 'input[type="file"]',
            fileInputAlt: [
                'input[accept*="image"]',
                'input[accept*="*"]',
                '[data-testid="file-upload"] input'
            ],

            // 响应状态检测
            responseComplete: {
                regenerateButton: 'button:contains("Regenerate"), button:contains("重新生成")',
                inputEnabled: 'div.ProseMirror[contenteditable="true"]',
                sendEnabled: 'button[aria-label="Send Message"]:not([disabled])'
            },

            // 内容提取
            codeBlocks: 'pre code',
            codeVersionButtons: 'button.flex.text-left.font-styrene.rounded-xl',
            documentButtons: 'button[class*="font-styrene"][class*="border-0"]',
            responseText: '[data-message-author-role="assistant"] .font-claude-message'
        },

        features: {
            supportFileUpload: true,
            supportNewChat: true,
            supportStreamResponse: true,
            supportCodeBlocks: true,
            supportDocuments: true,
            maxFileSize: 10 * 1024 * 1024, // 10MB
            supportedFileTypes: ['image/*', 'text/*', 'application/pdf'],
            maxTokens: 100000,
            rateLimit: {
                messagesPerHour: 50,
                tokensPerMinute: 8000
            }
        },

        timing: {
            pageLoadTimeout: 30000,
            loginTimeout: 60000,
            responseTimeout: 120000,
            uploadTimeout: 30000,
            retryDelay: 2000,
            maxRetries: 3,
            responseCheckInterval: 2000,
            streamingTimeout: 180000
        },

        errorPatterns: {
            rateLimited: ['rate limit', 'too many requests', '请求过于频繁'],
            authRequired: ['login required', 'authentication', '需要登录'],
            serviceUnavailable: ['service unavailable', '服务不可用', '503'],
            contentBlocked: ['content policy', '内容违规', 'blocked']
        }
    },

    chatgpt: {
        id: 'chatgpt',
        name: 'ChatGPT',
        icon: '💬',
        provider: 'OpenAI',
        status: 'stable',

        urls: {
            base: 'https://chatgpt.com',
            chat: 'https://chatgpt.com',
            login: 'https://chatgpt.com/auth/login',
            api: 'https://chatgpt.com/backend-api'
        },

        selectors: {
            // 登录检测
            loginButton: 'button:has-text("Log in")',
            loggedInIndicator: '[data-testid="profile-button"], .user-avatar',

            // 聊天界面
            newChatButton: '[data-testid="new-chat-button"], button:has-text("New chat")',
            promptTextarea: '#prompt-textarea, [data-testid="prompt-textarea"]',
            sendButton: '[data-testid="send-button"], button[aria-label="Send message"]',
            responseContainer: '[data-message-author-role="assistant"]',
            thinkingIndicator: '.result-streaming, [data-testid="loading"]',

            // 文件上传
            uploadButton: '[data-testid="upload-button"]',
            fileInput: 'input[type="file"]',

            // 响应状态
            responseComplete: {
                regenerateButton: 'button:contains("Regenerate"), [data-testid="regenerate"]',
                inputEnabled: '#prompt-textarea:not([disabled])',
                sendEnabled: '[data-testid="send-button"]:not([disabled])'
            },

            // 内容提取
            codeBlocks: 'pre code',
            responseText: '[data-message-author-role="assistant"] .markdown'
        },

        features: {
            supportFileUpload: true,
            supportNewChat: true,
            supportStreamResponse: true,
            supportCodeBlocks: true,
            supportDocuments: false,
            maxFileSize: 20 * 1024 * 1024, // 20MB
            supportedFileTypes: ['image/*', 'text/*', 'application/pdf', 'application/vnd.openxmlformats-officedocument'],
            maxTokens: 32000,
            rateLimit: {
                messagesPerHour: 100,
                tokensPerMinute: 10000
            }
        },

        timing: {
            pageLoadTimeout: 30000,
            loginTimeout: 60000,
            responseTimeout: 90000,
            uploadTimeout: 45000,
            retryDelay: 3000,
            maxRetries: 3,
            responseCheckInterval: 1500,
            streamingTimeout: 150000
        },

        errorPatterns: {
            rateLimited: ['rate limit', 'too many requests'],
            authRequired: ['login required', 'unauthorized'],
            serviceUnavailable: ['service unavailable', '503'],
            contentBlocked: ['content policy violation', 'unsafe content']
        }
    },

    qwen: {
        id: 'qwen',
        name: '通义千问',
        icon: '🌟',
        provider: 'Alibaba',
        status: 'testing',

        urls: {
            base: 'https://chat.qwen.ai',
            chat: 'https://chat.qwen.ai',
            login: 'https://chat.qwen.ai/login',
            api: 'https://chat.qwen.ai/api'
        },

        selectors: {
            // 登录检测
            loginButton: 'button:has-text("登录"), button:has-text("Login")',
            loggedInIndicator: '.user-info, [data-testid="user-avatar"]',

            // 聊天界面
            newChatButton: '[data-testid="new-chat"], button:contains("新对话")',
            promptTextarea: 'textarea[placeholder*="输入"], #chat-input',
            sendButton: '[data-testid="send"], button[aria-label*="发送"]',
            responseContainer: '.message-assistant, [data-role="assistant"]',
            thinkingIndicator: '.thinking, .loading-dots',

            // 文件上传
            uploadButton: '[data-testid="upload"], .upload-btn',
            fileInput: 'input[type="file"]',

            // 响应状态
            responseComplete: {
                regenerateButton: 'button:contains("重新生成"), [data-testid="regenerate"]',
                inputEnabled: 'textarea:not([disabled])',
                sendEnabled: '[data-testid="send"]:not([disabled])'
            },

            // 内容提取
            codeBlocks: 'pre code, .code-block',
            responseText: '.message-content, .response-text'
        },

        features: {
            supportFileUpload: true,
            supportNewChat: true,
            supportStreamResponse: true,
            supportCodeBlocks: true,
            supportDocuments: true,
            maxFileSize: 15 * 1024 * 1024, // 15MB
            supportedFileTypes: ['image/*', 'text/*', 'application/pdf'],
            maxTokens: 8000,
            rateLimit: {
                messagesPerHour: 80,
                tokensPerMinute: 6000
            }
        },

        timing: {
            pageLoadTimeout: 25000,
            loginTimeout: 45000,
            responseTimeout: 100000,
            uploadTimeout: 40000,
            retryDelay: 2500,
            maxRetries: 3,
            responseCheckInterval: 2000,
            streamingTimeout: 160000
        },

        errorPatterns: {
            rateLimited: ['请求过于频繁', '访问受限', 'rate limit'],
            authRequired: ['请先登录', '登录过期', 'unauthorized'],
            serviceUnavailable: ['服务暂不可用', '系统维护'],
            contentBlocked: ['内容不合规', '违反使用条款']
        }
    },

    deepseek: {
        id: 'deepseek',
        name: 'DeepSeek',
        icon: '🧠',
        provider: 'DeepSeek',
        status: 'testing',

        urls: {
            base: 'https://chat.deepseek.com',
            chat: 'https://chat.deepseek.com',
            login: 'https://chat.deepseek.com/sign_in',
            api: 'https://chat.deepseek.com/api'
        },

        selectors: {
            // 登录检测
            loginButton: 'button:has-text("Sign in"), .login-btn',
            loggedInIndicator: '.user-panel, [data-testid="user-menu"]',

            // 聊天界面
            newChatButton: '[data-testid="new-chat"], .new-chat-btn',
            promptTextarea: 'textarea[placeholder*="Ask"], #message-input',
            sendButton: '[data-testid="send-message"], .send-btn',
            responseContainer: '.assistant-message, [data-role="assistant"]',
            thinkingIndicator: '.generating, .loading',

            // 文件上传
            uploadButton: '.upload-button, [data-testid="file-upload"]',
            fileInput: 'input[type="file"]',

            // 响应状态
            responseComplete: {
                regenerateButton: 'button:contains("Regenerate"), .regenerate-btn',
                inputEnabled: 'textarea:not([disabled])',
                sendEnabled: '.send-btn:not([disabled])'
            },

            // 内容提取
            codeBlocks: 'pre code, .code-container',
            responseText: '.message-content, .assistant-content'
        },

        features: {
            supportFileUpload: false, // 暂不支持文件上传
            supportNewChat: true,
            supportStreamResponse: true,
            supportCodeBlocks: true,
            supportDocuments: false,
            maxFileSize: 0,
            supportedFileTypes: [],
            maxTokens: 4000,
            rateLimit: {
                messagesPerHour: 60,
                tokensPerMinute: 4000
            }
        },

        timing: {
            pageLoadTimeout: 20000,
            loginTimeout: 40000,
            responseTimeout: 80000,
            uploadTimeout: 0, // 不支持上传
            retryDelay: 2000,
            maxRetries: 3,
            responseCheckInterval: 1500,
            streamingTimeout: 120000
        },

        errorPatterns: {
            rateLimited: ['rate limit exceeded', '请求频率过高'],
            authRequired: ['authentication required', '需要登录'],
            serviceUnavailable: ['service temporarily unavailable'],
            contentBlocked: ['content not allowed', '内容受限']
        }
    }
};

// ==================== 工具函数 ====================

/**
 * 获取LLM平台配置
 * @param {string} providerId - 提供商ID
 * @returns {Object|null} 平台配置或null
 */
export function getLLMConfig(providerId) {
    return LLM_PLATFORM_CONFIGS[providerId] || null;
}

/**
 * 获取支持的LLM提供商列表
 * @param {string} status - 状态过滤器（可选）
 * @returns {Array} 提供商列表
 */
export function getSupportedLLMProviders(status = null) {
    const providers = Object.values(LLM_PLATFORM_CONFIGS);
    if (status) {
        return providers.filter(p => p.status === status);
    }
    return providers;
}

/**
 * 获取可用的LLM提供商（排除planned状态）
 * @returns {Array} 可用提供商列表
 */
export function getAvailableLLMProviders() {
    return getSupportedLLMProviders().filter(p => p.status !== 'planned');
}

/**
 * 获取LLM平台URL
 * @param {string} providerId - 提供商ID
 * @param {string} type - URL类型（base, chat, login, api）
 * @returns {string|null} URL或null
 */
export function getLLMPlatformUrl(providerId, type = 'chat') {
    const config = getLLMConfig(providerId);
    return config?.urls?.[type] || null;
}

/**
 * 获取LLM平台选择器
 * @param {string} providerId - 提供商ID
 * @param {string} selectorName - 选择器名称
 * @returns {string|Array|null} 选择器或null
 */
export function getLLMPlatformSelector(providerId, selectorName) {
    const config = getLLMConfig(providerId);
    return config?.selectors?.[selectorName] || null;
}

/**
 * 获取LLM平台定时配置
 * @param {string} providerId - 提供商ID
 * @returns {Object} 定时配置
 */
export function getLLMPlatformTiming(providerId) {
    const config = getLLMConfig(providerId);
    return config?.timing || {
        pageLoadTimeout: 30000,
        responseTimeout: 120000,
        uploadTimeout: 30000,
        retryDelay: 2000,
        maxRetries: 3,
        responseCheckInterval: 2000,
        streamingTimeout: 180000
    };
}

/**
 * 验证LLM消息内容
 * @param {string} providerId - 提供商ID
 * @param {Object} message - 消息对象
 * @returns {Object} 验证结果
 */
export function validateLLMMessage(providerId, message) {
    const config = getLLMConfig(providerId);
    if (!config) {
        return { valid: false, error: `不支持的LLM提供商: ${providerId}` };
    }

    const errors = [];
    const { maxTokens, maxFileSize, supportedFileTypes } = config.features;

    // 验证消息长度
    if (message.prompt && message.prompt.length > maxTokens * 4) { // 粗略估算token
        errors.push(`消息过长，超过${maxTokens}个token限制`);
    }

    // 验证文件上传
    if (message.files && message.files.length > 0) {
        if (!config.features.supportFileUpload) {
            errors.push(`${config.name}不支持文件上传`);
        } else {
            for (const file of message.files) {
                if (file.size > maxFileSize) {
                    errors.push(`文件 ${file.name} 超过大小限制 (${maxFileSize / 1024 / 1024}MB)`);
                }

                const isValidType = supportedFileTypes.some(type => {
                    if (type.endsWith('/*')) {
                        return file.type.startsWith(type.slice(0, -1));
                    }
                    return file.type === type;
                });

                if (!isValidType) {
                    errors.push(`文件 ${file.name} 格式不支持，支持格式: ${supportedFileTypes.join(', ')}`);
                }
            }
        }
    }

    return {
        valid: errors.length === 0,
        errors: errors
    };
}

/**
 * 检查LLM提供商功能支持
 * @param {string} providerId - 提供商ID
 * @param {string} feature - 功能名称
 * @returns {boolean} 是否支持
 */
export function isLLMFeatureSupported(providerId, feature) {
    const config = getLLMConfig(providerId);
    return config?.features?.[feature] || false;
}

/**
 * 获取LLM错误类型
 * @param {string} providerId - 提供商ID
 * @param {string} errorMessage - 错误消息
 * @returns {string} 错误类型
 */
export function categorizeLLMError(providerId, errorMessage) {
    const config = getLLMConfig(providerId);
    if (!config || !errorMessage) return 'unknown';

    const { errorPatterns } = config;
    const message = errorMessage.toLowerCase();

    for (const [category, patterns] of Object.entries(errorPatterns)) {
        if (patterns.some(pattern => message.includes(pattern.toLowerCase()))) {
            return category;
        }
    }

    return 'unknown';
}

/**
 * 获取LLM提供商统计信息
 * @returns {Object} 统计信息
 */
export function getLLMProvidersStats() {
    const providers = Object.values(LLM_PLATFORM_CONFIGS);
    const stats = {
        total: providers.length,
        stable: 0,
        testing: 0,
        planned: 0,
        supportFileUpload: 0,
        supportStreaming: 0,
        supportCodeBlocks: 0
    };

    providers.forEach(provider => {
        stats[provider.status]++;
        if (provider.features.supportFileUpload) stats.supportFileUpload++;
        if (provider.features.supportStreamResponse) stats.supportStreaming++;
        if (provider.features.supportCodeBlocks) stats.supportCodeBlocks++;
    });

    return stats;
}

export default LLM_PLATFORM_CONFIGS;