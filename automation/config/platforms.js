// automation/config/platforms.js
// 完整的平台配置文件 - 统一管理所有自媒体平台

export const PLATFORM_CONFIGS = {
    wechat: {
        id: 'wechat',
        name: '微信视频号',
        icon: '🎬',
        color: 'bg-green-500',
        status: 'stable', // stable | beta | testing

        urls: {
            upload: 'https://channels.weixin.qq.com/platform/post/create',
            login: 'https://channels.weixin.qq.com/login',
            dashboard: 'https://channels.weixin.qq.com/platform',
            help: 'https://creators.weixin.qq.com'
        },

        selectors: {
            // 微信特有的iframe结构
            iframe: 'iframe',
            fileInput: 'input[type="file"]',

            // 表单字段
            shortTitle: 'input[placeholder*="概括视频主要内容"]',
            description: 'div[contenteditable][data-placeholder="添加描述"]',
            descriptionFallback: '.input-editor[contenteditable]',
            location: 'input[placeholder*="位置"]',
            locationOptions: '.common-option-list-wrap .option-item',

            // 按钮和状态
            publishButton: 'button:contains("发表")',
            deleteButton: '.finder-tag-wrap .tag-inner',
            successMessage: '.success-message, .toast-success, [class*="success"]'
        },

        fields: {
            title: {
                required: false,
                maxLength: 16,
                minLength: 6,
                note: '微信使用描述生成短标题，6-16字符'
            },
            description: {
                required: true,
                maxLength: 500,
                note: '详细描述视频内容'
            },
            location: {
                required: false,
                maxLength: 50,
                note: '支持位置搜索和选择'
            }
        },

        fileConstraints: {
            formats: ['mp4', 'avi', 'mov', 'wmv'],
            maxSize: 500 * 1024 * 1024, // 500MB
            duration: { min: 3, max: 300 }, // 3秒-5分钟
            resolution: { min: '480p', max: '4K' }
        },

        features: {
            useIframe: true,          // 使用iframe结构
            needShortTitle: true,     // 需要生成短标题
            supportLocation: true,    // 支持位置信息
            autoPublish: true,        // 支持自动发布
            needClickUpload: false,   // 不需要先点击上传按钮
            hasUploadProgress: true,  // 有上传进度显示
            needWaitProcessing: true  // 需要等待视频处理
        },

        timing: {
            pageLoadTimeout: 15000,
            uploadTimeout: 60000,
            processingTimeout: 60000,
            publishTimeout: 10000
        }
    },

    douyin: {
        id: 'douyin',
        name: '抖音',
        icon: '🎵',
        color: 'bg-black',
        status: 'testing',

        urls: {
            upload: 'https://creator.douyin.com/creator-micro/content/upload',
            login: 'https://creator.douyin.com/login',
            dashboard: 'https://creator.douyin.com/creator-micro/home',
            help: 'https://creator.douyin.com/creator-micro/home/help'
        },

        selectors: {
            // 抖音上传流程
            uploadButton: '.semi-button-content',
            uploadButtonText: 'span:contains("上传视频")',
            fileInput: 'input[type="file"]',

            // 表单字段
            titleInput: '.semi-input[placeholder*="填写作品标题"]',
            titleInputAlt: 'input[placeholder*="填写作品标题"]',
            descriptionEditor: '.editor-kit-container[data-placeholder="添加作品简介"]',
            descriptionEditorAlt: '.editor-kit-container.editor',
            locationSelect: '.semi-select-selection-text',
            locationPlaceholder: '.semi-select-selection-placeholder',
            locationInput: '.semi-select-option-list input',
            locationOption: '.semi-select-option',

            // 发布相关
            publishButton: '.button-dhlUZE.primary-cECiOJ',
            publishButtonAlt: 'button[class*="primary"]',

            // 状态检查
            uploadProgress: '.upload-progress, [class*="progress"]',
            uploadComplete: '.upload-complete, [class*="complete"]',
            successMessage: '[class*="success"], .toast',
            errorMessage: '[class*="error"], .error-toast'
        },

        fields: {
            title: {
                required: true,
                maxLength: 55,
                note: '吸引人的标题有助于获得更多推荐'
            },
            description: {
                required: true,
                maxLength: 2200,
                note: '支持话题标签，使用#话题#格式'
            },
            location: {
                required: false,
                maxLength: 50,
                note: '添加位置信息有助于本地推荐'
            }
        },

        fileConstraints: {
            formats: ['mp4', 'mov', 'avi'],
            maxSize: 1024 * 1024 * 1024, // 1GB
            duration: { min: 1, max: 600 }, // 1秒-10分钟
            resolution: { min: '480p', max: '4K' },
            aspectRatio: ['9:16', '16:9', '1:1'] // 竖屏优先
        },

        features: {
            useIframe: false,
            needShortTitle: false,
            supportLocation: true,
            autoPublish: true,
            needClickUpload: true,    // 需要先点击上传按钮
            hasUploadProgress: true,
            needWaitProcessing: true,
            supportHashtags: true,    // 支持话题标签
            supportAtMention: true    // 支持@提及
        },

        timing: {
            pageLoadTimeout: 15000,
            uploadTimeout: 90000,     // 抖音上传时间较长
            processingTimeout: 90000,
            publishTimeout: 10000,
            clickDelay: 1000         // 点击间隔
        }
    },

    xiaohongshu: {
        id: 'xiaohongshu',
        name: '小红书',
        icon: '📝',
        color: 'bg-red-500',
        status: 'testing',

        urls: {
            upload: 'https://creator.xiaohongshu.com/publish/publish?source=official',
            login: 'https://creator.xiaohongshu.com/login',
            dashboard: 'https://creator.xiaohongshu.com',
            help: 'https://creator.xiaohongshu.com/help'
        },

        selectors: {
            // 小红书上传
            fileInput: 'input[type="file"]',
            uploadArea: '.upload-area, .ant-upload',

            // 表单字段
            titleInput: '.d-text[placeholder*="填写标题"]',
            titleInputAlt: 'input[placeholder*="填写标题"]',
            descriptionEditor: '.ql-editor',
            descriptionPlaceholder: 'p[data-placeholder="输入正文描述"]',
            locationSelect: '.d-text.d-select-placeholder',
            locationInput: '.d-input input',
            locationOption: '.d-select-option',

            // 发布按钮
            publishButton: '.d-button-content',
            publishButtonAlt: 'button[class*="primary"]',

            // 状态显示
            uploadProgress: '.progress, [class*="progress"]',
            successMessage: '.success, [class*="success"]'
        },

        fields: {
            title: {
                required: true,
                maxLength: 20, // 小红书标题限制较短
                note: '简洁有力的标题，20字以内'
            },
            description: {
                required: true,
                maxLength: 1000,
                note: '详细描述内容，支持表情符号'
            },
            location: {
                required: false,
                maxLength: 50,
                note: '添加地点信息'
            }
        },

        fileConstraints: {
            formats: ['mp4', 'mov'],
            maxSize: 500 * 1024 * 1024, // 500MB
            duration: { min: 3, max: 900 }, // 3秒-15分钟
            resolution: { min: '720p', max: '4K' },
            aspectRatio: ['9:16', '3:4', '1:1'] // 竖屏和方形
        },

        features: {
            useIframe: false,
            needShortTitle: false,
            supportLocation: true,
            autoPublish: true,
            needClickUpload: false,
            hasUploadProgress: true,
            needWaitProcessing: false,
            supportEmoji: true,       // 支持表情符号
            supportMultiImage: true   // 支持多图文
        },

        timing: {
            pageLoadTimeout: 15000,
            uploadTimeout: 60000,
            processingTimeout: 30000,
            publishTimeout: 10000
        }
    },

    kuaishou: {
        id: 'kuaishou',
        name: '快手',
        icon: '⚡',
        color: 'bg-orange-500',
        status: 'testing',

        urls: {
            upload: 'https://cp.kuaishou.com/article/publish/video',
            login: 'https://cp.kuaishou.com/login',
            dashboard: 'https://cp.kuaishou.com',
            help: 'https://cp.kuaishou.com/help'
        },

        selectors: {
            // 快手上传
            fileInput: 'input[type="file"]',
            uploadArea: '.upload-area, [class*="upload"]',

            // 表单字段 (快手不需要标题)
            descriptionEditor: '._description_2klkp_59',
            descriptionEditorAlt: '[id="work-description-edit"]',
            locationInput: '.ant-select-selection-search-input',
            locationSelect: '.ant-select-selection-item',
            locationOption: '.ant-select-item-option',

            // 发布按钮
            publishButton: '._button_3a3lq_1._button-primary_3a3lq_60',
            publishButtonAlt: 'button[class*="primary"]',

            // 状态显示
            uploadProgress: '.upload-progress, [class*="progress"]',
            successMessage: '.success-message, [class*="success"]'
        },

        fields: {
            title: {
                required: false, // 快手不需要标题
                note: '快手不需要单独的标题字段'
            },
            description: {
                required: true,
                maxLength: 300, // 快手描述较短
                note: '简短有趣的描述，300字以内'
            },
            location: {
                required: false,
                maxLength: 50,
                note: '添加位置信息有助于本地推荐'
            }
        },

        fileConstraints: {
            formats: ['mp4', 'mov', 'avi'],
            maxSize: 512 * 1024 * 1024, // 512MB
            duration: { min: 1, max: 1800 }, // 1秒-30分钟
            resolution: { min: '480p', max: '4K' },
            aspectRatio: ['9:16', '16:9', '1:1']
        },

        features: {
            useIframe: false,
            needShortTitle: false,
            supportLocation: true,
            autoPublish: true,
            needClickUpload: false,
            hasUploadProgress: true,
            needWaitProcessing: true,
            noTitle: true             // 特殊标记：不需要标题
        },

        timing: {
            pageLoadTimeout: 15000,
            uploadTimeout: 60000,
            processingTimeout: 60000,
            publishTimeout: 10000
        }
    },

    // 预留其他平台配置
    bilibili: {
        id: 'bilibili',
        name: 'B站',
        icon: '📺',
        color: 'bg-pink-500',
        status: 'planned',

        urls: {
            upload: 'https://member.bilibili.com/video/upload',
            login: 'https://passport.bilibili.com/login',
            dashboard: 'https://member.bilibili.com'
        },

        fields: {
            title: { required: true, maxLength: 80 },
            description: { required: true, maxLength: 2000 },
            tags: { required: true, maxCount: 10 }
        },

        features: {
            supportTags: true,
            supportCover: true,
            supportSeries: true,
            needReview: true  // 需要审核
        }
    },

    zhihu: {
        id: 'zhihu',
        name: '知乎',
        icon: '🧠',
        color: 'bg-blue-600',
        status: 'planned',

        urls: {
            upload: 'https://zhuanlan.zhihu.com/write',
            login: 'https://www.zhihu.com/signin'
        },

        features: {
            supportMarkdown: true,
            supportVideo: true,
            supportLive: true
        }
    }
}

