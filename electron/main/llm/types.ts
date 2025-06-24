// electron/main/llm/types.ts
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
}

export interface LLMChatRequest {
    prompt?: string;
    files?: string[];
    stream?: boolean;
    newChat?: boolean;
}

export interface LLMChatResponse {
    success: boolean;
    response?: any;
    conversationId?: string;
    provider: string;
    timing?: {
        completedAt: number;
    };
    error?: string;
}

export interface LLMProvider {
    id: string;
    name: string;
    icon: string;
    status: 'stable' | 'testing' | 'planned';
    features: {
        supportFileUpload: boolean;
        supportStreamResponse: boolean;
        maxFileSize: number;
        supportedFileTypes: string[];
    };
}

export interface LLMConfig {
    concurrency: {
        defaultMaxSessions: number;
        userLimits: Record<string, number>;
        enableConcurrencyControl: boolean;
    };
    apiKey: {
        validation: {
            minLength: number;
            requiredPrefixes?: string[];
            allowedPatterns?: string[];
        };
        predefinedUsers: string[];
    };
    features: {
        enableUsageLogging: boolean;
        enableRateLimiting: boolean;
        sessionTimeout: number; // 分钟
    };
}

export interface ApiKeyValidation {
    valid: boolean;
    userType: 'predefined' | 'dynamic' | 'invalid';
    permissions: string[];
    reason?: string;
}

export interface ConcurrencyCheck {
    allowed: boolean;
    currentCount: number;
    maxAllowed: number;
    reason?: string;
}

export interface LLMErrorResponse {
    success: false;
    error: string;
    code: 'INVALID_API_KEY' | 'PROVIDER_NOT_FOUND' | 'SESSION_ERROR' | 'CONCURRENT_LIMIT_EXCEEDED' | 'INTERNAL_ERROR';
    details?: any;
    timestamp: string;
}