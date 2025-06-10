// automation/engines/douyin-video-publisher.js - 配置驱动版本
// 所有页面元素都从 platformConfig 中读取，便于维护

import fs from 'fs'
import path from 'path'

export class DouyinVideoPublisher {
    constructor(session, platformConfig) {
        this.session = session
        this.config = platformConfig
        this.selectors = platformConfig.selectors
        this.features = platformConfig.features
        this.timing = platformConfig.timing
    }

    async uploadFile(filePath) {
        console.log('📤 上传视频到抖音...')

        try {
            // ChromeController 已经自动导航到上传页面
            if (this.features.needClickUpload) {
                await this.clickUploadButton()
            }

            const result = await this.uploadFileToDouyin(filePath)

            if (this.features.needVideoReview) {
                console.log('⏳ 等待抖音视频审核完成...')
                await this.waitForVideoReview()
            }

            return result
        } catch (error) {
            throw new Error(`抖音文件上传失败: ${error.message}`)
        }
    }

    async fillForm(content) {
        console.log('📝 填写抖音表单...')

        const steps = []
        await this.delay(3000) // 等待页面加载

        // 填写标题
        if (content.title && this.config.fields.title.required) {
            try {
                console.log('📝 填写抖音标题...')
                await this.fillFieldWithRetry('title', content.title)
                steps.push({ field: '标题', success: true, value: content.title })
                console.log(`   ✅ 标题填写成功: ${content.title}`)
            } catch (error) {
                steps.push({ field: '标题', success: false, error: error.message })
                console.log(`   ⚠️ 标题填写失败: ${error.message}`)
            }
        }

        // 填写描述
        if (content.description) {
            try {
                console.log('📝 填写抖音描述...')
                await this.fillFieldWithRetry('description', content.description)
                steps.push({ field: '描述', success: true, value: content.description })
                console.log(`   ✅ 描述填写成功`)
            } catch (error) {
                steps.push({ field: '描述', success: false, error: error.message })
                console.log(`   ⚠️ 描述填写失败: ${error.message}`)
            }
        }

        // 填写位置
        if (content.location && this.features.supportLocation) {
            try {
                console.log('📍 填写抖音位置...')
                await this.fillLocationField(content.location)
                steps.push({ field: '位置', success: true, value: content.location })
                console.log(`   ✅ 位置填写成功`)
            } catch (error) {
                steps.push({ field: '位置', success: false, error: error.message })
                console.log(`   ⚠️ 位置填写失败: ${error.message}`)
            }
        }

        return { success: true, steps }
    }

