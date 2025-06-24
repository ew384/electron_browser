// 类型声明：automation 模块

declare module '../automation/core/llm-controller.js' {
  export interface LLMSession {
    sessionId: string;
    apiKey: string;
    provider: string;
    status: 'active' | 'inactive' | 'error';
    createdAt: number;
    lastUsed: number;
    messageCount: number;
    tabId?: string;
    debugPort?: number;
    llmConfig: any;
  }

  export interface LLMControllerConfig {
    electronApiUrl?: string;
    timeout?: number;
    retryAttempts?: number;
  }

  export class LLMController {
    constructor(config?: LLMControllerConfig);
    createLLMSession(apiKey: string, provider: string): Promise<LLMSession>;
    closeLLMSession(apiKey: string, provider: string): Promise<boolean>;
    getLLMSession(apiKey: string, provider: string): LLMSession | null;
    getUserLLMSessions(apiKey: string): Record<string, LLMSession>;
    getAllLLMSessions(): LLMSession[];
    cleanupExpiredLLMSessions(maxAge?: number): Promise<number>;
    uploadFileToLLM(session: LLMSession, fileName: string, base64Data: string, mimeType: string): Promise<any>;
    getLLMDebugInfo(): Promise<any>;
    cleanup(): Promise<void>;
  }
}

declare module '../automation/config/llm-platforms.js' {
  export interface LLMProvider {
    id: string;
    name: string;
    icon: string;
    provider: string;
    status: 'stable' | 'testing' | 'planned';
    features: {
      supportFileUpload: boolean;
      supportStreamResponse: boolean;
      maxFileSize: number;
      supportedFileTypes: string[];
    };
    urls: {
      base: string;
      chat: string;
      login?: string;
    };
    selectors: Record<string, string>;
    timing: Record<string, number>;
  }

  export interface LLMProvidersStats {
    total: number;
    stable: number;
    testing: number;
    planned: number;
  }

  export function getSupportedLLMProviders(): LLMProvider[];
  export function getLLMProvidersStats(): LLMProvidersStats;
  export function getLLMConfig(providerId: string): LLMProvider | null;
}

declare module '../automation/engines/llm-publishers/claude-llm-publisher.js' {
  export class ClaudeLLMPublisher {
    constructor(session: any, llmController: any);
    sendMessage(prompt?: string, files?: string[], newChat?: boolean, stream?: boolean): Promise<any>;
    handleChatStream(prompt?: string, files?: string[], stream?: boolean, newChat?: boolean): AsyncGenerator<any>;
    checkLoggedIn(): Promise<boolean>;
    handleLogin(): Promise<any>;
    startNewChat(): Promise<boolean>;
    uploadFiles(filePaths?: string[]): Promise<boolean>;
    cleanup(): Promise<void>;
  }
}
