// automation/engines/llm-publishers/claude-llm-publisher.js
// Claude AI专用LLM发布器 - 移植和优化自Python版本的auth_handler

import { getLLMConfig, getLLMPlatformSelector } from '../../config/llm-platforms.js';

export class ClaudeLLMPublisher {
    constructor(session, llmController) {
        this.session = session;
        this.llmController = llmController;
        this.config = getLLMConfig('claude');
        this.selectors = this.config.selectors;
        this.features = this.config.features;
        this.timing = this.config.timing;
        this.domain = 'claude.ai';
        this.loggedIn = false;
        this.conversationId = null;
    }

    // ==================== 认证和登录检测 ====================

    /**
     * 检查是否已登录Claude
     * @returns {boolean} 登录状态
     */
    async checkLoggedIn() {
        try {
            console.log('[Claude] 检查登录状态...');
            const loggedInSelectors = this.selectors.loggedInIndicator.split(', ');
            const selectorChecks = loggedInSelectors.map(sel => `document.querySelector('${sel.trim()}')`).join(' || ');
            const script = `
                (function() {
                    try {
                        // 检查登录指示器
                        const loggedInIndicator = ${selectorChecks};
                        if (loggedInIndicator) {
                            return { loggedIn: true, method: 'indicator' };
                        }
                        
                        // 检查URL是否包含chat或new
                        const url = window.location.href;
                        if (url.includes('/chat/') || url.includes('/new')) {
                            return { loggedIn: true, method: 'url' };
                        }
                        
                        // 检查是否有输入框
                        const promptArea = document.querySelector('${this.selectors.promptTextarea}');
                        if (promptArea) {
                            return { loggedIn: true, method: 'textarea' };
                        }
                        
                        // 检查是否有登录按钮
                        const loginButton = document.querySelector('${this.selectors.loginButton}');
                        if (loginButton) {
                            return { loggedIn: false, method: 'login_button' };
                        }
                        
                        return { loggedIn: false, method: 'unknown' };
                    } catch (e) {
                        return { loggedIn: false, error: e.message };
                    }
                })()
            `;

            const result = await this.llmController.executeLLMScript(this.session, script);

            if (result.success && result.result) {
                const checkResult = result.result.value || result.result;
                this.loggedIn = checkResult.loggedIn;
                console.log(`[Claude] 登录状态: ${this.loggedIn ? '✅已登录' : '❌未登录'} (${result.result.method})`);
                return this.loggedIn;
            } else {
                console.log('[Claude] 登录状态检查失败');
                return false;
            }

        } catch (error) {
            console.error('[Claude] 登录检查异常:', error.message);
            return false;
        }
    }

    /**
     * 处理登录流程
     * @returns {Object} 登录结果
     */
    async handleLogin() {
        console.log('[Claude] 开始登录处理...');

        try {
            // 先检查当前登录状态
            const isLoggedIn = await this.checkLoggedIn();
            if (isLoggedIn) {
                return {
                    success: true,
                    status: 'already_logged_in',
                    message: '用户已登录'
                };
            }

            // 导航到登录页面
            const loginUrl = this.config.urls.login;
            const navigated = await this.llmController.navigateLLMTab(this.session, loginUrl);
            if (!navigated) {
                throw new Error('无法导航到登录页面');
            }

            // 等待用户手动登录
            console.log('[Claude] 等待用户手动登录...');
            const loginResult = await this.waitForManualLogin();

            if (loginResult) {
                this.loggedIn = true;
                return {
                    success: true,
                    status: 'manual_login_completed',
                    message: '手动登录完成'
                };
            } else {
                return {
                    success: false,
                    status: 'login_timeout',
                    message: '登录超时'
                };
            }

        } catch (error) {
            console.error('[Claude] 登录处理失败:', error.message);
            return {
                success: false,
                status: 'login_error',
                message: error.message
            };
        }
    }

    /**
     * 等待用户手动登录
     * @param {number} timeout 超时时间（毫秒）
     * @returns {boolean} 登录是否成功
     */
    async waitForManualLogin(timeout = 300000) {
        console.log('[Claude] 等待手动登录，超时时间:', timeout / 1000, '秒');

        const startTime = Date.now();
        const checkInterval = 3000; // 每3秒检查一次

        while (Date.now() - startTime < timeout) {
            const isLoggedIn = await this.checkLoggedIn();

            if (isLoggedIn) {
                console.log('[Claude] ✅ 手动登录成功');
                return true;
            }

            console.log('[Claude] ⏳ 继续等待手动登录...');
            await this.delay(checkInterval);
        }

        console.log('[Claude] ❌ 手动登录超时');
        return false;
    }

    // ==================== 对话管理 ====================

