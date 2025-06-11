// automation/core/index.js - 并发支持集成版本
import { ChromeController } from './chrome-controller.js'
import { ContentProcessor } from './content-processor.js'
import { TemplateEngine } from './template-engine.js'
import { MultiPlatformPublisher } from '../engines/multi-platform-engine.js'
import { getPlatformConfig } from '../config/platforms.js'
import path from 'path'
import fs from 'fs'

export class UniversalPublisher {
    constructor(options = {}) {
        this.config = {
            electronApiUrl: options.electronApiUrl || 'http://localhost:9528',
            timeout: options.timeout || 15000,
            retryAttempts: options.retryAttempts || 3,
            outputDir: options.outputDir || './output',
            autoPublish: options.autoPublish !== false,
            // 🔧 新增：并发配置
            enableConcurrency: options.enableConcurrency !== false,
            maxConcurrentPlatforms: options.maxConcurrentPlatforms || 4,
            ...options
        }

        this.chromeController = new ChromeController({
            electronApiUrl: this.config.electronApiUrl,
            timeout: this.config.timeout,
            retryAttempts: this.config.retryAttempts
        })

        this.contentProcessor = new ContentProcessor(this.config)
        this.templateEngine = new TemplateEngine(this.config)
        this.multiPlatformEngine = new MultiPlatformPublisher()
        this.multiPlatformEngine.setChromeController(this.chromeController)
        this.initOutputDir()
        console.log('🚀 UniversalPublisher 初始化完成 (并发支持版本)')
        this.logDebugInfo()
    }

    // 🔧 新增：并发多平台发布（主要方法）
    async publishMultiPlatformConcurrent(platforms, workflowType, content, template, accounts) {
        console.log(`📦 并发批量发布 ${workflowType} 到 ${platforms.length} 个平台`)

        try {
            // 1. 验证参数
            if (platforms.length !== accounts.length) {
                throw new Error(`平台数量(${platforms.length})与账号数量(${accounts.length})不匹配`)
            }

            // 2. 处理内容和模板
            const processedContent = await this.contentProcessor.process(content, workflowType)
            const processedAccounts = accounts.map(account => this.processAccountConfig(account))

            // 3. 渲染模板（使用第一个账号作为基准）
            const renderData = await this.templateEngine.render(template, processedContent, processedAccounts[0])

            // 4. 检查并发限制
            const concurrentGroups = this.splitIntoConcurrentGroups(platforms, processedAccounts, this.config.maxConcurrentPlatforms)

            console.log(`🔧 并发配置: ${concurrentGroups.length} 组, 每组最多 ${this.config.maxConcurrentPlatforms} 个平台`)

            // 5. 逐组并发执行
            const allResults = []
            for (let groupIndex = 0; groupIndex < concurrentGroups.length; groupIndex++) {
                const group = concurrentGroups[groupIndex]
                console.log(`\n📦 执行第 ${groupIndex + 1}/${concurrentGroups.length} 组 (${group.platforms.length} 个平台)`)

                try {
                    const groupResult = await this.multiPlatformEngine.publishToMultiplePlatformsConcurrent(
                        group.platforms,
                        group.accounts,
                        renderData,
                        content.videoFile || content.file,
                        this.chromeController
                    )

                    allResults.push({
                        groupIndex: groupIndex + 1,
                        ...groupResult
                    })

                    // 组间延迟（避免系统过载）
                    if (groupIndex < concurrentGroups.length - 1) {
                        console.log('⏳ 组间等待 5 秒...')
                        await this.delay(5000)
                    }

                } catch (error) {
                    console.error(`❌ 第 ${groupIndex + 1} 组执行失败:`, error.message)
                    allResults.push({
                        groupIndex: groupIndex + 1,
                        success: false,
                        error: error.message,
                        platforms: group.platforms,
                        accounts: group.accounts.map(a => a.id)
                    })
                }
            }

            // 6. 汇总所有结果
            const finalResult = this.aggregateGroupResults(allResults, platforms, processedAccounts)

            // 7. 保存结果
            await this.saveMultiPlatformResult(finalResult, workflowType)

            console.log(`📊 并发批量发布完成: 总成功 ${finalResult.totalSuccessCount}/${finalResult.totalPlatforms}`)
            return finalResult

        } catch (error) {
            console.error('❌ 并发多平台发布失败:', error.message)
            await this.diagnoseError(error)
            throw error
        }
    }

    // 🔧 保留：原有多平台发布方法（兼容性）
    async publishMultiPlatform(platforms, workflowType, content, template, accounts) {
        if (this.config.enableConcurrency) {
            console.log('🔄 使用并发模式')
            return await this.publishMultiPlatformConcurrent(platforms, workflowType, content, template, accounts)
        } else {
            console.log('🔄 使用串行模式 (兼容)')
            return await this.publishMultiPlatformSerial(platforms, workflowType, content, template, accounts)
        }
    }

