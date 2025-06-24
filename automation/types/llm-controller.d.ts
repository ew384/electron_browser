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