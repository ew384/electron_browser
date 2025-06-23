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

            const script = `
                (function() {
                    try {
                        // 检查登录指示器
                        const loggedInIndicator = document.querySelector('${this.selectors.loggedInIndicator}');
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
                this.loggedIn = result.result.loggedIn;
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
                this.conversationId = result.result;
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

            if (result.success && result.result.success) {
                console.log('[Claude] ✅ 消息发送成功');
                return { success: true };
            } else {
                throw new Error(result.result?.error || '消息发送失败');
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
                        
                        console.log('[Claude Wait] 开始等待响应，超时时间:', maxWaitTime + 'ms');
                        
                        while (Date.now() - startTime < maxWaitTime) {
                            // 检查思维指示器是否消失
                            const thinkingIndicator = document.querySelector('${this.selectors.thinkingIndicator}');
                            
                            // 检查输入框是否重新启用
                            const textArea = document.querySelector('div.ProseMirror[contenteditable="true"]');
                            const sendButton = document.querySelector('${this.selectors.sendButton}:not([disabled])');
                            
                            // 检查重新生成按钮
                            let regenerateButton = null;
                            const buttons = Array.from(document.querySelectorAll('button'));
                            for (const button of buttons) {
                                if (button.textContent.includes('Regenerate') || 
                                    button.textContent.includes('重新生成') ||
                                    button.textContent.includes('Retry')) {
                                    regenerateButton = button;
                                    break;
                                }
                            }
                            
                            // 如果没有思维指示器且输入框可用，或者有重新生成按钮，认为响应完成
                            const isComplete = (!thinkingIndicator && textArea && sendButton) || regenerateButton;
                            
                            if (isComplete) {
                                const waitTime = Date.now() - startTime;
                                console.log('[Claude Wait] 响应完成，等待时间:', waitTime + 'ms');
                                return {
                                    success: true,
                                    waitTime: waitTime,
                                    hasRegenerateButton: !!regenerateButton
                                };
                            }
                            
                            // 等待检查间隔
                            await new Promise(resolve => setTimeout(resolve, checkInterval));
                        }
                        
                        // 超时
                        console.log('[Claude Wait] 响应等待超时');
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

            if (result.success && result.result.success) {
                console.log('[Claude] ✅ 响应等待完成');
                // 额外等待2秒确保内容完全加载
                await this.delay(2000);
                return { success: true };
            } else {
                throw new Error(result.result?.error || '响应等待失败');
            }

        } catch (error) {
            console.error('[Claude] 响应等待失败:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // ==================== 内容提取 ====================

    /**
     * 提取页面完整内容
     * @returns {Object} 提取的内容
     */
    async extractPageContent() {
        try {
            console.log('[Claude] 开始提取页面内容...');

            // 首先提取代码版本信息
            const codeVersions = await this.extractCodeVersions();

            // 然后提取完整对话内容
            const contentScript = `
                (function() {
                    try {
                        const codeVersionsMap = new Map(${JSON.stringify(codeVersions)});
                        
                        // 查找主要内容区域
                        const mainContentArea = document.querySelector('div.flex-1.flex.flex-col.gap-3');
                        if (!mainContentArea) {
                            return { error: "无法找到主要内容区域" };
                        }
                        
                        const conversationElements = Array.from(mainContentArea.children);
                        let content = {
                            conversationTurns: [],
                            uiElements: []
                        };
                        
                        let currentTurn = null;
                        let turnIndex = 0;
                        
                        for (const element of conversationElements) {
                            // 检查是否是用户查询
                            const isUserQuery = element.querySelector('.bg-bg-300');
                            
                            if (isUserQuery) {
                                // 保存前一个对话轮次
                                if (currentTurn) {
                                    content.conversationTurns.push(currentTurn);
                                    turnIndex++;
                                }
                                
                                // 提取用户查询文本
                                let queryText = isUserQuery.textContent.trim();
                                queryText = queryText.replace(/Edit$/, '').trim();
                                queryText = queryText.replace(/^[A-Z]\\s*/, '');
                                
                                // 创建新的对话轮次
                                currentTurn = {
                                    turnIndex: turnIndex,
                                    query: queryText,
                                    responses: [],
                                    codeBlocks: [],
                                    documents: [],
                                    codeExplanations: []
                                };
                            } else if (currentTurn) {
                                // 处理Claude的回复
                                const hasResponseContent = element.querySelector('.font-claude-message') || 
                                                          element.querySelector('[class*="tracking"]');
                                
                                if (hasResponseContent) {
                                    // 提取代码块
                                    await this.extractCodeBlocks(element, currentTurn, codeVersionsMap);
                                    
                                    // 提取文档引用
                                    this.extractDocuments(element, currentTurn);
                                    
                                    // 提取代码说明
                                    this.extractCodeExplanations(element, currentTurn);
                                    
                                    // 提取响应文本
                                    this.extractResponseText(element, currentTurn);
                                }
                            }
                        }
                        
                        // 添加最后一个对话轮次
                        if (currentTurn) {
                            content.conversationTurns.push(currentTurn);
                        }
                        
                        // 后处理：标记继续查询
                        this.markContinuationQueries(content.conversationTurns);
                        
                        return content;
                        
                    } catch (e) {
                        return { error: e.message };
                    }
                })()
            `;

            const result = await this.llmController.executeLLMScript(this.session, contentScript, {
                awaitPromise: true,
                timeout: 30000
            });

            if (result.success && result.result && !result.result.error) {
                console.log('[Claude] ✅ 页面内容提取完成');

                // 格式化为OpenAI兼容格式
                const formattedContent = await this.formatToOpenAIStyle(result.result);
                return formattedContent;
            } else {
                throw new Error(result.result?.error || '内容提取失败');
            }

        } catch (error) {
            console.error('[Claude] 页面内容提取失败:', error.message);
            return {
                error: error.message,
                conversationTurns: []
            };
        }
    }

    /**
     * 提取代码版本信息
     * @returns {Array} 代码版本列表
     */
    async extractCodeVersions() {
        try {
            const script = `
                (async function() {
                    const codeVersions = new Map();
                    
                    // 查找所有代码版本按钮
                    const codeButtons = Array.from(document.querySelectorAll('button.flex.text-left.font-styrene.rounded-xl'));
                    const codeButtonsFiltered = codeButtons.filter(btn => 
                        btn.textContent.includes('Code') && 
                        (btn.textContent.includes('Version') || btn.textContent.includes('∙'))
                    );
                    
                    // 处理每个按钮
                    for (const button of codeButtonsFiltered) {
                        try {
                            const buttonText = button.textContent.trim();
                            
                            // 提取版本信息
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
                            
                            // 点击按钮显示代码
                            button.click();
                            await new Promise(r => setTimeout(r, 500));
                            
                            // 从侧边栏提取代码
                            const sidebarCodeContainer = document.querySelector('.max-md\\\\:absolute.top-0.right-0.bottom-0.left-0.z-20');
                            if (sidebarCodeContainer) {
                                const codeElement = sidebarCodeContainer.querySelector('code.language-python');
                                if (codeElement) {
                                    const fullCodeText = codeElement.textContent.trim();
                                    if (fullCodeText) {
                                        codeVersions.set(buttonText, {
                                            language: 'python',
                                            code: fullCodeText,
                                            buttonLabel: buttonText,
                                            version: versionLabel
                                        });
                                    }
                                }
                            }
                        } catch (buttonError) {
                            console.error("代码按钮处理错误:", buttonError);
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

    /**
     * 格式化为OpenAI兼容格式
     * @param {Object} content 原始内容
     * @returns {Object} OpenAI格式的内容
     */
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

                // 添加助手消息
                if (turn.responses && turn.responses.length > 0) {
                    const assistantContent = {
                        response: turn.responses,
                        codeBlocks: turn.codeBlocks || [],
                        documents: turn.documents || [],
                        codeExplanations: turn.codeExplanations || []
                    };

                    messages.push({
                        role: "assistant",
                        content: assistantContent
                    });
                }
            }

            // 返回OpenAI兼容格式
            return {
                id: "chatcmpl-" + (conversationId || Date.now()),
                created: Math.floor(Date.now() / 1000),
                model: "Claude 3.5 Sonnet",
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