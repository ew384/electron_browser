// 工作流引擎 - 修复视频描述填写
import { FileUploader } from './file-uploader.js'

export class WorkflowEngine {
    constructor(config) {
        this.config = config
        console.log('⚙️ WorkflowEngine 初始化完成 (修复版本)')
    }
    
    async execute(session, workflowType, renderData, pageAnalysis) {
        console.log(`🔄 执行 ${workflowType} 工作流 (修复版本)`)
        
        const steps = []
        const fileUploader = new FileUploader(session)
        
        try {
            // 1. 检测iframe结构
            console.log('🔍 检测页面iframe结构...')
            const iframeInfo = await this.analyzeIframeStructure(session)
            
            if (!iframeInfo.hasAccessibleIframe) {
                console.log('⚠️ 未找到可访问的iframe，使用手动指导模式')
                return this.executeManualMode(workflowType, renderData)
            }
            
            console.log(`✅ 找到可操作iframe`)
            
            // 2. 分析具体的输入元素
            const elementInfo = await this.analyzeInputElements(session, workflowType)
            console.log('📋 找到的输入元素:')
            Object.entries(elementInfo).forEach(([key, found]) => {
                console.log(`   ${key}: ${found ? '✅' : '❌'}`)
            })
            
            // 3. 执行文件上传 (如果有文件)
            await this.handleFileUploads(session, workflowType, renderData, steps, fileUploader)
            
            // 4. 填写文本内容 (使用正确的选择器)
            await this.fillTextContentFixed(session, workflowType, renderData, steps)
            
            // 5. 检查发布准备状态
            const readyToPublish = this.checkReadyToPublish(steps)
            
            if (readyToPublish) {
                console.log('🎉 所有内容已准备完成，可以发布')
                steps.push({
                    step: 'ready_to_publish',
                    success: true,
                    instruction: '所有内容已填写完成，请点击发布按钮'
                })
            }
            
            return {
                success: true,
                type: workflowType,
                mode: 'auto_fixed',
                steps,
                readyToPublish,
                elementInfo,
                message: readyToPublish ? 
                    `${workflowType}工作流完成，准备发布` :
                    `${workflowType}工作流部分完成，请检查步骤`
            }
            
        } catch (error) {
            console.error('❌ 工作流执行失败:', error.message)
            return {
                success: false,
                type: workflowType,
                mode: 'auto_fixed',
                steps,
                error: error.message,
                fallback: this.executeManualMode(workflowType, renderData)
            }
        }
    }
    
    async analyzeInputElements(session, workflowType) {
        const result = await session.chromeController.executeScript(session, `
            (function() {
                const iframe = document.querySelector('iframe');
                if (!iframe || !iframe.contentDocument) {
                    return JSON.stringify({ error: '无法访问iframe' });
                }
                
                const iframeDoc = iframe.contentDocument;
                const elements = {};
                
                // 视频相关元素
                if ('${workflowType}' === 'video') {
                    // 短标题输入框
                    elements.shortTitle = !!iframeDoc.querySelector('input[placeholder*="概括视频主要内容"]');
                    
                    // 视频描述编辑器 (contenteditable)
                    elements.description = !!iframeDoc.querySelector('div[contenteditable][data-placeholder="添加描述"]');
                    elements.descriptionFallback = !!iframeDoc.querySelector('.input-editor[contenteditable]');
                    elements.anyContentEditable = !!iframeDoc.querySelector('div[contenteditable]');
                    
                    // 位置输入
                    elements.location = !!iframeDoc.querySelector('input[placeholder*="位置"]');
                    
                    // 文件上传
                    elements.fileInput = !!iframeDoc.querySelector('input[type="file"]');
                    
                    // 发布按钮
                    elements.publishButton = !!iframeDoc.querySelector('button[class*="primary"], .weui-desktop-btn_primary');
                }
                
                // 图文相关元素
                if ('${workflowType}' === 'article') {
                    elements.title = !!iframeDoc.querySelector('input[placeholder*="标题"]');
                    elements.content = !!iframeDoc.querySelector('div[contenteditable], textarea');
                    elements.imageUpload = !!iframeDoc.querySelector('input[type="file"][accept*="image"]');
                }
                
                // 音频/音乐相关元素
                if ('${workflowType}' === 'music' || '${workflowType}' === 'audio') {
                    elements.title = !!iframeDoc.querySelector('input[placeholder*="标题"], input[placeholder*="歌曲"]');
                    elements.audioUpload = !!iframeDoc.querySelector('input[type="file"][accept*="audio"]');
                    
                    if ('${workflowType}' === 'music') {
                        elements.artist = !!iframeDoc.querySelector('input[placeholder*="歌手"], input[placeholder*="艺术家"]');
                        elements.album = !!iframeDoc.querySelector('input[placeholder*="专辑"]');
                    }
                }
                
                return JSON.stringify(elements);
            })()
        `)
        
        return JSON.parse(result.result.value)
    }
    
