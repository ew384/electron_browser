// automation/engines/multi-platform-engine.js - 并发版本
import { WeChatVideoPublisher } from './wechat-video-publisher.js'
import { DouyinVideoPublisher } from './douyin-video-publisher.js'
import { getPlatformConfig } from '../config/platforms.js'

export class MultiPlatformPublisher {
    constructor() {
        this.publishers = new Map()
        this.initializePublishers()
    }

    initializePublishers() {
        this.publishers.set('wechat', WeChatVideoPublisher)
        this.publishers.set('douyin', DouyinVideoPublisher)
    }

    // 🔧 新增：真正的并发多平台发布
    async publishToMultiplePlatformsConcurrent(platforms, accounts, content, filePath, chromeController) {
        console.log(`📦 开始并发多平台发布: ${platforms.join(', ')}`)

        try {
            // 1. 验证参数
            if (platforms.length !== accounts.length) {
                throw new Error(`平台数量(${platforms.length})与账号数量(${accounts.length})不匹配`)
            }

            // 2. 并发创建会话
            console.log('🔗 并发创建浏览器会话...')
            const sessionResult = await chromeController.createMultipleSessions(accounts, platforms)

            if (sessionResult.errors.length > 0) {
                console.warn(`⚠️ ${sessionResult.errors.length} 个会话创建失败`)
                sessionResult.errors.forEach(error => {
                    console.warn(`   ${error.account}-${error.platform}: ${error.error}`)
                })
            }

            const validSessions = sessionResult.sessions
            if (validSessions.length === 0) {
                throw new Error('没有可用的浏览器会话')
            }

            // 3. 创建并发发布任务
            console.log(`🚀 开始并发发布到 ${validSessions.length} 个平台...`)

            const publishTasks = validSessions.map(session =>
                this.publishToPlatformWithSession(session, content, filePath)
                    .then(result => ({
                        ...result,
                        session: session,
                        platform: session.platform,
                        platformName: getPlatformConfig(session.platform)?.name || session.platform
                    }))
                    .catch(error => ({
                        success: false,
                        session: session,
                        platform: session.platform,
                        platformName: getPlatformConfig(session.platform)?.name || session.platform,
                        error: error.message,
                        errorType: this.categorizeError(error)
                    }))
            )

            // 4. 并发执行所有发布任务
            console.log('⚡ 并发执行发布任务...')
            const startTime = Date.now()

            const results = await Promise.all(publishTasks)

            const endTime = Date.now()
            const totalTime = endTime - startTime

            // 5. 统计结果
            const successResults = results.filter(r => r.success)
            const failureResults = results.filter(r => !r.success)

            console.log(`📊 并发发布完成: 成功 ${successResults.length}, 失败 ${failureResults.length}, 耗时 ${totalTime}ms`)

            // 6. 清理会话
            const sessionIds = validSessions.map(s => s.id)
            await chromeController.closeMultipleSessions(sessionIds)

            // 7. 返回详细结果
            return {
                success: successResults.length > 0,
                totalPlatforms: platforms.length,
                attemptedPlatforms: validSessions.length,
                successCount: successResults.length,
                failureCount: failureResults.length,
                sessionErrors: sessionResult.errors,
                results: results,
                timing: {
                    totalTime: totalTime,
                    averageTime: totalTime / validSessions.length,
                    startTime: startTime,
                    endTime: endTime
                },
                summary: this.generateResultSummary(results, sessionResult.errors)
            }

        } catch (error) {
            console.error('❌ 并发多平台发布失败:', error.message)
            throw error
        }
    }

