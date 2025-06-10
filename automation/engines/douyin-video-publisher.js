// ============ 修复后的 douyin-video-publisher.js ============
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