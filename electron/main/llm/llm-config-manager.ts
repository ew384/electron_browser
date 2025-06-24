// electron/main/llm/llm-config-manager.ts
import * as fs from 'fs';
import * as path from 'path';
import { LLMConfig } from './types';

export class LLMConfigManager {
    private config: LLMConfig;
    private configPath?: string;

    constructor(configPath?: string) {
        // 如果没有指定路径，使用默认路径
        if (!configPath) {
            // 方案一：与 http-api-server.ts 同级
            configPath = path.join(__dirname, '../llm-config.json');

            // 如果同级不存在，尝试 llm 目录内
            if (!fs.existsSync(configPath)) {
                configPath = path.join(__dirname, 'llm-config.json');
            }
        }

        this.configPath = configPath;
        this.config = this.loadConfig();
    }

    private getDefaultConfig(): LLMConfig {
        return {
            concurrency: {
                defaultMaxSessions: 2,
                userLimits: {
                    'test1': 3,      // 测试用户允许3个会话
                    'user_1': 2,     // 普通用户2个会话
                    'user_2': 2
                },
                enableConcurrencyControl: true
            },
            apiKey: {
                validation: {
                    minLength: 8,
                    requiredPrefixes: ['llm_', 'dev_', 'prod_'],
                    allowedPatterns: ['^[a-zA-Z0-9_-]+$']
                },
                predefinedUsers: ['test1', 'user_1', 'user_2']
            },
            features: {
                enableUsageLogging: true,
                enableRateLimiting: false,
                sessionTimeout: 60 // 1小时
            }
        };
    }

    private loadConfig(): LLMConfig {
        let userConfig = {};
        const defaultConfig = this.getDefaultConfig();

        // 1. 尝试从文件加载
        if (this.configPath && fs.existsSync(this.configPath)) {
            try {
                const configData = fs.readFileSync(this.configPath, 'utf8');
                userConfig = JSON.parse(configData);
                console.log('[LLM Config] 从文件加载配置:', this.configPath);
            } catch (error) {
                console.warn('[LLM Config] 配置文件解析失败，使用默认配置:', error);
            }
        }

        // 2. 从环境变量覆盖
        const envConfig = this.loadFromEnvironment();

        // 3. 合并配置（深度合并）
        return this.deepMerge(defaultConfig, userConfig, envConfig);
    }

    private loadFromEnvironment(): Partial<LLMConfig> {
        const envConfig: any = {};

        // 并发控制相关
        if (process.env.LLM_MAX_SESSIONS) {
            envConfig.concurrency = {
                defaultMaxSessions: parseInt(process.env.LLM_MAX_SESSIONS)
            };
        }

        if (process.env.LLM_ENABLE_CONCURRENCY) {
            if (!envConfig.concurrency) envConfig.concurrency = {};
            envConfig.concurrency.enableConcurrencyControl = process.env.LLM_ENABLE_CONCURRENCY !== 'false';
        }

        // API密钥验证相关
        if (process.env.LLM_MIN_KEY_LENGTH) {
            envConfig.apiKey = {
                validation: {
                    minLength: parseInt(process.env.LLM_MIN_KEY_LENGTH)
                }
            };
        }

        // 特性开关
        if (process.env.LLM_ENABLE_LOGGING) {
            envConfig.features = {
                enableUsageLogging: process.env.LLM_ENABLE_LOGGING === 'true'
            };
        }

        if (process.env.LLM_SESSION_TIMEOUT) {
            if (!envConfig.features) envConfig.features = {};
            envConfig.features.sessionTimeout = parseInt(process.env.LLM_SESSION_TIMEOUT);
        }

        return envConfig;
    }

    private deepMerge(target: any, ...sources: any[]): any {
        if (!sources.length) return target;
        const source = sources.shift();

        if (this.isObject(target) && this.isObject(source)) {
            for (const key in source) {
                if (this.isObject(source[key])) {
                    if (!target[key]) Object.assign(target, { [key]: {} });
                    this.deepMerge(target[key], source[key]);
                } else {
                    Object.assign(target, { [key]: source[key] });
                }
            }
        }

        return this.deepMerge(target, ...sources);
    }

    private isObject(item: any): boolean {
        return item && typeof item === 'object' && !Array.isArray(item);
    }

    // 公共方法
    getConfig(): LLMConfig {
        return this.config;
    }

    getConcurrencyConfig() {
        return this.config.concurrency;
    }

    getApiKeyConfig() {
        return this.config.apiKey;
    }

    getFeaturesConfig() {
        return this.config.features;
    }

    // 动态更新配置
    updateConcurrencyLimit(apiKey: string, newLimit: number): void {
        this.config.concurrency.userLimits[apiKey] = newLimit;
        console.log(`[LLM Config] 更新用户 ${apiKey} 并发限制为 ${newLimit}`);
    }

    updateDefaultMaxSessions(newLimit: number): void {
        this.config.concurrency.defaultMaxSessions = newLimit;
        console.log(`[LLM Config] 更新默认最大会话数为 ${newLimit}`);
    }

    // 保存配置到文件
    saveConfig(): boolean {
        if (!this.configPath) {
            console.warn('[LLM Config] 未指定配置文件路径，无法保存');
            return false;
        }

        try {
            const configDir = path.dirname(this.configPath);
            if (!fs.existsSync(configDir)) {
                fs.mkdirSync(configDir, { recursive: true });
            }

            fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
            console.log('[LLM Config] 配置已保存到:', this.configPath);
            return true;
        } catch (error) {
            console.error('[LLM Config] 保存配置失败:', error);
            return false;
        }
    }

    // 重载配置
    reloadConfig(): void {
        this.config = this.loadConfig();
        console.log('[LLM Config] 配置已重载');
    }

    // 获取配置摘要（用于日志和调试）
    getConfigSummary(): object {
        return {
            concurrency: {
                defaultMaxSessions: this.config.concurrency.defaultMaxSessions,
                userLimitsCount: Object.keys(this.config.concurrency.userLimits).length,
                enabled: this.config.concurrency.enableConcurrencyControl
            },
            apiKey: {
                predefinedUsersCount: this.config.apiKey.predefinedUsers.length,
                minLength: this.config.apiKey.validation.minLength,
                prefixesCount: this.config.apiKey.validation.requiredPrefixes?.length || 0
            },
            features: this.config.features
        };
    }
}