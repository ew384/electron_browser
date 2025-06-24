// electron/main/llm/llm-session-mapper.ts
import { LLMChatRequest, LLMChatResponse } from './types';

interface LLMController {
    getLLMSession(apiKey: string, provider: string): any;
    createLLMSession(apiKey: string, provider: string): Promise<any>;
}

export class LLMSessionMapper {
    private publisherCache = new Map<string, any>();

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
                options.prompt,
                options.files,
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

            // 创建发布器实例并处理流式响应
            const publisher = new PublisherClass(session, this.llmController);

            for await (const chunk of publisher.handleChatStream(
                options.prompt,
                options.files,
                true, // 流式
                options.newChat
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
     * 获取发布器类
     */
    private async getPublisherClass(provider: string): Promise<any> {
        // 检查缓存
        if (this.publisherCache.has(provider)) {
            return this.publisherCache.get(provider);
        }

        try {
            let PublisherClass;

            switch (provider) {
                case 'claude':
                    const claudeModule = await import('../../../automation/engines/llm-publishers/claude-llm-publisher.js');
                    PublisherClass = claudeModule.ClaudeLLMPublisher;
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
    } {
        return {
            cachedProviders: Array.from(this.publisherCache.keys()),
            cacheSize: this.publisherCache.size
        };
    }
}