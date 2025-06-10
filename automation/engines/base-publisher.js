// ============ 1. 基础发布器抽象类 ============
// automation/engines/base-publisher.js
export class BasePublisher {
    constructor(session, platformConfig) {
        this.session = session
        this.platformConfig = platformConfig
        this.features = platformConfig.features || {}
        this.selectors = platformConfig.selectors || {}
        this.timing = platformConfig.timing || {}
    }

    // 抽象方法 - 子类必须实现
    async uploadFile(filePath) {
        throw new Error('uploadFile method must be implemented')
    }

    async fillForm(content) {
        throw new Error('fillForm method must be implemented')
    }

    async publish() {
        throw new Error('publish method must be implemented')
    }

    // 通用方法
    async navigateToUploadPage() {
        console.log(`🔄 导航到 ${this.platformConfig.name} 上传页面`)

        try {
            await this.session.chromeController.sendCommand(this.session, 'Page.navigate', {
                url: this.platformConfig.urls.upload
            })

            await this.waitForPageLoad()
            return true
        } catch (error) {
            console.error(`❌ 导航失败: ${error.message}`)
            return false
        }
    }

    async waitForPageLoad(timeout = 15000) {
        console.log('⏳ 等待页面加载完成...')

        const startTime = Date.now()
        while (Date.now() - startTime < timeout) {
            try {
                const readyState = await this.session.chromeController.sendCommand(this.session, 'Runtime.evaluate', {
                    expression: 'document.readyState',
                    returnByValue: true
                })

                if (readyState.result.value === 'complete') {
                    await new Promise(resolve => setTimeout(resolve, 2000))
                    return true
                }

                await new Promise(resolve => setTimeout(resolve, 1000))
            } catch (error) {
                await new Promise(resolve => setTimeout(resolve, 1000))
            }
        }
        return false
    }

    async executeScript(script) {
        return await this.session.chromeController.executeScript(this.session, script)
    }

    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms))
    }

    // 通用文件上传方法
    async uploadFileToInput(filePath, inputSelector = 'input[type="file"]') {
        console.log(`📤 上传文件到 ${this.platformConfig.name}: ${filePath}`)

        const fs = await import('fs')
        const path = await import('path')

        if (!fs.existsSync(filePath)) {
            throw new Error(`文件不存在: ${filePath}`)
        }

        const fileBuffer = fs.readFileSync(filePath)
        const base64Data = fileBuffer.toString('base64')
        const fileName = path.basename(filePath)
        const mimeType = this.getMimeType(filePath)

        const script = `
            (function() {
                try {
                    ${this.features.useIframe ? `
                        const iframe = document.querySelector('iframe');
                        if (!iframe || !iframe.contentDocument) {
                            throw new Error('无法访问iframe');
                        }
                        const doc = iframe.contentDocument;
                    ` : `
                        const doc = document;
                    `}
                    
                    let fileInput = doc.querySelector('${inputSelector}');
                    if (!fileInput) {
                        const selectors = [
                            'input[type="file"]',
                            'input[accept*="video"]',
                            'input[accept*="image"]',
                            '[data-testid*="upload"] input'
                        ];
                        
                        for (const selector of selectors) {
                            fileInput = doc.querySelector(selector);
                            if (fileInput) break;
                        }
                    }
                    
                    if (!fileInput) {
                        throw new Error('未找到文件上传输入框');
                    }
                    
                    // 创建File对象
                    const byteCharacters = atob('${base64Data}');
                    const byteNumbers = new Array(byteCharacters.length);
                    for (let i = 0; i < byteCharacters.length; i++) {
                        byteNumbers[i] = byteCharacters.charCodeAt(i);
                    }
                    const byteArray = new Uint8Array(byteNumbers);
                    const blob = new Blob([byteArray], { type: '${mimeType}' });
                    const file = new File([blob], '${fileName}', {
                        type: '${mimeType}',
                        lastModified: Date.now()
                    });
                    
                    // 设置文件
                    const dataTransfer = new DataTransfer();
                    dataTransfer.items.add(file);
                    Object.defineProperty(fileInput, 'files', {
                        value: dataTransfer.files,
                        configurable: true
                    });
                    
                    // 触发事件
                    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
                    fileInput.dispatchEvent(new Event('input', { bubbles: true }));
                    
                    return { success: true, fileName: '${fileName}' };
                } catch (e) {
                    return { success: false, error: e.message };
                }
            })()
        `

        const result = await this.executeScript(script)
        const uploadResult = result.result.value

        if (!uploadResult.success) {
            throw new Error(`文件上传失败: ${uploadResult.error}`)
        }

        console.log(`✅ 文件上传成功: ${uploadResult.fileName}`)
        return uploadResult
    }

    getMimeType(filePath) {
        const path = require('path')
        const ext = path.extname(filePath).toLowerCase()
        const mimeTypes = {
            '.mp4': 'video/mp4',
            '.avi': 'video/avi',
            '.mov': 'video/quicktime',
            '.wmv': 'video/x-ms-wmv',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.mp3': 'audio/mpeg',
            '.wav': 'audio/wav'
        }
        return mimeTypes[ext] || 'application/octet-stream'
    }
}

