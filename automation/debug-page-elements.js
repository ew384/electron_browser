#!/usr/bin/env node
// 调试页面元素结构
import { ChromeController } from './wechat-publisher/chrome-controller.js'

async function debugPageElements() {
    console.log('🔍 调试页面元素结构...')
    
    const controller = new ChromeController({
        debugPort: 9225,
        timeout: 15000
    })
    
    const testAccount = {
        id: 'debug_test',
        name: '调试测试',
        profile: {}
    }
    
    try {
        // 1. 创建会话
        const session = await controller.createSession(testAccount)
        session.chromeController = controller
        
        // 2. 获取iframe内的所有输入元素
        console.log('📋 分析iframe内的输入元素...')
        const iframeElements = await controller.executeScript(session, `
            (function() {
                const iframe = document.querySelector('iframe');
                if (!iframe || !iframe.contentDocument) {
                    return JSON.stringify({ error: '无法访问iframe' });
                }
                
                const iframeDoc = iframe.contentDocument;
                const result = {
                    inputs: [],
                    textareas: [],
                    contentEditables: [],
                    buttons: [],
                    fileInputs: []
                };
                
                // 收集所有input元素
                const inputs = iframeDoc.querySelectorAll('input');
                inputs.forEach((input, index) => {
                    result.inputs.push({
                        index: index,
                        type: input.type,
                        placeholder: input.placeholder,
                        name: input.name,
                        className: input.className,
                        id: input.id,
                        value: input.value,
                        visible: input.offsetWidth > 0 && input.offsetHeight > 0
                    });
                });
                
                // 收集所有textarea元素
                const textareas = iframeDoc.querySelectorAll('textarea');
                textareas.forEach((textarea, index) => {
                    result.textareas.push({
                        index: index,
                        placeholder: textarea.placeholder,
                        className: textarea.className,
                        id: textarea.id,
                        value: textarea.value,
                        visible: textarea.offsetWidth > 0 && textarea.offsetHeight > 0
                    });
                });
                
                // 收集所有contenteditable元素
                const editables = iframeDoc.querySelectorAll('[contenteditable]');
                editables.forEach((editable, index) => {
                    result.contentEditables.push({
                        index: index,
                        tagName: editable.tagName,
                        className: editable.className,
                        id: editable.id,
                        dataPlaceholder: editable.getAttribute('data-placeholder'),
                        innerHTML: editable.innerHTML,
                        textContent: editable.textContent,
                        visible: editable.offsetWidth > 0 && editable.offsetHeight > 0
                    });
                });
                
                // 收集按钮
                const buttons = iframeDoc.querySelectorAll('button');
                buttons.forEach((button, index) => {
                    result.buttons.push({
                        index: index,
                        textContent: button.textContent.trim(),
                        className: button.className,
                        id: button.id,
                        type: button.type,
                        visible: button.offsetWidth > 0 && button.offsetHeight > 0
                    });
                });
                
                // 收集文件输入
                const fileInputs = iframeDoc.querySelectorAll('input[type="file"]');
                fileInputs.forEach((input, index) => {
                    result.fileInputs.push({
                        index: index,
                        accept: input.accept,
                        className: input.className,
                        id: input.id,
                        visible: input.offsetWidth > 0 && input.offsetHeight > 0
                    });
                });
                
                return JSON.stringify(result, null, 2);
            })()
        `)
        
        const elements = JSON.parse(iframeElements.result.value)
        
        console.log('\n📋 页面元素分析结果:')
        console.log('=' * 60)
        
        if (elements.error) {
            console.log('❌ 错误:', elements.error)
            return
        }
        
        // 显示输入框
        console.log('\n📝 INPUT 元素:')
        elements.inputs.forEach(input => {
            console.log(`  [${input.index}] 类型: ${input.type}`)
            console.log(`      占位符: "${input.placeholder}"`)
            console.log(`      类名: ${input.className}`)
            console.log(`      可见: ${input.visible}`)
            console.log(`      当前值: "${input.value}"`)
            console.log()
        })
        
        // 显示可编辑区域
        console.log('\n✏️ CONTENTEDITABLE 元素:')
        elements.contentEditables.forEach(editable => {
            console.log(`  [${editable.index}] 标签: ${editable.tagName}`)
            console.log(`      数据占位符: "${editable.dataPlaceholder}"`)
            console.log(`      类名: ${editable.className}`)
            console.log(`      可见: ${editable.visible}`)
            console.log(`      内容: "${editable.textContent}"`)
            console.log(`      HTML: "${editable.innerHTML.slice(0, 100)}..."`)
            console.log()
        })
        
        // 显示文本区域
        if (elements.textareas.length > 0) {
            console.log('\n📄 TEXTAREA 元素:')
            elements.textareas.forEach(textarea => {
                console.log(`  [${textarea.index}] 占位符: "${textarea.placeholder}"`)
                console.log(`      类名: ${textarea.className}`)
                console.log(`      可见: ${textarea.visible}`)
                console.log()
            })
        }
        
        // 显示按钮
        console.log('\n🔘 BUTTON 元素:')
        elements.buttons.forEach(button => {
            if (button.visible) {
                console.log(`  [${button.index}] 文本: "${button.textContent}"`)
                console.log(`      类名: ${button.className}`)
                console.log(`      类型: ${button.type}`)
                console.log()
            }
        })
        
        // 显示文件输入
        if (elements.fileInputs.length > 0) {
            console.log('\n📁 FILE INPUT 元素:')
            elements.fileInputs.forEach(input => {
                console.log(`  [${input.index}] 接受类型: ${input.accept}`)
                console.log(`      类名: ${input.className}`)
                console.log(`      可见: ${input.visible}`)
                console.log()
            })
        }
        
        // 3. 尝试手动测试填写
        console.log('\n🧪 尝试手动填写测试...')
        
        // 测试填写第一个可见的input
        const visibleInputs = elements.inputs.filter(input => input.visible && input.type === 'text')
        if (visibleInputs.length > 0) {
            console.log(`📝 尝试填写第一个文本输入框 (index: ${visibleInputs[0].index})...`)
            
            const fillResult = await controller.executeScript(session, `
                (function() {
                    const iframe = document.querySelector('iframe');
                    if (!iframe || !iframe.contentDocument) {
                        return JSON.stringify({ success: false, error: '无法访问iframe' });
                    }
                    
                    const iframeDoc = iframe.contentDocument;
                    const inputs = iframeDoc.querySelectorAll('input[type="text"]');
                    const targetInput = inputs[${visibleInputs[0].index}];
                    
                    if (!targetInput) {
                        return JSON.stringify({ success: false, error: '未找到目标输入框' });
                    }
                    
                    console.log('找到目标输入框:', targetInput);
                    
                    // 聚焦并填写
                    targetInput.focus();
                    targetInput.value = '测试短标题内容';
                    
                    // 触发事件
                    ['input', 'change', 'keyup', 'blur'].forEach(eventType => {
                        const event = new Event(eventType, { bubbles: true });
                        targetInput.dispatchEvent(event);
                    });
                    
                    return JSON.stringify({
                        success: true,
                        value: targetInput.value,
                        placeholder: targetInput.placeholder
                    });
                })()
            `)
            
            const fillResultData = JSON.parse(fillResult.result.value)
            console.log('填写结果:', fillResultData)
        }
        
        // 测试填写第一个contenteditable
        const visibleEditables = elements.contentEditables.filter(editable => editable.visible)
        if (visibleEditables.length > 0) {
            console.log(`✏️ 尝试填写第一个可编辑区域 (index: ${visibleEditables[0].index})...`)
            
            const editResult = await controller.executeScript(session, `
                (function() {
                    const iframe = document.querySelector('iframe');
                    if (!iframe || !iframe.contentDocument) {
                        return JSON.stringify({ success: false, error: '无法访问iframe' });
                    }
                    
                    const iframeDoc = iframe.contentDocument;
                    const editables = iframeDoc.querySelectorAll('[contenteditable]');
                    const targetEditable = editables[${visibleEditables[0].index}];
                    
                    if (!targetEditable) {
                        return JSON.stringify({ success: false, error: '未找到目标可编辑区域' });
                    }
                    
                    console.log('找到目标可编辑区域:', targetEditable);
                    
                    // 聚焦并填写
                    targetEditable.focus();
                    targetEditable.textContent = '测试视频描述内容 #测试账号';
                    targetEditable.innerHTML = '测试视频描述内容 #测试账号';
                    
                    // 触发事件
                    ['input', 'change', 'keyup', 'blur'].forEach(eventType => {
                        const event = new Event(eventType, { bubbles: true });
                        targetEditable.dispatchEvent(event);
                    });
                    
                    // 额外触发输入事件
                    const inputEvent = new InputEvent('input', {
                        bubbles: true,
                        data: '测试视频描述内容 #测试账号'
                    });
                    targetEditable.dispatchEvent(inputEvent);
                    
                    return JSON.stringify({
                        success: true,
                        textContent: targetEditable.textContent,
                        innerHTML: targetEditable.innerHTML,
                        dataPlaceholder: targetEditable.getAttribute('data-placeholder')
                    });
                })()
            `)
            
            const editResultData = JSON.parse(editResult.result.value)
            console.log('编辑结果:', editResultData)
        }
        
        await controller.closeSession(session.id)
        
    } catch (error) {
        console.error('❌ 调试失败:', error.message)
    }
}

debugPageElements()
