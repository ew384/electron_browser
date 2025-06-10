import { ChromeController } from './chrome-controller.js'
import { WorkflowEngine } from './workflow-engine.js'
import { ContentProcessor } from './content-processor.js'
import { TemplateEngine } from './template-engine.js'
import { MultiPlatformPublisher } from '../engines/multi-platform-engine.js'
import { getPlatformConfig } from '../config/platforms.js'
import path from 'path'
import fs from 'fs'

/**
 * 多平台发布器 - 统一管理所有平台的自动化发布
 * 重构自原来的 WeChatPublisher，现在支持多平台并行发布
 */
export class UniversalPublisher {
    constructor(options = {}) {
        this.config = {
            debugPort: options.debugPort || 9225,
            timeout: options.timeout || 15000,
            retryAttempts: options.retryAttempts || 3,
            outputDir: options.outputDir || './output',
            serverPort: options.serverPort || 3000,
            ...options
        }

        // 初始化核心组件
        this.chromeController = new ChromeController(this.config)
        this.workflowEngine = new WorkflowEngine(this.config)
        this.contentProcessor = new ContentProcessor(this.config)
        this.templateEngine = new TemplateEngine(this.config)

        // 初始化多平台发布引擎
        this.multiPlatformEngine = new MultiPlatformPublisher()
        this.multiPlatformEngine.initializePublishers()

        this.initOutputDir()
        console.log('🚀 UniversalPublisher 初始化完成 (支持多平台)')
    }

    initOutputDir() {
        if (!fs.existsSync(this.config.outputDir)) {
            fs.mkdirSync(this.config.outputDir, { recursive: true })
        }
    }

    /**
     * 发布到单个平台
     * @param {string} platformId - 平台ID (wechat, douyin, xiaohongshu, kuaishou)
     * @param {string} workflowType - 工作流类型 (video, article, music, audio)
     * @param {object} content - 内容数据
     * @param {object} template - 模板配置
     * @param {object} account - 账号配置
     */
    async publish(platformId, workflowType, content, template, account) {
        console.log(`📱 开始发布 ${workflowType} 到 ${platformId} 平台: ${account.id}`)

        try {
            // 1. 验证输入参数
            this.validateInput(platformId, workflowType, content, template)

            // 2. 处理内容
            const processedContent = await this.contentProcessor.process(content, workflowType)

            // 3. 渲染模板
            const renderData = await this.templateEngine.render(template, processedContent, account)

            console.log('📋 渲染后的内容:')
            Object.entries(renderData).forEach(([key, value]) => {
                if (typeof value === 'string' && value.length < 100) {
                    console.log(`   ${key}: ${value}`)
                }
            })

            // 4. 启动浏览器会话
            const session = await this.chromeController.createSession(account)
            session.chromeController = this.chromeController

            // 5. 使用多平台发布引擎执行
            const result = await this.multiPlatformEngine.publishToPlatform(
                platformId,
                session,
                renderData,
                content.videoFile || content.file
            )

            // 6. 保存结果
            await this.saveResult(platformId, workflowType, result, account)

            // 7. 清理会话
            await this.chromeController.closeSession(session.id)

            console.log(`✅ ${platformId} ${workflowType} 发布完成`)
            return result

        } catch (error) {
            console.error(`❌ ${platformId} ${workflowType} 发布失败:`, error.message)
            throw error
        }
    }

    /**
     * 多平台并行发布
     * @param {Array} platforms - 平台ID数组
     * @param {string} workflowType - 工作流类型
     * @param {object} content - 内容数据
     * @param {object} template - 模板配置
     * @param {Array} accounts - 账号配置数组
     */
    async publishMultiPlatform(platforms, workflowType, content, template, accounts) {
        console.log(`📦 批量发布 ${workflowType} 到 ${platforms.length} 个平台`)

        try {
            // 验证参数
            if (platforms.length !== accounts.length) {
                throw new Error(`平台数量(${platforms.length})与账号数量(${accounts.length})不匹配`)
            }

            // 创建浏览器会话
            const sessions = []
            for (let i = 0; i < accounts.length; i++) {
                const session = await this.chromeController.createSession(accounts[i])
                session.chromeController = this.chromeController
                sessions.push(session)
            }

            // 使用多平台发布引擎执行
            const result = await this.multiPlatformEngine.publishToMultiplePlatforms(
                platforms,
                sessions,
                content,
                content.videoFile || content.file
            )

            // 清理会话
            for (const session of sessions) {
                await this.chromeController.closeSession(session.id)
            }

            console.log('📊 多平台发布完成')
            return result

        } catch (error) {
            console.error('❌ 多平台发布失败:', error.message)
            throw error
        }
    }