    async fillTextContentFixed(session, workflowType, renderData, steps) {
        console.log('📝 填写文本内容 (使用正确选择器)...')
        
        if (workflowType === 'video') {
            // 1. 填写短标题 (概括视频主要内容)
            if (renderData.description) {
                try {
                    console.log('📝 填写视频短标题...')
                    // 截取描述的前16个字符作为短标题
                    const shortTitle = renderData.description.slice(0, 16)
                    await this.fillIframeInputFixed(session, 'short_title', shortTitle)
                    steps.push({
                        step: 'fill_short_title',
                        success: true,
                        field: '短标题',
                        value: shortTitle
                    })
                    console.log(`   ✅ 短标题填写成功: ${shortTitle}`)
                } catch (error) {
                    steps.push({
                        step: 'fill_short_title',
                        success: false,
                        error: error.message
                    })
                    console.log(`   ⚠️ 短标题填写失败: ${error.message}`)
                }
            }
            
            // 2. 填写视频描述 (contenteditable区域)
            if (renderData.description) {
                try {
                    console.log('📝 填写视频详细描述...')
                    await this.fillIframeInputFixed(session, 'description', renderData.description)
                    steps.push({
                        step: 'fill_description',
                        success: true,
                        field: '详细描述',
                        value: renderData.description
                    })
                    console.log(`   ✅ 详细描述填写成功`)
                } catch (error) {
                    steps.push({
                        step: 'fill_description',
                        success: false,
                        error: error.message
                    })
                    console.log(`   ⚠️ 详细描述填写失败: ${error.message}`)
                }
            }
            
            // 3. 填写位置信息
            if (renderData.location) {
                try {
                    console.log('📍 填写位置信息...')
                    await this.fillIframeInputFixed(session, 'location', renderData.location)
                    steps.push({
                        step: 'fill_location',
                        success: true,
                        field: '位置',
                        value: renderData.location
                    })
                    console.log(`   ✅ 位置信息填写成功`)
                } catch (error) {
                    steps.push({
                        step: 'fill_location',
                        success: false,
                        error: error.message
                    })
                    console.log(`   ⚠️ 位置信息填写失败: ${error.message}`)
                }
            }
        }
        
        // 其他工作流类型的处理...
        if (workflowType === 'article') {
            await this.fillArticleContent(session, renderData, steps)
        } else if (workflowType === 'music') {
            await this.fillMusicContent(session, renderData, steps)
        } else if (workflowType === 'audio') {
            await this.fillAudioContent(session, renderData, steps)
        }
    }
    
