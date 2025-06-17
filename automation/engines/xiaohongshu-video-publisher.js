// automation/engines/xiaohongshu-video-publisher.js - 修复版本
// 🔧 参考抖音发布器，增加视频处理和发布按钮等待逻辑

import fs from 'fs'
import path from 'path'

export class XiaohongshuVideoPublisher {
    constructor(session, platformConfig, chromeController) {
        this.session = session
        this.chromeController = chromeController
        this.config = platformConfig
        this.selectors = platformConfig.selectors
        this.features = platformConfig.features
        this.timing = platformConfig.timing
    }

    async uploadFile(filePath) {
        console.log('📤 上传视频到小红书...')

        try {
            const result = await this.uploadFileToXiaohongshu(filePath)

            // 🔧 新增：等待视频处理完成
            if (this.features.needWaitFormActivation) {
                console.log('⏳ 等待小红书表单激活...')
                await this.waitForFormActivation()
            }

            // 🔧 新增：等待视频上传和处理完成
            console.log('⏳ 等待视频上传和处理完成...')
            await this.waitForVideoProcessing()

            return result
        } catch (error) {
            throw new Error(`小红书文件上传失败: ${error.message}`)
        }
    }

    async fillForm(content) {
        console.log('📝 填写小红书表单...')

        const steps = []

        try {
            // 🔧 增加等待时间，确保表单完全就绪
            console.log('⏳ 等待表单完全就绪...')
            await this.delay(3000)

            // 填写标题
            if (content.title && this.config.fields.title.required) {
                console.log('📝 填写标题...')
                await this.fillTitleField(content.title)
                steps.push({ field: '标题', success: true, value: content.title })
                await this.delay(1000)
            }

            // 填写描述
            if (content.description) {
                console.log('📝 填写描述...')
                await this.fillDescriptionField(content.description)
                steps.push({ field: '描述', success: true, value: content.description })
                await this.delay(1000)
            }

            // 选择位置
            if (content.location && this.features.supportLocation) {
                console.log('📍 选择位置...')
                const locationResult = await this.fillLocationField(content.location)
                steps.push({ field: '位置', success: locationResult.success, value: locationResult.location })
                await this.delay(2000)
            }

            return { success: true, steps }
        } catch (error) {
            throw new Error(`小红书表单填写失败: ${error.message}`)
        }
    }

    async publish() {
        console.log('🚀 发布小红书视频...')

        try {
            // 🔧 新增：等待发布按钮可用（关键修复）
            await this.waitForPublishButton()

            await this.clickPublishButton()
            const status = await this.checkPublishStatus()

            return {
                success: true,
                status: status.status,
                message: status.message
            }
        } catch (error) {
            throw new Error(`小红书发布失败: ${error.message}`)
        }
    }

    // ==================== 🔧 新增：视频处理等待逻辑 ====================