// 工具函数

// 获取平台配置
export function getPlatformConfig(platformId) {
    return PLATFORM_CONFIGS[platformId] || null
}

// 获取所有支持的平台
export function getSupportedPlatforms(status = null) {
    const platforms = Object.values(PLATFORM_CONFIGS)

    if (status) {
        return platforms.filter(p => p.status === status)
    }

    return platforms
}

// 获取可用的平台 (排除planned状态)
export function getAvailablePlatforms() {
    return getSupportedPlatforms().filter(p => p.status !== 'planned')
}

// 获取平台URL
export function getPlatformUrl(platformId, type = 'upload') {
    const config = getPlatformConfig(platformId)
    return config?.urls?.[type] || null
}

// 获取平台选择器
export function getPlatformSelector(platformId, selectorName) {
    const config = getPlatformConfig(platformId)
    return config?.selectors?.[selectorName] || null
}

// 验证平台内容
export function validatePlatformContent(platformId, content) {
    const config = getPlatformConfig(platformId)
    if (!config) {
        return { valid: false, error: `不支持的平台: ${platformId}` }
    }

    const errors = []

    // 验证标题
    if (config.fields.title?.required && !content.title?.trim()) {
        errors.push(`${config.name}需要标题`)
    }

    if (content.title && config.fields.title?.maxLength && content.title.length > config.fields.title.maxLength) {
        errors.push(`${config.name}标题超出限制(${config.fields.title.maxLength}字符)`)
    }

    if (content.title && config.fields.title?.minLength && content.title.length < config.fields.title.minLength) {
        errors.push(`${config.name}标题至少需要${config.fields.title.minLength}字符`)
    }

    // 验证描述
    if (config.fields.description?.required && !content.description?.trim()) {
        errors.push(`${config.name}需要描述`)
    }

    if (content.description && config.fields.description?.maxLength && content.description.length > config.fields.description.maxLength) {
        errors.push(`${config.name}描述超出限制(${config.fields.description.maxLength}字符)`)
    }

    return {
        valid: errors.length === 0,
        errors: errors
    }
}

