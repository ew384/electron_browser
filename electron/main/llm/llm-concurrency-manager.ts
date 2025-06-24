// electron/main/llm/llm-concurrency-manager.ts
import { ConcurrencyCheck, LLMConfig } from './types';

export class LLMConcurrencyManager {
    private currentSessions = new Map<string, Set<string>>(); // apiKey -> Set<sessionId>
    private sessionMetadata = new Map<string, {
        apiKey: string;
        provider: string;
        createdAt: number;
        lastUsed: number;
    }>(); // sessionId -> metadata

    constructor(private config: LLMConfig) {
        // 启动定期清理任务
        this.startCleanupTask();
    }

    /**
     * 检查是否可以创建新会话
     */
    canCreateSession(apiKey: string): ConcurrencyCheck {
        if (!this.config.concurrency.enableConcurrencyControl) {
            return {
                allowed: true,
                currentCount: this.getCurrentSessionCount(apiKey),
                maxAllowed: -1 // -1 表示无限制
            };
        }

        const maxSessions = this.getUserSessionLimit(apiKey);
        const currentCount = this.getCurrentSessionCount(apiKey);

        if (currentCount >= maxSessions) {
            return {
                allowed: false,
                currentCount,
                maxAllowed: maxSessions,
                reason: `已达到最大并发会话数限制 (${currentCount}/${maxSessions})`
            };
        }

        return {
            allowed: true,
            currentCount,
            maxAllowed: maxSessions
        };
    }

    /**
     * 注册新会话
     */
    registerSession(apiKey: string, sessionId: string, provider: string): boolean {
        const check = this.canCreateSession(apiKey);
        if (!check.allowed) {
            console.warn(`[LLM Concurrency] 会话注册被拒绝: ${apiKey} - ${check.reason}`);
            return false;
        }

        // 添加到当前会话集合
        if (!this.currentSessions.has(apiKey)) {
            this.currentSessions.set(apiKey, new Set());
        }
        this.currentSessions.get(apiKey)!.add(sessionId);

        // 记录会话元数据
        this.sessionMetadata.set(sessionId, {
            apiKey,
            provider,
            createdAt: Date.now(),
            lastUsed: Date.now()
        });

        console.log(`[LLM Concurrency] 会话已注册: ${apiKey}/${sessionId} (${provider}), 当前会话数: ${this.getCurrentSessionCount(apiKey)}`);
        return true;
    }

    /**
     * 注销会话
     */
    unregisterSession(apiKey: string, sessionId: string): void {
        const userSessions = this.currentSessions.get(apiKey);
        if (userSessions) {
            userSessions.delete(sessionId);
            if (userSessions.size === 0) {
                this.currentSessions.delete(apiKey);
            }
        }

        // 移除会话元数据
        const metadata = this.sessionMetadata.get(sessionId);
        this.sessionMetadata.delete(sessionId);

        console.log(`[LLM Concurrency] 会话已注销: ${apiKey}/${sessionId}, 当前会话数: ${this.getCurrentSessionCount(apiKey)}`);

        if (metadata) {
            const duration = Date.now() - metadata.createdAt;
            console.log(`[LLM Concurrency] 会话持续时间: ${Math.round(duration / 1000)}秒`);
        }
    }

    /**
     * 更新会话最后使用时间
     */
    updateSessionActivity(sessionId: string): void {
        const metadata = this.sessionMetadata.get(sessionId);
        if (metadata) {
            metadata.lastUsed = Date.now();
        }
    }

    /**
     * 获取用户当前会话数
     */
    getCurrentSessionCount(apiKey: string): number {
        return this.currentSessions.get(apiKey)?.size || 0;
    }

    /**
     * 获取用户会话限制
     */
    private getUserSessionLimit(apiKey: string): number {
        // 检查用户特定限制
        const userLimit = this.config.concurrency.userLimits[apiKey];
        if (userLimit !== undefined) {
            return userLimit;
        }

        // 使用默认限制
        return this.config.concurrency.defaultMaxSessions;
    }

