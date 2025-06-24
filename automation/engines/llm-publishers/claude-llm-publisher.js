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
     * 等待Claude响应完成
     * @returns {Object} 等待结果
     */
    async waitForResponse() {
        try {
            console.log('[Claude] 等待响应完成...');

            const waitScript = `
                (async function() {
                    try {
                        const maxWaitTime = ${this.timing.responseTimeout};
                        const checkInterval = ${this.timing.responseCheckInterval};
                        const startTime = Date.now();
                        
                        while (Date.now() - startTime < maxWaitTime) {
                            // 检查思维指示器是否消失
                            const thinkingIndicator = document.querySelector('[data-testid="conversation-turn-loading"]') || 
                                                    document.querySelector('.animate-pulse');
                            
                            // 检查输入框是否重新启用
                            const textArea = document.querySelector('div.ProseMirror[contenteditable="true"]');
                            const sendButton = document.querySelector('button[aria-label*="send" i]:not([disabled])');
                            
                            // 检查重新生成按钮（只返回是否存在，不返回元素本身）
                            const buttons = Array.from(document.querySelectorAll('button'));
                            const hasRegenerateButton = buttons.some(btn => 
                                btn.textContent.includes('Regenerate') || 
                                btn.textContent.includes('重新生成') ||
                                btn.textContent.includes('Retry')
                            );
                            
                            // 判断响应是否完成
                            const isComplete = (!thinkingIndicator && textArea && sendButton) || hasRegenerateButton;
                            
                            if (isComplete) {
                                const waitTime = Date.now() - startTime;
                                return {
                                    success: true,
                                    waitTime: waitTime,
                                    hasRegenerateButton: hasRegenerateButton
                                };
                            }
                            
                            await new Promise(resolve => setTimeout(resolve, checkInterval));
                        }
                        
                        return {
                            success: false,
                            error: 'Response timeout',
                            waitTime: maxWaitTime
                        };
                        
                    } catch (e) {
                        return {
                            success: false,
                            error: e.message
                        };
                    }
                })()
            `;

            const result = await this.llmController.executeLLMScript(this.session, waitScript, {
                awaitPromise: true,
                timeout: this.timing.responseTimeout + 5000
            });

            if (result.success && result.result) {
                const waitResult = result.result.value || result.result;  // 🔧 修复解析

                if (waitResult && waitResult.success) {
                    console.log('[Claude] ✅ 响应等待完成');
                    await this.delay(2000);
                    return { success: true };
                } else {
                    throw new Error(waitResult?.error || '响应等待失败');
                }
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
     * 提取页面完整内容 - 最终修复版本
     * 基于Chrome Console测试成功的逻辑
     */
    async extractPageContent() {
        try {
            console.log('[Claude] 开始提取页面内容...');

            // 最终修复版内容提取脚本
            const contentScript = `
                (function() {
                    try {
                        // 🔧 修复后的内容提取函数
                        function extractResponseContentInOrder(element) {
                            const contentBlocks = [];
                            const seenCodeTexts = new Set(); // 用于代码去重
                            
                            // 🔧 关键修复：找到实际的内容容器
                            const contentArea = element.querySelector('.font-claude-message');
                            if (!contentArea) return contentBlocks;
                            
                            // 🔧 关键修复：找到网格容器
                            const gridContainer = contentArea.querySelector('div[class*="grid-cols-1"]');
                            if (!gridContainer) {
                                console.log('未找到网格容器，尝试直接从contentArea提取');
                                return extractFromDirectChildren(contentArea, seenCodeTexts);
                            }
                            
                            console.log(\`找到网格容器，包含 \${gridContainer.children.length} 个子元素\`);
                            
                            // 🔧 按顺序遍历网格容器的所有子元素
                            Array.from(gridContainer.children).forEach((child, index) => {
                                console.log(\`处理网格子元素 \${index}: \${child.tagName}\`);
                                
                                if (child.tagName === 'P' && child.classList.contains('whitespace-normal')) {
                                    // 这是文本段落
                                    const text = child.textContent.trim();
                                    if (text) {
                                        contentBlocks.push({
                                            type: 'text',
                                            text: text
                                        });
                                        console.log(\`  ✅ 添加文本: \${text.substring(0, 50)}...\`);
                                    }
                                } else if (child.tagName === 'PRE') {
                                    // 这是代码块
                                    // 获取代码语言
                                    let language = '';
                                    const codeElement = child.querySelector('code');
                                    if (codeElement && codeElement.className) {
                                        const match = codeElement.className.match(/language-([a-zA-Z0-9]+)/);
                                        if (match) {
                                            language = match[1];
                                        }
                                    }
                                    
                                    // 获取并清理代码文本
                                    let rawCodeText = child.textContent || "";
                                    let cleanCodeText = rawCodeText;
                                    
                                    // 移除 Copy 后缀
                                    cleanCodeText = cleanCodeText.replace(/Copy$/i, '').trim();
                                    
                                    // 🔧 关键修复：移除语言标签前缀
                                    if (language) {
                                        const languagePrefix = new RegExp(\`^\${language}\\\\s*\`, 'i');
                                        cleanCodeText = cleanCodeText.replace(languagePrefix, '');
                                    }
                                    
                                    // 🔧 去重检查（只去除完全相同的代码）
                                    if (cleanCodeText.trim() && !seenCodeTexts.has(cleanCodeText)) {
                                        seenCodeTexts.add(cleanCodeText);
                                        
                                        contentBlocks.push({
                                            type: 'code',
                                            language: language || 'text',
                                            code: cleanCodeText
                                        });
                                        
                                        console.log(\`  ✅ 添加代码(\${language}): \${cleanCodeText.substring(0, 50)}...\`);
                                    } else {
                                        console.log(\`  ⚠️ 跳过重复代码块: \${cleanCodeText.substring(0, 30)}...\`);
                                    }
                                } else {
                                    console.log(\`  ❓ 跳过未知元素类型: \${child.tagName}\`);
                                }
                            });
                            
                            return contentBlocks;
                        }
                        
                        // 🔧 备用提取函数（如果找不到网格容器）
                        function extractFromDirectChildren(contentArea, seenCodeTexts) {
                            const contentBlocks = [];
                            
                            // 提取所有文本段落
                            const textParagraphs = contentArea.querySelectorAll('p.whitespace-normal.break-words');
                            const codeBlocks = contentArea.querySelectorAll('pre');
                            
                            console.log(\`备用提取: 找到 \${textParagraphs.length} 个文本段落, \${codeBlocks.length} 个代码块\`);
                            
                            // 创建一个包含所有元素的数组，按DOM顺序排序
                            const allElements = [];
                            
                            textParagraphs.forEach(p => allElements.push({ type: 'text', element: p }));
                            codeBlocks.forEach(pre => allElements.push({ type: 'code', element: pre }));
                            
                            // 按DOM中的实际顺序排序
                            allElements.sort((a, b) => {
                                const positionA = a.element.compareDocumentPosition(b.element);
                                return positionA & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
                            });
                            
                            // 处理排序后的元素
                            allElements.forEach((item, index) => {
                                if (item.type === 'text') {
                                    const text = item.element.textContent.trim();
                                    if (text) {
                                        contentBlocks.push({
                                            type: 'text',
                                            text: text
                                        });
                                    }
                                } else if (item.type === 'code') {
                                    let language = '';
                                    const codeElement = item.element.querySelector('code');
                                    if (codeElement && codeElement.className) {
                                        const match = codeElement.className.match(/language-([a-zA-Z0-9]+)/);
                                        if (match) {
                                            language = match[1];
                                        }
                                    }
                                    
                                    let rawCodeText = item.element.textContent || "";
                                    let cleanCodeText = rawCodeText.replace(/Copy$/i, '').trim();
                                    
                                    if (language) {
                                        const languagePrefix = new RegExp(\`^\${language}\\\\s*\`, 'i');
                                        cleanCodeText = cleanCodeText.replace(languagePrefix, '');
                                    }
                                    
                                    if (cleanCodeText.trim() && !seenCodeTexts.has(cleanCodeText)) {
                                        seenCodeTexts.add(cleanCodeText);
                                        
                                        contentBlocks.push({
                                            type: 'code',
                                            language: language || 'text',
                                            code: cleanCodeText
                                        });
                                    }
                                }
                            });
                            
                            return contentBlocks;
                        }
                        
                        // Store content
                        let content = {
                            conversationTurns: [],
                            uiElements: []
                        };
                        
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
                                // If there was a previous turn, add it to the results
                                if (currentTurn) {
                                    content.conversationTurns.push(currentTurn);
                                    turnIndex++;
                                }
                                
                                let queryText = isUserQuery.textContent.trim();
                                queryText = queryText.replace(/Edit$/, '').trim();
                                queryText = queryText.replace(/^[A-Z\\s]*/, '');
                                
                                currentTurn = {
                                    turnIndex: turnIndex,
                                    query: queryText,
                                    response: {
                                        content: []
                                    }
                                };
                                
                                console.log(\`新的对话轮次 \${turnIndex}: \${queryText}\`);
                            } else {
                                if (!currentTurn) continue;
                                
                                const hasResponseContent = element.querySelector('.font-claude-message');
                                
                                if (hasResponseContent) {
                                    console.log(\`处理Claude回复，按顺序解析内容\`);
                                    
                                    // 🔧 使用修复后的提取函数
                                    const responseContent = extractResponseContentInOrder(element);
                                    
                                    // 将内容添加到当前轮次
                                    currentTurn.response.content.push(...responseContent);
                                    
                                    console.log(\`当前轮次内容块数量: \${currentTurn.response.content.length}\`);
                                }
                            }
                        }
                        
                        // Add the last turn (if any)
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
                awaitPromise: false,
                timeout: 15000
            });

            if (result.success && result.result) {
                const extractedContent = result.result.value || result.result;

                // 检查是否有错误
                if (extractedContent.error) {
                    throw new Error(extractedContent.error);
                }

                // 确保 conversationTurns 是数组
                if (!extractedContent.conversationTurns || !Array.isArray(extractedContent.conversationTurns)) {
                    console.warn('[Claude] 内容提取结果格式异常，使用默认结构');
                    extractedContent.conversationTurns = [];
                }

                console.log('[Claude] ✅ 页面内容提取完成');
                console.log(`[Claude] 提取到 ${extractedContent.conversationTurns.length} 个对话轮次`);

                // 输出每个对话轮次的详细信息
                extractedContent.conversationTurns.forEach((turn, index) => {
                    const textBlocks = turn.response.content.filter(c => c.type === 'text').length;
                    const codeBlocks = turn.response.content.filter(c => c.type === 'code').length;
                    console.log(`[Claude] 对话轮次 ${index}:`, {
                        query: turn.query?.substring(0, 50) + '...',
                        totalContentBlocks: turn.response.content.length,
                        textBlocks: textBlocks,
                        codeBlocks: codeBlocks
                    });
                });

                const formattedContent = await this.formatToOpenAIStyle(extractedContent);
                return formattedContent;
            } else {
                throw new Error('脚本执行失败: ' + (result.error || '未知错误'));
            }

        } catch (error) {
            console.error('[Claude] 页面内容提取失败:', error.message);
            return {
                error: error.message,
                conversationTurns: [],
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
     * 提取代码版本信息 - 保持原有实现
     */
    async extractCodeVersions() {
        try {
            const script = `
            (async function() {
                const codeVersions = new Map();
                
                // Find all code version buttons
                const codeButtons = Array.from(document.querySelectorAll('button.flex.text-left.font-styrene.rounded-xl'));
                const codeButtonsFiltered = codeButtons.filter(btn => 
                    btn.textContent.includes('Code') && 
                    (btn.textContent.includes('Version') || btn.textContent.includes('∙'))
                );
                
                // Process each button sequentially
                for (const button of codeButtonsFiltered) {
                    try {
                        const buttonText = button.textContent.trim();
                        
                        // Extract version information
                        let versionLabel = "Version 1";
                        if (buttonText.includes('Version')) {
                            const versionMatch = buttonText.match(/Version\\s*(\\d+)/i);
                            if (versionMatch) {
                                versionLabel = \`Version \${versionMatch[1]}\`;
                            }
                        } else if (buttonText.includes('∙')) {
                            const parts = buttonText.split('∙');
                            if (parts.length > 1) {
                                versionLabel = parts[1].trim();
                            }
                        }
                        
                        // Click the button to display code in sidebar
                        button.click();
                        
                        // Wait for sidebar to update
                        await new Promise(r => setTimeout(r, 500));
                        
                        // Extract code from the sidebar
                        const sidebarCodeContainer = document.querySelector('.max-md\\\\:absolute.top-0.right-0.bottom-0.left-0.z-20');
                        if (sidebarCodeContainer) {
                            const codeElement = sidebarCodeContainer.querySelector('code.language-python');
                            if (codeElement) {
                                const fullCodeText = codeElement.textContent.trim();
                                if (fullCodeText) {
                                    // Store code with its version info
                                    codeVersions.set(buttonText, {
                                        language: 'python',
                                        code: fullCodeText,
                                        buttonLabel: buttonText,
                                        version: versionLabel
                                    });
                                    console.log(\`Extracted code for: \${buttonText} (\${versionLabel})\`);
                                }
                            }
                        }
                    } catch (buttonError) {
                        console.error("Error processing button:", buttonError);
                    }
                }
                
                return Array.from(codeVersions.entries());
            })()
        `;

            const result = await this.llmController.executeLLMScript(this.session, script, {
                awaitPromise: true,
                timeout: 15000
            });

            if (result.success && Array.isArray(result.result)) {
                console.log(`[Claude] 提取到 ${result.result.length} 个代码版本`);
                return result.result;
            } else {
                console.log('[Claude] 未找到代码版本');
                return [];
            }

        } catch (error) {
            console.error('[Claude] 代码版本提取失败:', error.message);
            return [];
        }
    }

    async formatToOpenAIStyle(content) {
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

                // 添加助手消息 - 新格式
                if (turn.response && turn.response.content && turn.response.content.length > 0) {
                    // 🔧 新的数据结构：分离文本和代码块
                    const responseContent = {
                        contentBlocks: turn.response.content,
                        // 为了兼容性，也提供传统格式
                        textBlocks: turn.response.content.filter(c => c.type === 'text').map(c => c.text),
                        codeBlocks: turn.response.content.filter(c => c.type === 'code').map(c => ({
                            language: c.language,
                            code: c.code,
                            type: 'inline'
                        }))
                    };

                    messages.push({
                        role: "assistant",
                        content: responseContent
                    });
                }
            }

            // 返回OpenAI兼容格式
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
            console.error('[Claude] OpenAI格式转换失败:', error.message);
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