    // 🔧 保留：串行发布方法（向后兼容）
    async publishMultiPlatformSerial(platforms, workflowType, content, template, accounts) {
        console.log(`📦 串行批量发布 ${workflowType} 到 ${platforms.length} 个平台`)

        try {
            const processedContent = await this.contentProcessor.process(content, workflowType)
            const processedAccounts = accounts.map(account => this.processAccountConfig(account))

            const sessions = []
            for (let i = 0; i < processedAccounts.length; i++) {
                console.log(`🔗 为账号 ${processedAccounts[i].id} 创建浏览器会话...`)
                const session = await this.chromeController.createSession(processedAccounts[i], platforms[i])
                sessions.push(session)
            }

            const renderData = await this.templateEngine.render(template, processedContent, processedAccounts[0])

            const result = await this.multiPlatformEngine.publishToMultiplePlatforms(
                platforms,
                sessions,
                renderData,
                content.videoFile || content.file
            )

            for (const session of sessions) {
                await this.chromeController.closeSession(session.id)
            }

            return result

        } catch (error) {
            console.error('❌ 串行多平台发布失败:', error.message)
            throw error
        }
    }

    // 🔧 保留：单平台发布
    async publish(platformId, workflowType, content, template, account) {
        console.log(`📱 开始发布 ${workflowType} 到 ${platformId} 平台: ${account.id}`)

        try {
            this.validateInput(platformId, workflowType, content, template)
            const processedAccount = this.processAccountConfig(account)
            const processedContent = await this.contentProcessor.process(content, workflowType)
            const renderData = await this.templateEngine.render(template, processedContent, processedAccount)

            const session = await this.chromeController.createSession(processedAccount, platformId)

            const result = await this.multiPlatformEngine.publishToPlatform(
                platformId,
                session,
                renderData,
                content.videoFile || content.file
            )

            await this.saveResult(platformId, workflowType, result, processedAccount)
            await this.chromeController.closeSession(session.id)

            console.log(`✅ ${platformId} ${workflowType} 发布完成`)
            return result

        } catch (error) {
            console.error(`❌ ${platformId} ${workflowType} 发布失败:`, error.message)
            await this.diagnoseError(error)
            throw error
        }
    }

    // 🔧 新增：分组逻辑
    splitIntoConcurrentGroups(platforms, accounts, maxConcurrent) {
        const groups = []

        for (let i = 0; i < platforms.length; i += maxConcurrent) {
            const endIndex = Math.min(i + maxConcurrent, platforms.length)
            groups.push({
                platforms: platforms.slice(i, endIndex),
                accounts: accounts.slice(i, endIndex)
            })
        }

        return groups
    }

    // 🔧 新增：结果汇总
    aggregateGroupResults(groupResults, originalPlatforms, originalAccounts) {
        const allResults = []
        const allErrors = []
        let totalSuccessCount = 0
        let totalAttemptedCount = 0
        let totalSessionErrors = []

        // 收集时间统计
        const timingStats = {
            groupTimings: [],
            totalStartTime: Math.min(...groupResults.map(g => g.timing?.startTime || Date.now())),
            totalEndTime: Math.max(...groupResults.map(g => g.timing?.endTime || Date.now()))
        }

        groupResults.forEach(groupResult => {
            if (groupResult.results) {
                allResults.push(...groupResult.results)
                totalSuccessCount += groupResult.successCount || 0
                totalAttemptedCount += groupResult.attemptedPlatforms || 0

                if (groupResult.sessionErrors) {
                    totalSessionErrors.push(...groupResult.sessionErrors)
                }

                if (groupResult.timing) {
                    timingStats.groupTimings.push({
                        groupIndex: groupResult.groupIndex,
                        duration: groupResult.timing.totalTime,
                        platforms: groupResult.attemptedPlatforms || 0
                    })
                }
            }

            if (groupResult.error) {
                allErrors.push({
                    groupIndex: groupResult.groupIndex,
                    error: groupResult.error,
                    platforms: groupResult.platforms || [],
                    accounts: groupResult.accounts || []
                })
            }
        })

        // 计算总体统计
        timingStats.totalDuration = timingStats.totalEndTime - timingStats.totalStartTime
        timingStats.averageGroupDuration = timingStats.groupTimings.length > 0
            ? timingStats.groupTimings.reduce((sum, g) => sum + g.duration, 0) / timingStats.groupTimings.length
            : 0

        return {
            success: totalSuccessCount > 0,
            totalPlatforms: originalPlatforms.length,
            attemptedPlatforms: totalAttemptedCount,
            totalSuccessCount: totalSuccessCount,
            totalFailureCount: totalAttemptedCount - totalSuccessCount,
            sessionErrorCount: totalSessionErrors.length,
            results: allResults,
            sessionErrors: totalSessionErrors,
            groupErrors: allErrors,
            timing: timingStats,
            summary: this.generateConcurrentSummary(allResults, totalSessionErrors, allErrors),
            platforms: originalPlatforms,
            accounts: originalAccounts.map(a => ({ id: a.id, name: a.name }))
        }
    }