    // 🔧 新增：使用会话发布到单个平台
    async publishToPlatformWithSession(session, content, filePath) {
        const platformId = session.platform
        console.log(`🚀 发布到 ${platformId} (会话: ${session.id})`)

        try {
            const platformConfig = getPlatformConfig(platformId)
            if (!platformConfig) {
                throw new Error(`不支持的平台: ${platformId}`)
            }

            const PublisherClass = this.publishers.get(platformId)
            if (!PublisherClass) {
                throw new Error(`平台 ${platformId} 的发布器未实现`)
            }

            // 使用会话创建发布器实例
            const publisher = new PublisherClass(session, platformConfig)

            // 执行发布流程
            const stepResults = {}

            // 步骤1: 上传文件
            console.log(`📤 ${platformId}: 上传文件`)
            const uploadResult = await publisher.uploadFile(filePath)
            stepResults.upload = uploadResult

            // 步骤2: 填写表单
            console.log(`📝 ${platformId}: 填写表单`)
            const formResult = await publisher.fillForm(content)
            stepResults.form = formResult

            // 步骤3: 发布
            console.log(`🚀 ${platformId}: 执行发布`)
            const publishResult = await publisher.publish()
            stepResults.publish = publishResult

            return {
                success: true,
                platform: platformId,
                platformName: platformConfig.name,
                steps: stepResults,
                timing: {
                    completedAt: Date.now()
                }
            }

        } catch (error) {
            console.error(`❌ ${platformId} 发布失败:`, error.message)
            return {
                success: false,
                platform: platformId,
                platformName: getPlatformConfig(platformId)?.name || platformId,
                error: error.message,
                errorType: this.categorizeError(error)
            }
        }
    }

    // 🔧 保留：兼容性方法（串行版本）
    async publishToMultiplePlatforms(platforms, sessions, content, filePath) {
        console.log(`📦 串行多平台发布: ${platforms.join(', ')} (兼容模式)`)

        try {
            const results = []

            for (let i = 0; i < platforms.length; i++) {
                const platformId = platforms[i]
                const session = sessions[i]

                try {
                    console.log(`\n📱 发布到平台: ${platformId}`)
                    const result = await this.publishToPlatform(platformId, session, content, filePath)
                    results.push(result)

                    // 平台间延迟
                    if (i < platforms.length - 1) {
                        console.log('⏳ 等待 3 秒后处理下一个平台...')
                        await this.delay(3000)
                    }
                } catch (error) {
                    console.error(`❌ 平台 ${platformId} 发布失败:`, error.message)
                    results.push({
                        success: false,
                        platform: platformId,
                        platformName: getPlatformConfig(platformId)?.name || platformId,
                        error: error.message
                    })
                }
            }

            const successCount = results.filter(r => r.success).length
            console.log(`📊 串行发布完成: 成功 ${successCount}, 失败 ${results.length - successCount}`)

            return {
                success: successCount > 0,
                totalPlatforms: platforms.length,
                successCount,
                failureCount: results.length - successCount,
                results
            }

        } catch (error) {
            console.error('❌ 串行多平台发布失败:', error.message)
            throw error
        }
    }

    // 🔧 保留：单平台发布
    async publishToPlatform(platformId, session, content, filePath) {
        console.log(`🚀 开始发布到 ${platformId}`)

        try {
            const platformConfig = getPlatformConfig(platformId)
            if (!platformConfig) {
                throw new Error(`不支持的平台: ${platformId}`)
            }

            const PublisherClass = this.publishers.get(platformId)
            if (!PublisherClass) {
                throw new Error(`平台 ${platformId} 的发布器未实现`)
            }

            const publisher = new PublisherClass(session, platformConfig)

            console.log(`📤 步骤1: 上传文件到 ${platformId}`)
            const uploadResult = await publisher.uploadFile(filePath)

            console.log(`📝 步骤2: 填写 ${platformId} 表单`)
            const formResult = await publisher.fillForm(content)

            console.log(`🚀 步骤3: 发布到 ${platformId}`)
            const publishResult = await publisher.publish()

            return {
                success: true,
                platform: platformId,
                platformName: platformConfig.name,
                steps: {
                    upload: uploadResult,
                    form: formResult,
                    publish: publishResult
                }
            }
        } catch (error) {
            console.error(`❌ ${platformId} 发布失败:`, error.message)
            return {
                success: false,
                platform: platformId,
                platformName: getPlatformConfig(platformId)?.name || platformId,
                error: error.message
            }
        }
    }

    // 🔧 新增：错误分类
    categorizeError(error) {
        const message = error.message || error.toString()

        if (message.includes('连接') || message.includes('timeout') || message.includes('ECONNREFUSED')) {
            return 'connection'
        } else if (message.includes('未找到') || message.includes('not found') || message.includes('元素')) {
            return 'element'
        } else if (message.includes('上传') || message.includes('upload') || message.includes('文件')) {
            return 'upload'
        } else if (message.includes('登录') || message.includes('认证') || message.includes('权限')) {
            return 'auth'
        } else if (message.includes('网络') || message.includes('network')) {
            return 'network'
        } else {
            return 'unknown'
        }
    }

