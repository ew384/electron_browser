// automation/types/claude-publisher.d.ts
export interface ClaudeLLMPublisher {
    constructor(session: any, llmController: any);
    sendMessage(prompt: string, files?: string[], newChat?: boolean, stream?: boolean): Promise<any>;
    handleChatStream(prompt: string, files?: string[], stream?: boolean, newChat?: boolean): AsyncGenerator<any>;
    checkLoggedIn(): Promise<boolean>;
    handleLogin(): Promise<any>;
    startNewChat(): Promise<boolean>;
    uploadFiles(filePaths: string[]): Promise<boolean>;
    cleanup(): Promise<void>;
}

export class ClaudeLLMPublisher implements ClaudeLLMPublisher { }