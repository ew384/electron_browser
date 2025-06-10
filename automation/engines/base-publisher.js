// ============ 修复后的 base-publisher.js ============
// automation/engines/base-publisher.js
import fs from 'fs'
import path from 'path'

/**
 * 基础发布器抽象类
 * 提供所有平台发布器的通用功能
 */
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
        throw new Error('uploadFile method must be implemented by subclass')
    }

    async fillForm(content) {
        throw new Error('fillForm method must be implemented by subclass')
    }

    async publish() {
        throw new Error('publish method must be implemented by subclass')
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

    // 在 automation/engines/base-publisher.js 的 uploadFileToInput 方法中
    // 直接在方法内部定义 getMimeType 函数，而不是调用 this.getMimeType

    async uploadFileToInput(filePath, inputSelector = 'input[type="file"]') {
        console.log(`📤 上传文件到 ${this.platformConfig.name}: ${filePath}`)

        if (!fs.existsSync(filePath)) {
            throw new Error(`文件不存在: ${filePath}`)
        }

        console.log('📜 执行页面脚本...')

        const fileBuffer = fs.readFileSync(filePath)
        const base64Data = fileBuffer.toString('base64')
        const fileName = path.basename(filePath)

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
        const mimeType = mimeTypes[ext] || 'application/octet-stream'

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
                
                // 如果有上传区域配置，先点击上传区域
                const uploadAreaSelector = '${this.selectors.uploadArea || ''}';
                if (uploadAreaSelector) {
                    const uploadArea = doc.querySelector(uploadAreaSelector);
                    if (uploadArea) {
                        uploadArea.click();
                        // 简单等待
                        const start = Date.now();
                        while (Date.now() - start < 500) {}
                    }
                }
                
                // 使用配置中的文件输入框选择器
                let fileInput = doc.querySelector('${this.selectors.fileInput || inputSelector}');
                
                if (!fileInput) {
                    throw new Error('未找到文件上传输入框');
                }
                
                // 创建和设置文件
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
}