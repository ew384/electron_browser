// automation/engines/wechat-video-publisher.js - 配置驱动版本
// 所有页面元素都从 platformConfig 中读取，便于维护

import fs from 'fs'
import path from 'path'

export class WeChatVideoPublisher {
    constructor(session, platformConfig, chromeController) {
        this.session = session
        this.chromeController = chromeController
        this.config = platformConfig
        this.selectors = platformConfig.selectors
        this.features = platformConfig.features
        this.timing = platformConfig.timing
    }

    async uploadFile(filePath) {
        console.log('📤 上传视频到微信视频号...')

        try {
            // ChromeController 已经自动导航到上传页面，直接上传文件
            const result = await this.uploadFileToWeChatIframe(filePath)

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

        try {
            // 1. 填写短标题
            if ((content.title || content.description) && this.features.needShortTitle) {
                const shortTitle = this.generateShortTitle(content)
                await this.fillFieldWithRetry('shortTitle', shortTitle)
                steps.push({ field: '短标题', success: true, value: shortTitle })
            }

            // 2. 填写描述
            if (content.description) {
                await this.fillFieldWithRetry('description', content.description)
                steps.push({ field: '描述', success: true, value: content.description })
            }

            // 3. 填写位置
            if (content.location && this.features.supportLocation) {
                await this.fillLocationField(content.location)
                steps.push({ field: '位置', success: true, value: content.location })
            }

            return { success: true, steps }
        } catch (error) {
            steps.push({ field: '表单填写', success: false, error: error.message })
            throw error
        }
    }

    async publish() {
        console.log('🚀 发布微信视频号...')

        try {
            const publishResult = await this.autoPublish()

            return {
                success: true,
                status: publishResult.publishStatus?.status || 'success',
                message: publishResult.publishStatus?.message || '发布成功'
            }
        } catch (error) {
            throw new Error(`微信视频号发布失败: ${error.message}`)
        }
    }

    // ==================== 配置驱动的通用方法 ====================

    /**
     * 通用字段填写方法（带重试）
     */
    async fillFieldWithRetry(fieldType, value) {
        const maxRetries = this.timing.maxRetries || 3
        const retryDelay = this.timing.retryDelay || 2000

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            console.log(`🎯 尝试填写${fieldType} (第${attempt}次)...`)

            try {
                if (fieldType === 'shortTitle') {
                    await this.fillShortTitleField(value)
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

    async uploadFileToWeChatIframe(filePath) {
        console.log('📤 上传文件到微信视频号...')

        const fileStats = fs.statSync(filePath)
        const fileSizeMB = fileStats.size / (1024 * 1024)
        console.log(`📁 文件大小: ${fileSizeMB.toFixed(2)} MB`)

        if (fileSizeMB > 100) {
            throw new Error(`文件过大 (${fileSizeMB.toFixed(2)} MB)，请使用小于 100MB 的文件`)
        }

        // 🔧 改进的上传方案：分块处理 + 增加超时时间
        return await this.uploadWithImprovedMethod(filePath)
    }

    async uploadWithImprovedMethod(filePath) {
        const fileName = path.basename(filePath)
        const mimeType = this.getMimeType(filePath)
        
        try {
            // 第一步：准备页面
            await this.prepareUploadPage()
            
            // 第二步：分块读取和处理文件
            const fileData = await this.processFileInChunks(filePath)
            
            // 第三步：执行上传
            const uploadResult = await this.executeFileUploadWithChunks(fileName, mimeType, fileData)
            
            return uploadResult
            
        } catch (error) {
            throw new Error(`改进上传方法失败: ${error.message}`)
        }
    }

    async prepareUploadPage() {
        const script = `
            (function() {
                try {
                    // 等待页面完全加载
                    if (document.readyState !== 'complete') {
                        return { success: false, error: '页面未完全加载' };
                    }
                    
                    const wujieApp = document.querySelector('wujie-app');
                    if (!wujieApp || !wujieApp.shadowRoot) {
                        return { success: false, error: '未找到 wujie-app 或 shadow DOM' };
                    }
                    
                    const shadowDoc = wujieApp.shadowRoot;
                    const uploadArea = shadowDoc.querySelector('.center');
                    if (!uploadArea) {
                        return { success: false, error: '未找到上传区域' };
                    }
                    
                    // 确保上传区域可见
                    uploadArea.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    uploadArea.click();
                    
                    return { success: true, ready: true };
                    
                } catch (e) {
                    return { success: false, error: e.message };
                }
            })()
        `;
        
        const result = await this.executeScript(script)
        if (!result.result.value.success) {
            throw new Error(`页面准备失败: ${result.result.value.error}`)
        }
        
        await this.delay(2000)
    }

    async processFileInChunks(filePath) {
        console.log('📊 优化分块处理文件...')
        
        const fileStats = fs.statSync(filePath)
        const fileSizeMB = fileStats.size / (1024 * 1024)
        
        // 🔧 根据文件大小动态调整块大小
        let chunkSize
        if (fileSizeMB < 20) {
            chunkSize = 10 * 1024 * 1024  // 小文件：10MB 块
        } else if (fileSizeMB < 50) {
            chunkSize = 5 * 1024 * 1024   // 中等文件：5MB 块
        } else {
            chunkSize = 2 * 1024 * 1024   // 大文件：2MB 块
        }
        
        console.log(`📁 文件大小: ${fileSizeMB.toFixed(2)} MB`)
        console.log(`📦 块大小: ${(chunkSize / 1024 / 1024).toFixed(2)} MB`)
        
        const chunks = []
        const fileBuffer = fs.readFileSync(filePath)
        
        console.log('🔄 开始分块处理...')
        for (let i = 0; i < fileBuffer.length; i += chunkSize) {
            const chunk = fileBuffer.slice(i, i + chunkSize)
            const base64Chunk = chunk.toString('base64')
            chunks.push(base64Chunk)
            
            // 报告进度
            const progress = ((i / fileBuffer.length) * 100).toFixed(1)
            console.log(`   进度: ${progress}% (块 ${chunks.length})`)
            
            // 每处理几块就释放内存
            if (chunks.length % 5 === 0 && global.gc) {
                global.gc()
            }
        }
        
        console.log(`✅ 分块完成: ${chunks.length} 块`)
        
        return {
            chunks: chunks,
            totalSize: fileBuffer.length,
            chunkSize: chunkSize,
            chunkCount: chunks.length
        }
    }
    async executeFileUploadWithChunks(fileName, mimeType, fileData) {
        console.log('🚀 执行分块文件上传...')
        
        // 🔧 修复：移除脚本中的 await，使用 Promise 和 setTimeout
        const uploadScript = `
            (function() {
                try {
                    console.log('开始分块文件上传...');
                    const startTime = Date.now();
                    
                    const wujieApp = document.querySelector('wujie-app');
                    if (!wujieApp || !wujieApp.shadowRoot) {
                        throw new Error('未找到 wujie-app 或 shadow DOM');
                    }
                    
                    const shadowDoc = wujieApp.shadowRoot;
                    
                    let fileInput = shadowDoc.querySelector('input[type="file"]');
                    if (!fileInput) {
                        const uploadArea = shadowDoc.querySelector('.center');
                        if (!uploadArea) {
                            throw new Error('未找到上传区域');
                        }
                        
                        uploadArea.click();
                        
                        // 🔧 修复：使用同步等待，不使用 await
                        let attempts = 0;
                        const maxAttempts = 20; // 最多等待 4 秒
                        
                        while (!fileInput && attempts < maxAttempts) {
                            fileInput = shadowDoc.querySelector('input[type="file"]');
                            if (!fileInput) {
                                // 同步等待 200ms
                                const waitStart = Date.now();
                                while (Date.now() - waitStart < 200) {
                                    // 忙等待
                                }
                                attempts++;
                            }
                        }
                    }
                    
                    if (!fileInput) {
                        throw new Error('无法创建文件输入框');
                    }
                    
                    console.log('开始重新组装文件数据...');
                    
                    // 🔧 在浏览器中重新组装 base64 数据
                    const chunks = ${JSON.stringify(fileData.chunks)};
                    console.log('文件块数量:', chunks.length);
                    
                    const fullBase64 = chunks.join('');
                    console.log('Base64 数据长度:', fullBase64.length);
                    
                    console.log('开始解码 Base64...');
                    const byteCharacters = atob(fullBase64);
                    console.log('字节字符长度:', byteCharacters.length);
                    
                    // 🔧 分批处理字节转换，使用同步方式
                    const byteNumbers = new Array(byteCharacters.length);
                    const batchSize = 50000; // 减少批大小，避免阻塞
                    
                    console.log('开始字节转换...');
                    for (let i = 0; i < byteCharacters.length; i += batchSize) {
                        const end = Math.min(i + batchSize, byteCharacters.length);
                        
                        for (let j = i; j < end; j++) {
                            byteNumbers[j] = byteCharacters.charCodeAt(j);
                        }
                        
                        // 每处理一批就报告进度
                        if (i % (batchSize * 10) === 0) {
                            const progress = ((i / byteCharacters.length) * 100).toFixed(1);
                            console.log('字节转换进度:', progress + '%');
                        }
                    }
                    
                    console.log('创建 Blob 对象...');
                    const byteArray = new Uint8Array(byteNumbers);
                    const blob = new Blob([byteArray], { type: '${mimeType}' });
                    
                    console.log('创建 File 对象...');
                    const file = new File([blob], '${fileName}', {
                        type: '${mimeType}',
                        lastModified: Date.now()
                    });
                    
                    console.log('设置文件到输入框...');
                    // 设置文件
                    const dataTransfer = new DataTransfer();
                    dataTransfer.items.add(file);
                    Object.defineProperty(fileInput, 'files', {
                        value: dataTransfer.files,
                        configurable: true
                    });
                    
                    console.log('触发事件...');
                    // 触发事件
                    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
                    fileInput.dispatchEvent(new Event('input', { bubbles: true }));
                    
                    const endTime = Date.now();
                    console.log('分块上传完成，总耗时:', endTime - startTime, 'ms');
                    
                    return {
                        success: true,
                        fileName: '${fileName}',
                        fileSize: ${fileData.totalSize},
                        chunks: ${fileData.chunks.length},
                        executionTime: endTime - startTime
                    };
                    
                } catch (e) {
                    console.error('分块上传失败:', e);
                    return { 
                        success: false, 
                        error: e.message,
                        stack: e.stack
                    };
                }
            })()
        `;
        
        console.log('🚀 开始执行上传脚本...')
        
        // 🔧 增加脚本执行超时时间到 3 分钟
        const result = await this.executeScriptWithTimeout(uploadScript, 180000)
        
        const uploadResult = result.result.value
        if (!uploadResult.success) {
            throw new Error(`分块上传失败: ${uploadResult.error}`)
        }
        
        console.log(`✅ 分块上传成功!`)
        console.log(`   文件名: ${uploadResult.fileName}`)
        console.log(`   文件大小: ${(uploadResult.fileSize / 1024 / 1024).toFixed(2)} MB`)
        console.log(`   分块数量: ${uploadResult.chunks}`)
        console.log(`   执行时间: ${uploadResult.executionTime}ms`)
        
        // 等待视频处理
        if (this.features.needWaitProcessing) {
            await this.waitForVideoProcessing()
        }
        
        return uploadResult
    }

    // 🔧 带超时和详细错误处理的脚本执行
    async executeScriptWithTimeout(script, timeout = 180000) {
        console.log(`⏱️ 执行脚本，超时时间: ${timeout/1000}秒`)
        
        return new Promise(async (resolve, reject) => {
            const timeoutId = setTimeout(() => {
                reject(new Error(`脚本执行超时 (${timeout/1000}s)`))
            }, timeout)
            
            try {
                const result = await this.executeScript(script)
                clearTimeout(timeoutId)
                
                // 🔧 检查结果类型
                console.log('📊 脚本执行结果类型:', typeof result.result.value)
                
                if (result.result.value && typeof result.result.value === 'object') {
                    if (result.result.value.success === false) {
                        console.error('❌ 脚本执行失败:', result.result.value.error)
                    } else {
                        console.log('✅ 脚本执行成功')
                    }
                }
                
                resolve(result)
            } catch (error) {
                clearTimeout(timeoutId)
                console.error('❌ 脚本执行异常:', error.message)
                reject(error)
            }
        })
    }
    /**
     * 填写短标题字段
     */
    async fillShortTitleField(value) {
        const script = `
            (function() {
                try {
                    const selectors = ${JSON.stringify(this.selectors)};
                    const iframe = document.querySelector(selectors.iframe);
                    if (!iframe || !iframe.contentDocument) {
                        return { success: false, error: '无法访问iframe' };
                    }
                    
                    const iframeDoc = iframe.contentDocument;
                    
                    // 查找短标题输入框
                    let element = iframeDoc.querySelector(selectors.shortTitle);
                    
                    if (!element) {
                        return { success: false, error: '未找到短标题输入框' };
                    }
                    
                    console.log('找到短标题输入框:', element.placeholder, element.className);
                    
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
                    
                    return {
                        success: true,
                        value: element.value,
                        placeholder: element.placeholder,
                        className: element.className
                    };
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

        return fillResult
    }

    /**
     * 填写描述字段
     */
    async fillDescriptionField(value) {
        const script = `
            (function() {
                try {
                    const selectors = ${JSON.stringify(this.selectors)};
                    const iframe = document.querySelector(selectors.iframe);
                    if (!iframe || !iframe.contentDocument) {
                        return { success: false, error: '无法访问iframe' };
                    }
                    
                    const iframeDoc = iframe.contentDocument;
                    
                    // 查找描述编辑器
                    let element = iframeDoc.querySelector(selectors.description);
                    if (!element && selectors.descriptionAlt) {
                        element = iframeDoc.querySelector(selectors.descriptionAlt);
                    }
                    
                    if (!element) {
                        return { success: false, error: '未找到描述编辑器' };
                    }
                    
                    console.log('找到描述编辑器:', element.className, element.getAttribute('data-placeholder'));
                    
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
                    
                    return {
                        success: true,
                        content: element.textContent,
                        dataPlaceholder: element.getAttribute('data-placeholder')
                    };
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

        return fillResult
    }

    /**
     * 填写位置字段（带下拉选择）
     */
    async fillLocationField(value) {
        // 首先填写位置输入框
        const inputScript = `
            (function() {
                try {
                    const selectors = ${JSON.stringify(this.selectors)};
                    const iframe = document.querySelector(selectors.iframe);
                    if (!iframe || !iframe.contentDocument) {
                        return { success: false, error: '无法访问iframe' };
                    }
                    
                    const iframeDoc = iframe.contentDocument;
                    
                    // 查找位置输入框
                    let element = iframeDoc.querySelector(selectors.location);
                    if (!element && selectors.locationAlt) {
                        element = iframeDoc.querySelector(selectors.locationAlt);
                    }
                    
                    if (!element) {
                        return { success: false, error: '未找到位置输入框' };
                    }
                    
                    console.log('找到位置输入框:', element.placeholder, element.className);
                    
                    // 确保元素可见并聚焦
                    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    element.focus();
                    
                    // 清空并设置新值
                    element.value = '';
                    element.value = '${value.replace(/'/g, "\\'")}';
                    
                    // 触发输入事件，让下拉列表出现
                    element.dispatchEvent(new Event('focus', { bubbles: true }));
                    element.dispatchEvent(new Event('input', { bubbles: true }));
                    element.dispatchEvent(new Event('keyup', { bubbles: true }));
                    
                    return { success: true, value: element.value };
                } catch (e) {
                    return { success: false, error: e.message };
                }
            })()
        `

        const inputResult = await this.executeScript(inputScript)
        const inputFillResult = inputResult.result.value

        if (!inputFillResult.success) {
            throw new Error(inputFillResult.error)
        }

        // 等待下拉列表出现并选择
        await this.delay(1000)

        const selectScript = `
            (function() {
                try {
                    const selectors = ${JSON.stringify(this.selectors)};
                    const iframe = document.querySelector(selectors.iframe);
                    const iframeDoc = iframe.contentDocument;
                    
                    // 查找下拉列表选项
                    const optionList = iframeDoc.querySelector(selectors.locationOptions);
                    if (optionList) {
                        console.log('找到下拉列表');
                        
                        // 查找包含城市名的选项 (避免选择"不显示位置")
                        const options = optionList.querySelectorAll('.option-item:not(.active)');
                        console.log('找到选项数量:', options.length);
                        
                        // 选择第一个不是"不显示位置"的选项
                        for (let option of options) {
                            const nameElement = option.querySelector(selectors.locationOptionName);
                            if (nameElement && !nameElement.textContent.includes('不显示位置')) {
                                console.log('选择位置:', nameElement.textContent);
                                option.click();
                                
                                return {
                                    success: true,
                                    selectedLocation: nameElement.textContent
                                };
                            }
                        }
                        
                        // 如果没找到合适的选项，选择第一个非活跃选项
                        if (options.length > 0) {
                            const firstOption = options[0];
                            const nameElement = firstOption.querySelector(selectors.locationOptionName);
                            firstOption.click();
                            
                            return {
                                success: true,
                                selectedLocation: nameElement ? nameElement.textContent : '已选择位置'
                            };
                        }
                    }
                    
                    // 如果没有下拉列表，直接返回成功
                    return {
                        success: true,
                        selectedLocation: '${value.replace(/'/g, "\\'")}',
                        note: '无下拉选项，直接使用输入值'
                    };
                } catch (e) {
                    return { success: false, error: e.message };
                }
            })()
        `

        const selectResult = await this.executeScript(selectScript)
        await this.delay(500)

        return selectResult.result.value
    }

    // ==================== 微信特定方法 ====================

    /**
     * 生成符合要求的短标题
     */
    generateShortTitle(renderData) {
        let sourceText = ''

        if (renderData.title) {
            sourceText = renderData.title
        } else if (renderData.description) {
            sourceText = renderData.description
        } else {
            return '精彩视频内容'
        }

        // 移除特殊字符，只保留微信允许的符号
        const cleanText = sourceText
            .replace(/[#@\[\]()（）「」【】、，。！~`!@$^&*()_=\-\[\]{}\\|;':",.<>/]/g, '')
            .replace(/\s+/g, ' ')
            .trim()

        // 确保长度在6-16个字符之间
        if (cleanText.length >= 6 && cleanText.length <= 16) {
            return cleanText
        } else if (cleanText.length > 16) {
            return cleanText.substring(0, 16)
        } else if (cleanText.length > 0) {
            const suffixes = ['分享', '记录', '内容', '精彩', '时刻', '故事']
            for (const suffix of suffixes) {
                const newTitle = cleanText + suffix
                if (newTitle.length >= 6 && newTitle.length <= 16) {
                    return newTitle
                }
            }
            return '精彩视频分享'
        } else {
            return '精彩视频内容'
        }
    }

    /**
     * 等待视频处理完成
     */
    async waitForVideoProcessing() {
        console.log('⏳ 等待视频处理完成...')

        const timeout = this.timing.processingTimeout
        const startTime = Date.now()

        while (Date.now() - startTime < timeout) {
            const script = `
                (function() {
                    const selectors = ${JSON.stringify(this.selectors)};
                    const iframe = document.querySelector(selectors.iframe);
                    if (!iframe || !iframe.contentDocument) {
                        return false;
                    }
                    const iframeDoc = iframe.contentDocument;
                    const deleteButton = iframeDoc.querySelector(selectors.deleteButton);
                    return deleteButton && deleteButton.textContent.trim() === selectors.deleteButtonText;
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

    /**
     * 自动发布方法
     */
    async autoPublish() {
        console.log('🎯 执行自动发布...')

        // 等待条件满足
        const readyResult = await this.waitForPublishButton()
        if (!readyResult.success) {
            return readyResult
        }

        console.log('✅ 开始发布...')

        // 点击发表按钮
        const publishResult = await this.clickPublishButton()
        if (!publishResult.success) {
            return publishResult
        }

        // 等待发布处理
        await this.delay(3000)

        // 检查发布状态
        const publishStatus = await this.checkPublishStatus()

        return {
            success: true,
            publishStatus: publishStatus,
            waitTime: readyResult.waitTime
        }
    }

    /**
     * 等待发布按钮激活
     */

    async waitForPublishButton() {
        console.log('⏳ 等待发表按钮激活和视频上传完成...')

        // 🔧 增加超时时间：从60秒增加到120秒（2分钟）
        const maxWaitTime = this.timing.publishTimeout || 120000
        const checkInterval = 2000
        const startTime = Date.now()

        while (Date.now() - startTime < maxWaitTime) {
            try {
                const status = await this.checkPublishReadiness()

                if (status.ready) {
                    console.log('✅ 发表按钮已激活且视频处理完成')
                    return {
                        success: true,
                        waitTime: Date.now() - startTime
                    }
                }

                const waitTime = Math.round((Date.now() - startTime) / 1000)
                console.log(`⏳ 等待中... (${waitTime}s)`)
                console.log(`   按钮状态: ${status.buttonReady ? '✅激活' : '❌未激活'}`)
                console.log(`   视频状态: ${status.videoReady ? '✅完成' : '⏳处理中'}`)

                // 如果视频完成但按钮未激活，说明在生成封面
                if (status.videoReady && !status.buttonReady) {
                    console.log('   💡 视频已完成，正在生成封面，继续等待按钮激活...')
                }

                await this.delay(checkInterval)

            } catch (error) {
                console.log(`⚠️ 检查状态失败: ${error.message}`)
                await this.delay(checkInterval)
            }
        }

        // 🔧 超时前最后检查：可能刚好在超时瞬间完成
        console.log('⏰ 达到超时时间，进行最后检查...')
        try {
            const finalStatus = await this.checkPublishReadiness()
            if (finalStatus.ready) {
                console.log('🎉 最后检查发现按钮已激活，继续发布!')
                return {
                    success: true,
                    waitTime: maxWaitTime,
                    note: '超时前最后检查成功'
                }
            }

            // 🔧 如果视频已完成但按钮未激活，再等30秒
            if (finalStatus.videoReady && !finalStatus.buttonReady) {
                console.log('📹 视频已完成但按钮未激活，延长等待30秒...')

                const extendedWaitTime = 30000
                const extendedStartTime = Date.now()

                while (Date.now() - extendedStartTime < extendedWaitTime) {
                    const extendedStatus = await this.checkPublishReadiness()

                    if (extendedStatus.ready) {
                        console.log('🎉 延长等待成功，按钮已激活!')
                        return {
                            success: true,
                            waitTime: maxWaitTime + (Date.now() - extendedStartTime),
                            note: '延长等待成功'
                        }
                    }

                    const extendedWaitSeconds = Math.round((Date.now() - extendedStartTime) / 1000)
                    console.log(`⏰ 延长等待中... (${extendedWaitSeconds}s/30s)`)

                    await this.delay(2000)
                }
            }
        } catch (error) {
            console.log(`⚠️ 最后检查失败: ${error.message}`)
        }

        console.log('❌ 等待超时，封面生成时间过长')
        return {
            success: false,
            error: '等待超时：封面生成时间超过预期，建议手动完成发布',
            waitTime: maxWaitTime,
            suggestion: '可以在微信页面手动点击发表按钮完成发布'
        }
    }

    /**
     * 检查发布准备状态
     */
    async checkPublishReadiness() {
        const script = `
        (function() {
            try {
                const selectors = ${JSON.stringify(this.selectors)};
                const iframe = document.querySelector(selectors.iframe);
                if (!iframe || !iframe.contentDocument) {
                    return { ready: false, error: '无法访问iframe' };
                }
                
                const iframeDoc = iframe.contentDocument;
                
                // 1. 检查发表按钮状态
                let buttonReady = false;
                const buttons = iframeDoc.querySelectorAll(selectors.publishButton);
                for (let button of buttons) {
                    const buttonText = button.textContent.trim();
                    if (selectors.publishButtonText.includes(buttonText)) {
                        buttonReady = !button.disabled && !button.className.includes('disabled');
                        break;
                    }
                }
                
                // 🔧 关键修复：更可靠的视频完成检测
                // 检查删除按钮存在且文本正确
                const deleteButton = iframeDoc.querySelector(selectors.deleteButton);
                const videoReady = deleteButton && deleteButton.textContent.trim() === selectors.deleteButtonText;
                
                // 🔧 补充检查：如果删除按钮检测失败，检查是否还有"上传中"文本
                let hasUploadingText = false;
                if (!videoReady) {
                    const bodyText = iframeDoc.body.textContent;
                    hasUploadingText = bodyText.includes('上传中') || bodyText.includes('处理中');
                }
                
                // 最终判断：必须有删除按钮且按钮可用，或者（按钮可用且没有上传中提示）
                const ready = (videoReady && buttonReady) || (buttonReady && !hasUploadingText);
                
                return {
                    ready: ready,
                    buttonReady: buttonReady,
                    videoReady: videoReady,
                    hasUploadingText: hasUploadingText,
                    deleteButtonText: deleteButton ? deleteButton.textContent.trim() : 'N/A'
                };
                
            } catch (e) {
                return { ready: false, error: e.message };
            }
        })()
    `

        const result = await this.executeScript(script)
        return result.result.value
    }

    /**
     * 点击发表按钮
     */
    async clickPublishButton() {
        const script = `
            (function() {
                try {
                    const selectors = ${JSON.stringify(this.selectors)};
                    const iframe = document.querySelector(selectors.iframe);
                    if (!iframe || !iframe.contentDocument) {
                        return { success: false, error: '无法访问iframe' };
                    }
                    
                    const iframeDoc = iframe.contentDocument;
                    
                    // 查找发表按钮
                    let publishButton = null;
                    const buttons = iframeDoc.querySelectorAll(selectors.publishButton);
                    for (let button of buttons) {
                        const buttonText = button.textContent.trim();
                        if (selectors.publishButtonText.includes(buttonText)) {
                            publishButton = button;
                            break;
                        }
                    }
                    
                    if (!publishButton) {
                        return { success: false, error: '未找到发表按钮' };
                    }
                    
                    if (publishButton.disabled) {
                        return { success: false, error: '发表按钮已禁用' };
                    }
                    
                    // 滚动到按钮并点击
                    publishButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    publishButton.focus();
                    publishButton.click();
                    
                    console.log('✅ 已点击发表按钮');
                    
                    return {
                        success: true,
                        buttonText: publishButton.textContent.trim()
                    };
                    
                } catch (e) {
                    return { success: false, error: e.message };
                }
            })()
        `

        const result = await this.executeScript(script)
        return result.result.value
    }

    /**
     * 检查发布状态
     */
    async checkPublishStatus() {
        console.log('📊 检查发布状态...')

        const script = `
            (function() {
                try {
                    const selectors = ${JSON.stringify(this.selectors)};
                    const iframe = document.querySelector(selectors.iframe);
                    if (!iframe || !iframe.contentDocument) {
                        return { status: 'unknown', message: '无法访问iframe' };
                    }
                    
                    const iframeDoc = iframe.contentDocument;
                    
                    // 检查成功提示
                    for (let selector of selectors.successMessage) {
                        const element = iframeDoc.querySelector(selector);
                        if (element && element.textContent.includes('成功')) {
                            return {
                                status: 'success',
                                message: element.textContent.trim()
                            };
                        }
                    }
                    
                    // 检查页面跳转
                    const currentUrl = window.location.href;
                    if (currentUrl.includes('success') || currentUrl.includes('complete')) {
                        return {
                            status: 'success',
                            message: '页面已跳转，发布可能成功'
                        };
                    }
                    
                    return {
                        status: 'unknown',
                        message: '无法确定发布状态'
                    };
                    
                } catch (e) {
                    return { status: 'error', message: e.message };
                }
            })()
        `

        const result = await this.executeScript(script)
        const status = result.result.value

        console.log(`   📊 发布状态: ${status.status} - ${status.message}`)
        return status
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