    // 🔧 新增：并发结果摘要
    generateConcurrentSummary(results, sessionErrors, groupErrors) {
        const platformStats = {}
        const errorsByType = {}

        results.forEach(result => {
            const platformName = result.platformName || result.platform
            if (!platformStats[platformName]) {
                platformStats[platformName] = { success: 0, failure: 0 }
            }

            if (result.success) {
                platformStats[platformName].success++
            } else {
                platformStats[platformName].failure++
                const errorType = result.errorType || 'unknown'
                errorsByType[errorType] = (errorsByType[errorType] || 0) + 1
            }
        })

        // 添加会话错误统计
        sessionErrors.forEach(error => {
            errorsByType['session'] = (errorsByType['session'] || 0) + 1
        })

        // 添加组错误统计
        groupErrors.forEach(error => {
            errorsByType['system'] = (errorsByType['system'] || 0) + 1
        })

        const recommendations = []
        if (errorsByType.connection > 0) recommendations.push('检查网络连接稳定性')
        if (errorsByType.session > 0) recommendations.push('确保浏览器实例正常运行')
        if (errorsByType.element > 0) recommendations.push('更新平台页面选择器配置')
        if (errorsByType.system > 0) recommendations.push('检查系统资源和并发限制')

        return {
            platformStats,
            errorsByType,
            recommendations,
            concurrencyEffective: Object.values(platformStats).some(stat => stat.success > 0)
        }
    }

    // 🔧 保留：原有方法
    getSupportedPlatforms() {
        return this.multiPlatformEngine.getSupportedPlatforms()
    }

    getPlatformConfig(platformId) {
        return getPlatformConfig(platformId)
    }

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

    // 私有方法
    validateInput(platformId, workflowType, content, template) {
        const config = this.getPlatformConfig(platformId)
        if (!config) {
            throw new Error(`不支持的平台: ${platformId}`)
        }

        const supportedTypes = ['video', 'article', 'music', 'audio']
        if (!supportedTypes.includes(workflowType)) {
            throw new Error(`不支持的工作流类型: ${workflowType}`)
        }

        if (!content || typeof content !== 'object') {
            throw new Error('内容参数无效')
        }

        if (!template || typeof template !== 'object') {
            throw new Error('模板参数无效')
        }
    }

    processAccountConfig(account) {
        const processedAccount = { ...account }

        if (processedAccount.debugPort) {
            console.log(`⚠️ 移除账号 ${account.id} 中的硬编码端口: ${processedAccount.debugPort}`)
            delete processedAccount.debugPort
        }

        processedAccount.id = processedAccount.id || `account_${Date.now()}`
        processedAccount.platform = processedAccount.platform || 'wechat'

        return processedAccount
    }

    async diagnoseError(error) {
        console.log('\n🔍 错误诊断:')

        if (error.message.includes('无法连接到Chrome调试端口')) {
            console.log('❌ Chrome连接问题')
            console.log('💡 建议解决方案:')
            console.log('   1. 确保 Electron Browser Manager 正在运行')
            console.log('   2. 在管理器中启动至少一个浏览器实例')
            console.log('   3. 检查防火墙是否阻止端口访问')

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
            debugPort: result.debugPort || 'dynamic',
            version: '2.0.0-concurrent'
        }

        fs.writeFileSync(filepath, JSON.stringify(saveData, null, 2))
        console.log(`📄 结果已保存: ${filepath}`)
    }

    // 🔧 新增：保存多平台结果
    async saveMultiPlatformResult(result, workflowType) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
        const filename = `multi-platform-${workflowType}-${timestamp}.json`
        const filepath = path.join(this.config.outputDir, filename)

        const saveData = {
            type: 'multi-platform',
            workflowType,
            timestamp: new Date().toISOString(),
            result,
            version: '2.0.0-concurrent',
            concurrencyEnabled: this.config.enableConcurrency,
            maxConcurrentPlatforms: this.config.maxConcurrentPlatforms
        }

        fs.writeFileSync(filepath, JSON.stringify(saveData, null, 2))
        console.log(`📄 多平台结果已保存: ${filepath}`)
    }

    initOutputDir() {
        if (!fs.existsSync(this.config.outputDir)) {
            fs.mkdirSync(this.config.outputDir, { recursive: true })
        }
    }

    async logDebugInfo() {
        try {
            const debugInfo = await this.chromeController.getDebugInfo()
            console.log('🔍 系统状态:')
            console.log(`   Electron API: ${debugInfo.apiAvailable ? '✅ 可用' : '❌ 不可用'}`)
            console.log(`   API地址: ${debugInfo.apiEndpoint}`)
            console.log(`   浏览器实例: ${debugInfo.browsersCount || 0} 个`)
            console.log(`   运行中: ${debugInfo.runningBrowsers || 0} 个`)
            console.log(`   并发模式: ${this.config.enableConcurrency ? '✅ 启用' : '❌ 禁用'}`)
            console.log(`   最大并发: ${this.config.maxConcurrentPlatforms} 个平台`)

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