// 适配内容到平台要求
export function adaptContentToPlatform(platformId, content) {
    const config = getPlatformConfig(platformId)
    if (!config) return content

    const adapted = { ...content }

    // 特殊处理：快手不需要标题
    if (config.features?.noTitle) {
        adapted.title = ''
    }

    // 适配标题
    if (adapted.title && config.fields.title?.maxLength) {
        if (adapted.title.length > config.fields.title.maxLength) {
            adapted.title = adapted.title.substring(0, config.fields.title.maxLength - 3) + '...'
        }
    }

    // 适配描述
    if (adapted.description && config.fields.description?.maxLength) {
        if (adapted.description.length > config.fields.description.maxLength) {
            // 尝试在句号处截断
            const truncated = adapted.description.substring(0, config.fields.description.maxLength - 3)
            const lastSentence = truncated.lastIndexOf('。')

            if (lastSentence > config.fields.description.maxLength * 0.7) {
                adapted.description = adapted.description.substring(0, lastSentence + 1)
            } else {
                adapted.description = truncated + '...'
            }
        }
    }

    return adapted
}

// 获取平台特性
export function getPlatformFeatures(platformId) {
    const config = getPlatformConfig(platformId)
    return config?.features || {}
}

// 获取平台时间配置
export function getPlatformTiming(platformId) {
    const config = getPlatformConfig(platformId)
    return config?.timing || {
        pageLoadTimeout: 15000,
        uploadTimeout: 60000,
        processingTimeout: 30000,
        publishTimeout: 10000
    }
}

// 检查平台状态
export function isPlatformAvailable(platformId) {
    const config = getPlatformConfig(platformId)
    return config && config.status !== 'planned'
}

// 导出默认配置
export default PLATFORM_CONFIGS