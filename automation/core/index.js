// automation/core/index.js - 修复版本
// 移除端口硬编码，集成动态端口获取

import { ChromeController } from './chrome-controller.js'
import { ContentProcessor } from './content-processor.js'
import { TemplateEngine } from './template-engine.js'
import { MultiPlatformPublisher } from '../engines/multi-platform-engine.js'
import { getPlatformConfig } from '../config/platforms.js'
import path from 'path'
import fs from 'fs'

/**
 * 修复版发布器 - 集成动态端口获取
 */
export class UniversalPublisher {
    constructor(options = {}) {
        this.config = {
            // 🔧 修复：移除硬编码端口，改为可选配置
            debugPort: options.debugPort || null, // null表示动态获取
            electronApiUrl: options.electronApiUrl || 'http://localhost:9528',
            timeout: options.timeout || 15000,
            retryAttempts: options.retryAttempts || 3,
            outputDir: options.outputDir || './output',
            autoPublish: options.autoPublish !== false, // 默认启用自动发布
            ...options
        }

        // 🔧 修复：传递完整配置给ChromeController
        this.chromeController = new ChromeController({
            debugPort: this.config.debugPort,
            electronApiUrl: this.config.electronApiUrl,
            timeout: this.config.timeout,
            retryAttempts: this.config.retryAttempts
        })

        this.contentProcessor = new ContentProcessor(this.config)
        this.templateEngine = new TemplateEngine(this.config)

        // 初始化精简版多平台发布引擎
        this.multiPlatformEngine = new MultiPlatformPublisher()

        this.initOutputDir()
        console.log('🚀 UniversalPublisher 初始化完成 (动态端口版本)')

        // 🔧 新增：启动时显示调试信息
        this.logDebugInfo()
    }

    initOutputDir() {
        if (!fs.existsSync(this.config.outputDir)) {
            fs.mkdirSync(this.config.outputDir, { recursive: true })
        }
    }

    /**
     * 🔧 新增：启动时显示调试信息
     */
    async logDebugInfo() {
        try {
            const debugInfo = await this.chromeController.getDebugInfo()
            console.log('🔍 系统状态:')
            console.log(`   Electron API: ${debugInfo.apiAvailable ? '✅ 可用' : '❌ 不可用'}`)
            console.log(`   API地址: ${debugInfo.apiEndpoint}`)
            console.log(`   浏览器实例: ${debugInfo.browsersCount || 0} 个`)
            console.log(`   运行中: ${debugInfo.runningBrowsers || 0} 个`)

            if (debugInfo.availablePorts && debugInfo.availablePorts.length > 0) {
                console.log('   可用端口:')
                debugInfo.availablePorts.forEach(port => {
                    console.log(`     - ${port.accountId}: ${port.port} (${port.status})`)
                })
            }
        } catch (error) {
            console.log('⚠️ 获取调试信息失败:', error.message)
        }
    }

    /**
     * 发布到单个平台 - 修复版本
     */
    async publish(platformId, workflowType, content, template, account) {
        console.log(`📱 开始发布 ${workflowType} 到 ${platformId} 平台: ${account.id}`)

        try {
            // 1. 验证参数
            this.validateInput(platformId, workflowType, content, template)

            // 2. 🔧 修复：处理账号配置，移除硬编码端口
            const processedAccount = this.processAccountConfig(account)

            // 3. 处理内容
            const processedContent = await this.contentProcessor.process(content, workflowType)

            // 4. 渲染模板
            const renderData = await this.templateEngine.render(template, processedContent, processedAccount)

            console.log('📋 渲染后的内容:')
            Object.entries(renderData).forEach(([key, value]) => {
                if (typeof value === 'string' && value.length < 100) {
                    console.log(`   ${key}: ${value}`)
                }
            })

            // 5. 🔧 修复：启动浏览器会话（动态端口）
            console.log('🔗 创建浏览器会话（动态端口）...')
            const session = await this.chromeController.createSession(processedAccount)
            session.chromeController = this.chromeController

            console.log(`✅ 会话创建成功，使用端口: ${session.debugPort}`)

            // 6. 直接使用多平台发布引擎
            const result = await this.multiPlatformEngine.publishToPlatform(
                platformId,
                session,
                renderData,
                content.videoFile || content.file
            )

            // 7. 保存结果
            await this.saveResult(platformId, workflowType, result, processedAccount)

            // 8. 清理会话
            await this.chromeController.closeSession(session.id)

            console.log(`✅ ${platformId} ${workflowType} 发布完成`)
            return result

        } catch (error) {
            console.error(`❌ ${platformId} ${workflowType} 发布失败:`, error.message)

            // 🔧 新增：提供详细的错误诊断
            await this.diagnoseError(error)

            throw error
        }
    }