    async publish() {
        console.log('🚀 发布抖音视频...')

        try {
            await this.waitForPublishButton()
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

    // ==================== 通用方法：基于配置查找元素 ====================

    /**
     * 通用元素查找方法
     * @param {string} selectorKey - 配置中的选择器键名
     * @param {Document} doc - 文档对象，默认为当前页面
     * @returns {Element|null} - 找到的元素
     */
    async findElement(selectorKey, doc = null) {
        const script = `
            (function() {
                const doc = ${doc ? 'arguments[0]' : 'document'};
                const selectors = ${JSON.stringify(this.selectors)};
                
                // 获取主选择器
                const mainSelector = selectors['${selectorKey}'];
                if (mainSelector) {
                    const element = doc.querySelector(mainSelector);
                    if (element) {
                        return { found: true, selector: mainSelector, element: element };
                    }
                }
                
                // 尝试备用选择器
                const altSelectors = selectors['${selectorKey}Alt'];
                if (altSelectors && Array.isArray(altSelectors)) {
                    for (const selector of altSelectors) {
                        const element = doc.querySelector(selector);
                        if (element) {
                            return { found: true, selector: selector, element: element };
                        }
                    }
                }
                
                return { found: false, selector: null, element: null };
            })()
        `

        const result = await this.executeScript(script)
        return result.result.value
    }

    /**
     * 通用字段填写方法（带重试）
     */
    async fillFieldWithRetry(fieldType, value) {
        const maxRetries = this.timing.maxRetries || 3
        const retryDelay = this.timing.retryDelay || 2000

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            console.log(`🎯 尝试填写${fieldType} (第${attempt}次)...`)

            try {
                if (fieldType === 'title') {
                    await this.fillTitleField(value)
                } else if (fieldType === 'description') {
                    await this.fillDescriptionField(value)
                }

                console.log(`   ✅ ${fieldType}填写成功`)
                return
            } catch (error) {
                console.log(`   ⚠️ 第${attempt}次尝试失败: ${error.message}`)
                if (attempt < maxRetries) {
                    await this.delay(retryDelay)
                }
            }
        }

        throw new Error(`${fieldType}填写失败，已尝试${maxRetries}次`)
    }

    /**
     * 填写标题字段
     */
    async fillTitleField(value) {
        const script = `
            (function() {
                try {
                    const selectors = ${JSON.stringify(this.selectors)};
                    
                    // 尝试主选择器
                    let element = document.querySelector(selectors.titleInput);
                    
                    // 尝试备用选择器
                    if (!element && selectors.titleInputAlt) {
                        for (const selector of selectors.titleInputAlt) {
                            element = document.querySelector(selector);
                            if (element) break;
                        }
                    }
                    
                    if (!element) {
                        throw new Error('未找到标题输入框');
                    }

                    console.log('找到标题输入框:', element.placeholder || element.className);
                    
                    // 确保元素可见并聚焦
                    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    element.focus();
                    
                    // 清空并设置新值
                    element.value = '';
                    element.value = '${value.replace(/'/g, "\\'")}';
                    
                    // 触发事件
                    element.dispatchEvent(new Event('focus', { bubbles: true }));
                    element.dispatchEvent(new Event('input', { bubbles: true }));
                    element.dispatchEvent(new Event('change', { bubbles: true }));
                    element.dispatchEvent(new Event('blur', { bubbles: true }));
                    
                    // 验证
                    if (element.value === '${value.replace(/'/g, "\\'")}') {
                        return { success: true, value: element.value };
                    } else {
                        throw new Error('标题值设置失败');
                    }
                    
                } catch (e) {
                    return { success: false, error: e.message };
                }
            })()
        `

        const result = await this.executeScript(script)
        const fillResult = result.result.value

        if (!fillResult.success) {
            throw new Error(fillResult.error)
        }
    }

    /**
     * 填写描述字段
     */
    async fillDescriptionField(value) {
        const script = `
            (function() {
                try {
                    const selectors = ${JSON.stringify(this.selectors)};
                    
                    // 尝试主选择器
                    let element = document.querySelector(selectors.descriptionEditor);
                    
                    // 尝试备用选择器
                    if (!element && selectors.descriptionEditorAlt) {
                        for (const selector of selectors.descriptionEditorAlt) {
                            element = document.querySelector(selector);
                            if (element) break;
                        }
                    }
                    
                    if (!element) {
                        throw new Error('未找到描述编辑器');
                    }

                    console.log('找到描述编辑器:', element.getAttribute('data-placeholder') || element.className);
                    
                    // 确保元素可见并聚焦
                    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    element.focus();
                    
                    // 清空并设置新内容
                    element.innerHTML = '';
                    element.textContent = '${value.replace(/'/g, "\\'")}';
                    
                    // 触发事件
                    element.dispatchEvent(new Event('focus', { bubbles: true }));
                    element.dispatchEvent(new InputEvent('input', { bubbles: true, data: '${value.replace(/'/g, "\\'")}' }));
                    element.dispatchEvent(new Event('change', { bubbles: true }));
                    element.dispatchEvent(new Event('blur', { bubbles: true }));
                    
                    // 验证
                    if (element.textContent.trim() === '${value.replace(/'/g, "\\'")}') {
                        return { success: true, content: element.textContent };
                    } else {
                        throw new Error('描述内容设置失败');
                    }
                    
                } catch (e) {
                    return { success: false, error: e.message };
                }
            })()
        `

        const result = await this.executeScript(script)
        const fillResult = result.result.value

        if (!fillResult.success) {
            throw new Error(fillResult.error)
        }
    }

    /**
     * 填写位置字段
     */
    async fillLocationField(value) {
        const script = `
            (function() {
                const selectors = ${JSON.stringify(this.selectors)};
                const element = document.querySelector(selectors.locationSelect);
                if (!element) throw new Error('未找到位置选择器');
                
                element.click();
                
                setTimeout(() => {
                    const input = document.querySelector(selectors.locationInput);
                    if (input) {
                        input.value = '${value.replace(/'/g, "\\'")}';
                        input.dispatchEvent(new Event('input', { bubbles: true }));
                        
                        setTimeout(() => {
                            const option = document.querySelector(selectors.locationOption);
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

    // ==================== 平台特定操作方法 ====================

    async clickUploadButton() {
        const script = `
            (function() {
                const selectors = ${JSON.stringify(this.selectors)};
                
                // 尝试主上传按钮
                let uploadButton = document.querySelector(selectors.uploadButton);
                if (uploadButton && uploadButton.textContent.includes(selectors.uploadButtonText)) {
                    uploadButton.click();
                    return { success: true };
                }
                
                // 尝试备用上传按钮
                if (selectors.uploadButtonAlt) {
                    for (const selector of selectors.uploadButtonAlt) {
                        const button = document.querySelector(selector);
                        if (button) {
                            button.click();
                            return { success: true };
                        }
                    }
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

    async uploadFileToDouyin(filePath) {
        console.log('📤 上传文件到抖音...')

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
                    const selectors = ${JSON.stringify(this.selectors)};
                    
                    // 查找文件输入框
                    let fileInput = document.querySelector(selectors.fileInput);
                    
                    if (!fileInput && selectors.fileInputAlt) {
                        for (const selector of selectors.fileInputAlt) {
                            fileInput = document.querySelector(selector);
                            if (fileInput) break;
                        }
                    }
                    
                    if (!fileInput) {
                        throw new Error('未找到文件上传输入框');
                    }
                    
                    console.log('找到文件输入框');
                    
                    // 创建文件对象
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
                    
                    // 创建FileList
                    const dataTransfer = new DataTransfer();
                    dataTransfer.items.add(file);
                    
                    // 设置文件到input
                    Object.defineProperty(fileInput, 'files', {
                        value: dataTransfer.files,
                        configurable: true
                    });
                    
                    // 触发事件
                    fileInput.focus();
                    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
                    fileInput.dispatchEvent(new Event('input', { bubbles: true }));
                    
                    console.log('文件上传事件已触发');
                    
                    return {
                        success: true,
                        fileName: '${fileName}',
                        fileSize: ${fileBuffer.length},
                        mimeType: '${mimeType}'
                    };
                    
                } catch (e) {
                    console.error('文件上传失败:', e.message);
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
        await this.delay(3000)

        return uploadResult
    }

    async waitForVideoReview() {
        const timeout = this.timing.reviewTimeout
        const checkInterval = this.timing.reviewCheckInterval
        const startTime = Date.now()

        console.log('⏳ 等待抖音视频审核完成...')

        while (Date.now() - startTime < timeout) {
            const script = `
                (function() {
                    try {
                        const selectors = ${JSON.stringify(this.selectors)};
                        
                        // 检查审核状态元素
                        if (selectors.reviewStatus) {
                            for (const selector of selectors.reviewStatus) {
                                const reviewElements = document.querySelectorAll(selector);
                                for (let el of reviewElements) {
                                    for (const reviewingText of selectors.reviewingText) {
                                        if (el.textContent.includes(reviewingText)) {
                                            return { reviewing: true, status: reviewingText };
                                        }
                                    }
                                }
                            }
                        }

                        // 检查标题输入框是否可用（审核完成的标志）
                        const titleInput = document.querySelector(selectors.titleInput);
                        if (titleInput && !titleInput.disabled) {
                            console.log('标题输入框可用，审核可能已完成');
                            return { reviewing: false, status: '审核完成', ready: true };
                        }

                        // 检查发布按钮是否可用
                        const publishButton = document.querySelector(selectors.publishButton);
                        if (publishButton && !publishButton.disabled && publishButton.textContent.trim() === selectors.publishButtonText) {
                            console.log('发布按钮可用');
                            return { reviewing: false, status: '准备就绪', ready: true };
                        }

                        // 检查错误信息
                        if (selectors.errorMessage) {
                            for (const selector of selectors.errorMessage) {
                                const errorElements = document.querySelectorAll(selector);
                                for (let el of errorElements) {
                                    if (el.textContent.includes('失败') || el.textContent.includes('错误')) {
                                        return { reviewing: false, status: '审核失败', error: el.textContent };
                                    }
                                }
                            }
                        }

                        return { reviewing: true, status: '检查中' };
                    } catch (e) {
                        return { reviewing: true, status: '检查异常', error: e.message };
                    }
                })()
            `

            const result = await this.executeScript(script)
            const status = result.result.value

            const waitTime = Math.round((Date.now() - startTime) / 1000)
            console.log(`⏳ 审核状态检查 (${waitTime}s): ${status.status}`)

            if (status.error) {
                throw new Error(`审核失败: ${status.error}`)
            }

            if (status.ready) {
                console.log('✅ 抖音视频审核完成，可以继续填写表单')
                return true
            }

            await this.delay(checkInterval)
        }

        throw new Error('抖音视频审核超时，请手动检查')
    }

    async waitForPublishButton() {
        console.log('⏳ 等待发布按钮可用...')

        const timeout = this.timing.publishTimeout
        const startTime = Date.now()

        while (Date.now() - startTime < timeout) {
            const script = `
                (function() {
                    const selectors = ${JSON.stringify(this.selectors)};
                    
                    // 检查主发布按钮
                    let button = document.querySelector(selectors.publishButton);
                    
                    // 检查备用发布按钮
                    if (!button && selectors.publishButtonAlt) {
                        for (const selector of selectors.publishButtonAlt) {
                            button = document.querySelector(selector);
                            if (button) break;
                        }
                    }
                    
                    if (button) {
                        const isEnabled = !button.disabled && button.textContent.trim() === selectors.publishButtonText;
                        console.log('发布按钮状态:', isEnabled ? '可用' : '不可用', button.textContent);
                        return { ready: isEnabled, text: button.textContent.trim() };
                    }
                    return { ready: false, error: '未找到发布按钮' };
                })()
            `

            const result = await this.executeScript(script)
            const status = result.result.value

            if (status.ready) {
                console.log('✅ 发布按钮已可用')
                return true
            }

            const waitTime = Math.round((Date.now() - startTime) / 1000)
            console.log(`⏳ 等待发布按钮可用... (${waitTime}s)`)

            await this.delay(2000)
        }

        throw new Error('发布按钮等待超时')
    }

    async clickPublishButton() {
        const script = `
            (function() {
                const selectors = ${JSON.stringify(this.selectors)};
                
                // 尝试主发布按钮
                let button = document.querySelector(selectors.publishButton);
                
                // 尝试备用发布按钮
                if (!button && selectors.publishButtonAlt) {
                    for (const selector of selectors.publishButtonAlt) {
                        button = document.querySelector(selector);
                        if (button) break;
                    }
                }
                
                if (!button) {
                    throw new Error('未找到发布按钮');
                }
                
                if (button.disabled) {
                    throw new Error('发布按钮已禁用');
                }

                // 确保按钮可见并点击
                button.scrollIntoView({ behavior: 'smooth', block: 'center' });
                button.focus();
                button.click();
                
                console.log('✅ 已点击发布按钮');
                
                return { success: true, buttonText: button.textContent.trim() };
            })()
        `

        const result = await this.executeScript(script)
        const clickResult = result.result.value

        if (!clickResult.success) {
            throw new Error('点击发布按钮失败')
        }

        console.log('✅ 发布按钮点击成功')
        await this.delay(3000)
    }

    async checkPublishStatus() {
        const script = `
            (function() {
                const selectors = ${JSON.stringify(this.selectors)};
                
                // 检查成功消息
                if (selectors.successMessage) {
                    for (const selector of selectors.successMessage) {
                        const successElements = document.querySelectorAll(selector);
                        for (let el of successElements) {
                            if (el.textContent.includes('成功')) {
                                return { status: 'success', message: el.textContent.trim() };
                            }
                        }
                    }
                }
                
                // 检查错误消息
                if (selectors.errorMessage) {
                    for (const selector of selectors.errorMessage) {
                        const errorElements = document.querySelectorAll(selector);
                        for (let el of errorElements) {
                            return { status: 'error', message: el.textContent.trim() };
                        }
                    }
                }
                
                return { status: 'unknown', message: '状态未知' };
            })()
        `

        const result = await this.executeScript(script)
        return result.result.value
    }

    // ==================== 工具方法 ====================

    getMimeType(filePath) {
        const ext = path.extname(filePath).toLowerCase()
        const mimeTypes = {
            '.mp4': 'video/mp4',
            '.avi': 'video/avi',
            '.mov': 'video/quicktime',
            '.wmv': 'video/x-ms-wmv',
            '.flv': 'video/x-flv',
            '.webm': 'video/webm',
            '.m4v': 'video/mp4',
            '.3gp': 'video/3gpp'
        }
        return mimeTypes[ext] || 'video/mp4'
    }

    async executeScript(script) {
        return await this.session.chromeController.executeScript(this.session, script)
    }

    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms))
    }
}