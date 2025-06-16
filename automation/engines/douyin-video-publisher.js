// automation/engines/douyin-video-publisher.js - 配置驱动版本
// 所有页面元素都从 platformConfig 中读取，便于维护

import fs from 'fs'
import path from 'path'

export class DouyinVideoPublisher {
    constructor(session, platformConfig, chromeController) {
        this.session = session
        this.chromeController = chromeController  // ✅ 正确接收并保存
        this.config = platformConfig
        this.selectors = platformConfig.selectors
        this.features = platformConfig.features
        this.timing = platformConfig.timing
    }

    async uploadFile(filePath) {
        console.log('📤 上传视频到抖音...')

        try {
            // ChromeController 已经自动导航到上传页面
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

    // 简化版的fillForm方法 - 无额外验证
    // 在 douyin-video-publisher.js 中替换现有的 fillForm 方法

    async fillForm(content) {
        console.log('📝 填写抖音表单...')

        const steps = []

        // 🔧 关键改进：增加等待时间，确保页面完全加载
        console.log('⏳ 等待页面完全加载...')
        await this.delay(5000) // 从3秒增加到5秒

        // 填写标题
        if (content.title && this.config.fields.title.required) {
            try {
                console.log('📝 填写抖音标题...')
                await this.fillFieldWithRetry('title', content.title)

                // 🔧 简单延时，让填写操作完全完成
                await this.delay(1500)

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

                // 🔧 简单延时，让填写操作完全完成
                await this.delay(1500)

                steps.push({ field: '描述', success: true, value: content.description })
                console.log(`   ✅ 描述填写成功`)
            } catch (error) {
                steps.push({ field: '描述', success: false, error: error.message })
                console.log(`   ⚠️ 描述填写失败: ${error.message}`)
            }
        }

        // 填写位置（如果需要）
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

    // 修复后的抖音表单填写方法
    // 替换 douyin-video-publisher.js 中的相应方法

    /**
     * 修复后的标题填写方法
     */
    async fillTitleField(value) {
        // 先传递值到页面环境，避免字符串插值问题
        await this.executeScript(`window._tempTitleValue = ${JSON.stringify(value)};`);

        const script = `
        (function() {
            try {
                const value = window._tempTitleValue;
                const selectors = ${JSON.stringify(this.selectors)};
                
                console.log('🔍 开始查找标题输入框...');
                console.log('目标值:', value);
                
                // 查找标题输入框 - 使用更灵活的查找策略
                let element = null;
                
                // 1. 尝试主选择器
                if (selectors.titleInput) {
                    element = document.querySelector(selectors.titleInput);
                    if (element) {
                        console.log('✅ 主选择器找到:', selectors.titleInput);
                    }
                }
                
                // 2. 尝试备用选择器
                if (!element && selectors.titleInputAlt) {
                    for (const selector of selectors.titleInputAlt) {
                        element = document.querySelector(selector);
                        if (element && element.placeholder && element.placeholder.includes('标题')) {
                            console.log('✅ 备用选择器找到:', selector);
                            break;
                        }
                    }
                }
                
                // 3. 最后尝试通用选择器
                if (!element) {
                    const allInputs = document.querySelectorAll('input[type="text"], input:not([type])');
                    for (const input of allInputs) {
                        if (input.placeholder && input.placeholder.includes('标题')) {
                            element = input;
                            console.log('✅ 通用查找找到标题框');
                            break;
                        }
                    }
                }
                
                if (!element) {
                    throw new Error('未找到标题输入框');
                }

                console.log('📝 开始填写标题...');
                console.log('输入框当前状态:', {
                    value: element.value,
                    disabled: element.disabled,
                    readonly: element.readOnly,
                    placeholder: element.placeholder
                });
                
                // 确保元素可见和可交互
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                
                // 清空并填写 - 使用多种方法确保成功
                element.focus();
                
                // 方法1: 选中所有内容后替换
                element.select();
                
                // 方法2: 使用 execCommand (如果支持)
                if (document.execCommand) {
                    document.execCommand('selectAll', false, null);
                    document.execCommand('insertText', false, value);
                } else {
                    // 方法3: 直接设置value
                    element.value = value;
                }
                
                // 触发所有相关事件
                const events = [
                    new Event('focus', { bubbles: true }),
                    new Event('input', { bubbles: true }),
                    new Event('change', { bubbles: true }),
                    new KeyboardEvent('keyup', { bubbles: true }),
                    new Event('blur', { bubbles: true })
                ];
                
                events.forEach(event => {
                    element.dispatchEvent(event);
                });
                
                // 等待一下再验证
                setTimeout(() => {
                    console.log('✅ 标题填写完成，当前值:', element.value);
                }, 100);
                
                // 验证填写结果
                const success = element.value === value && element.value.length > 0;
                
                // 清理临时变量
                delete window._tempTitleValue;
                
                return { 
                    success: success, 
                    value: element.value,
                    expected: value,
                    match: element.value === value
                };
                
            } catch (e) {
                console.error('标题填写异常:', e);
                delete window._tempTitleValue;
                return { success: false, error: e.message };
            }
        })()
    `;

        const result = await this.executeScript(script);
        const fillResult = result.result.value;

        if (!fillResult.success) {
            throw new Error(fillResult.error || '标题填写失败');
        }

        // 双重验证
        if (!fillResult.match) {
            console.warn(`⚠️ 标题填写不匹配: 期望"${fillResult.expected}", 实际"${fillResult.value}"`);
        }

        return fillResult;
    }

    /**
     * 修复后的描述填写方法
     */
    async fillDescriptionField(value) {
        // 先传递值到页面环境
        await this.executeScript(`window._tempDescValue = ${JSON.stringify(value)};`);

        const script = `
        (function() {
            try {
                const value = window._tempDescValue;
                const selectors = ${JSON.stringify(this.selectors)};
                
                console.log('🔍 开始查找描述编辑器...');
                console.log('目标值:', value);
                
                // 查找描述编辑器
                let element = null;
                
                // 1. 尝试主选择器
                if (selectors.descriptionEditor) {
                    element = document.querySelector(selectors.descriptionEditor);
                    if (element) {
                        console.log('✅ 主选择器找到:', selectors.descriptionEditor);
                    }
                }
                
                // 2. 尝试备用选择器
                if (!element && selectors.descriptionEditorAlt) {
                    for (const selector of selectors.descriptionEditorAlt) {
                        element = document.querySelector(selector);
                        if (element) {
                            console.log('✅ 备用选择器找到:', selector);
                            break;
                        }
                    }
                }
                
                // 3. 尝试通用富文本编辑器选择器
                if (!element) {
                    const editableElements = document.querySelectorAll('[contenteditable="true"]');
                    for (const el of editableElements) {
                        const placeholder = el.getAttribute('data-placeholder');
                        if (placeholder && placeholder.includes('简介')) {
                            element = el;
                            console.log('✅ 通用查找找到描述编辑器');
                            break;
                        }
                    }
                }
                
                if (!element) {
                    throw new Error('未找到描述编辑器');
                }

                console.log('📝 开始填写描述...');
                console.log('编辑器当前状态:', {
                    contentEditable: element.contentEditable,
                    textContent: element.textContent,
                    innerHTML: element.innerHTML,
                    placeholder: element.getAttribute('data-placeholder')
                });
                
                // 确保元素可见
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                
                // 聚焦编辑器
                element.focus();
                
                // 清空内容 - 富文本编辑器的清空方法
                if (document.execCommand) {
                    // 选中所有内容
                    const range = document.createRange();
                    range.selectNodeContents(element);
                    const selection = window.getSelection();
                    selection.removeAllRanges();
                    selection.addRange(range);
                    
                    // 删除选中内容
                    document.execCommand('delete', false, null);
                    
                    // 插入新内容
                    document.execCommand('insertText', false, value);
                } else {
                    // 备用方法：直接设置内容
                    element.innerHTML = '';
                    element.textContent = value;
                }
                
                // 触发事件 - 富文本编辑器需要特殊的事件处理
                const events = [
                    new Event('focus', { bubbles: true }),
                    new InputEvent('input', { 
                        bubbles: true, 
                        inputType: 'insertText',
                        data: value 
                    }),
                    new Event('change', { bubbles: true }),
                    new KeyboardEvent('keyup', { bubbles: true }),
                    new Event('blur', { bubbles: true })
                ];
                
                events.forEach(event => {
                    element.dispatchEvent(event);
                });
                
                // 等待处理
                setTimeout(() => {
                    console.log('✅ 描述填写完成，当前内容:', element.textContent);
                }, 100);
                
                // 验证结果
                const actualContent = element.textContent || element.innerText || '';
                const success = actualContent.trim().length > 0 && 
                               actualContent.trim() !== '添加作品简介' &&
                               actualContent.includes(value.substring(0, 10)); // 检查前10个字符
                
                // 清理临时变量
                delete window._tempDescValue;
                
                return { 
                    success: success, 
                    content: actualContent.trim(),
                    expected: value,
                    length: actualContent.trim().length
                };
                
            } catch (e) {
                console.error('描述填写异常:', e);
                delete window._tempDescValue;
                return { success: false, error: e.message };
            }
        })()
    `;

        const result = await this.executeScript(script);
        const fillResult = result.result.value;

        if (!fillResult.success) {
            throw new Error(fillResult.error || '描述填写失败');
        }

        return fillResult;
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
    async uploadFileToDouyin(filePath) {
        console.log('📤 直接注入文件到抖音...')

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
                    
                    console.log('🔍 查找视频文件输入框...');
                    
                    // 查找视频输入框 - 使用与测试相同的逻辑
                    console.log('尝试主选择器:', selectors.fileInput);
                    let videoInput = document.querySelector(selectors.fileInput);
                    
                    if (videoInput) {
                        console.log('✅ 主选择器找到视频输入框');
                    } else {
                        console.log('❌ 主选择器未找到，尝试备选选择器...');
                        
                        if (selectors.fileInputAlt) {
                            for (const selector of selectors.fileInputAlt) {
                                console.log(\`尝试备选选择器: "\${selector}"\`);
                                const inputs = document.querySelectorAll(selector);
                                
                                for (const input of inputs) {
                                    const accept = input.accept;
                                    if (accept && (accept.includes('video') || accept.includes('.mp4'))) {
                                        videoInput = input;
                                        console.log('✅ 备选选择器找到匹配的视频输入框');
                                        break;
                                    }
                                }
                                if (videoInput) break;
                            }
                        }
                    }
                    
                    if (!videoInput) {
                        throw new Error('未找到视频文件输入框');
                    }
                    
                    console.log('📁 开始文件注入...');
                    
                    // 阻止文件选择对话框弹出
                    const preventClick = (e) => {
                        e.preventDefault();
                        e.stopImmediatePropagation();
                        return false;
                    };
                    videoInput.addEventListener('click', preventClick, true);
                    
                    // 创建视频文件
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
                    
                    console.log('文件创建成功:', file.name, file.type, file.size + ' bytes');
                    
                    // 设置文件到输入框
                    const dataTransfer = new DataTransfer();
                    dataTransfer.items.add(file);
                    
                    Object.defineProperty(videoInput, 'files', {
                        value: dataTransfer.files,
                        configurable: true,
                        writable: true
                    });
                    
                    console.log('文件设置完成，当前files数量:', videoInput.files.length);
                    
                    // 触发事件
                    videoInput.focus();
                    
                    const changeEvent = new Event('change', { 
                        bubbles: true,
                        cancelable: true
                    });
                    videoInput.dispatchEvent(changeEvent);
                    console.log('✅ change事件已触发');
                    
                    const inputEvent = new Event('input', { bubbles: true });
                    videoInput.dispatchEvent(inputEvent);
                    console.log('✅ input事件已触发');
                    
                    // 清理事件监听器
                    setTimeout(() => {
                        videoInput.removeEventListener('click', preventClick, true);
                    }, 1000);
                    
                    return {
                        success: true,
                        fileName: '${fileName}',
                        fileSize: ${fileBuffer.length},
                        mimeType: '${mimeType}'
                    };
                    
                } catch (e) {
                    console.error('文件注入失败:', e.message);
                    return { success: false, error: e.message };
                }
            })()
        `

        const result = await this.executeScript(script)
        const uploadResult = result.result.value

        if (!uploadResult.success) {
            throw new Error(`文件注入失败: ${uploadResult.error}`)
        }

        console.log(`✅ 文件注入成功: ${uploadResult.fileName}`)
        console.log(`   文件大小: ${uploadResult.fileSize} bytes`)

        // 等待抖音SDK处理文件 - 比微信需要更长时间
        await this.delay(8000)

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
        return await this.chromeController.executeScript(this.session, script)
    }

    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms))
    }
}