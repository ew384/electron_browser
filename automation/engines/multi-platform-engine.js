// automation/engines/multi-platform-publisher.js
import { WeChatVideoPublisher } from './wechat-video-publisher.js'
import { DouyinVideoPublisher } from './douyin-video-publisher.js'
// import { XiaohongshuVideoPublisher } from './xiaohongshu-video-publisher.js'
// import { KuaishouVideoPublisher } from './kuaishou-video-publisher.js'
import { getPlatformConfig } from '../config/platforms.js'

export class MultiPlatformPublisher {
    constructor() {
        this.publishers = new Map()
        this.sessions = new Map()
    }

    // 注册平台发布器
    registerPublisher(platformId, publisherClass) {
        this.publishers.set(platformId, publisherClass)
    }

    // 初始化所有发布器
    initializePublishers() {
        this.registerPublisher('wechat', WeChatVideoPublisher)
        this.registerPublisher('douyin', DouyinVideoPublisher)
        // this.registerPublisher('xiaohongshu', XiaohongshuVideoPublisher)
        // this.registerPublisher('kuaishou', KuaishouVideoPublisher)
    }

    // 创建平台发布器实例
    async createPublisher(platformId, session) {
        const PublisherClass = this.publishers.get(platformId)
        if (!PublisherClass) {
            throw new Error(`不支持的平台: ${platformId}`)
        }

        const platformConfig = getPlatformConfig(platformId)
        if (!platformConfig) {
            throw new Error(`平台配置不存在: ${platformId}`)
        }

        return new PublisherClass(session, platformConfig)
    }

    // 单平台发布
    async publishToPlatform(platformId, session, content, filePath) {
        console.log(`🚀 开始发布到 ${platformId}`)

        try {
            const publisher = await this.createPublisher(platformId, session)

            // 步骤1: 上传文件
            console.log(`📤 步骤1: 上传文件到 ${platformId}`)
            const uploadResult = await publisher.uploadFile(filePath)

            // 步骤2: 填写表单
            console.log(`📝 步骤2: 填写 ${platformId} 表单`)
            const formResult = await publisher.fillForm(content)

            // 步骤3: 发布
            console.log(`🚀 步骤3: 发布到 ${platformId}`)
            const publishResult = await publisher.publish()

            return {
                success: true,
                platform: platformId,
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
                error: error.message
            }
        }
    }

    // 多平台并行发布
    async publishToMultiplePlatforms(platforms, sessions, content, filePath) {
        console.log(`📦 开始多平台并行发布: ${platforms.join(', ')}`)

        const publishPromises = platforms.map(async (platformId, index) => {
            const session = sessions[index]
            if (!session) {
                throw new Error(`平台 ${platformId} 缺少对应的浏览器会话`)
            }

            return this.publishToPlatform(platformId, session, content, filePath)
        })

        try {
            const results = await Promise.allSettled(publishPromises)

            const successCount = results.filter(r => r.status === 'fulfilled' && r.value.success).length
            const failureCount = results.length - successCount

            console.log(`📊 多平台发布完成: 成功 ${successCount}, 失败 ${failureCount}`)

            return {
                success: successCount > 0,
                totalPlatforms: platforms.length,
                successCount,
                failureCount,
                results: results.map((result, index) => ({
                    platform: platforms[index],
                    status: result.status,
                    ...result.value
                }))
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
}