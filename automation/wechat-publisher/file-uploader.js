// 文件上传器 - 实现真实的文件上传
import fs from 'fs'
import path from 'path'

export class FileUploader {
    constructor(session) {
        this.session = session
    }
    
    async uploadFile(filePath, inputSelector = 'input[type="file"]') {
        console.log(`📤 开始上传文件: ${filePath}`)
        
        // 1. 验证文件存在
        if (!fs.existsSync(filePath)) {
            throw new Error(`文件不存在: ${filePath}`)
        }
        
        const fileStats = fs.statSync(filePath)
        console.log(`   文件大小: ${(fileStats.size / 1024 / 1024).toFixed(2)} MB`)
        
        // 2. 读取文件并转换为base64
        const fileBuffer = fs.readFileSync(filePath)
        const base64Data = fileBuffer.toString('base64')
        const fileName = path.basename(filePath)
        const mimeType = this.getMimeType(filePath)
        
        console.log(`   文件类型: ${mimeType}`)
        console.log(`   文件名: ${fileName}`)
        
        // 3. 在iframe中执行文件上传
        const uploadScript = `
            (function() {
                const iframe = document.querySelector('iframe');
                if (!iframe || !iframe.contentDocument) {
                    throw new Error('无法访问iframe');
                }
                
                const iframeDoc = iframe.contentDocument;
                
                // 查找文件输入框
                let fileInput = iframeDoc.querySelector('${inputSelector}');
                if (!fileInput) {
                    // 尝试其他可能的选择器
                    const selectors = [
                        'input[type="file"]',
                        'input[accept*="video"]',
                        'input[accept*="image"]',
                        'input[accept*="audio"]',
                        '[data-testid*="upload"] input',
                        '.upload-input input'
                    ];
                    
                    for (const selector of selectors) {
                        fileInput = iframeDoc.querySelector(selector);
                        if (fileInput) break;
                    }
                }
                
                if (!fileInput) {
                    throw new Error('未找到文件上传输入框');
                }
                
                console.log('找到文件输入框:', fileInput.tagName, fileInput.accept);
                
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
                
                // 创建FileList
                const dataTransfer = new DataTransfer();
                dataTransfer.items.add(file);
                
                // 设置文件到input
                Object.defineProperty(fileInput, 'files', {
                    value: dataTransfer.files,
                    configurable: true
                });
                
                // 触发事件
                const events = ['change', 'input'];
                for (const eventType of events) {
                    const event = new Event(eventType, { bubbles: true });
                    fileInput.dispatchEvent(event);
                }
                
                // 也尝试触发拖拽事件 (有些上传区域使用拖拽)
                const dragEvents = ['dragenter', 'dragover', 'drop'];
                const uploadArea = iframeDoc.querySelector('.upload-area, .ant-upload, [class*="upload"]');
                if (uploadArea) {
                    for (const eventType of dragEvents) {
                        const event = new Event(eventType, { bubbles: true });
                        if (eventType === 'drop') {
                            Object.defineProperty(event, 'dataTransfer', {
                                value: dataTransfer
                            });
                        }
                        uploadArea.dispatchEvent(event);
                    }
                }
                
                return {
                    success: true,
                    fileName: '${fileName}',
                    fileSize: ${fileStats.size},
                    mimeType: '${mimeType}',
                    inputFound: !!fileInput,
                    uploadAreaFound: !!uploadArea
                };
            })()
        `
        
        try {
            const result = await this.session.chromeController.executeScript(this.session, uploadScript)
            const uploadResult = result.result.value
            
            if (uploadResult.success) {
                console.log('✅ 文件上传成功')
                console.log(`   输入框: ${uploadResult.inputFound ? '找到' : '未找到'}`)
                console.log(`   上传区域: ${uploadResult.uploadAreaFound ? '找到' : '未找到'}`)
                
                // 等待一段时间让上传处理
                await new Promise(resolve => setTimeout(resolve, 3000))
                
                return uploadResult
            } else {
                throw new Error('文件上传失败')
            }
        } catch (error) {
            console.error('❌ 文件上传失败:', error.message)
            throw error
        }
    }
    
    getMimeType(filePath) {
        const ext = path.extname(filePath).toLowerCase()
        const mimeTypes = {
            '.mp4': 'video/mp4',
            '.avi': 'video/avi',
            '.mov': 'video/quicktime',
            '.wmv': 'video/x-ms-wmv',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.webp': 'image/webp',
            '.mp3': 'audio/mpeg',
            '.wav': 'audio/wav',
            '.m4a': 'audio/mp4',
            '.flac': 'audio/flac',
            '.ogg': 'audio/ogg'
        }
        return mimeTypes[ext] || 'application/octet-stream'
    }
}
