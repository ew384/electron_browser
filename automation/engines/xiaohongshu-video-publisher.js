// automation/engines/xiaohongshu-video-publisher.js
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

            if (this.features.needWaitFormActivation) {
                console.log('⏳ 等待小红书表单激活...')
                await this.waitForFormActivation()
            }

            return result
        } catch (error) {
            throw new Error(`小红书文件上传失败: ${error.message}`)
        }
    }

    async fillForm(content) {
        console.log('📝 填写小红书表单...')

        const steps = []

        try {
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

    // ==================== 核心实现方法 ====================

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