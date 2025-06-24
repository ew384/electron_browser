// electron/main/llm/llm-user-manager.ts
import { ApiKeyValidation, LLMConfig } from './types';

export class LLMUserManager {
    constructor(private config: LLMConfig) { }

    /**
     * 验证API密钥
     * @param apiKey API密钥
     * @returns 验证结果
     */
    validateApiKey(apiKey: string): ApiKeyValidation {
        // 基础检查
        if (!apiKey || typeof apiKey !== 'string') {
            return {
                valid: false,
                userType: 'invalid',
                permissions: [],
                reason: 'API密钥不能为空'
            };
        }

        // 层次1：预定义用户（最高优先级）
        if (this.isPredefinedUser(apiKey)) {
            return {
                valid: true,
                userType: 'predefined',
                permissions: ['llm_access', 'shared_instance', 'unlimited_sessions'],
                reason: '预定义测试用户'
            };
        }

        // 层次2：动态密钥验证
        const dynamicValidation = this.validateDynamicKey(apiKey);
        if (dynamicValidation.valid) {
            return {
                valid: true,
                userType: 'dynamic',
                permissions: ['llm_access', 'limited_sessions'],
                reason: dynamicValidation.reason
            };
        }

        return {
            valid: false,
            userType: 'invalid',
            permissions: [],
            reason: dynamicValidation.reason
        };
    }

    /**
     * 检查是否为预定义用户
     */
    private isPredefinedUser(apiKey: string): boolean {
        return this.config.apiKey.predefinedUsers.includes(apiKey);
    }

    /**
     * 验证动态密钥
     */
    private validateDynamicKey(apiKey: string): { valid: boolean; reason: string } {
        const validation = this.config.apiKey.validation;

        // 1. 长度检查
        if (apiKey.length < validation.minLength) {
            return {
                valid: false,
                reason: `API密钥长度不足，最少需要${validation.minLength}个字符`
            };
        }

        // 2. 格式检查
        if (validation.allowedPatterns) {
            const patternValid = validation.allowedPatterns.some(pattern => {
                const regex = new RegExp(pattern);
                return regex.test(apiKey);
            });

            if (!patternValid) {
                return {
                    valid: false,
                    reason: 'API密钥格式不正确，只允许字母、数字、下划线和横线'
                };
            }
        }

        // 3. 前缀检查（可选）
        if (validation.requiredPrefixes && validation.requiredPrefixes.length > 0) {
            const hasValidPrefix = validation.requiredPrefixes.some(prefix =>
                apiKey.startsWith(prefix)
            );

            // 如果定义了前缀但不匹配，且长度不够长，则拒绝
            if (!hasValidPrefix && apiKey.length < 12) {
                return {
                    valid: false,
                    reason: `API密钥应以以下前缀开头: ${validation.requiredPrefixes.join(', ')} 或长度至少12位`
                };
            }
        }

        // 4. 其他业务规则验证
        if (this.isBlacklistedKey(apiKey)) {
            return {
                valid: false,
                reason: 'API密钥已被禁用'
            };
        }

        return {
            valid: true,
            reason: '动态密钥验证通过'
        };
    }

    /**
     * 检查密钥是否在黑名单中
     */
    private isBlacklistedKey(apiKey: string): boolean {
        // 可以在这里添加黑名单逻辑
        const blacklist = ['test', 'demo', 'example', 'invalid'];
        return blacklist.includes(apiKey.toLowerCase());
    }

    /**
     * 检查是否为LLM用户（与原有系统兼容）
     */
    isLLMUser(apiKey: string): boolean {
        return this.isPredefinedUser(apiKey);
    }

    /**
     * 获取用户信息
     */
    getUserInfo(apiKey: string): {
        id: string;
        type: 'predefined' | 'dynamic' | 'invalid';
        permissions: string[];
        displayName: string;
    } {
        const validation = this.validateApiKey(apiKey);

        return {
            id: apiKey,
            type: validation.userType,
            permissions: validation.permissions,
            displayName: this.generateDisplayName(apiKey, validation.userType)
        };
    }

    /**
     * 生成显示名称
     */
    private generateDisplayName(apiKey: string, userType: string): string {
        if (userType === 'predefined') {
            const displayNames: Record<string, string> = {
                'test1': 'Test User 1',
                'user_1': 'LLM User 1',
                'user_2': 'LLM User 2'
            };
            return displayNames[apiKey] || `Predefined User (${apiKey})`;
        } else if (userType === 'dynamic') {
            // 对于动态用户，只显示前4位和后4位
            if (apiKey.length > 8) {
                const start = apiKey.substring(0, 4);
                const end = apiKey.substring(apiKey.length - 4);
                return `${start}****${end}`;
            }
            return `Dynamic User (${apiKey})`;
        }
        return 'Invalid User';
    }

    /**
     * 检查用户权限
     */
    hasPermission(apiKey: string, permission: string): boolean {
        const validation = this.validateApiKey(apiKey);
        return validation.valid && validation.permissions.includes(permission);
    }

    /**
     * 获取用户统计信息
     */
    getUserStats(): {
        predefinedUsers: number;
        validDynamicUsers: number;
        totalValidUsers: number;
    } {
        return {
            predefinedUsers: this.config.apiKey.predefinedUsers.length,
            validDynamicUsers: 0, // 这需要从活跃会话中统计
            totalValidUsers: this.config.apiKey.predefinedUsers.length
        };
    }

    /**
     * 添加预定义用户
     */
    addPredefinedUser(apiKey: string): boolean {
        if (!this.config.apiKey.predefinedUsers.includes(apiKey)) {
            this.config.apiKey.predefinedUsers.push(apiKey);
            console.log(`[LLM User] 添加预定义用户: ${apiKey}`);
            return true;
        }
        return false;
    }

    /**
     * 移除预定义用户
     */
    removePredefinedUser(apiKey: string): boolean {
        const index = this.config.apiKey.predefinedUsers.indexOf(apiKey);
        if (index !== -1) {
            this.config.apiKey.predefinedUsers.splice(index, 1);
            console.log(`[LLM User] 移除预定义用户: ${apiKey}`);
            return true;
        }
        return false;
    }

    /**
     * 生成新的API密钥（用于管理界面）
     */
    generateApiKey(prefix: string = 'llm'): string {
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substring(2, 8);
        return `${prefix}_${timestamp}_${random}`;
    }

    /**
     * 验证和清理API密钥格式
     */
    sanitizeApiKey(apiKey: string): string {
        // 移除空白字符
        return apiKey.trim();
    }
}