    async fillIframeInputFixed(session, fieldType, value) {
        const script = `
            (function() {
                const iframe = document.querySelector('iframe');
                if (!iframe || !iframe.contentDocument) {
                    throw new Error('无法访问iframe');
                }
                
                const iframeDoc = iframe.contentDocument;
                let element = null;
                let elementType = '';
                
                // 根据字段类型查找正确的元素
                switch ('${fieldType}') {
                    case 'short_title':
                        element = iframeDoc.querySelector('input[placeholder*="概括视频主要内容"]');
                        elementType = 'input';
                        break;
                        
                    case 'description':
                        // 首先尝试找到视频描述的contenteditable区域
                        element = iframeDoc.querySelector('div[contenteditable][data-placeholder="添加描述"]');
                        if (!element) {
                            element = iframeDoc.querySelector('.input-editor[contenteditable]');
                        }
                        if (!element) {
                            element = iframeDoc.querySelector('div[contenteditable]');
                        }
                        elementType = 'contenteditable';
                        break;
                        
                    case 'location':
                        element = iframeDoc.querySelector('input[placeholder*="位置"]') ||
                                 iframeDoc.querySelector('input[placeholder*="地点"]');
                        elementType = 'input';
                        break;
                        
                    case 'title':
                        element = iframeDoc.querySelector('input[placeholder*="标题"]') ||
                                 iframeDoc.querySelector('input[placeholder*="歌曲"]');
                        elementType = 'input';
                        break;
                        
                    case 'artist':
                        element = iframeDoc.querySelector('input[placeholder*="歌手"]') ||
                                 iframeDoc.querySelector('input[placeholder*="艺术家"]') ||
                                 iframeDoc.querySelector('input[placeholder*="演唱"]');
                        elementType = 'input';
                        break;
                        
                    case 'album':
                        element = iframeDoc.querySelector('input[placeholder*="专辑"]');
                        elementType = 'input';
                        break;
                        
                    case 'content':
                        element = iframeDoc.querySelector('div[contenteditable]') ||
                                 iframeDoc.querySelector('textarea');
                        elementType = element && element.tagName.toLowerCase() === 'div' ? 'contenteditable' : 'input';
                        break;
                }
                
                if (!element) {
                    throw new Error('未找到对应的输入字段: ${fieldType}');
                }
                
                console.log('找到元素:', element.tagName, elementType, element.className);
                
                // 聚焦元素
                element.focus();
                
                // 清空现有内容
                if (elementType === 'contenteditable') {
                    element.innerHTML = '';
                    element.textContent = '';
                } else {
                    element.value = '';
                }
                
                // 等待一下确保聚焦生效
                await new Promise(resolve => setTimeout(resolve, 200));
                
                // 设置新内容
                const newValue = '${value.replace(/'/g, "\\'")}';
                
                if (elementType === 'contenteditable') {
                    element.textContent = newValue;
                    element.innerHTML = newValue;
                } else {
                    element.value = newValue;
                }
                
                // 触发各种事件确保内容被识别
                const events = ['focus', 'input', 'change', 'keyup', 'keydown', 'blur'];
                for (const eventType of events) {
                    const event = new Event(eventType, { bubbles: true, cancelable: true });
                    element.dispatchEvent(event);
                    await new Promise(resolve => setTimeout(resolve, 50));
                }
                
                // 对于contenteditable，还要触发额外的事件
                if (elementType === 'contenteditable') {
                    const inputEvent = new InputEvent('input', {
                        bubbles: true,
                        cancelable: true,
                        data: newValue
                    });
                    element.dispatchEvent(inputEvent);
                    
                    // 手动触发compositionend事件 (中文输入法常用)
                    const compositionEvent = new CompositionEvent('compositionend', {
                        bubbles: true,
                        data: newValue
                    });
                    element.dispatchEvent(compositionEvent);
                }
                
                // 验证内容是否设置成功
                const currentValue = elementType === 'contenteditable' ? 
                    (element.textContent || element.innerHTML) : element.value;
                
                return {
                    success: true,
                    fieldType: '${fieldType}',
                    value: newValue,
                    currentValue: currentValue,
                    elementType: elementType,
                    elementTag: element.tagName,
                    className: element.className,
                    placeholder: element.placeholder || element.getAttribute('data-placeholder') || ''
                };
            })()
        `
        
        const result = await session.chromeController.executeScript(session, script)
        return result.result.value
    }
    
    async fillArticleContent(session, renderData, steps) {
        // 图文内容填写逻辑
        if (renderData.title) {
            try {
                await this.fillIframeInputFixed(session, 'title', renderData.title)
                steps.push({ step: 'fill_title', success: true, value: renderData.title })
            } catch (error) {
                steps.push({ step: 'fill_title', success: false, error: error.message })
            }
        }
        
        if (renderData.content) {
            try {
                await this.fillIframeInputFixed(session, 'content', renderData.content)
                steps.push({ step: 'fill_content', success: true, value: renderData.content })
            } catch (error) {
                steps.push({ step: 'fill_content', success: false, error: error.message })
            }
        }
    }
    