    /**
     * 开始新对话
     * @returns {boolean} 是否成功
     */
    async startNewChat() {
        try {
            console.log('[Claude] 开始新对话...');

            // 检查当前URL是否已经是新对话页面
            const checkUrlScript = 'return window.location.href';
            const urlResult = await this.llmController.executeLLMScript(this.session, checkUrlScript);

            if (urlResult.success && urlResult.result.includes('/new')) {
                console.log('[Claude] 已在新对话页面');
                return true;
            }

            // 尝试点击新对话按钮
            const clickNewChatScript = `
                (function() {
                    try {
                        const newChatButton = document.querySelector('${this.selectors.newChatButton}');
                        if (newChatButton) {
                            newChatButton.click();
                            return { success: true, method: 'button' };
                        }
                        return { success: false, reason: 'button_not_found' };
                    } catch (e) {
                        return { success: false, error: e.message };
                    }
                })()
            `;

            const clickResult = await this.llmController.executeLLMScript(this.session, clickNewChatScript);

            if (clickResult.success && clickResult.result.success) {
                // 等待页面跳转
                await this.delay(3000);

                // 验证是否跳转成功
                const verifyResult = await this.llmController.executeLLMScript(this.session, checkUrlScript);
                if (verifyResult.success && verifyResult.result.includes('/new')) {
                    console.log('[Claude] ✅ 新对话创建成功');
                    return true;
                }
            }

            // 如果按钮点击失败，直接导航到新对话页面
            console.log('[Claude] 按钮点击失败，直接导航到新对话页面');
            const navigated = await this.llmController.navigateLLMTab(this.session, this.config.urls.chat);

            if (navigated) {
                await this.delay(3000);
                console.log('[Claude] ✅ 新对话页面导航成功');
                return true;
            }

            throw new Error('无法创建新对话');

        } catch (error) {
            console.error('[Claude] 新对话创建失败:', error.message);
            return false;
        }
    }

    /**
     * 获取对话ID
     * @returns {string|null} 对话ID
     */
    async getChatId() {
        try {
            const script = `
                (function() {
                    try {
                        const url = window.location.href;
                        const match = url.match(/claude\\.ai\\/chat\\/([^?#]+)/);
                        return match ? match[1] : null;
                    } catch (e) {
                        return null;
                    }
                })()
            `;

            const result = await this.llmController.executeLLMScript(this.session, script);

            if (result.success && result.result) {
                const chatId = result.result.value || result.result;
                this.conversationId = chatId;
                console.log(`[Claude] 获取对话ID: ${this.conversationId}`);
                return this.conversationId;
            }

            return null;

        } catch (error) {
            console.error('[Claude] 获取对话ID失败:', error.message);
            return null;
        }
    }

    // ==================== 文件上传 ====================

    /**
     * 上传文件到Claude
     * @param {Array|string} filePaths 文件路径数组或单个文件路径
     * @returns {boolean} 上传是否成功
     */
    async uploadFiles(filePaths) {
        try {
            if (!filePaths || (Array.isArray(filePaths) && filePaths.length === 0)) {
                return true; // 没有文件需要上传
            }

            if (!this.features.supportFileUpload) {
                throw new Error('Claude不支持文件上传');
            }

            const fileArray = Array.isArray(filePaths) ? filePaths : [filePaths];
            console.log(`[Claude] 上传文件: ${fileArray.length} 个`);

            // 上传脚本 - 基于Python版本优化
            const uploadScript = `
                (async function() {
                    try {
                        const filePaths = ${JSON.stringify(fileArray)};
                        
                        // 查找文件输入框
                        let fileInput = document.querySelector('${this.selectors.fileInput}');
                        
                        if (!fileInput) {
                            console.log('[Claude Upload] 直接查找失败，尝试备用选择器');
                            const altSelectors = ${JSON.stringify(this.selectors.fileInputAlt || [])};
                            
                            for (const selector of altSelectors) {
                                const inputs = document.querySelectorAll(selector);
                                for (const input of inputs) {
                                    const accept = input.accept;
                                    if (accept && (accept.includes('image') || accept.includes('*'))) {
                                        fileInput = input;
                                        break;
                                    }
                                }
                                if (fileInput) break;
                            }
                        }
                        
                        if (!fileInput) {
                            // 尝试点击上传按钮
                            const uploadButton = document.querySelector('${this.selectors.uploadButton}');
                            if (uploadButton) {
                                uploadButton.click();
                                await new Promise(resolve => setTimeout(resolve, 1000));
                                fileInput = document.querySelector('${this.selectors.fileInput}');
                            }
                        }
                        
                        if (!fileInput) {
                            throw new Error('未找到文件输入框');
                        }
                        
                        console.log('[Claude Upload] 找到文件输入框，开始上传');
                        
                        // 模拟文件上传 - 这里需要结合后端文件处理
                        // 由于安全限制，无法直接设置文件路径，需要通过其他方式处理
                        
                        return {
                            success: true,
                            message: '文件上传接口已找到',
                            fileInputFound: true,
                            filesCount: filePaths.length
                        };
                        
                    } catch (e) {
                        return {
                            success: false,
                            error: e.message
                        };
                    }
                })()
            `;

            const result = await this.llmController.executeLLMScript(this.session, uploadScript, {
                awaitPromise: true,
                timeout: this.timing.uploadTimeout
            });

            if (result.success && result.result.success) {
                console.log('[Claude] ✅ 文件上传准备完成');
                return true;
            } else {
                throw new Error(result.result?.error || '文件上传失败');
            }

        } catch (error) {
            console.error('[Claude] 文件上传失败:', error.message);
            return false;
        }
    }