    /**
     * 等待视频上传和处理完成
     */
    async waitForVideoProcessing() {
        const timeout = this.timing.processingTimeout || 60000  // 60秒超时
        const checkInterval = 2000  // 2秒检查一次
        const startTime = Date.now()

        console.log('⏳ 等待小红书视频处理完成...')

        while (Date.now() - startTime < timeout) {
            const script = `
            (function() {
                try {
                    // 🔧 优先检测上传成功的标志
                    const uploadSuccessIndicators = [
                        // 检测"上传成功"文本
                        (function() {
                            const bodyText = document.body.textContent || '';
                            return bodyText.includes('上传成功');
                        })(),
                        
                        // 检测视频信息显示（大小、时长等）
                        (function() {
                            const bodyText = document.body.textContent || '';
                            return bodyText.includes('视频大小') && bodyText.includes('视频时长');
                        })(),
                        
                        // 检测包含视频信息的div
                        (function() {
                            const divs = document.querySelectorAll('div');
                            for (const div of divs) {
                                const text = div.textContent || '';
                                if (text.includes('上传成功') || 
                                    (text.includes('视频大小') && text.includes('KB')) ||
                                    (text.includes('视频时长') && text.includes('s'))) {
                                    return true;
                                }
                            }
                            return false;
                        })()
                    ];
        
                    const uploadSuccess = uploadSuccessIndicators.some(indicator => indicator);
        
                    // 🔧 如果检测到上传成功，则认为处理完成
                    if (uploadSuccess) {
                        console.log('✅ 检测到视频上传成功标志');
                        return {
                            isUploading: false,
                            hasProcessingText: false,
                            formReady: true,
                            processingComplete: true,
                            uploadSuccess: true,
                            reason: '检测到上传成功标志'
                        };
                    }
        
                    // 🔧 检测仍在上传的标志（改为更精确的检测）
                    const stillUploadingIndicators = [
                        // 检测进度条（必须是可见的）
                        (function() {
                            const progressElements = document.querySelectorAll('.upload-progress, [class*="progress"]');
                            for (const el of progressElements) {
                                const style = window.getComputedStyle(el);
                                if (style.display !== 'none' && style.visibility !== 'hidden' && 
                                    el.offsetParent !== null) {
                                    return true;
                                }
                            }
                            return false;
                        })(),
                        
                        // 检测上传中的文本（更精确）
                        (function() {
                            const uploadingTexts = ['上传中', '正在上传', '文件上传中'];
                            const bodyText = document.body.textContent || '';
                            return uploadingTexts.some(text => bodyText.includes(text));
                        })(),
                        
                        // 检测loading动画（必须是可见的）
                        (function() {
                            const loadingElements = document.querySelectorAll('.loading, [class*="loading"], .spinner');
                            for (const el of loadingElements) {
                                const style = window.getComputedStyle(el);
                                if (style.display !== 'none' && style.visibility !== 'hidden' && 
                                    el.offsetParent !== null) {
                                    return true;
                                }
                            }
                            return false;
                        })()
                    ];
        
                    const isUploading = stillUploadingIndicators.some(indicator => indicator);
        
                    // 检查是否有处理中的文本
                    const bodyText = document.body.textContent || '';
                    const processingKeywords = ['处理中', '转码中', '生成封面', '请稍候'];
                    const hasProcessingText = processingKeywords.some(keyword => bodyText.includes(keyword));
        
                    // 检查表单是否完全可用
                    const titleInput = document.querySelector('input[placeholder*="标题"]');
                    const descEditor = document.querySelector('.ql-editor[contenteditable="true"]');
                    const publishButton = document.querySelector('button.publishBtn') || 
                                        document.querySelector('button[class*="publishBtn"]');
        
                    const formReady = titleInput && descEditor && publishButton && 
                                    !titleInput.disabled && !publishButton.disabled;
        
                    // 🔧 关键判断逻辑修正：
                    // 1. 如果检测到上传成功 → 处理完成
                    // 2. 如果没有上传中标志且表单就绪 → 处理完成  
                    // 3. 否则 → 继续等待
                    const processingComplete = uploadSuccess || (!isUploading && !hasProcessingText && formReady);
        
                    return {
                        isUploading: isUploading,
                        hasProcessingText: hasProcessingText,
                        formReady: formReady,
                        processingComplete: processingComplete,
                        uploadSuccess: uploadSuccess,
                        reason: uploadSuccess ? '检测到上传成功' : 
                               processingComplete ? '无上传标志且表单就绪' : '仍在处理中',
                        debug: {
                            titleInputExists: !!titleInput,
                            descEditorExists: !!descEditor,
                            publishButtonExists: !!publishButton,
                            publishButtonDisabled: publishButton ? publishButton.disabled : null,
                            bodyTextSample: bodyText.substring(0, 200) + '...'
                        }
                    };
                } catch (e) {
                    return { 
                        processingComplete: false, 
                        error: e.message,
                        isUploading: true
                    };
                }
            })()
        `;

            const result = await this.executeScript(script);
            const status = result.result.value;

            const waitTime = Math.round((Date.now() - startTime) / 1000);
            console.log(`⏳ 视频处理状态检查 (${waitTime}s):`, {
                上传中: status.isUploading ? '是' : '否',
                处理文本: status.hasProcessingText ? '是' : '否',
                表单就绪: status.formReady ? '是' : '否',
                处理完成: status.processingComplete ? '是' : '否'
            });

            if (status.error) {
                console.warn(`⚠️ 状态检查出错: ${status.error}，继续等待...`);
            }

            if (status.processingComplete) {
                console.log('✅ 小红书视频处理完成，表单已就绪');
                return true;
            }

            await this.delay(checkInterval);
        }

        console.warn('⚠️ 视频处理等待超时，尝试继续...');
        return false;  // 超时但不抛出错误，让后续流程继续
    }