    /**
     * 批量发布 (兼容原有接口)
     * @param {string} workflowType - 工作流类型
     * @param {object} content - 内容数据
     * @param {object} template - 模板配置
     * @param {Array} accounts - 账号配置数组
     */
    async batchPublish(workflowType, content, template, accounts) {
        console.log(`📦 批量发布 ${workflowType} 到 ${accounts.length} 个账号`)

        const results = []
        for (const account of accounts) {
            try {
                console.log(`\n📱 发布到账号: ${account.name || account.id}`)

                // 获取账号对应的平台，默认为微信视频号
                const platformId = account.platform || 'wechat'

                const variedContent = await this.contentProcessor.generateVariation(content, account)
                const result = await this.publish(platformId, workflowType, variedContent, template, account)

                results.push({
                    account: account.id,
                    platform: platformId,
                    status: 'success',
                    result
                })

                // 账号间延迟
                if (accounts.indexOf(account) < accounts.length - 1) {
                    const delay = 5000 + Math.random() * 5000
                    console.log(`⏳ 等待 ${Math.round(delay / 1000)} 秒后处理下一个账号...`)
                    await this.delay(delay)
                }

            } catch (error) {
                console.error(`❌ 账号 ${account.id} 发布失败:`, error.message)
                results.push({
                    account: account.id,
                    platform: account.platform || 'wechat',
                    status: 'failed',
                    error: error.message
                })
            }
        }

        return results
    }

    /**
     * 获取支持的平台列表
     */
    getSupportedPlatforms() {
        return this.multiPlatformEngine.getSupportedPlatforms()
    }

    /**
     * 获取平台配置
     */
    getPlatformConfig(platformId) {
        return getPlatformConfig(platformId)
    }

    /**
     * 预览内容适配效果
     */
    async previewContent(platforms, content) {
        const previews = []

        for (const platformId of platforms) {
            try {
                const adaptedContent = this.multiPlatformEngine.adaptContentToPlatform(platformId, content)
                const validation = this.multiPlatformEngine.validatePlatformConfig(platformId, adaptedContent)
                const config = this.getPlatformConfig(platformId)

                previews.push({
                    platformId,
                    platformName: config?.name || platformId,
                    adaptedContent,
                    validation,
                    config
                })
            } catch (error) {
                previews.push({
                    platformId,
                    error: error.message
                })
            }
        }

        return previews
    }

    // ==================== 私有方法 ====================

    validateInput(platformId, workflowType, content, template) {
        // 验证平台
        const config = this.getPlatformConfig(platformId)
        if (!config) {
            throw new Error(`不支持的平台: ${platformId}`)
        }

        // 验证工作流类型
        const supportedTypes = ['video', 'article', 'music', 'audio']
        if (!supportedTypes.includes(workflowType)) {
            throw new Error(`不支持的工作流类型: ${workflowType}`)
        }

        // 验证内容
        if (!content || typeof content !== 'object') {
            throw new Error('内容参数无效')
        }

        // 验证模板
        if (!template || typeof template !== 'object') {
            throw new Error('模板参数无效')
        }
    }

    async saveResult(platformId, workflowType, result, account) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
        const filename = `${platformId}-${workflowType}-${account.id}-${timestamp}.json`
        const filepath = path.join(this.config.outputDir, filename)

        const saveData = {
            platform: platformId,
            workflowType,
            account: account.id,
            timestamp: new Date().toISOString(),
            result
        }

        fs.writeFileSync(filepath, JSON.stringify(saveData, null, 2))
        console.log(`📄 结果已保存: ${filepath}`)
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms))
    }
}

// 向后兼容：导出原来的 WeChatPublisher 名称
export const WeChatPublisher = UniversalPublisher

// 导出多平台发布器 (推荐使用)
export const MultiPlatformVideoPublisher = UniversalPublisher

// 默认导出
export default UniversalPublisher

// 导出其他核心组件
export {
    ChromeController,
    WorkflowEngine,
    ContentProcessor,
    TemplateEngine,
    MultiPlatformPublisher
}