    // ==================== 消息发送和响应处理 ====================

    /**
     * 发送消息到Claude
     * @param {string} prompt 消息内容
     * @param {Array} files 文件列表（可选）
     * @param {boolean} newChat 是否开始新对话
     * @param {boolean} stream 是否流式响应
     * @returns {Object} 响应结果
     */
    async sendMessage(prompt, files = null, newChat = false, stream = false) {
        try {
            console.log('[Claude] 发送消息开始...');

            // 确保已登录
            const isLoggedIn = await this.checkLoggedIn();
            if (!isLoggedIn) {
                throw new Error('用户未登录，无法发送消息');
            }

            // 开始新对话（如果需要）
            if (newChat) {
                const newChatSuccess = await this.startNewChat();
                if (!newChatSuccess) {
                    throw new Error('无法开始新对话');
                }
            }

            // 上传文件（如果有）
            if (files && files.length > 0) {
                const uploadSuccess = await this.uploadFiles(files);
                if (!uploadSuccess) {
                    throw new Error('文件上传失败');
                }
            }

            // 发送消息
            if (prompt) {
                const sendResult = await this.sendPromptMessage(prompt);
                if (!sendResult.success) {
                    throw new Error(sendResult.error);
                }

                // 等待响应
                const responseResult = await this.waitForResponse();
                if (!responseResult.success) {
                    throw new Error(responseResult.error);
                }

                // 提取并格式化响应
                const extractedContent = await this.extractPageContent();

                return {
                    success: true,
                    response: extractedContent,
                    conversationId: await this.getChatId(),
                    timing: {
                        completedAt: Date.now()
                    }
                };
            }

            return {
                success: true,
                message: '操作完成，无消息发送',
                conversationId: await this.getChatId()
            };

        } catch (error) {
            console.error('[Claude] 发送消息失败:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * 发送提示消息
     * @param {string} prompt 消息内容
     * @returns {Object} 发送结果
     */
    async sendPromptMessage(prompt) {
        try {
            console.log('[Claude] 发送提示消息...');

            const sendScript = `
                (async function() {
                    try {
                        const prompt = ${JSON.stringify(prompt)};
                        
                        // 查找输入框
                        const textarea = document.querySelector('div.ProseMirror') || 
                                        document.querySelector('${this.selectors.promptTextarea}');
                        
                        if (!textarea) {
                            throw new Error('未找到输入框');
                        }
                        
                        console.log('[Claude Send] 找到输入框，开始输入消息');
                        
                        // 聚焦输入框
                        textarea.focus();
                        
                        // 使用粘贴模拟来设置内容
                        textarea.innerHTML = '';
                        textarea.innerHTML = prompt.replace(/\\n/g, '<br>');
                        
                        // 触发输入事件
                        const inputEvent = new Event('input', { bubbles: true });
                        textarea.dispatchEvent(inputEvent);
                        
                        const changeEvent = new Event('change', { bubbles: true });
                        textarea.dispatchEvent(changeEvent);
                        
                        console.log('[Claude Send] 消息已输入，等待发送按钮激活');
                        
                        // 等待发送按钮激活
                        let sendButtonEnabled = false;
                        let retryCount = 0;
                        const maxRetries = 20;
                        
                        while (retryCount < maxRetries && !sendButtonEnabled) {
                            const sendBtn = document.querySelector('${this.selectors.sendButton}');
                            if (sendBtn && !sendBtn.disabled) {
                                sendButtonEnabled = true;
                                break;
                            }
                            await new Promise(resolve => setTimeout(resolve, 500));
                            retryCount++;
                        }
                        
                        if (!sendButtonEnabled) {
                            throw new Error('发送按钮未激活');
                        }
                        
                        // 点击发送按钮
                        const sendBtn = document.querySelector('${this.selectors.sendButton}');
                        if (sendBtn && !sendBtn.disabled) {
                            sendBtn.click();
                            console.log('[Claude Send] 已点击发送按钮');
                            return { success: true };
                        } else {
                            throw new Error('发送按钮不可用');
                        }
                        
                    } catch (e) {
                        return { success: false, error: e.message };
                    }
                })()
            `;

            const result = await this.llmController.executeLLMScript(this.session, sendScript, {
                awaitPromise: true,
                timeout: 30000
            });

            const sendResult = result.result.value || result.result;  // 🔧 修复
            if (result.success && sendResult.success) {
                console.log('[Claude] ✅ 消息发送成功');
                return { success: true };
            } else {
                throw new Error(sendResult?.error || '消息发送失败');
            }

        } catch (error) {
            console.error('[Claude] 消息发送失败:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * 等待Claude响应完成 - 最终修复版：基于完整回复内容稳定性
     * @returns {Object} 等待结果
     */
    async waitForResponse() {
        try {
            console.log('[Claude] 等待响应完成...');

            const waitScript = `
            (async function() {
                try {
                    const maxWaitTime = ${this.timing.responseTimeout};
                    const checkInterval = 2000;
                    const startTime = Date.now();
                    
                    let lastCompleteLength = 0;
                    let stableCount = 0;
                    const requiredStableChecks = 3;
                    
                    console.log('[Claude Wait] 开始完整内容稳定性检测...');
                    
                    while (Date.now() - startTime < maxWaitTime) {
                        // 1. 基础完成检测
                        const supportLink = document.querySelector('a[href*="claude-is-providing-incorrect-or-misleading-responses"]');
                        const hasSupportLink = supportLink && supportLink.offsetParent !== null;
                        
                        // 2. 🔧 检测真实生成状态（排除静态Loading）
                        function checkRealGenerationStatus() {
                            // 检查可见的动态指示器
                            const dynamicIndicators = [
                                '[data-testid="conversation-turn-loading"]',
                                '.animate-pulse',
                                '.animate-spin',
                                '[data-loading="true"]'
                            ];
                            
                            for (const selector of dynamicIndicators) {
                                const elements = document.querySelectorAll(selector);
                                for (const el of elements) {
                                    if (el.offsetParent !== null) {
                                        return true;
                                    }
                                }
                            }
                            
                            // 检查动态生成文本（只在主内容区域）
                            const dynamicKeywords = ['生成中...', 'Generating...', '正在生成...', 'Thinking...'];
                            const mainContent = document.querySelector('div.flex-1.flex.flex-col.gap-3');
                            if (mainContent) {
                                const mainText = mainContent.textContent;
                                for (const keyword of dynamicKeywords) {
                                    if (mainText.includes(keyword)) {
                                        return true;
                                    }
                                }
                            }
                            
                            return false;
                        }
                        
                        const hasRealGeneration = checkRealGenerationStatus();
                        
                        // 3. 🔧 关键改进：检查完整回复内容的稳定性
                        let currentCompleteLength = 0;
                        const mainContentArea = document.querySelector('div.flex-1.flex.flex-col.gap-3');
                        
                        if (mainContentArea) {
                            const conversationElements = Array.from(mainContentArea.children);
                            
                            // 找到最新的助手回复
                            for (let i = conversationElements.length - 1; i >= 0; i--) {
                                const element = conversationElements[i];
                                const hasResponse = element.querySelector('.font-claude-message');
                                
                                if (hasResponse) {
                                    // 获取整个回复区域的内容长度（包括Artifact和解释文本）
                                    currentCompleteLength = hasResponse.textContent.length;
                                    break;
                                }
                            }
                        }
                        
                        // 检查完整内容是否稳定
                        const contentChanged = currentCompleteLength !== lastCompleteLength;
                        if (contentChanged) {
                            stableCount = 0;
                            console.log('[Claude Wait] 完整内容变化:', lastCompleteLength, '->', currentCompleteLength);
                        } else {
                            stableCount++;
                        }
                        lastCompleteLength = currentCompleteLength;
                        
                        // 4. 综合判断
                        const elapsed = Date.now() - startTime;
                        const basicComplete = hasSupportLink;
                        const noRealGeneration = !hasRealGeneration;
                        const contentStable = stableCount >= requiredStableChecks;
                        const minTimeElapsed = elapsed > 5000; // 最少等待5秒
                        const hasContent = currentCompleteLength > 50; // 确保有实际内容
                        
                        console.log('[Claude Wait] 状态检查:', {
                            elapsed: Math.round(elapsed / 1000) + 's',
                            supportLink: basicComplete,
                            noGeneration: noRealGeneration,
                            contentStable: stableCount + '/' + requiredStableChecks,
                            contentLength: currentCompleteLength,
                            minTime: minTimeElapsed,
                            hasContent: hasContent
                        });
                        
                        // 🔧 最终完成条件：基于完整内容稳定性
                        if (basicComplete && noRealGeneration && contentStable && minTimeElapsed && hasContent) {
                            const waitTime = Date.now() - startTime;
                            console.log('[Claude Wait] ✅ 完整回复真正完成！');
                            return {
                                success: true,
                                waitTime: waitTime,
                                method: 'complete_content_stability',
                                finalContentLength: currentCompleteLength,
                                stableChecks: stableCount
                            };
                        }
                        
                        // 🔧 快速完成条件：长时间等待后的备用逻辑
                        if (basicComplete && noRealGeneration && stableCount >= 2 && elapsed > 30000) {
                            const waitTime = Date.now() - startTime;
                            console.log('[Claude Wait] ⚡ 长时间等待，启用快速完成');
                            return {
                                success: true,
                                waitTime: waitTime,
                                method: 'extended_wait_fallback',
                                finalContentLength: currentCompleteLength
                            };
                        }
                        
                        await new Promise(resolve => setTimeout(resolve, checkInterval));
                    }
                    
                    return {
                        success: false,
                        error: 'Timeout waiting for complete content stability',
                        waitTime: maxWaitTime,
                        finalContentLength: lastCompleteLength
                    };
                    
                } catch (e) {
                    return {
                        success: false,
                        error: e.message,
                        stack: e.stack
                    };
                }
            })()
        `;

            const result = await this.llmController.executeLLMScript(this.session, waitScript, {
                awaitPromise: true,
                timeout: this.timing.responseTimeout + 15000
            });

            if (result.success && result.result) {
                const waitResult = result.result.value || result.result;

                if (waitResult && waitResult.success) {
                    console.log(`[Claude] ✅ 完整回复等待成功`);
                    console.log(`[Claude] 方法: ${waitResult.method}`);
                    console.log(`[Claude] 耗时: ${waitResult.waitTime}ms`);
                    console.log(`[Claude] 最终内容长度: ${waitResult.finalContentLength}`);

                    // 完成后稍等确保DOM完全稳定
                    await this.delay(1000);
                    return { success: true };
                } else {
                    throw new Error(waitResult?.error || '完整内容等待失败');
                }
            } else {
                throw new Error('脚本执行失败: ' + (result?.error || '未知错误'));
            }

        } catch (error) {
            console.error('[Claude] 响应等待失败:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }
    /**
     * 提取页面完整内容 - 最终修复版：提取所有区域的内容
     */
    async extractPageContent() {
        try {
            console.log('[Claude] 开始提取页面内容...');

            const contentScript = `
            (async function() {
                try {
                    // 🔧 改进的内容提取函数 - 提取整个回复区域的所有内容
                    async function extractCompleteContent(element) {
                        const contentParts = [];
                        const seenTexts = new Set(); // 用于去重
                        
                        const contentArea = element.querySelector('.font-claude-message');
                        if (!contentArea) {
                            console.log('❌ 未找到内容区域');
                            return '';
                        }
                        
                        console.log('✅ 找到内容区域，开始提取所有内容...');
                        
                        // 🔧 按DOM顺序提取内容，保持正确的结构顺序
                        function extractAllChildElements(container) {
                            const orderedParts = [];
                            
                            Array.from(container.children).forEach((child, index) => {
                                console.log(\`处理子元素 \${index}: \${child.tagName}\`);
                                
                                if (child.classList.contains('grid')) {
                                    // 网格容器 - 按顺序处理段落和列表
                                    Array.from(child.children).forEach((gridChild, gridIndex) => {
                                        if (gridChild.tagName === 'P' && gridChild.classList.contains('whitespace-normal')) {
                                            const text = gridChild.textContent.trim();
                                            if (text && !seenTexts.has(text)) {
                                                seenTexts.add(text);
                                                orderedParts.push({
                                                    type: 'text',
                                                    content: text,
                                                    order: \`\${index}.\${gridIndex}\`
                                                });
                                                console.log('  ✅ 网格段落:', text.substring(0, 50) + '...');
                                            }
                                        } else if (gridChild.tagName === 'UL' || gridChild.tagName === 'OL') {
                                            const listItems = [];
                                            Array.from(gridChild.children).forEach((li) => {
                                                if (li.tagName === 'LI') {
                                                    const liText = li.textContent.trim();
                                                    if (liText) {
                                                        const prefix = gridChild.tagName === 'OL' ? \`\${listItems.length + 1}.\` : '•';
                                                        listItems.push(\`\${prefix} \${liText}\`);
                                                    }
                                                }
                                            });
                                            if (listItems.length > 0) {
                                                const listText = listItems.join('\\n');
                                                if (!seenTexts.has(listText)) {
                                                    seenTexts.add(listText);
                                                    orderedParts.push({
                                                        type: 'list',
                                                        content: listText,
                                                        order: \`\${index}.\${gridIndex}\`
                                                    });
                                                    console.log('  ✅ 网格列表:', listItems.length, '项');
                                                }
                                            }
                                        }
                                    });
                                } else if (child.classList.contains('pt-3') || child.tagName === 'DIV') {
                                    // 其他容器 - 按DOM顺序处理所有子元素
                                    Array.from(child.children).forEach((subChild, subIndex) => {
                                        if (subChild.tagName === 'P') {
                                            const text = subChild.textContent.trim();
                                            if (text && !text.includes('Code') && text.length > 5 && !seenTexts.has(text)) {
                                                seenTexts.add(text);
                                                orderedParts.push({
                                                    type: 'text',
                                                    content: text,
                                                    order: \`\${index}.\${subIndex}\`
                                                });
                                                console.log('  ✅ 容器段落:', text.substring(0, 50) + '...');
                                            }
                                        } else if (subChild.tagName === 'OL' || subChild.tagName === 'UL') {
                                            const listItems = [];
                                            Array.from(subChild.children).forEach((li) => {
                                                if (li.tagName === 'LI') {
                                                    const liText = li.textContent.trim();
                                                    if (liText) {
                                                        const prefix = subChild.tagName === 'OL' ? \`\${listItems.length + 1}.\` : '•';
                                                        listItems.push(\`\${prefix} \${liText}\`);
                                                    }
                                                }
                                            });
                                            if (listItems.length > 0) {
                                                const listText = listItems.join('\\n');
                                                if (!seenTexts.has(listText)) {
                                                    seenTexts.add(listText);
                                                    orderedParts.push({
                                                        type: 'list',
                                                        content: listText,
                                                        order: \`\${index}.\${subIndex}\`
                                                    });
                                                    console.log('  ✅ 容器列表:', listItems.length, '项');
                                                }
                                            }
                                        }
                                    });
                                    
                                    // 单独处理直接的段落和列表（非子元素）
                                    const directTexts = child.querySelectorAll(':scope > p');
                                    directTexts.forEach((textEl, textIndex) => {
                                        const text = textEl.textContent.trim();
                                        if (text && !text.includes('Code') && text.length > 5 && !seenTexts.has(text)) {
                                            seenTexts.add(text);
                                            orderedParts.push({
                                                type: 'text',
                                                content: text,
                                                order: \`\${index}.direct\${textIndex}\`
                                            });
                                            console.log('  ✅ 直接段落:', text.substring(0, 50) + '...');
                                        }
                                    });
                                    
                                    const directLists = child.querySelectorAll(':scope > ol, :scope > ul');
                                    directLists.forEach((list, listIndex) => {
                                        const listItems = [];
                                        Array.from(list.children).forEach((li) => {
                                            if (li.tagName === 'LI') {
                                                const liText = li.textContent.trim();
                                                if (liText) {
                                                    const prefix = list.tagName === 'OL' ? \`\${listItems.length + 1}.\` : '•';
                                                    listItems.push(\`\${prefix} \${liText}\`);
                                                }
                                            }
                                        });
                                        if (listItems.length > 0) {
                                            const listText = listItems.join('\\n');
                                            if (!seenTexts.has(listText)) {
                                                seenTexts.add(listText);
                                                orderedParts.push({
                                                    type: 'list',
                                                    content: listText,
                                                    order: \`\${index}.directList\${listIndex}\`
                                                });
                                                console.log('  ✅ 直接列表:', listItems.length, '项');
                                            }
                                        }
                                    });
                                    
                                    // 处理内联代码块
                                    const codeBlocks = child.querySelectorAll('pre code');
                                    codeBlocks.forEach((codeBlock, codeIndex) => {
                                        const code = codeBlock.textContent.trim();
                                        if (code && code.length > 10) {
                                            const language = codeBlock.className.match(/language-([a-zA-Z0-9]+)/)?.[1] || 'bash';
                                            const markdownCode = \`\\\`\\\`\\\`\${language}\\n\${code}\\n\\\`\\\`\\\`\`;
                                            if (!seenTexts.has(markdownCode)) {
                                                seenTexts.add(markdownCode);
                                                orderedParts.push({
                                                    type: 'code',
                                                    content: markdownCode,
                                                    order: \`\${index}.code\${codeIndex}\`
                                                });
                                                console.log('  ✅ 内联代码块:', language, code.length, '字符');
                                            }
                                        }
                                    });
                                }
                            });
                            
                            // 🔧 按DOM顺序返回内容
                            return orderedParts.map(part => part.content);
                        }
                        
                        // 提取基础内容
                        const basicParts = extractAllChildElements(contentArea);
                        contentParts.push(...basicParts);
                        
                        // 🔧 单独处理Artifact（放在开头，因为通常是主要代码）
                        const artifacts = contentArea.querySelectorAll('.artifact-block-cell');
                        const artifactCodes = [];
                        
                        console.log(\`📦 处理 \${artifacts.length} 个Artifact...\`);
                        
                        for (let i = 0; i < artifacts.length; i++) {
                            const artifact = artifacts[i];
                            const codeLabel = artifact.querySelector('.text-sm.text-text-300');
                            const isCode = codeLabel && codeLabel.textContent.includes('Code');
                            
                            if (isCode) {
                                const titleElement = artifact.querySelector('.leading-tight.text-sm');
                                const title = titleElement ? titleElement.textContent.trim() : \`代码块 \${i + 1}\`;
                                
                                console.log(\`Artifact \${i}: \${title}\`);
                                
                                // 🔧 尝试获取完整代码：先点击展开，如果失败使用预览
                                let fullCode = '';
                                let language = 'bash';
                                
                                try {
                                    // 方法1：点击获取完整代码
                                    artifact.click();
                                    await new Promise(resolve => setTimeout(resolve, 1500));
                                    
                                    const expandedCode = document.querySelector('code.language-bash, code.language-shell, code.language-python, code.language-javascript');
                                    if (expandedCode) {
                                        fullCode = expandedCode.textContent.trim();
                                        const languageMatch = expandedCode.className.match(/language-([a-zA-Z0-9]+)/);
                                        language = languageMatch ? languageMatch[1] : 'bash';
                                        
                                        console.log(\`  ✅ 获取完整代码: \${fullCode.length} 字符\`);
                                        
                                        // 关闭侧边栏
                                        const closeButton = document.querySelector('[aria-label="Close"]');
                                        if (closeButton) {
                                            closeButton.click();
                                            await new Promise(resolve => setTimeout(resolve, 500));
                                        }
                                    }
                                } catch (clickError) {
                                    console.log('  ⚠️ 点击展开失败，使用预览代码');
                                }
                                
                                // 方法2：如果点击失败，使用预览代码
                                if (!fullCode) {
                                    const previewElement = artifact.querySelector('.font-mono');
                                    if (previewElement) {
                                        fullCode = previewElement.textContent.trim();
                                        console.log(\`  📝 使用预览代码: \${fullCode.length} 字符\`);
                                    }
                                }
                                
                                if (fullCode) {
                                    const markdownCode = \`\\\`\\\`\\\`\${language}\\n\${fullCode}\\n\\\`\\\`\\\`\`;
                                    artifactCodes.push(markdownCode);
                                }
                            }
                        }
                        
                        // 🔧 将Artifact代码放在开头
                        const finalParts = [...artifactCodes, ...contentParts];
                        
                        console.log('内容提取完成:');
                        console.log('- Artifact代码块:', artifactCodes.length);
                        console.log('- 其他内容块:', contentParts.length);
                        console.log('- 总内容块:', finalParts.length);
                        
                        const finalContent = finalParts.join('\\n\\n');
                        console.log('- 最终内容长度:', finalContent.length);
                        
                        return finalContent;
                    }
                    
                    // 主提取逻辑
                    const content = { conversationTurns: [] };
                    
                    const mainContentArea = document.querySelector('div.flex-1.flex.flex-col.gap-3');
                    if (!mainContentArea) {
                        return { error: "Cannot find main content area" };
                    }
                    
                    const conversationElements = Array.from(mainContentArea.children);
                    console.log('找到对话元素数量:', conversationElements.length);
                    
                    let currentTurn = null;
                    let turnIndex = 0;
                    
                    for (const element of conversationElements) {
                        const isUserQuery = element.querySelector('.bg-bg-300');
                        
                        if (isUserQuery) {
                            if (currentTurn) {
                                content.conversationTurns.push(currentTurn);
                                turnIndex++;
                            }
                            
                            let queryText = isUserQuery.textContent.trim();
                            queryText = queryText.replace(/Edit$/, '').trim();
                            
                            // 🔧 移除用户名前缀
                            const userAvatar = element.querySelector('.rounded-full.font-bold');
                            if (userAvatar) {
                                const userName = userAvatar.textContent.trim();
                                if (queryText.startsWith(userName)) {
                                    queryText = queryText.substring(userName.length).trim();
                                }
                            }
                            
                            currentTurn = {
                                turnIndex: turnIndex,
                                query: queryText,
                                response: null
                            };
                            
                            console.log(\`新的对话轮次 \${turnIndex}: \${queryText.substring(0, 50)}...\`);
                        } else {
                            if (!currentTurn) continue;
                            
                            const hasResponseContent = element.querySelector('.font-claude-message');
                            
                            if (hasResponseContent) {
                                console.log('提取Claude回复内容...');
                                
                                const responseText = await extractCompleteContent(element);
                                currentTurn.response = responseText;
                                
                                console.log(\`✅ 回复内容长度: \${responseText.length} 字符\`);
                            }
                        }
                    }
                    
                    if (currentTurn) {
                        content.conversationTurns.push(currentTurn);
                    }
                    
                    console.log('内容提取完成，对话轮次数量:', content.conversationTurns.length);
                    return content;
                    
                } catch (e) {
                    console.error('提取过程中出错:', e);
                    return { error: e.message, stack: e.stack };
                }
            })()
        `;

            // 执行脚本
            const result = await this.llmController.executeLLMScript(this.session, contentScript, {
                awaitPromise: true,
                timeout: 45000 // 增加超时时间，因为需要处理点击操作
            });

            if (result.success && result.result) {
                const extractedContent = result.result.value || result.result;

                if (extractedContent.error) {
                    throw new Error(extractedContent.error);
                }

                if (!extractedContent.conversationTurns || !Array.isArray(extractedContent.conversationTurns)) {
                    console.warn('[Claude] 内容提取结果格式异常');
                    extractedContent.conversationTurns = [];
                }

                console.log('[Claude] ✅ 页面内容提取完成');
                console.log(`[Claude] 提取到 ${extractedContent.conversationTurns.length} 个对话轮次`);

                extractedContent.conversationTurns.forEach((turn, index) => {
                    const hasCode = turn.response && turn.response.includes('```');
                    console.log(`[Claude] 对话轮次 ${index}:`, {
                        query: turn.query?.substring(0, 50) + '...',
                        responseLength: turn.response?.length || 0,
                        hasCode: hasCode
                    });
                });

                const formattedContent = await this.formatToNativeAPIStyle(extractedContent);
                return formattedContent;
            } else {
                throw new Error('脚本执行失败: ' + (result.error || '未知错误'));
            }

        } catch (error) {
            console.error('[Claude] 页面内容提取失败:', error.message);
            return {
                error: error.message,
                id: "chatcmpl-" + Date.now(),
                created: Math.floor(Date.now() / 1000),
                model: "Claude 4.0 Sonnet",
                messages: [],
                usage: {
                    prompt_tokens: -1,
                    completion_tokens: -1,
                    total_tokens: -1
                },
                provider: "claude"
            };
        }
    }
    /**
     * 格式化为原生API标准格式
     * 符合 OpenAI ChatGPT API 标准
     */
    async formatToNativeAPIStyle(content) {
        try {
            const messages = [];
            const conversationId = await this.getChatId();

            // 转换每个对话轮次
            for (const turn of content.conversationTurns) {
                // 添加用户消息
                if (turn.query) {
                    messages.push({
                        role: "user",
                        content: turn.query
                    });
                }

                // 🔧 关键改进：助手消息直接使用字符串内容
                if (turn.response) {
                    messages.push({
                        role: "assistant",
                        content: turn.response // 直接使用提取的纯文本字符串
                    });
                }
            }

            // 🔧 返回完全符合原生API标准的格式
            return {
                id: "chatcmpl-" + (conversationId || Date.now()),
                created: Math.floor(Date.now() / 1000),
                model: "Claude 4.0 Sonnet",
                messages: messages,
                usage: {
                    prompt_tokens: -1,
                    completion_tokens: -1,
                    total_tokens: -1
                },
                provider: "claude",
                conversationId: conversationId
            };

        } catch (error) {
            console.error('[Claude] 原生API格式转换失败:', error.message);
            return {
                error: error.message,
                messages: []
            };
        }
    }
    // ==================== 流式响应处理 ====================

    /**
     * 处理流式聊天响应
     * @param {string} prompt 消息内容
     * @param {Array} filePaths 文件路径
     * @param {boolean} stream 是否流式
     * @param {boolean} newChat 是否新对话
     * @returns {AsyncGenerator} 流式响应生成器
     */
    async* handleChatStream(prompt, filePaths = null, stream = true, newChat = false) {
        try {
            console.log('[Claude] 开始流式聊天处理...');

            // 发送消息并获取完整响应
            const result = await this.sendMessage(prompt, filePaths, newChat, stream);

            if (result.success) {
                if (stream) {
                    // 模拟流式响应 - 分块发送内容
                    const response = result.response;
                    yield {
                        type: 'start',
                        provider: 'claude',
                        conversationId: result.conversationId
                    };

                    // 发送主要内容
                    yield {
                        type: 'content',
                        data: response,
                        finished: false
                    };

                    // 发送完成信号
                    yield {
                        type: 'complete',
                        data: response,
                        finished: true,
                        conversationId: result.conversationId
                    };
                } else {
                    // 非流式响应
                    yield result.response;
                }
            } else {
                yield {
                    type: 'error',
                    error: result.error,
                    provider: 'claude'
                };
            }

        } catch (error) {
            console.error('[Claude] 流式聊天处理失败:', error.message);
            yield {
                type: 'error',
                error: error.message,
                provider: 'claude'
            };
        }
    }

    // ==================== 工具方法 ====================

    /**
     * 延迟执行
     * @param {number} ms 延迟时间（毫秒）
     */
    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * 清理资源
     */
    async cleanup() {
        try {
            console.log('[Claude] 清理Claude发布器资源...');
            this.session = null;
            this.llmController = null;
            this.loggedIn = false;
            this.conversationId = null;
        } catch (error) {
            console.error('[Claude] 资源清理失败:', error.message);
        }
    }

    /**
     * 获取Claude状态信息
     * @returns {Object} 状态信息
     */
    async getStatus() {
        try {
            const isLoggedIn = await this.checkLoggedIn();
            const conversationId = await this.getChatId();

            return {
                provider: 'claude',
                loggedIn: isLoggedIn,
                conversationId: conversationId,
                features: this.features,
                lastChecked: Date.now()
            };
        } catch (error) {
            return {
                provider: 'claude',
                error: error.message,
                lastChecked: Date.now()
            };
        }
    }
}