    /**
     * 等待发布按钮可用
     * 参考抖音的 waitForPublishButton 方法
     */
    async waitForPublishButton() {
        console.log('⏳ 等待小红书发布按钮可用...')

        const timeout = this.timing.publishTimeout || 30000  // 30秒超时
        const checkInterval = 1000  // 1秒检查一次
        const startTime = Date.now()

        while (Date.now() - startTime < timeout) {
            const script = `
                (function() {
                    try {
                        // 查找发布按钮 - 使用多种选择器
                        let publishButton = document.querySelector('button.publishBtn');
                        
                        if (!publishButton) {
                            publishButton = document.querySelector('button[class*="publishBtn"]');
                        }
                        
                        if (!publishButton) {
                            // 通过文本查找发布按钮
                            const buttons = document.querySelectorAll('button');
                            for (const btn of buttons) {
                                if (btn.textContent.trim() === '发布' && !btn.textContent.includes('章节')) {
                                    publishButton = btn;
                                    break;
                                }
                            }
                        }

                        if (!publishButton) {
                            return { 
                                ready: false, 
                                error: '未找到发布按钮',
                                buttonExists: false
                            };
                        }

                        // 检查按钮状态
                        const isEnabled = !publishButton.disabled;
                        const isVisible = publishButton.offsetParent !== null;
                        const buttonText = publishButton.textContent.trim();
                        
                        // 检查是否有视觉上的禁用状态
                        const computedStyle = window.getComputedStyle(publishButton);
                        const isVisuallyDisabled = computedStyle.opacity < 0.6 || 
                                                 computedStyle.pointerEvents === 'none' ||
                                                 publishButton.classList.contains('disabled');

                        const ready = isEnabled && isVisible && !isVisuallyDisabled && buttonText === '发布';

                        return {
                            ready: ready,
                            buttonExists: true,
                            isEnabled: isEnabled,
                            isVisible: isVisible,
                            isVisuallyDisabled: isVisuallyDisabled,
                            buttonText: buttonText,
                            className: publishButton.className,
                            debug: {
                                disabled: publishButton.disabled,
                                opacity: computedStyle.opacity,
                                pointerEvents: computedStyle.pointerEvents
                            }
                        };
                    } catch (e) {
                        return { 
                            ready: false, 
                            error: e.message,
                            buttonExists: false
                        };
                    }
                })()
            `;

            const result = await this.executeScript(script);
            const status = result.result.value;

            const waitTime = Math.round((Date.now() - startTime) / 1000);

            if (status.buttonExists) {
                console.log(`⏳ 发布按钮状态 (${waitTime}s):`, {
                    就绪: status.ready ? '✅' : '❌',
                    启用: status.isEnabled ? '✅' : '❌',
                    可见: status.isVisible ? '✅' : '❌',
                    视觉禁用: status.isVisuallyDisabled ? '❌' : '✅',
                    按钮文本: status.buttonText
                });
            } else {
                console.log(`⏳ 查找发布按钮中... (${waitTime}s)`);
            }

            if (status.ready) {
                console.log('✅ 小红书发布按钮已可用');
                return true;
            }

            if (status.error && !status.error.includes('未找到发布按钮')) {
                console.warn(`⚠️ 发布按钮检查出错: ${status.error}`);
            }

            await this.delay(checkInterval);
        }

        throw new Error('等待发布按钮超时：发布按钮未激活或视频还在处理中');
    }

    // ==================== 保留原有方法 ====================

    async uploadFileToXiaohongshu(filePath) {
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
                    const fileInput = document.querySelector('${this.selectors.fileInput}');
                    if (!fileInput) throw new Error('未找到文件上传输入框');

                    const preventClick = (e) => e.preventDefault();
                    fileInput.addEventListener('click', preventClick, true);

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

                    const dataTransfer = new DataTransfer();
                    dataTransfer.items.add(file);
                    Object.defineProperty(fileInput, 'files', {
                        value: dataTransfer.files,
                        configurable: true
                    });

                    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
                    fileInput.dispatchEvent(new Event('input', { bubbles: true }));

                    setTimeout(() => fileInput.removeEventListener('click', preventClick, true), 2000);

                    return { success: true, fileName: '${fileName}', fileSize: ${fileBuffer.length} };
                } catch (e) {
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
        await this.delay(3000)

        return uploadResult
    }

    async waitForFormActivation() {
        const timeout = this.timing.formActivationTimeout
        const startTime = Date.now()

        while (Date.now() - startTime < timeout) {
            const script = `
                (function() {
                    const titleInput = document.querySelector('${this.selectors.titleInput}');
                    const descEditor = document.querySelector('${this.selectors.descriptionEditor}');
                    return {
                        titleExists: !!titleInput,
                        descExists: !!descEditor,
                        ready: !!(titleInput && descEditor)
                    };
                })()
            `

            const result = await this.executeScript(script)
            const status = result.result.value

            if (status.ready) {
                console.log('✅ 小红书表单已激活')
                return true
            }

            await this.delay(1000)
        }

        throw new Error('小红书表单激活超时')
    }

