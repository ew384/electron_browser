// automation/engines/multi-platform-engine.js - 精简版本
// 移除抽象层，直接调用专门的 publisher

import { WeChatVideoPublisher } from './wechat-video-publisher.js'
import { DouyinVideoPublisher } from './douyin-video-publisher.js'
import { getPlatformConfig } from '../config/platforms.js'

export class MultiPlatformPublisher {
    constructor() {
        this.publishers = new Map()
        this.initializePublishers()
    }

    // 初始化发布器映射
    initializePublishers() {
        this.publishers.set('wechat', WeChatVideoPublisher)
        this.publishers.set('douyin', DouyinVideoPublisher)
        // 可以继续添加其他平台
        // this.publishers.set('xiaohongshu', XiaohongshuVideoPublisher)
        // this.publishers.set('kuaishou', KuaishouVideoPublisher)
    }

    // 单平台发布 - 直接实例化对应的专门 publisher
    async publishToPlatform(platformId, session, content, filePath) {
        console.log(`🚀 开始发布到 ${platformId}`)

        try {
            // 获取平台配置
            const platformConfig = getPlatformConfig(platformId)
            if (!platformConfig) {
                throw new Error(`不支持的平台: ${platformId}`)
            }

            // 获取对应的 Publisher 类
            const PublisherClass = this.publishers.get(platformId)
            if (!PublisherClass) {
                throw new Error(`平台 ${platformId} 的发布器未实现`)
            }

            // 直接实例化专门的 publisher
            const publisher = new PublisherClass(session, platformConfig)

            // 执行发布流程：上传 -> 填表 -> 发布
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

    // 多平台并行发布
    async publishToMultiplePlatforms(platforms, sessions, content, filePath) {
        console.log(`📦 开始多平台发布: ${platforms.join(', ')}`)

        try {
            // 验证参数
            if (platforms.length !== sessions.length) {
                throw new Error(`平台数量(${platforms.length})与会话数量(${sessions.length})不匹配`)
            }

            // 串行执行，避免并发问题
            const results = []
            for (let i = 0; i < platforms.length; i++) {
                const platformId = platforms[i]
                const session = sessions[i]

                try {
                    console.log(`\n📱 发布到平台: ${platformId}`)
                    const result = await this.publishToPlatform(platformId, session, content, filePath)
                    results.push(result)

                    // 平台间延迟，避免过于频繁的操作
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
            const failureCount = results.length - successCount

            console.log(`📊 多平台发布完成: 成功 ${successCount}, 失败 ${failureCount}`)

            return {
                success: successCount > 0,
                totalPlatforms: platforms.length,
                successCount,
                failureCount,
                results
            }
        } catch (error) {
            console.error('❌ 多平台发布失败:', error.message)
            throw error
        }
    }

    // 获取支持的平台列表
    getSupportedPlatforms() {
        return Array.from(this.publishers.keys())
    }

    // 验证平台配置
    validatePlatformConfig(platformId, content) {
        const platformConfig = getPlatformConfig(platformId)
        if (!platformConfig) {
            return { valid: false, error: `平台配置不存在: ${platformId}` }
        }

        const errors = []

        // 验证必需字段
        if (platformConfig.fields.title?.required && !content.title?.trim()) {
            errors.push(`${platformConfig.name}需要标题`)
        }

        if (platformConfig.fields.description?.required && !content.description?.trim()) {
            errors.push(`${platformConfig.name}需要描述`)
        }

        // 验证字段长度
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

    // 适配内容到平台要求
    adaptContentToPlatform(platformId, content) {
        const platformConfig = getPlatformConfig(platformId)
        if (!platformConfig) return content

        const adapted = { ...content }

        // 特殊处理：快手不需要标题
        if (platformConfig.features?.noTitle) {
            adapted.title = ''
        }

        // 适配标题长度
        if (adapted.title && platformConfig.fields.title?.maxLength) {
            if (adapted.title.length > platformConfig.fields.title.maxLength) {
                adapted.title = adapted.title.substring(0, platformConfig.fields.title.maxLength - 3) + '...'
            }
        }

        // 适配描述长度
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

    // 工具方法
    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms))
    }
}