// automation/config/platforms.js - 配置与逻辑分离版本
// 所有页面元素选择器都在这里配置，方便维护和更新

export const PLATFORM_CONFIGS = {
    wechat: {
        id: 'wechat',
        name: '微信视频号',
        icon: '🎬',
        color: 'bg-green-500',
        status: 'stable',

        urls: {
            upload: 'https://channels.weixin.qq.com/platform/post/create',
            login: 'https://channels.weixin.qq.com/login',
            dashboard: 'https://channels.weixin.qq.com/platform',
            help: 'https://creators.weixin.qq.com'
        },

        selectors: {
            // iframe 相关
            iframe: 'iframe',

            // 文件上传相关
            uploadArea: '.center, .upload-area',
            fileInput: 'input[type="file"]',
            fileInputAlt: [
                'input[accept*="video"]',
                'input[accept*="*"]',
                '.upload-input input[type="file"]',
                '.finder-upload input[type="file"]',
                '[data-testid*="upload"] input',
                '.ant-upload input',
                '.weui-uploader__input'
            ],

            // 表单字段
            shortTitle: 'input[placeholder*="概括视频主要内容"]',
            description: 'div[contenteditable][data-placeholder="添加描述"]',
            descriptionAlt: '.input-editor[contenteditable]',
            location: 'input[placeholder*="位置"]',
            locationAlt: 'input[placeholder*="搜索附近位置"]',
            locationOptions: '.common-option-list-wrap .option-item',
            locationOptionName: '.name',

            // 按钮和状态
            publishButton: 'button',
            publishButtonText: ['发表', '发布'],
            deleteButton: '.finder-tag-wrap .tag-inner',
            deleteButtonText: '删除',

            // 成功提示
            successMessage: [
                '.success-message',
                '.toast-success',
                '[class*="success"]',
                '.weui-desktop-toast'
            ]
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

        features: {
            useIframe: true,
            needShortTitle: true,
            supportLocation: true,
            autoPublish: true,
            needClickUpload: false,
            hasUploadProgress: true,
            needWaitProcessing: true
        },

        timing: {
            pageLoadTimeout: 15000,
            uploadTimeout: 60000,
            processingTimeout: 60000,
            publishTimeout: 120000,
            retryDelay: 2000,
            maxRetries: 3
        }
    },

    douyin: {
        id: 'douyin',
        name: '抖音',
        icon: '🎵',
        color: 'bg-black',
        status: 'stable',

        urls: {
            upload: 'https://creator.douyin.com/creator-micro/content/post/video?enter_from=publish_page',
            login: 'https://creator.douyin.com/login',
            dashboard: 'https://creator.douyin.com/creator-micro/home',
            help: 'https://creator.douyin.com/creator-micro/home/help'
        },

        selectors: {
            // 上传相关
            uploadButton: '.inner-p-HQwLO0',

            // 文件上传
            fileInput: 'input[type="file"][accept*="video"]',
            fileInputAlt: [
                'input[type="file"]', // 通用备选
                'input[accept*="video"]',
                'input[accept*=".mp4"]',
                '.upload-input input[type="file"]',
                '[data-testid*="upload"] input',
                '.ant-upload input'
            ],
            // 表单字段 - 优化后的选择器
            titleInput: 'input.semi-input[placeholder*="填写作品标题"]',
            titleInputAlt: [
                '.semi-input.semi-input-default[placeholder*="标题"]',
                'input[placeholder*="填写作品标题，为作品获得更多流量"]', // 完整匹配作为备选
                'input[placeholder*="标题"]',
                '.title-input',
                '[data-testid="title-input"]'
            ],

            // 描述编辑器 - 简化选择器，提高稳定性
            descriptionEditor: '[contenteditable="true"][data-placeholder*="简介"]',
            descriptionEditorAlt: [
                '.zone-container.editor-kit-container[contenteditable="true"]',
                '.editor-kit-container.editor[data-placeholder="添加作品简介"]',
                '[data-placeholder="添加作品简介"]',
                '.zone-container[contenteditable="true"]',
                '.editor-comp-publish[contenteditable="true"]',
                '[contenteditable="true"]' // 最后的备选
            ],

            // 位置相关
            locationSelect: '.semi-select-selection-text',
            locationPlaceholder: '.semi-select-selection-placeholder',
            locationInput: '.semi-select-option-list input',
            locationOption: '.semi-select-option',

            // 发布相关 - 使用最新的精确选择器
            publishButton: '.button-dhlUZE.primary-cECiOJ',
            publishButtonAlt: [
                'button[class*="primary"]',
                'button:contains("发布")',
                '.publish-btn',
                '[data-testid="publish-button"]',
                '.btn-publish'
            ],
            publishButtonText: '发布',

            // 状态检查
            uploadProgress: [
                '.upload-progress',
                '[class*="progress"]'
            ],
            uploadComplete: [
                '.upload-complete',
                '[class*="complete"]'
            ],
            reviewStatus: [
                '[class*="review"]',
                '[class*="check"]',
                '[class*="审核"]'
            ],
            reviewingText: ['审核中', '检测中'],
            successMessage: [
                '[class*="success"]',
                '.toast'
            ],
            errorMessage: [
                '[class*="error"]',
                '.error-toast'
            ]
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

        features: {
            useIframe: false,
            needShortTitle: false,
            supportLocation: true,
            autoPublish: true,
            needClickUpload: true,
            hasUploadProgress: true,
            needWaitProcessing: true,
            needVideoReview: true, // 抖音特有：需要视频审核
            supportHashtags: true,
            supportAtMention: true
        },

        timing: {
            pageLoadTimeout: 15000,
            uploadTimeout: 90000,
            processingTimeout: 90000,
            reviewTimeout: 120000, // 视频审核超时时间
            publishTimeout: 10000,
            clickDelay: 1000,
            retryDelay: 2000,
            maxRetries: 3,
            reviewCheckInterval: 5000 // 审核状态检查间隔
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
            fileInput: 'input[type="file"]',
            uploadArea: ['.upload-area', '.ant-upload'],

            titleInput: '.d-text[placeholder*="填写标题"]',
            titleInputAlt: 'input[placeholder*="填写标题"]',

            descriptionEditor: '.ql-editor',
            descriptionPlaceholder: 'p[data-placeholder="输入正文描述"]',

            locationSelect: '.d-text.d-select-placeholder',
            locationInput: '.d-input input',
            locationOption: '.d-select-option',

            publishButton: '.d-button-content',
            publishButtonAlt: 'button[class*="primary"]',

            uploadProgress: ['.progress', '[class*="progress"]'],
            successMessage: ['.success', '[class*="success"]']
        },

        fields: {
            title: { required: true, maxLength: 20 },
            description: { required: true, maxLength: 1000 },
            location: { required: false, maxLength: 50 }
        },

        features: {
            useIframe: false,
            supportLocation: true,
            autoPublish: true,
            supportEmoji: true,
            supportMultiImage: true
        },

        timing: {
            pageLoadTimeout: 15000,
            uploadTimeout: 60000,
            processingTimeout: 30000,
            publishTimeout: 10000,
            retryDelay: 2000,
            maxRetries: 3
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
            fileInput: 'input[type="file"]',
            uploadArea: ['.upload-area', '[class*="upload"]'],

            descriptionEditor: '._description_2klkp_59',
            descriptionEditorAlt: '[id="work-description-edit"]',

            locationInput: '.ant-select-selection-search-input',
            locationSelect: '.ant-select-selection-item',
            locationOption: '.ant-select-item-option',

            publishButton: '._button_3a3lq_1._button-primary_3a3lq_60',
            publishButtonAlt: 'button[class*="primary"]',

            uploadProgress: ['.upload-progress', '[class*="progress"]'],
            successMessage: ['.success-message', '[class*="success"]']
        },

        fields: {
            title: { required: false },
            description: { required: true, maxLength: 300 },
            location: { required: false, maxLength: 50 }
        },

        features: {
            useIframe: false,
            supportLocation: true,
            autoPublish: true,
            noTitle: true
        },

        timing: {
            pageLoadTimeout: 15000,
            uploadTimeout: 60000,
            processingTimeout: 60000,
            publishTimeout: 10000,
            retryDelay: 2000,
            maxRetries: 3
        }
    }
}

// 工具函数保持不变...
export function getPlatformConfig(platformId) {
    return PLATFORM_CONFIGS[platformId] || null
}

export function getSupportedPlatforms(status = null) {
    const platforms = Object.values(PLATFORM_CONFIGS)
    if (status) {
        return platforms.filter(p => p.status === status)
    }
    return platforms
}

export function getAvailablePlatforms() {
    return getSupportedPlatforms().filter(p => p.status !== 'planned')
}

export function getPlatformUrl(platformId, type = 'upload') {
    const config = getPlatformConfig(platformId)
    return config?.urls?.[type] || null
}

export function getPlatformSelector(platformId, selectorName) {
    const config = getPlatformConfig(platformId)
    return config?.selectors?.[selectorName] || null
}

export function getPlatformTiming(platformId) {
    const config = getPlatformConfig(platformId)
    return config?.timing || {
        pageLoadTimeout: 15000,
        uploadTimeout: 60000,
        processingTimeout: 30000,
        publishTimeout: 10000,
        retryDelay: 2000,
        maxRetries: 3
    }
}

// 其他工具函数保持不变...
export function validatePlatformContent(platformId, content) {
    const config = getPlatformConfig(platformId)
    if (!config) {
        return { valid: false, error: `不支持的平台: ${platformId}` }
    }

    const errors = []

    if (config.fields.title?.required && !content.title?.trim()) {
        errors.push(`${config.name}需要标题`)
    }

    if (content.title && config.fields.title?.maxLength && content.title.length > config.fields.title.maxLength) {
        errors.push(`${config.name}标题超出限制(${config.fields.title.maxLength}字符)`)
    }

    if (content.title && config.fields.title?.minLength && content.title.length < config.fields.title.minLength) {
        errors.push(`${config.name}标题至少需要${config.fields.title.minLength}字符`)
    }

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

export function adaptContentToPlatform(platformId, content) {
    const config = getPlatformConfig(platformId)
    if (!config) return content

    const adapted = { ...content }

    if (config.features?.noTitle) {
        adapted.title = ''
    }

    if (adapted.title && config.fields.title?.maxLength) {
        if (adapted.title.length > config.fields.title.maxLength) {
            adapted.title = adapted.title.substring(0, config.fields.title.maxLength - 3) + '...'
        }
    }

    if (adapted.description && config.fields.description?.maxLength) {
        if (adapted.description.length > config.fields.description.maxLength) {
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

export function getPlatformFeatures(platformId) {
    const config = getPlatformConfig(platformId)
    return config?.features || {}
}

export function isPlatformAvailable(platformId) {
    const config = getPlatformConfig(platformId)
    return config && config.status !== 'planned'
}

export default PLATFORM_CONFIGS