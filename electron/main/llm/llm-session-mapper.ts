// electron/main/llm/llm-session-mapper.ts - 修复版本
import { LLMChatRequest, LLMChatResponse } from './types';

interface LLMController {
    getLLMSession(apiKey: string, provider: string): any;
    createLLMSession(apiKey: string, provider: string): Promise<any>;
}

// Claude 发布器类型声明
interface ClaudePublisher {
    new(session: any, llmController: any): {
        sendMessage(prompt: string, files?: string[], newChat?: boolean, stream?: boolean): Promise<any>;
        handleChatStream(prompt: string, files?: string[], stream?: boolean, newChat?: boolean): AsyncGenerator<any>;
    };
}

export class LLMSessionMapper {
    private publisherCache = new Map<string, ClaudePublisher>();

    constructor(private llmController: LLMController) { }

    /**
     * 处理非流式聊天
     */
    async handleChat(apiKey: string, provider: string, options: LLMChatRequest): Promise<LLMChatResponse> {
        try {
            // 获取或创建会话
            let session = this.llmController.getLLMSession(apiKey, provider);
            if (!session) {
                session = await this.llmController.createLLMSession(apiKey, provider);
            }

            // 获取对应的发布器
            const PublisherClass = await this.getPublisherClass(provider);
            if (!PublisherClass) {
                throw new Error(`Unsupported LLM provider: ${provider}`);
            }

            // 创建发布器实例并发送消息
            const publisher = new PublisherClass(session, this.llmController);
            const result = await publisher.sendMessage(
                options.prompt || '',    // ✅ 确保是 string
                options.files || [],     // ✅ 确保是 string[]
                options.newChat,
                false // 非流式
            );

            if (result.success) {
                session.messageCount++;
                session.lastUsed = Date.now();

                return {
                    success: true,
                    response: result.response,
                    conversationId: result.conversationId,
                    provider: provider,
                    timing: result.timing
                };
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                provider: provider
            };
        }
    }

    /**
     * 处理流式聊天
     */
    async* handleChatStream(apiKey: string, provider: string, options: LLMChatRequest): AsyncGenerator<any, void, unknown> {
        try {
            // 获取或创建会话
            let session = this.llmController.getLLMSession(apiKey, provider);
            if (!session) {
                session = await this.llmController.createLLMSession(apiKey, provider);
            }

            // 获取对应的发布器
            const PublisherClass = await this.getPublisherClass(provider);
            if (!PublisherClass) {
                throw new Error(`Unsupported LLM provider: ${provider}`);
            }
            const prompt = options.prompt || '';  // ✅ 添加这行
            const files = options.files || [];    // ✅ 添加这行
            const newChat = options.newChat || false; // ✅ 添加这行
            // 创建发布器实例并处理流式响应
            const publisher = new PublisherClass(session, this.llmController);

            for await (const chunk of publisher.handleChatStream(
                prompt,
                files,
                true, // 流式
                newChat
            )) {
                yield chunk;
            }

            session.messageCount++;
            session.lastUsed = Date.now();

        } catch (error) {
            yield {
                type: 'error',
                error: error instanceof Error ? error.message : String(error),
                provider: provider
            };
        }
    }