    async fillMusicContent(session, renderData, steps) {
        // 音乐内容填写逻辑
        const fields = [
            { key: 'title', type: 'title', label: '歌曲名称' },
            { key: 'artist', type: 'artist', label: '艺术家' },
            { key: 'album', type: 'album', label: '专辑' }
        ]
        
        for (const field of fields) {
            if (renderData[field.key]) {
                try {
                    await this.fillIframeInputFixed(session, field.type, renderData[field.key])
                    steps.push({ step: `fill_${field.key}`, success: true, value: renderData[field.key] })
                } catch (error) {
                    steps.push({ step: `fill_${field.key}`, success: false, error: error.message })
                }
            }
        }
    }
    
    async fillAudioContent(session, renderData, steps) {
        // 音频内容填写逻辑
        if (renderData.title) {
            try {
                await this.fillIframeInputFixed(session, 'title', renderData.title)
                steps.push({ step: 'fill_title', success: true, value: renderData.title })
            } catch (error) {
                steps.push({ step: 'fill_title', success: false, error: error.message })
            }
        }
        
        if (renderData.description) {
            try {
                await this.fillIframeInputFixed(session, 'description', renderData.description)
                steps.push({ step: 'fill_description', success: true, value: renderData.description })
            } catch (error) {
                steps.push({ step: 'fill_description', success: false, error: error.message })
            }
        }
    }
    
    async handleFileUploads(session, workflowType, renderData, steps, fileUploader) {
        // 文件上传逻辑 (与之前相同)
        const fileFields = {
            video: 'videoFile',
            music: 'musicFile', 
            audio: 'audioFile'
        }
        
        const fileField = fileFields[workflowType]
        if (fileField && renderData[fileField]) {
            try {
                console.log(`📤 上传${workflowType}文件...`)
                const uploadResult = await fileUploader.uploadFile(renderData[fileField])
                steps.push({
                    step: 'upload_file',
                    success: true,
                    fileType: workflowType,
                    fileName: uploadResult.fileName,
                    fileSize: uploadResult.fileSize
                })
                console.log('   ✅ 文件上传成功')
            } catch (error) {
                steps.push({
                    step: 'upload_file',
                    success: false,
                    error: error.message,
                    manual: true,
                    instruction: `请手动上传文件: ${renderData[fileField]}`
                })
                console.log('   ⚠️ 文件上传失败，需要手动操作')
            }
        }
    }
    
    async analyzeIframeStructure(session) {
        const result = await session.chromeController.executeScript(session, `
            (function() {
                const iframes = document.querySelectorAll('iframe');
                const info = {
                    iframeCount: iframes.length,
                    hasAccessibleIframe: false
                };
                
                for (let i = 0; i < iframes.length; i++) {
                    try {
                        const iframe = iframes[i];
                        if (iframe.contentDocument && iframe.contentDocument.body) {
                            info.hasAccessibleIframe = true;
                            break;
                        }
                    } catch (e) {
                        // iframe不可访问
                    }
                }
                
                return JSON.stringify(info);
            })()
        `)
        
        return JSON.parse(result.result.value)
    }
    
    checkReadyToPublish(steps) {
        const criticalSteps = steps.filter(step => 
            step.step.includes('upload') || 
            step.step.includes('fill_title') || 
            step.step.includes('fill_description') ||
            step.step.includes('fill_short_title')
        )
        
        const successfulSteps = criticalSteps.filter(step => step.success)
        
        return successfulSteps.length >= Math.max(1, Math.floor(criticalSteps.length * 0.7))
    }
    
    executeManualMode(workflowType, renderData) {
        return {
            success: true,
            type: workflowType,
            mode: 'manual',
            steps: [],
            message: `${workflowType}工作流 - 手动操作模式`
        }
    }
}