    /**
     * 多平台并行发布 - 修复版本
     */
    async publishMultiPlatform(platforms, workflowType, content, template, accounts) {
        console.log(`📦 批量发布 ${workflowType} 到 ${platforms.length} 个平台`)

        try {
            // 验证参数
            if (platforms.length !== accounts.length) {
                throw new Error(`平台数量(${platforms.length})与账号数量(${accounts.length})不匹配`)
            }

            // 🔧 修复：处理账号配置
            const processedAccounts = accounts.map(account => this.processAccountConfig(account))

            // 处理内容
            const processedContent = await this.contentProcessor.process(content, workflowType)

            // 创建浏览器会话（每个账号对应一个会话）
            const sessions = []
            for (let i = 0; i < processedAccounts.length; i++) {
                console.log(`🔗 为账号 ${processedAccounts[i].id} 创建浏览器会话...`)
                const session = await this.chromeController.createSession(processedAccounts[i])
                session.chromeController = this.chromeController
                sessions.push(session)

                console.log(`✅ 账号 ${processedAccounts[i].id} 会话创建成功，端口: ${session.debugPort}`)
            }

            // 渲染模板（为第一个账号生成内容，其他账号会在发布时生成变化）
            const renderData = await this.templateEngine.render(template, processedContent, processedAccounts[0])

            // 使用多平台发布引擎执行
            const result = await this.multiPlatformEngine.publishToMultiplePlatforms(
                platforms,
                sessions,
                renderData,
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
            await this.diagnoseError(error)
            throw error
        }
    }

    /**
     * 批量发布 (兼容原有接口)
     */
    async batchPublish(workflowType, content, template, accounts) {
        console.log(`📦 批量发布 ${workflowType} 到 ${accounts.length} 个账号`)

        const results = []
        for (const account of accounts) {
            try {
                console.log(`\n📱 发布到账号: ${account.name || account.id}`)

                // 获取账号对应的平台，默认为微信视频号
                const platformId = account.platform || 'wechat'

                // 为每个账号生成变化的内容
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

    /**
     * 🔧 新增：处理账号配置，移除硬编码端口
     */
    processAccountConfig(account) {
        const processedAccount = { ...account }

        // 移除硬编码的调试端口，让系统动态获取
        if (processedAccount.debugPort) {
            console.log(`⚠️ 移除账号 ${account.id} 中的硬编码端口: ${processedAccount.debugPort}`)
            delete processedAccount.debugPort
        }

        // 确保必要的字段存在
        processedAccount.id = processedAccount.id || `account_${Date.now()}`
        processedAccount.platform = processedAccount.platform || 'wechat'

        return processedAccount
    }

    /**
     * 🔧 新增：错误诊断
     */
    async diagnoseError(error) {
        console.log('\n🔍 错误诊断:')

        if (error.message.includes('无法连接到Chrome调试端口')) {
            console.log('❌ Chrome连接问题')
            console.log('💡 建议解决方案:')
            console.log('   1. 确保 Electron Browser Manager 正在运行')
            console.log('   2. 在管理器中启动至少一个浏览器实例')
            console.log('   3. 检查防火墙是否阻止端口访问')

            // 获取详细的调试信息
            try {
                const debugInfo = await this.chromeController.getDebugInfo()
                console.log('📊 系统状态:', debugInfo)
            } catch (debugError) {
                console.log('⚠️ 无法获取调试信息:', debugError.message)
            }
        } else if (error.message.includes('未找到')) {
            console.log('❌ 元素查找问题')
            console.log('💡 建议解决方案:')
            console.log('   1. 检查目标网站是否更新了页面结构')
            console.log('   2. 更新 platforms.js 中的选择器配置')
            console.log('   3. 确保页面完全加载后再执行操作')
        } else if (error.message.includes('timeout') || error.message.includes('超时')) {
            console.log('❌ 超时问题')
            console.log('💡 建议解决方案:')
            console.log('   1. 增加超时时间配置')
            console.log('   2. 检查网络连接速度')
            console.log('   3. 减少并发操作数量')
        }

        console.log('')
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
            result,
            // 🔧 新增：保存使用的端口信息
            debugPort: result.debugPort || 'dynamic',
            version: '2.0.0-fixed'
        }

        fs.writeFileSync(filepath, JSON.stringify(saveData, null, 2))
        console.log(`📄 结果已保存: ${filepath}`)
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms))
    }
}

// 向后兼容：导出原来的名称
export const WeChatPublisher = UniversalPublisher
export const MultiPlatformVideoPublisher = UniversalPublisher

// 默认导出
export default UniversalPublisher

// 导出其他核心组件
export {
    ChromeController,
    ContentProcessor,
    TemplateEngine,
    MultiPlatformPublisher
}