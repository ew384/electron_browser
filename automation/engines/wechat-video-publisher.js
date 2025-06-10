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