    /**
     * 获取系统状态
     */
    getSystemStatus(): {
        totalUsers: number;
        totalActiveSessions: number;
        concurrencyEnabled: boolean;
        userBreakdown: Array<{
            apiKey: string;
            activeSessions: number;
            maxSessions: number;
            sessions: Array<{
                sessionId: string;
                provider: string;
                createdAt: number;
                lastUsed: number;
                duration: number;
            }>;
        }>;
    } {
        const userBreakdown = Array.from(this.currentSessions.entries()).map(([apiKey, sessionIds]) => {
            const sessions = Array.from(sessionIds).map(sessionId => {
                const metadata = this.sessionMetadata.get(sessionId);
                return {
                    sessionId,
                    provider: metadata?.provider || 'unknown',
                    createdAt: metadata?.createdAt || 0,
                    lastUsed: metadata?.lastUsed || 0,
                    duration: metadata ? Date.now() - metadata.createdAt : 0
                };
            });

            return {
                apiKey,
                activeSessions: sessionIds.size,
                maxSessions: this.getUserSessionLimit(apiKey),
                sessions
            };
        });

        const totalActiveSessions = Array.from(this.currentSessions.values())
            .reduce((total, sessions) => total + sessions.size, 0);

        return {
            totalUsers: this.currentSessions.size,
            totalActiveSessions,
            concurrencyEnabled: this.config.concurrency.enableConcurrencyControl,
            userBreakdown
        };
    }

    /**
     * 强制关闭用户的所有会话
     */
    forceCloseUserSessions(apiKey: string): string[] {
        const userSessions = this.currentSessions.get(apiKey);
        if (!userSessions) {
            return [];
        }

        const sessionIds = Array.from(userSessions);

        // 清理当前会话记录
        this.currentSessions.delete(apiKey);

        // 清理会话元数据
        sessionIds.forEach(sessionId => {
            this.sessionMetadata.delete(sessionId);
        });

        console.log(`[LLM Concurrency] 强制关闭用户 ${apiKey} 的 ${sessionIds.length} 个会话`);
        return sessionIds;
    }

    /**
     * 清理过期会话
     */
    cleanupExpiredSessions(): number {
        const sessionTimeout = this.config.features.sessionTimeout * 60 * 1000; // 转换为毫秒
        const now = Date.now();
        let cleanedCount = 0;

        // 查找过期会话
        const expiredSessions: string[] = [];
        for (const [sessionId, metadata] of this.sessionMetadata.entries()) {
            if (now - metadata.lastUsed > sessionTimeout) {
                expiredSessions.push(sessionId);
            }
        }

        // 清理过期会话
        expiredSessions.forEach(sessionId => {
            const metadata = this.sessionMetadata.get(sessionId);
            if (metadata) {
                this.unregisterSession(metadata.apiKey, sessionId);
                cleanedCount++;
            }
        });

        if (cleanedCount > 0) {
            console.log(`[LLM Concurrency] 清理了 ${cleanedCount} 个过期会话`);
        }

        return cleanedCount;
    }

    /**
     * 启动定期清理任务
     */
    private startCleanupTask(): void {
        // 每5分钟清理一次过期会话
        setInterval(() => {
            this.cleanupExpiredSessions();
        }, 5 * 60 * 1000);

        console.log('[LLM Concurrency] 定期清理任务已启动（每5分钟执行一次）');
    }

    /**
     * 动态更新用户会话限制
     */
    updateUserSessionLimit(apiKey: string, newLimit: number): void {
        this.config.concurrency.userLimits[apiKey] = newLimit;
        console.log(`[LLM Concurrency] 更新用户 ${apiKey} 会话限制为 ${newLimit}`);

        // 如果当前会话数超过新限制，可以选择是否强制关闭
        const currentCount = this.getCurrentSessionCount(apiKey);
        if (currentCount > newLimit) {
            console.warn(`[LLM Concurrency] 用户 ${apiKey} 当前会话数 (${currentCount}) 超过新限制 (${newLimit})`);
            // 这里可以选择是否自动关闭多余的会话
        }
    }

    /**
     * 获取会话详细信息
     */
    getSessionInfo(sessionId: string): {
        exists: boolean;
        metadata?: {
            apiKey: string;
            provider: string;
            createdAt: number;
            lastUsed: number;
            duration: number;
        };
    } {
        const metadata = this.sessionMetadata.get(sessionId);
        if (!metadata) {
            return { exists: false };
        }

        return {
            exists: true,
            metadata: {
                ...metadata,
                duration: Date.now() - metadata.createdAt
            }
        };
    }

    /**
     * 检查特定会话是否存在
     */
    hasSession(apiKey: string, sessionId: string): boolean {
        const userSessions = this.currentSessions.get(apiKey);
        return userSessions ? userSessions.has(sessionId) : false;
    }

    /**
     * 获取用户的所有会话ID
     */
    getUserSessions(apiKey: string): string[] {
        const userSessions = this.currentSessions.get(apiKey);
        return userSessions ? Array.from(userSessions) : [];
    }
}