    async fillTitleField(value) {
        const script = `
            (function() {
                try {
                    const titleInput = document.querySelector('${this.selectors.titleInput}');
                    if (!titleInput) throw new Error('未找到标题输入框');

                    titleInput.focus();
                    titleInput.value = '${value.replace(/'/g, "\\'")}';
                    titleInput.dispatchEvent(new Event('input', { bubbles: true }));
                    titleInput.dispatchEvent(new Event('change', { bubbles: true }));

                    return { success: true };
                } catch (e) {
                    return { success: false, error: e.message };
                }
            })()
        `

        const result = await this.executeScript(script)
        if (!result.result.value.success) {
            throw new Error(result.result.value.error)
        }
    }

    async fillDescriptionField(value) {
        const script = `
            (function() {
                try {
                    const descEditor = document.querySelector('${this.selectors.descriptionEditor}');
                    if (!descEditor) throw new Error('未找到描述编辑器');

                    descEditor.focus();
                    descEditor.innerHTML = '';
                    const htmlContent = '${value.replace(/'/g, "\\'").replace(/\n/g, '<br>')}';
                    descEditor.innerHTML = '<p>' + htmlContent + '</p>';

                    descEditor.dispatchEvent(new InputEvent('input', { 
                        bubbles: true,
                        inputType: 'insertText',
                        data: '${value.replace(/'/g, "\\'")}'
                    }));

                    return { success: true };
                } catch (e) {
                    return { success: false, error: e.message };
                }
            })()
        `

        const result = await this.executeScript(script)
        if (!result.result.value.success) {
            throw new Error(result.result.value.error)
        }
    }

    async fillLocationField(locationName = '香港') {
        const script = `
            (async function() {
                try {
                    const placeholder = document.querySelector('${this.selectors.locationSelector}');
                    if (!placeholder) throw new Error('未找到位置选择器');

                    placeholder.click();
                    await new Promise(resolve => setTimeout(resolve, 1000));

                    const inputFilter = document.querySelector('${this.selectors.locationInputFilter}');
                    const hiddenInput = document.querySelector('${this.selectors.locationHiddenInput}');

                    if (inputFilter && hiddenInput) {
                        inputFilter.classList.remove('hide');
                        inputFilter.style.display = 'block';
                        hiddenInput.style.width = '200px';

                        hiddenInput.focus();
                        hiddenInput.value = '';

                        const searchText = '${locationName}';
                        for (let i = 0; i < searchText.length; i++) {
                            hiddenInput.value = searchText.substring(0, i + 1);
                            hiddenInput.dispatchEvent(new Event('input', { bubbles: true }));
                            await new Promise(resolve => setTimeout(resolve, 100));
                        }

                        await new Promise(resolve => setTimeout(resolve, 2000));

                        const options = document.querySelectorAll('${this.selectors.locationOptions}');
                        for (const option of options) {
                            const name = option.querySelector('${this.selectors.locationOptionName}')?.textContent || option.textContent;
                            if (name && name.includes('${locationName}')) {
                                option.click();
                                return { success: true, location: name };
                            }
                        }
                    }

                    return { success: false, error: '位置选择失败' };
                } catch (e) {
                    return { success: false, error: e.message };
                }
            })()
        `

        const result = await this.executeScript(script)
        return result.result.value
    }

    async clickPublishButton() {
        const script = `
            (function() {
                try {
                    const buttons = document.querySelectorAll('button');
                    let publishButton = null;

                    for (const btn of buttons) {
                        if (btn.textContent.trim() === '${this.selectors.publishButtonText}' && 
                            !btn.textContent.includes('章节')) {
                            publishButton = btn;
                            break;
                        }
                    }

                    if (!publishButton) {
                        publishButton = document.querySelector('${this.selectors.publishButton}') ||
                                       document.querySelector('${this.selectors.publishButtonAlt}');
                    }

                    if (!publishButton) throw new Error('未找到发布按钮');
                    if (publishButton.disabled) throw new Error('发布按钮已禁用');

                    publishButton.click();
                    return { success: true };
                } catch (e) {
                    return { success: false, error: e.message };
                }
            })()
        `

        const result = await this.executeScript(script)
        if (!result.result.value.success) {
            throw new Error(result.result.value.error)
        }

        await this.delay(3000)
    }

    async checkPublishStatus() {
        await this.delay(3000)

        const script = `
            (function() {
                const currentUrl = window.location.href;
                const urlChanged = !currentUrl.includes('/publish/publish');
                
                return {
                    status: urlChanged ? 'success' : 'unknown',
                    message: urlChanged ? '发布成功' : '状态未知',
                    currentUrl: currentUrl
                };
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
            '.mov': 'video/quicktime',
            '.avi': 'video/avi',
            '.webm': 'video/webm'
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