// ============ 2. 微信视频号发布器 ============
// automation/engines/wechat-video-publisher.js
import { BasePublisher } from './base-publisher.js'

export class WeChatVideoPublisher extends BasePublisher {
    constructor(session, platformConfig) {
        super(session, platformConfig)
    }

    async uploadFile(filePath) {
        console.log('📤 上传视频到微信视频号...')

        try {
            await this.navigateToUploadPage()
            const result = await this.uploadFileToInput(filePath)

            // 等待视频处理完成
            if (this.features.needWaitProcessing) {
                await this.waitForVideoProcessing()
            }

            return result
        } catch (error) {
            throw new Error(`微信视频号文件上传失败: ${error.message}`)
        }
    }

    async fillForm(content) {
        console.log('📝 填写微信视频号表单...')

        const steps = []

        // 填写短标题
        if (content.title || content.description) {
            try {
                const shortTitle = this.generateShortTitle(content)
                await this.fillShortTitle(shortTitle)
                steps.push({ field: '短标题', success: true, value: shortTitle })
            } catch (error) {
                steps.push({ field: '短标题', success: false, error: error.message })
            }
        }

        // 填写描述
        if (content.description) {
            try {
                await this.fillDescription(content.description)
                steps.push({ field: '描述', success: true, value: content.description })
            } catch (error) {
                steps.push({ field: '描述', success: false, error: error.message })
            }
        }

        // 填写位置
        if (content.location) {
            try {
                await this.fillLocation(content.location)
                steps.push({ field: '位置', success: true, value: content.location })
            } catch (error) {
                steps.push({ field: '位置', success: false, error: error.message })
            }
        }

        return { success: true, steps }
    }

    async publish() {
        console.log('🚀 发布微信视频号...')

        try {
            // 等待发布按钮激活
            await this.waitForPublishButton()

            // 点击发布
            await this.clickPublishButton()

            // 检查发布状态
            const status = await this.checkPublishStatus()

            return {
                success: true,
                status: status.status,
                message: status.message
            }
        } catch (error) {
            throw new Error(`微信视频号发布失败: ${error.message}`)
        }
    }