    /**
     * 处理文件上传
     */
    async handleFileUpload(apiKey: string, provider: string, fileData: {
        fileName: string;
        base64Data: string;
        mimeType: string;
    }): Promise<{ success: boolean; error?: string; fileName?: string; fileSize?: number }> {
        try {
            const session = this.llmController.getLLMSession(apiKey, provider);
            if (!session) {
                throw new Error(`No session found for ${provider}`);
            }

            // 这里需要调用 LLMController 的文件上传方法
            // 假设 llmController 有 uploadFileToLLM 方法
            const result = await (this.llmController as any).uploadFileToLLM(
                session,
                fileData.fileName,
                fileData.base64Data,
                fileData.mimeType
            );

            return result;

        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    /**
     * 获取发布器类 - 修复版本，增强错误处理
     */
    private async getPublisherClass(provider: string): Promise<ClaudePublisher | null> {
        // 检查缓存
        if (this.publisherCache.has(provider)) {
            return this.publisherCache.get(provider) || null;
        }

        try {
            let PublisherClass: ClaudePublisher | null = null;

            switch (provider) {
                case 'claude':
                    PublisherClass = await this.importClaudePublisher();
                    break;

                // 将来可以添加其他提供商
                case 'chatgpt':
                    // const chatgptModule = await import('../../../automation/engines/llm-publishers/chatgpt-llm-publisher.js');
                    // PublisherClass = chatgptModule.ChatGPTLLMPublisher;
                    throw new Error('ChatGPT provider not implemented yet');

                case 'qwen':
                    // const qwenModule = await import('../../../automation/engines/llm-publishers/qwen-llm-publisher.js');
                    // PublisherClass = qwenModule.QwenLLMPublisher;
                    throw new Error('Qwen provider not implemented yet');

                default:
                    return null;
            }

            // 缓存发布器类
            if (PublisherClass) {
                this.publisherCache.set(provider, PublisherClass);
            }

            return PublisherClass;

        } catch (error) {
            console.error(`[LLM SessionMapper] 加载发布器失败 ${provider}:`, error);
            return null;
        }
    }

    /**
     * 安全导入 Claude 发布器
     */
    private async importClaudePublisher(): Promise<ClaudePublisher | null> {
        const possiblePaths = [
            '../../../../automation/engines/llm-publishers/claude-llm-publisher.js',
            '../../../../automation/engines/llm-publishers/claude-llm-publisher.mjs'
        ];

        for (const modulePath of possiblePaths) {
            try {
                console.log(`[LLM SessionMapper] 尝试导入 Claude 发布器: ${modulePath}`);
                const claudeModule = await import(modulePath);

                if (claudeModule && claudeModule.ClaudeLLMPublisher) {
                    console.log(`[LLM SessionMapper] 成功导入 Claude 发布器: ${modulePath}`);
                    return claudeModule.ClaudeLLMPublisher as ClaudePublisher;
                } else {
                    console.warn(`[LLM SessionMapper] Claude 发布器类未找到: ${modulePath}`);
                }
            } catch (error) {
                console.warn(`[LLM SessionMapper] Claude 发布器导入失败 ${modulePath}:`,
                    error instanceof Error ? error.message : String(error));
                continue;
            }
        }

        // 如果所有路径都失败，返回模拟的发布器
        console.warn('[LLM SessionMapper] 所有 Claude 发布器导入路径失败，使用模拟发布器');
        return this.getMockClaudePublisher();
    }

    /**
     * 获取模拟的 Claude 发布器（降级方案）
     */
    private getMockClaudePublisher(): ClaudePublisher {
        return class MockClaudePublisher {
            constructor(session: any, llmController: any) {
                console.warn('[Mock Claude Publisher] 使用模拟发布器，功能受限');
            }

            async sendMessage(prompt: string, files?: string[], newChat?: boolean, stream?: boolean): Promise<any> {
                return {
                    success: false,
                    error: 'Claude 发布器不可用，请检查模块路径'
                };
            }

            async* handleChatStream(prompt: string, files?: string[], stream?: boolean, newChat?: boolean): AsyncGenerator<any> {
                yield {
                    type: 'error',
                    error: 'Claude 发布器不可用，请检查模块路径',
                    provider: 'claude'
                };
            }
        } as ClaudePublisher;
    }

    /**
     * 清理缓存
     */
    clearCache(): void {
        this.publisherCache.clear();
        console.log('[LLM SessionMapper] 发布器缓存已清理');
    }

    /**
     * 获取支持的提供商列表
     */
    getSupportedProviders(): string[] {
        return ['claude']; // 目前只支持 Claude
    }

    /**
     * 检查提供商是否受支持
     */
    isProviderSupported(provider: string): boolean {
        return this.getSupportedProviders().includes(provider);
    }

    /**
     * 预加载发布器（可选，用于提高性能）
     */
    async preloadPublishers(): Promise<void> {
        console.log('[LLM SessionMapper] 预加载发布器...');

        const providers = this.getSupportedProviders();
        const loadPromises = providers.map(async (provider) => {
            try {
                await this.getPublisherClass(provider);
                console.log(`[LLM SessionMapper] 预加载完成: ${provider}`);
            } catch (error) {
                console.warn(`[LLM SessionMapper] 预加载失败 ${provider}:`, error);
            }
        });

        await Promise.all(loadPromises);
        console.log('[LLM SessionMapper] 所有发布器预加载完成');
    }

    /**
     * 获取发布器缓存状态
     */
    getCacheStatus(): {
        cachedProviders: string[];
        cacheSize: number;
        loadedSuccessfully: boolean;
    } {
        return {
            cachedProviders: Array.from(this.publisherCache.keys()),
            cacheSize: this.publisherCache.size,
            loadedSuccessfully: this.publisherCache.size > 0
        };
    }
}