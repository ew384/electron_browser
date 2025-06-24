// automation/types/llm-platforms.d.ts
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