    // 私有方法
    generateShortTitle(content) {
        let sourceText = content.title || content.description || ''
        const cleanText = sourceText
            .replace(/[#@\[\]()（）「」【】、，。！~`!@$^&*()_=\-\[\]{}\\|;':",.<>/]/g, '')
            .replace(/\s+/g, ' ')
            .trim()

        if (cleanText.length >= 6 && cleanText.length <= 16) {
            return cleanText
        } else if (cleanText.length > 16) {
            return cleanText.substring(0, 16)
        } else {
            return cleanText + '分享'
        }
    }

    async fillShortTitle(value) {
        const script = `
            (function() {
                const iframe = document.querySelector('iframe');
                const doc = iframe ? iframe.contentDocument : document;
                const element = doc.querySelector('input[placeholder*="概括视频主要内容"]');
                
                if (!element) throw new Error('未找到短标题输入框');
                
                element.focus();
                element.value = '${value.replace(/'/g, "\\'")}';
                element.dispatchEvent(new Event('input', { bubbles: true }));
                element.dispatchEvent(new Event('change', { bubbles: true }));
                
                return { success: true };
            })()
        `

        const result = await this.executeScript(script)
        if (!result.result.value.success) {
            throw new Error('短标题填写失败')
        }
    }

    async fillDescription(value) {
        const script = `
            (function() {
                const iframe = document.querySelector('iframe');
                const doc = iframe ? iframe.contentDocument : document;
                let element = doc.querySelector('div[contenteditable][data-placeholder="添加描述"]');
                
                if (!element) {
                    element = doc.querySelector('.input-editor[contenteditable]');
                }
                
                if (!element) throw new Error('未找到描述编辑器');
                
                element.focus();
                element.textContent = '${value.replace(/'/g, "\\'")}';
                element.dispatchEvent(new Event('input', { bubbles: true }));
                element.dispatchEvent(new Event('change', { bubbles: true }));
                
                return { success: true };
            })()
        `

        const result = await this.executeScript(script)
        if (!result.result.value.success) {
            throw new Error('描述填写失败')
        }
    }

    async fillLocation(value) {
        const script = `
            (function() {
                const iframe = document.querySelector('iframe');
                const doc = iframe ? iframe.contentDocument : document;
                const element = doc.querySelector('input[placeholder*="位置"]');
                
                if (!element) throw new Error('未找到位置输入框');
                
                element.focus();
                element.value = '${value.replace(/'/g, "\\'")}';
                element.dispatchEvent(new Event('input', { bubbles: true }));
                
                // 等待下拉列表并选择
                setTimeout(() => {
                    const options = doc.querySelectorAll('.common-option-list-wrap .option-item');
                    if (options.length > 0) {
                        options[0].click();
                    }
                }, 1000);
                
                return { success: true };
            })()
        `

        const result = await this.executeScript(script)
        if (!result.result.value.success) {
            throw new Error('位置填写失败')
        }

        // 等待下拉选择完成
        await this.delay(1500)
    }

    async waitForVideoProcessing(timeout = 60000) {
        console.log('⏳ 等待视频处理完成...')

        const startTime = Date.now()
        while (Date.now() - startTime < timeout) {
            const script = `
                (function() {
                    const iframe = document.querySelector('iframe');
                    const doc = iframe ? iframe.contentDocument : document;
                    const deleteButton = doc.querySelector('.finder-tag-wrap .tag-inner');
                    return deleteButton && deleteButton.textContent.trim() === '删除';
                })()
            `

            const result = await this.executeScript(script)
            if (result.result.value) {
                console.log('✅ 视频处理完成')
                return true
            }

            await this.delay(2000)
        }

        throw new Error('视频处理超时')
    }

    async waitForPublishButton(timeout = 30000) {
        console.log('⏳ 等待发布按钮激活...')

        const startTime = Date.now()
        while (Date.now() - startTime < timeout) {
            const script = `
                (function() {
                    const iframe = document.querySelector('iframe');
                    const doc = iframe ? iframe.contentDocument : document;
                    
                    const buttons = doc.querySelectorAll('button');
                    for (let button of buttons) {
                        if (button.textContent.trim() === '发表') {
                            return !button.disabled;
                        }
                    }
                    return false;
                })()
            `

            const result = await this.executeScript(script)
            if (result.result.value) {
                console.log('✅ 发布按钮已激活')
                return true
            }

            await this.delay(2000)
        }

        throw new Error('发布按钮激活超时')
    }

    async clickPublishButton() {
        const script = `
            (function() {
                const iframe = document.querySelector('iframe');
                const doc = iframe ? iframe.contentDocument : document;
                
                const buttons = doc.querySelectorAll('button');
                for (let button of buttons) {
                    if (button.textContent.trim() === '发表') {
                        button.click();
                        return { success: true };
                    }
                }
                throw new Error('未找到发表按钮');
            })()
        `

        const result = await this.executeScript(script)
        if (!result.result.value.success) {
            throw new Error('点击发表按钮失败')
        }

        await this.delay(3000)
    }

    async checkPublishStatus() {
        const script = `
            (function() {
                const iframe = document.querySelector('iframe');
                const doc = iframe ? iframe.contentDocument : document;
                
                // 检查成功提示
                const successElements = doc.querySelectorAll('.success-message, .toast-success, [class*="success"]');
                for (let el of successElements) {
                    if (el.textContent.includes('成功')) {
                        return { status: 'success', message: el.textContent.trim() };
                    }
                }
                
                // 检查URL变化
                if (window.location.href.includes('success')) {
                    return { status: 'success', message: '发布成功' };
                }
                
                return { status: 'unknown', message: '状态未知' };
            })()
        `

        const result = await this.executeScript(script)
        return result.result.value
    }
}

// ============ 3. 抖音发布器 ============
// automation/engines/douyin-video-publisher.js
import { BasePublisher } from './base-publisher.js'

export class DouyinVideoPublisher extends BasePublisher {
    constructor(session, platformConfig) {
        super(session, platformConfig)
    }

    async uploadFile(filePath) {
        console.log('📤 上传视频到抖音...')

        try {
            await this.navigateToUploadPage()

            // 抖音需要先点击上传按钮
            if (this.features.needClickUpload) {
                await this.clickUploadButton()
            }

            const result = await this.uploadFileToInput(filePath)

            if (this.features.needWaitProcessing) {
                await this.waitForUploadComplete()
            }

            return result
        } catch (error) {
            throw new Error(`抖音文件上传失败: ${error.message}`)
        }
    }

    async fillForm(content) {
        console.log('📝 填写抖音表单...')

        const steps = []

        // 填写标题
        if (content.title) {
            try {
                await this.fillTitle(content.title)
                steps.push({ field: '标题', success: true, value: content.title })
            } catch (error) {
                steps.push({ field: '标题', success: false, error: error.message })
            }
        }

        // 填写描述
        if (content.description) {
            try {
                await this.fillDescription(content.description)
                steps.push({ field: '描述', success: true, value: content.description })
            } catch (error) {
                steps.push({ field: '描述', success: false, error: error.message })
            }
        }

        // 填写位置
        if (content.location) {
            try {
                await this.fillLocation(content.location)
                steps.push({ field: '位置', success: true, value: content.location })
            } catch (error) {
                steps.push({ field: '位置', success: false, error: error.message })
            }
        }

        return { success: true, steps }
    }

    async publish() {
        console.log('🚀 发布抖音视频...')

        try {
            await this.clickPublishButton()
            const status = await this.checkPublishStatus()

            return {
                success: true,
                status: status.status,
                message: status.message
            }
        } catch (error) {
            throw new Error(`抖音发布失败: ${error.message}`)
        }
    }

    // 私有方法
    async clickUploadButton() {
        const script = `
            (function() {
                const uploadButton = document.querySelector('.semi-button-content');
                if (uploadButton && uploadButton.textContent.includes('上传视频')) {
                    uploadButton.click();
                    return { success: true };
                }
                throw new Error('未找到上传按钮');
            })()
        `

        const result = await this.executeScript(script)
        if (!result.result.value.success) {
            throw new Error('点击上传按钮失败')
        }

        await this.delay(2000)
    }

    async fillTitle(value) {
        const script = `
            (function() {
                let element = document.querySelector('.semi-input[placeholder*="填写作品标题"]');
                if (!element) {
                    element = document.querySelector('input[placeholder*="填写作品标题"]');
                }
                
                if (!element) throw new Error('未找到标题输入框');
                
                element.focus();
                element.value = '${value.replace(/'/g, "\\'")}';
                element.dispatchEvent(new Event('input', { bubbles: true }));
                
                return { success: true };
            })()
        `

        const result = await this.executeScript(script)
        if (!result.result.value.success) {
            throw new Error('标题填写失败')
        }
    }

    async fillDescription(value) {
        const script = `
            (function() {
                let element = document.querySelector('.editor-kit-container[data-placeholder="添加作品简介"]');
                if (!element) {
                    element = document.querySelector('.editor-kit-container.editor');
                }
                
                if (!element) throw new Error('未找到描述编辑器');
                
                element.focus();
                element.textContent = '${value.replace(/'/g, "\\'")}';
                element.dispatchEvent(new Event('input', { bubbles: true }));
                
                return { success: true };
            })()
        `

        const result = await this.executeScript(script)
        if (!result.result.value.success) {
            throw new Error('描述填写失败')
        }
    }

    async fillLocation(value) {
        const script = `
            (function() {
                const element = document.querySelector('.semi-select-selection-text');
                if (!element) throw new Error('未找到位置选择器');
                
                element.click();
                
                setTimeout(() => {
                    const input = document.querySelector('.semi-select-option-list input');
                    if (input) {
                        input.value = '${value.replace(/'/g, "\\'")}';
                        input.dispatchEvent(new Event('input', { bubbles: true }));
                        
                        setTimeout(() => {
                            const option = document.querySelector('.semi-select-option');
                            if (option) option.click();
                        }, 500);
                    }
                }, 500);
                
                return { success: true };
            })()
        `

        const result = await this.executeScript(script)
        if (!result.result.value.success) {
            throw new Error('位置填写失败')
        }

        await this.delay(2000)
    }

    async waitForUploadComplete(timeout = 90000) {
        console.log('⏳ 等待抖音视频上传完成...')

        const startTime = Date.now()
        while (Date.now() - startTime < timeout) {
            const script = `
                (function() {
                    const completeElement = document.querySelector('.upload-complete, [class*="complete"]');
                    return !!completeElement;
                })()
            `

            const result = await this.executeScript(script)
            if (result.result.value) {
                console.log('✅ 抖音视频上传完成')
                return true
            }

            await this.delay(3000)
        }

        throw new Error('抖音视频上传超时')
    }

    async clickPublishButton() {
        const script = `
            (function() {
                let button = document.querySelector('.button-dhlUZE.primary-cECiOJ');
                if (!button) {
                    button = document.querySelector('button[class*="primary"]');
                }
                
                if (!button) throw new Error('未找到发布按钮');
                
                button.click();
                return { success: true };
            })()
        `

        const result = await this.executeScript(script)
        if (!result.result.value.success) {
            throw new Error('点击发布按钮失败')
        }

        await this.delay(3000)
    }

    async checkPublishStatus() {
        const script = `
            (function() {
                const successElements = document.querySelectorAll('[class*="success"], .toast');
                for (let el of successElements) {
                    if (el.textContent.includes('成功')) {
                        return { status: 'success', message: el.textContent.trim() };
                    }
                }
                
                const errorElements = document.querySelectorAll('[class*="error"], .error-toast');
                for (let el of errorElements) {
                    return { status: 'error', message: el.textContent.trim() };
                }
                
                return { status: 'unknown', message: '状态未知' };
            })()
        `

        const result = await this.executeScript(script)
        return result.result.value
    }
}

// ============ 4. 多平台发布引擎 ============
// automation/engines/multi-platform-engine.js
import { WeChatVideoPublisher } from './wechat-video-publisher.js'
import { DouyinVideoPublisher } from './douyin-video-publisher.js'
// import { XiaohongshuVideoPublisher } from './xiaohongshu-video-publisher.js'
// import { KuaishouVideoPublisher } from './kuaishou-video-publisher.js'
import { getPlatformConfig } from '../config/platforms.js'

export class MultiPlatformEngine {
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

// ============ 5. 工作流执行引擎更新 ============
// automation/wechat-publisher/workflow-engine.js (新增多平台支持)
import { MultiPlatformEngine } from '../engines/multi-platform-engine.js'

export class EnhancedWorkflowEngine {
    constructor(config) {
        this.config = config
        this.multiPlatformEngine = new MultiPlatformEngine()
        this.multiPlatformEngine.initializePublishers()
        console.log('⚙️ EnhancedWorkflowEngine 初始化完成 (支持多平台)')
    }

    // 执行单平台工作流
    async executeSinglePlatform(session, platformId, content, filePath) {
        console.log(`🔄 执行单平台工作流: ${platformId}`)

        try {
            // 验证平台配置
            const validation = this.multiPlatformPublisher.validatePlatformConfig(platformId, content)
            if (!validation.valid) {
                throw new Error(`配置验证失败: ${validation.errors.join(', ')}`)
            }

            // 适配内容
            const adaptedContent = this.multiPlatformPublisher.adaptContentToPlatform(platformId, content)

            // 执行单平台发布
            const result = await this.multiPlatformEngine.publishToPlatform(
                platformId,
                session,
                adaptedContent,
                filePath
            )

            return {
                success: result.success,
                platform: platformId,
                mode: 'single_platform',
                result,
                adaptedContent
            }

        } catch (error) {
            console.error(`❌ 单平台工作流执行失败:`, error.message)
            return {
                success: false,
                platform: platformId,
                mode: 'single_platform',
                error: error.message
            }
        }
    }

    // 执行多平台工作流
    async executeMultiPlatform(sessions, platforms, content, filePath) {
        console.log(`🔄 执行多平台工作流: ${platforms.join(', ')}`)

        try {
            // 验证所有平台配置
            const validationResults = platforms.map(platformId => ({
                platformId,
                validation: this.multiPlatformEngine.validatePlatformConfig(platformId, content)
            }))

            const invalidPlatforms = validationResults.filter(r => !r.validation.valid)
            if (invalidPlatforms.length > 0) {
                const errors = invalidPlatforms.map(p => `${p.platformId}: ${p.validation.errors.join(', ')}`)
                throw new Error(`平台配置验证失败: ${errors.join('; ')}`)
            }

            // 适配内容到各平台
            const adaptedContents = platforms.map(platformId => ({
                platformId,
                content: this.multiPlatformEngine.adaptContentToPlatform(platformId, content)
            }))

            // 执行多平台发布
            const result = await this.multiPlatformEngine.publishToMultiplePlatforms(
                platforms,
                sessions,
                content,
                filePath
            )

            return {
                success: result.success,
                platforms,
                mode: 'multi_platform',
                totalPlatforms: result.totalPlatforms,
                successCount: result.successCount,
                failureCount: result.failureCount,
                results: result.results,
                adaptedContents
            }

        } catch (error) {
            console.error(`❌ 多平台工作流执行失败:`, error.message)
            return {
                success: false,
                platforms,
                mode: 'multi_platform',
                error: error.message
            }
        }
    }

    // 获取支持的平台列表
    getSupportedPlatforms() {
        return this.multiPlatformEngine.getSupportedPlatforms()
    }

    // 预览各平台适配后的内容
    previewAdaptedContent(platforms, content) {
        return platforms.map(platformId => ({
            platformId,
            platformName: getPlatformConfig(platformId)?.name || platformId,
            adaptedContent: this.multiPlatformEngine.adaptContentToPlatform(platformId, content),
            validation: this.multiPlatformEngine.validatePlatformConfig(platformId, content)
        }))
    }
}

// ============ 6. CLI 命令行工具更新 ============
// automation/cli/automation-cli.js (新增多平台命令)

// 新增多平台发布命令
program
    .command('multi-publish')
    .description('多平台并行发布')
    .requiredOption('-c, --content <file>', '内容配置文件路径')
    .requiredOption('-p, --platforms <platforms>', '平台列表，逗号分隔 (wechat,douyin,xiaohongshu,kuaishou)')
    .requiredOption('-s, --sessions <file>', '浏览器会话配置文件路径')
    .option('-t, --template <file>', '模板配置文件路径')
    .option('--debug-ports <ports>', '调试端口列表，逗号分隔', '9225,9226,9227,9228')
    .action(async (options) => {
        try {
            console.log('📦 开始多平台并行发布...')

            // 解析参数
            const platforms = options.platforms.split(',').map(p => p.trim())
            const debugPorts = options.debugPorts.split(',').map(p => parseInt(p.trim()))

            // 检查文件
            if (!fs.existsSync(options.content)) {
                throw new Error(`内容配置文件不存在: ${options.content}`)
            }
            if (!fs.existsSync(options.sessions)) {
                throw new Error(`会话配置文件不存在: ${options.sessions}`)
            }

            const content = JSON.parse(fs.readFileSync(options.content, 'utf8'))
            const sessions = JSON.parse(fs.readFileSync(options.sessions, 'utf8'))
            const template = options.template && fs.existsSync(options.template) ?
                JSON.parse(fs.readFileSync(options.template, 'utf8')) : {}

            console.log(`📋 目标平台: ${platforms.join(', ')}`)
            console.log(`👥 浏览器会话数量: ${sessions.length}`)

            if (platforms.length !== sessions.length) {
                throw new Error(`平台数量(${platforms.length})与会话数量(${sessions.length})不匹配`)
            }

            // 初始化增强工作流引擎
            const { EnhancedWorkflowEngine } = await import('../wechat-publisher/workflow-engine.js')
            const workflowEngine = new EnhancedWorkflowEngine({
                debugPorts
            })

            // 创建浏览器会话
            const { ChromeController } = await import('../wechat-publisher/chrome-controller.js')
            const chromeController = new ChromeController({ debugPort: debugPorts[0] })

            const browserSessions = []
            for (let i = 0; i < sessions.length; i++) {
                const session = await chromeController.createSession(sessions[i])
                session.chromeController = chromeController
                browserSessions.push(session)
            }

            // 执行多平台发布
            const result = await workflowEngine.executeMultiPlatform(
                browserSessions,
                platforms,
                content,
                template,
                content.videoFile
            )

            // 清理会话
            for (const session of browserSessions) {
                await chromeController.closeSession(session.id)
            }

            console.log('\n📊 多平台发布结果:')
            result.results.forEach((platformResult, index) => {
                const status = platformResult.success ? '✅' : '❌'
                console.log(`${index + 1}. ${status} ${platformResult.platform}: ${platformResult.success ? '成功' : platformResult.error}`)
            })

            console.log(`\n📈 成功率: ${result.successCount}/${result.totalPlatforms} (${((result.successCount / result.totalPlatforms) * 100).toFixed(1)}%)`)

        } catch (error) {
            console.error('❌ 多平台发布失败:', error.message)
            process.exit(1)
        }
    })

// 新增平台预览命令
program
    .command('preview')
    .description('预览内容在各平台的适配效果')
    .requiredOption('-c, --content <file>', '内容配置文件路径')
    .option('-p, --platforms <platforms>', '平台列表，逗号分隔', 'wechat,douyin,xiaohongshu,kuaishou')
    .action(async (options) => {
        try {
            const platforms = options.platforms.split(',').map(p => p.trim())
            const content = JSON.parse(fs.readFileSync(options.content, 'utf8'))

            const { EnhancedWorkflowEngine } = await import('../wechat-publisher/workflow-engine.js')
            const workflowEngine = new EnhancedWorkflowEngine({})

            const previews = workflowEngine.previewAdaptedContent(platforms, content)

            console.log('\n📋 内容适配预览:')
            previews.forEach((preview, index) => {
                console.log(`\n${index + 1}. ${preview.platformName} (${preview.platformId})`)
                console.log(`   验证: ${preview.validation.valid ? '✅ 通过' : '❌ ' + preview.validation.errors.join(', ')}`)
                console.log(`   标题: ${preview.adaptedContent.title || '无'}`)
                console.log(`   描述: ${preview.adaptedContent.description?.substring(0, 50)}${preview.adaptedContent.description?.length > 50 ? '...' : ''}`)
                console.log(`   位置: ${preview.adaptedContent.location || '无'}`)
            })

        } catch (error) {
            console.error('❌ 内容预览失败:', error.message)
            process.exit(1)
        }
    })

// ============ 7. 配置文件示例 ============
// 多平台会话配置示例
/*
// sessions.json
[
    {
        "id": "wechat_session",
        "name": "微信视频号",
        "platform": "wechat",
        "debugPort": 9225
    },
    {
        "id": "douyin_session",
        "name": "抖音",
        "platform": "douyin",
        "debugPort": 9226
    },
    {
        "id": "xiaohongshu_session",
        "name": "小红书",
        "platform": "xiaohongshu",
        "debugPort": 9227
    },
    {
        "id": "kuaishou_session",
        "name": "快手",
        "platform": "kuaishou",
        "debugPort": 9228
    }
]
*/

// 内容配置示例
/*
// content.json
{
    "videoFile": "./videos/sample.mp4",
    "title": "精彩视频分享 - 记录美好瞬间",
    "description": "这是一个记录生活美好瞬间的精彩视频，希望大家喜欢！内容包含了风景、美食、人文等多个方面，让我们一起感受生活的美好。",
    "location": "北京市朝阳区",
    "tags": ["生活", "美好", "分享", "记录"],
    "hashtags": ["#生活记录", "#美好瞬间", "#视频分享"]
}
*/

// 使用示例命令
/*
# 单平台发布到微信视频号
node cli/automation-cli.js publish -t video -c content.json -a wechat-account.json

# 多平台并行发布
node cli/automation-cli.js multi-publish -c content.json -p wechat,douyin,xiaohongshu -s sessions.json

# 预览内容适配效果
node cli/automation-cli.js preview -c content.json -p wechat,douyin,xiaohongshu,kuaishou

# 测试单个平台
node cli/automation-cli.js publish -t video -c content.json -a douyin-account.json --debug-port 9226
*/