    // 🔧 新增：生成结果摘要
    generateResultSummary(results, sessionErrors = []) {
        const errorCategories = {}
        const successfulPlatforms = []
        const failedPlatforms = []

        results.forEach(result => {
            if (result.success) {
                successfulPlatforms.push(result.platformName || result.platform)
            } else {
                failedPlatforms.push({
                    platform: result.platformName || result.platform,
                    error: result.error,
                    category: result.errorType || 'unknown'
                })

                const category = result.errorType || 'unknown'
                errorCategories[category] = (errorCategories[category] || 0) + 1
            }
        })

        // 添加会话创建错误
        sessionErrors.forEach(error => {
            failedPlatforms.push({
                platform: `${error.account}-${error.platform}`,
                error: error.error,
                category: 'session'
            })
            errorCategories['session'] = (errorCategories['session'] || 0) + 1
        })

        return {
            successfulPlatforms,
            failedPlatforms,
            errorCategories,
            recommendations: this.generateRecommendations(errorCategories)
        }
    }

    // 🔧 新增：生成改进建议
    generateRecommendations(errorCategories) {
        const recommendations = []

        if (errorCategories.connection > 0) {
            recommendations.push('检查网络连接和浏览器实例状态')
        }
        if (errorCategories.element > 0) {
            recommendations.push('更新平台选择器配置，网站可能已更新')
        }
        if (errorCategories.upload > 0) {
            recommendations.push('检查文件格式和大小限制')
        }
        if (errorCategories.auth > 0) {
            recommendations.push('确认平台账号登录状态')
        }
        if (errorCategories.session > 0) {
            recommendations.push('确保浏览器实例正常运行')
        }

        return recommendations
    }

    // 工具方法
    getSupportedPlatforms() {
        return Array.from(this.publishers.keys())
    }

    validatePlatformConfig(platformId, content) {
        const platformConfig = getPlatformConfig(platformId)
        if (!platformConfig) {
            return { valid: false, error: `平台配置不存在: ${platformId}` }
        }

        const errors = []

        if (platformConfig.fields.title?.required && !content.title?.trim()) {
            errors.push(`${platformConfig.name}需要标题`)
        }

        if (platformConfig.fields.description?.required && !content.description?.trim()) {
            errors.push(`${platformConfig.name}需要描述`)
        }

        if (content.title && platformConfig.fields.title?.maxLength) {
            if (content.title.length > platformConfig.fields.title.maxLength) {
                errors.push(`${platformConfig.name}标题超出限制(${platformConfig.fields.title.maxLength}字符)`)
            }
        }

        if (content.description && platformConfig.fields.description?.maxLength) {
            if (content.description.length > platformConfig.fields.description.maxLength) {
                errors.push(`${platformConfig.name}描述超出限制(${platformConfig.fields.description.maxLength}字符)`)
            }
        }

        return {
            valid: errors.length === 0,
            errors: errors
        }
    }

    adaptContentToPlatform(platformId, content) {
        const platformConfig = getPlatformConfig(platformId)
        if (!platformConfig) return content

        const adapted = { ...content }

        if (platformConfig.features?.noTitle) {
            adapted.title = ''
        }

        if (adapted.title && platformConfig.fields.title?.maxLength) {
            if (adapted.title.length > platformConfig.fields.title.maxLength) {
                adapted.title = adapted.title.substring(0, platformConfig.fields.title.maxLength - 3) + '...'
            }
        }

        if (adapted.description && platformConfig.fields.description?.maxLength) {
            if (adapted.description.length > platformConfig.fields.description.maxLength) {
                const truncated = adapted.description.substring(0, platformConfig.fields.description.maxLength - 3)
                const lastSentence = truncated.lastIndexOf('。')

                if (lastSentence > platformConfig.fields.description.maxLength * 0.7) {
                    adapted.description = adapted.description.substring(0, lastSentence + 1)
                } else {
                    adapted.description = truncated + '...'
                }
            }
        }

        return adapted
    }

    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms))
    }
}