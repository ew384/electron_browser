// 工作流引擎 - 完整修复版本
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

            // 4. 填写文本内容 (使用修复的选择器)
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
                try {
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
                    
                    // 其他类型...
                    return JSON.stringify(elements);
                } catch (e) {
                    return JSON.stringify({ error: e.message });
                }
            })()
        `)

        try {
            return JSON.parse(result.result.value)
        } catch (parseError) {
            console.error('元素分析JSON解析错误:', parseError.message)
            return { error: 'JSON解析失败' }
        }
    }

    async fillTextContentFixed(session, workflowType, renderData, steps) {
        console.log('📝 填写文本内容 (使用修复的同步方法)...')

        if (workflowType === 'video') {
            // 1. 填写短标题
            if (renderData.description || renderData.title) {
                try {
                    console.log('📝 填写视频短标题...')
                    // 生成符合要求的短标题
                    const shortTitle = this.generateShortTitle(renderData)
                    const fillResult = await this.fillShortTitle(session, shortTitle)

                    if (fillResult.success) {
                        steps.push({
                            step: 'fill_short_title',
                            success: true,
                            field: '短标题',
                            value: shortTitle
                        })
                        console.log(`   ✅ 短标题填写成功: ${shortTitle}`)
                    } else {
                        throw new Error(fillResult.error)
                    }
                } catch (error) {
                    steps.push({
                        step: 'fill_short_title',
                        success: false,
                        error: error.message
                    })
                    console.log(`   ⚠️ 短标题填写失败: ${error.message}`)
                }
            }

            // 2. 填写视频描述
            if (renderData.description) {
                try {
                    console.log('📝 填写视频详细描述...')
                    const fillResult = await this.fillDescription(session, renderData.description)

                    if (fillResult.success) {
                        steps.push({
                            step: 'fill_description',
                            success: true,
                            field: '详细描述',
                            value: renderData.description
                        })
                        console.log(`   ✅ 详细描述填写成功`)
                    } else {
                        throw new Error(fillResult.error)
                    }
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
                    const fillResult = await this.fillLocationWithSelection(session, renderData.location)

                    if (fillResult.success) {
                        steps.push({
                            step: 'fill_location',
                            success: true,
                            field: '位置',
                            value: fillResult.selectedLocation || renderData.location
                        })
                        console.log(`   ✅ 位置信息填写成功: ${fillResult.selectedLocation || renderData.location}`)
                    } else {
                        throw new Error(fillResult.error)
                    }
                } catch (error) {
                    steps.push({
                        step: 'fill_location',
                        success: false,
                        error: error.message
                    })
                    console.log(`   ⚠️ 位置信息填写失败: ${error.message}`)
                }
            }

            // 4. 自动发布
            if (this.config.autoPublish !== false) {
                try {
                    console.log('🚀 自动发布视频...')
                    const publishResult = await this.autoPublish(session)

                    if (publishResult.success) {
                        steps.push({
                            step: 'auto_publish',
                            success: true,
                            field: '发布',
                            value: '已发布'
                        })
                        console.log(`   ✅ 视频发布成功`)
                    } else {
                        throw new Error(publishResult.error)
                    }
                } catch (error) {
                    steps.push({
                        step: 'auto_publish',
                        success: false,
                        error: error.message,
                        manual: true,
                        instruction: '请手动点击发表按钮'
                    })
                    console.log(`   ⚠️ 自动发布失败: ${error.message}`)
                }
            }
        }
    }

    // 生成符合要求的短标题
    generateShortTitle(renderData) {
        let sourceText = ''

        // 优先使用title，然后是description
        if (renderData.title) {
            sourceText = renderData.title
        } else if (renderData.description) {
            sourceText = renderData.description
        } else {
            return '精彩视频内容'
        }

        // 移除特殊字符，只保留微信允许的符号
        // 允许的符号：书名号《》、引号""''、冒号：、加号+、问号？、百分号%、摄氏度℃
        const cleanText = sourceText
            .replace(/[#@\[\]()（）「」【】、，。！~`!@$^&*()_=\-\[\]{}\\|;':",.<>/]/g, '') // 移除不允许的特殊字符
            .replace(/\s+/g, ' ') // 多个空格合并为一个
            .trim()

        // 确保长度在6-16个字符之间
        if (cleanText.length >= 6 && cleanText.length <= 16) {
            return cleanText
        } else if (cleanText.length > 16) {
            // 截取前16个字符
            return cleanText.substring(0, 16)
        } else if (cleanText.length > 0) {
            // 如果太短，尝试添加通用词汇
            const suffixes = ['分享', '记录', '内容', '精彩', '时刻', '故事']
            for (const suffix of suffixes) {
                const newTitle = cleanText + suffix
                if (newTitle.length >= 6 && newTitle.length <= 16) {
                    return newTitle
                }
            }
            // 如果还是太短，使用默认标题
            return '精彩视频分享'
        } else {
            // 如果清理后为空，使用默认标题
            return '精彩视频内容'
        }
    }

    // 专门填写短标题的方法
    async fillShortTitle(session, value) {
        console.log('🎯 定向填写短标题...')

        const script = `
            (function() {
                try {
                    const iframe = document.querySelector('iframe');
                    if (!iframe || !iframe.contentDocument) {
                        return { success: false, error: '无法访问iframe' };
                    }
                    
                    const iframeDoc = iframe.contentDocument;
                    
                    // 精确查找短标题输入框
                    let element = iframeDoc.querySelector('input[placeholder*="概括视频主要内容"]');
                    
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

        const result = await session.chromeController.executeScript(session, script)
        return result.result.value
    }

    // 专门填写描述的方法
    async fillDescription(session, value) {
        console.log('🎯 定向填写视频描述...')

        const script = `
            (function() {
                try {
                    const iframe = document.querySelector('iframe');
                    if (!iframe || !iframe.contentDocument) {
                        return { success: false, error: '无法访问iframe' };
                    }
                    
                    const iframeDoc = iframe.contentDocument;
                    
                    // 查找描述编辑器
                    let element = iframeDoc.querySelector('div[contenteditable][data-placeholder="添加描述"]');
                    if (!element) {
                        element = iframeDoc.querySelector('.input-editor[contenteditable]');
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

        const result = await session.chromeController.executeScript(session, script)
        return result.result.value
    }

    // 专门填写位置的方法 (带下拉选择)
    async fillLocationWithSelection(session, value) {
        console.log('🎯 定向填写位置信息 (带下拉选择)...')

        const script = `
            (function() {
                try {
                    const iframe = document.querySelector('iframe');
                    if (!iframe || !iframe.contentDocument) {
                        return { success: false, error: '无法访问iframe' };
                    }
                    
                    const iframeDoc = iframe.contentDocument;
                    
                    // 查找位置输入框
                    let element = iframeDoc.querySelector('input[placeholder*="位置"]');
                    if (!element) {
                        element = iframeDoc.querySelector('input[placeholder*="搜索附近位置"]');
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
                    
                    // 等待下拉列表加载
                    setTimeout(() => {
                        // 查找下拉列表选项
                        const optionList = iframeDoc.querySelector('.common-option-list-wrap');
                        if (optionList) {
                            console.log('找到下拉列表');
                            
                            // 查找包含城市名的选项 (避免选择"不显示位置")
                            const options = optionList.querySelectorAll('.option-item:not(.active)');
                            console.log('找到选项数量:', options.length);
                            
                            // 选择第一个不是"不显示位置"的选项
                            for (let option of options) {
                                const nameElement = option.querySelector('.name');
                                if (nameElement && !nameElement.textContent.includes('不显示位置')) {
                                    console.log('选择位置:', nameElement.textContent);
                                    option.click();
                                    
                                    return {
                                        success: true,
                                        value: element.value,
                                        selectedLocation: nameElement.textContent,
                                        placeholder: element.placeholder
                                    };
                                }
                            }
                            
                            // 如果没找到合适的选项，选择第一个非活跃选项
                            if (options.length > 0) {
                                const firstOption = options[0];
                                const nameElement = firstOption.querySelector('.name');
                                firstOption.click();
                                
                                return {
                                    success: true,
                                    value: element.value,
                                    selectedLocation: nameElement ? nameElement.textContent : '已选择位置',
                                    placeholder: element.placeholder
                                };
                            }
                        }
                        
                        // 如果没有下拉列表，直接返回成功
                        return {
                            success: true,
                            value: element.value,
                            selectedLocation: element.value,
                            placeholder: element.placeholder,
                            note: '无下拉选项，直接使用输入值'
                        };
                    }, 1000);
                    
                } catch (e) {
                    return { success: false, error: e.message };
                }
            })()
        `

        const result = await session.chromeController.executeScript(session, script)

        // 等待一下让下拉选择完成
        await new Promise(resolve => setTimeout(resolve, 1500))

        return result.result.value
    }

    // 自动发布方法 (等待按钮激活)
    async autoPublish(session) {
        console.log('🎯 执行自动发布 (等待按钮激活)...')

        // 首先等待发表按钮变为可用状态
        const buttonReady = await this.waitForPublishButton(session)
        if (!buttonReady.success) {
            return buttonReady
        }

        console.log('✅ 发表按钮已激活，开始发布...')

        const script = `
            (function() {
                try {
                    const iframe = document.querySelector('iframe');
                    if (!iframe || !iframe.contentDocument) {
                        return { success: false, error: '无法访问iframe' };
                    }
                    
                    const iframeDoc = iframe.contentDocument;
                    
                    // 更精确地查找发表按钮
                    let publishButton = null;
                    
                    // 方法1: 通过文本内容查找 "发表" 按钮
                    const buttons = iframeDoc.querySelectorAll('button');
                    for (let button of buttons) {
                        const buttonText = button.textContent.trim();
                        if (buttonText === '发表') {
                            publishButton = button;
                            console.log('通过文本找到发表按钮:', buttonText, button.className);
                            break;
                        }
                    }
                    
                    // 方法2: 如果没找到，尝试其他选择器
                    if (!publishButton) {
                        const primaryButtons = iframeDoc.querySelectorAll('button.weui-desktop-btn_primary');
                        for (let button of primaryButtons) {
                            const buttonText = button.textContent.trim();
                            if (buttonText === '发表' || buttonText === '发布') {
                                publishButton = button;
                                console.log('通过主要按钮样式找到:', buttonText, button.className);
                                break;
                            }
                        }
                    }
                    
                    if (!publishButton) {
                        return { success: false, error: '未找到发表按钮' };
                    }
                    
                    console.log('找到发表按钮:', publishButton.textContent.trim(), publishButton.className);
                    
                    // 再次检查按钮是否可用
                    if (publishButton.disabled) {
                        return { success: false, error: '发表按钮仍然不可用' };
                    }
                    
                    // 滚动到按钮位置
                    publishButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    
                    // 等待一下确保滚动完成
                    setTimeout(() => {
                        // 点击发表按钮
                        publishButton.focus();
                        publishButton.click();
                        
                        // 触发额外的点击事件
                        const clickEvent = new MouseEvent('click', {
                            bubbles: true,
                            cancelable: true,
                            view: iframeDoc.defaultView
                        });
                        publishButton.dispatchEvent(clickEvent);
                        
                        console.log('已点击发表按钮');
                    }, 500);
                    
                    return {
                        success: true,
                        buttonText: publishButton.textContent.trim(),
                        buttonClass: publishButton.className
                    };
                    
                } catch (e) {
                    return { success: false, error: e.message };
                }
            })()
        `

        const result = await session.chromeController.executeScript(session, script)

        // 等待发布处理
        await new Promise(resolve => setTimeout(resolve, 3000))

        // 检查发布状态
        const publishStatus = await this.checkPublishStatus(session)

        return {
            ...result.result.value,
            publishStatus: publishStatus
        }
    }

    // 等待发表按钮激活
    async waitForPublishButton(session) {
        console.log('⏳ 等待发表按钮激活...')

        const maxWaitTime = 30000 // 最大等待30秒
        const checkInterval = 1000 // 每秒检查一次
        const startTime = Date.now()

        while (Date.now() - startTime < maxWaitTime) {
            try {
                const buttonStatus = await session.chromeController.executeScript(session, `
                    (function() {
                        try {
                            const iframe = document.querySelector('iframe');
                            if (!iframe || !iframe.contentDocument) {
                                return { ready: false, error: '无法访问iframe' };
                            }
                            
                            const iframeDoc = iframe.contentDocument;
                            
                            // 更精确地查找发表按钮
                            let publishButton = null;
                            
                            // 方法1: 通过文本内容查找 "发表" 按钮
                            const buttons = iframeDoc.querySelectorAll('button');
                            for (let button of buttons) {
                                const buttonText = button.textContent.trim();
                                if (buttonText === '发表') {
                                    publishButton = button;
                                    console.log('通过文本找到发表按钮:', buttonText, button.className);
                                    break;
                                }
                            }
                            
                            // 方法2: 如果没找到，尝试其他选择器
                            if (!publishButton) {
                                // 查找所有主要按钮，过滤掉"保存草稿"等
                                const primaryButtons = iframeDoc.querySelectorAll('button.weui-desktop-btn_primary');
                                for (let button of primaryButtons) {
                                    const buttonText = button.textContent.trim();
                                    if (buttonText === '发表' || buttonText === '发布') {
                                        publishButton = button;
                                        console.log('通过主要按钮样式找到:', buttonText, button.className);
                                        break;
                                    }
                                }
                            }
                            
                            // 如果还是没找到，列出所有按钮帮助调试
                            if (!publishButton) {
                                const allButtons = [];
                                for (let button of buttons) {
                                    allButtons.push({
                                        text: button.textContent.trim(),
                                        className: button.className,
                                        disabled: button.disabled
                                    });
                                }
                                
                                return { 
                                    ready: false, 
                                    error: '未找到发表按钮',
                                    allButtons: allButtons
                                };
                            }
                            
                            const isDisabled = publishButton.disabled;
                            const buttonText = publishButton.textContent.trim();
                            const hasDisabledClass = publishButton.className.includes('disabled');
                            
                            // 检查按钮是否可用
                            const isReady = !isDisabled && !hasDisabledClass && (buttonText === '发表' || buttonText === '发布');
                            
                            return {
                                ready: isReady,
                                disabled: isDisabled,
                                hasDisabledClass: hasDisabledClass,
                                buttonText: buttonText,
                                className: publishButton.className
                            };
                            
                        } catch (e) {
                            return { ready: false, error: e.message };
                        }
                    })()
                `)

                const status = buttonStatus.result.value

                if (status.ready) {
                    console.log('✅ 发表按钮已激活')
                    return { success: true, waitTime: Date.now() - startTime }
                }

                if (status.error) {
                    console.log(`⚠️ 检查按钮状态时出错: ${status.error}`)
                    if (status.allButtons) {
                        console.log('📋 页面中所有按钮:')
                        status.allButtons.forEach((btn, index) => {
                            console.log(`   [${index}] "${btn.text}" - ${btn.className} - disabled: ${btn.disabled}`)
                        })
                    }
                } else {
                    const waitTime = Math.round((Date.now() - startTime) / 1000)
                    console.log(`⏳ 等待中... (${waitTime}s) - 按钮状态: disabled=${status.disabled}, text="${status.buttonText}"`)
                }

                // 等待下一次检查
                await new Promise(resolve => setTimeout(resolve, checkInterval))

            } catch (error) {
                console.log(`⚠️ 检查按钮状态失败: ${error.message}`)
                await new Promise(resolve => setTimeout(resolve, checkInterval))
            }
        }

        console.log('❌ 等待发表按钮激活超时')
        return {
            success: false,
            error: '等待发表按钮激活超时',
            waitTime: maxWaitTime
        }
    }

    // 检查发布状态
    async checkPublishStatus(session) {
        console.log('📊 检查发布状态...')

        const script = `
            (function() {
                try {
                    const iframe = document.querySelector('iframe');
                    if (!iframe || !iframe.contentDocument) {
                        return { status: 'unknown', message: '无法访问iframe' };
                    }
                    
                    const iframeDoc = iframe.contentDocument;
                    
                    // 检查是否有成功提示
                    const successSelectors = [
                        '.success-message',
                        '.toast-success', 
                        '[class*="success"]',
                        '.weui-desktop-toast'
                    ];
                    
                    for (let selector of successSelectors) {
                        const element = iframeDoc.querySelector(selector);
                        if (element && element.textContent.includes('成功')) {
                            return {
                                status: 'success',
                                message: element.textContent.trim()
                            };
                        }
                    }
                    
                    // 检查页面是否跳转（发布成功通常会跳转）
                    const currentUrl = window.location.href;
                    if (currentUrl.includes('success') || currentUrl.includes('complete')) {
                        return {
                            status: 'success',
                            message: '页面已跳转，发布可能成功'
                        };
                    }
                    
                    // 检查发表按钮是否还存在且可用
                    const publishButton = iframeDoc.querySelector('button.weui-desktop-btn_primary');
                    if (publishButton && publishButton.textContent.trim() === '发表') {
                        if (publishButton.disabled) {
                            return {
                                status: 'processing',
                                message: '发表按钮已禁用，可能正在处理'
                            };
                        } else {
                            return {
                                status: 'ready',
                                message: '发表按钮仍可用，可能需要再次点击'
                            };
                        }
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

        const result = await session.chromeController.executeScript(session, script)
        const status = result.result.value

        console.log(`   📊 发布状态: ${status.status} - ${status.message}`)
        return status
    }

    async handleFileUploads(session, workflowType, renderData, steps, fileUploader) {
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
                try {
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
                } catch (e) {
                    return JSON.stringify({ error: e.message });
                }
            })()
        `)

        try {
            return JSON.parse(result.result.value)
        } catch (parseError) {
            return { hasAccessibleIframe: false, error: 'JSON解析失败' }
        }
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