// automation/engines/llm-publishers/deepseek-llm-publisher.js
// DeepSeek AI专用LLM发布器 - 修复版，简化脚本避免HTTP 500错误

export class DeepSeekLLMPublisher {
    constructor(session, llmController) {
        this.session = session;
        this.llmController = llmController;
        this.domain = 'chat.deepseek.com';
        this.loggedIn = false;
        this.conversationId = null;

        // 基于实际测试的DeepSeek配置
        this.config = {
            name: 'DeepSeek',
            provider: 'deepseek',
            urls: {
                base: 'https://chat.deepseek.com',
                chat: 'https://chat.deepseek.com',
                login: 'https://chat.deepseek.com/sign_in'
            },
            
            // 基于Console脚本的实际选择器
            selectors: {
                avatarSelectors: [
                    'img.fdf01f38',
                    'img[src*="user-avatar"]',
                    'img[alt=""]',
                    '.ede5bc47',
                    '[class*="avatar"]',
                    '[class*="user"]',
                    'img[src*="static.deepseek.com"]'
                ],
                textarea: 'textarea._27c9245',
                textareaAlt: [
                    'textarea[placeholder*="问"]',
                    'textarea[placeholder*="输入"]',
                    'div[contenteditable="true"]',
                    '[role="textbox"]'
                ],
                sendButton: '._7436101.bcc55ca1',
                sendButtonAlt: [
                    'button[aria-label*="发送"]',
                    'button[type="submit"]',
                    'div[role="button"]:has(svg)',
                    'button:has(svg[viewBox="0 0 14 16"])'
                ]
            },
            
            features: {
                supportFileUpload: false,
                supportNewChat: true,
                supportStreamResponse: true,
                supportCodeBlocks: true,
                maxTokens: 4000
            },
            
            timing: {
                inputDelay: 500,
                responseTimeout: 120000,
                checkInterval: 3000,
                stableChecks: 3,
                loginTimeout: 300000
            }
        };
    }

    // ==================== 认证和登录检测 ====================

    async checkLoggedIn() {
        try {
            console.log('[DeepSeek] 检查登录状态...');
            
            // 🔧 简化的登录检测脚本
            const loginCheckScript = `
                (function() {
                    try {
                        // 检查常见的头像选择器
                        const avatarSelectors = [
                            'img.fdf01f38',
                            'img[src*="user-avatar"]',
                            '[class*="avatar"]',
                            '[class*="user"]'
                        ];
                        
                        for (const selector of avatarSelectors) {
                            const elements = document.querySelectorAll(selector);
                            for (const el of elements) {
                                if (el.offsetParent !== null) {
                                    return { loggedIn: true, method: 'avatar_found', selector: selector };
                                }
                            }
                        }
                        
                        return { loggedIn: false, method: 'no_avatar_found' };
                    } catch (e) {
                        return { loggedIn: false, error: e.message };
                    }
                })()
            `;

            const result = await this.llmController.executeLLMScript(this.session, loginCheckScript);
            const checkResult = result.result?.value || result.result;
            
            if (checkResult && typeof checkResult === 'object') {
                this.loggedIn = checkResult.loggedIn;
                console.log(`[DeepSeek] 登录状态: ${this.loggedIn ? '✅已登录' : '❌未登录'}`);
                return this.loggedIn;
            } else {
                console.log('[DeepSeek] 登录状态检查失败');
                return false;
            }

        } catch (error) {
            console.error('[DeepSeek] 登录检查异常:', error.message);
            return false;
        }
    }

    async handleLogin() {
        console.log('[DeepSeek] 开始登录处理...');

        try {
            const isLoggedIn = await this.checkLoggedIn();
            if (isLoggedIn) {
                return {
                    success: true,
                    status: 'already_logged_in',
                    message: '用户已登录'
                };
            }

            const loginUrl = this.config.urls.login;
            const navigated = await this.llmController.navigateLLMTab(this.session, loginUrl);
            if (!navigated) {
                throw new Error('无法导航到登录页面');
            }

            console.log('[DeepSeek] 等待用户手动登录...');
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
            console.error('[DeepSeek] 登录处理失败:', error.message);
            return {
                success: false,
                status: 'login_error',
                message: error.message
            };
        }
    }

    async waitForManualLogin(timeout = 300000) {
        console.log('[DeepSeek] 等待手动登录，超时时间:', timeout / 1000, '秒');

        const startTime = Date.now();
        const checkInterval = 3000;

        while (Date.now() - startTime < timeout) {
            const isLoggedIn = await this.checkLoggedIn();

            if (isLoggedIn) {
                console.log('[DeepSeek] ✅ 手动登录成功');
                return true;
            }

            console.log('[DeepSeek] ⏳ 继续等待手动登录...');
            await this.delay(checkInterval);
        }

        console.log('[DeepSeek] ❌ 手动登录超时');
        return false;
    }

    // ==================== 对话管理 ====================

    async startNewChat() {
        try {
            console.log('[DeepSeek] 开始新对话...');

            const checkUrlScript = 'return window.location.href';
            const urlResult = await this.llmController.executeLLMScript(this.session, checkUrlScript);
            const currentUrl = urlResult.result?.value || urlResult.result || '';
            
            if (urlResult.success && typeof currentUrl === 'string' && 
                (currentUrl.includes('/chat.deepseek.com') && !currentUrl.includes('/chat/'))) {
                console.log('[DeepSeek] 已在主对话页面');
                return true;
            }

            console.log('[DeepSeek] 导航到主对话页面');
            const navigated = await this.llmController.navigateLLMTab(this.session, this.config.urls.chat);

            if (navigated) {
                await this.delay(3000);
                console.log('[DeepSeek] ✅ 新对话页面导航成功');
                return true;
            }

            throw new Error('无法创建新对话');

        } catch (error) {
            console.error('[DeepSeek] 新对话创建失败:', error.message);
            return false;
        }
    }

    async getChatId() {
        try {
            const script = `
                (function() {
                    try {
                        const url = window.location.href;
                        const match = url.match(/chat\\.deepseek\\.com\\/chat\\/([^?#]+)/);
                        return match ? match[1] : Date.now().toString();
                    } catch (e) {
                        return Date.now().toString();
                    }
                })()
            `;

            const result = await this.llmController.executeLLMScript(this.session, script);

            if (result.success && result.result) {
                const chatId = result.result?.value || result.result;
                this.conversationId = chatId;
                console.log(`[DeepSeek] 获取对话ID: ${this.conversationId}`);
                return this.conversationId;
            }

            return null;

        } catch (error) {
            console.error('[DeepSeek] 获取对话ID失败:', error.message);
            return null;
        }
    }

    // ==================== 消息发送和响应处理 ====================

    async sendMessage(prompt, files = null, newChat = false, stream = false) {
        try {
            console.log('[DeepSeek] 发送消息开始...');

            const isLoggedIn = await this.checkLoggedIn();
            if (!isLoggedIn) {
                throw new Error('用户未登录，无法发送消息');
            }

            if (newChat) {
                const newChatSuccess = await this.startNewChat();
                if (!newChatSuccess) {
                    throw new Error('无法开始新对话');
                }
            }

            if (files && files.length > 0) {
                console.warn('[DeepSeek] 注意：DeepSeek暂不支持文件上传，文件将被忽略');
            }

            if (prompt) {
                // 🔒 安全保存完整的用户输入，用于后续精准提取
                this.session.lastPrompt = prompt;
                this.session.currentUserInput = prompt; // 新增：专门用于内容提取的字段
                
                const sendResult = await this.sendPromptMessage(prompt);
                if (!sendResult.success) {
                    throw new Error(sendResult.error);
                }

                const responseResult = await this.waitForResponse();
                if (!responseResult.success) {
                    throw new Error(responseResult.error);
                }

                // 🎯 传递用户输入到内容提取方法
                const extractedContent = await this.extractPageContent(prompt);

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
            console.error('[DeepSeek] 发送消息失败:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }
    async sendPromptMessage(prompt) {
        try {
            console.log('[DeepSeek] 发送提示消息...');

            // 🔧 分步执行，避免脚本过于复杂
            
            // 步骤1：查找输入框
            const findTextareaScript = `
                (function() {
                    try {
                        // 主选择器
                        let textarea = document.querySelector('textarea._27c9245');
                        if (textarea) {
                            return { success: true, method: 'main_selector' };
                        }
                        
                        // 备用选择器
                        const altSelectors = [
                            'textarea[placeholder*="问"]',
                            'textarea[placeholder*="输入"]',
                            'div[contenteditable="true"]',
                            '[role="textbox"]'
                        ];
                        
                        for (const selector of altSelectors) {
                            textarea = document.querySelector(selector);
                            if (textarea) {
                                return { success: true, method: 'alt_selector', selector: selector };
                            }
                        }
                        
                        return { success: false, error: '未找到输入框' };
                    } catch (e) {
                        return { success: false, error: e.message };
                    }
                })()
            `;

            const textareaResult = await this.llmController.executeLLMScript(this.session, findTextareaScript);
            const textareaCheck = textareaResult.result?.value || textareaResult.result;
            
            if (!textareaCheck.success) {
                throw new Error('找不到输入框: ' + textareaCheck.error);
            }

            // 步骤2：输入文本
            const inputScript = `
                (function() {
                    try {
                        const prompt = ${JSON.stringify(prompt)};
                        
                        // 查找输入框
                        let textarea = document.querySelector('textarea._27c9245');
                        if (!textarea) {
                            const altSelectors = [
                                'textarea[placeholder*="问"]',
                                'textarea[placeholder*="输入"]',
                                'div[contenteditable="true"]',
                                '[role="textbox"]'
                            ];
                            
                            for (const selector of altSelectors) {
                                textarea = document.querySelector(selector);
                                if (textarea) break;
                            }
                        }
                        
                        if (!textarea) {
                            return { success: false, error: '未找到输入框' };
                        }
                        
                        // 聚焦输入框
                        textarea.focus();
                        
                        // 设置值 - 使用React方式
                        try {
                            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                                window.HTMLTextAreaElement.prototype, 'value'
                            ).set;
                            nativeInputValueSetter.call(textarea, prompt);
                            
                            textarea.dispatchEvent(new Event('input', { bubbles: true }));
                            textarea.dispatchEvent(new Event('change', { bubbles: true }));
                            
                            if (textarea.value === prompt) {
                                return { success: true, method: 'react_native' };
                            }
                        } catch (e) {
                            // 备用方法：直接设置
                            textarea.value = prompt;
                            textarea.dispatchEvent(new Event('input', { bubbles: true }));
                            textarea.dispatchEvent(new Event('change', { bubbles: true }));
                            
                            if (textarea.value === prompt) {
                                return { success: true, method: 'direct_set' };
                            }
                        }
                        
                        return { success: false, error: '输入失败' };
                        
                    } catch (e) {
                        return { success: false, error: e.message };
                    }
                })()
            `;

            const inputResult = await this.llmController.executeLLMScript(this.session, inputScript);
            const inputCheck = inputResult.result?.value || inputResult.result;
            
            if (!inputCheck.success) {
                throw new Error('输入失败: ' + inputCheck.error);
            }

            console.log('[DeepSeek] ✅ 文本输入成功');
            
            // 等待一下让UI更新
            await this.delay(500);

            // 步骤3：查找并点击发送按钮
            const clickSendScript = `
                (function() {
                    try {
                        // 查找发送按钮
                        const allButtons = document.querySelectorAll('div[role="button"]');
                        let sendButton = null;
                        
                        for (const btn of allButtons) {
                            const hasUpArrowSVG = btn.querySelector('svg[viewBox="0 0 14 16"]');
                            const isDisabled = btn.getAttribute('aria-disabled') === 'true';
                            const isVisible = btn.offsetParent !== null;
                            
                            if (hasUpArrowSVG && !isDisabled && isVisible) {
                                sendButton = btn;
                                break;
                            }
                        }
                        
                        if (!sendButton) {
                            return { success: false, error: '未找到可用的发送按钮' };
                        }
                        
                        // 点击发送按钮
                        sendButton.click();
                        
                        // 检查是否发送成功（输入框是否清空）
                        setTimeout(() => {
                            const textarea = document.querySelector('textarea._27c9245');
                            if (textarea && textarea.value === '') {
                                console.log('发送成功：输入框已清空');
                            }
                        }, 1000);
                        
                        return { success: true, method: 'button_click' };
                        
                    } catch (e) {
                        return { success: false, error: e.message };
                    }
                })()
            `;

            const clickResult = await this.llmController.executeLLMScript(this.session, clickSendScript);
            const clickCheck = clickResult.result?.value || clickResult.result;
            
            if (!clickCheck.success) {
                throw new Error('发送按钮点击失败: ' + clickCheck.error);
            }

            console.log('[DeepSeek] ✅ 发送按钮点击成功');
            
            // 等待发送完成
            await this.delay(2000);
            
            return { success: true };

        } catch (error) {
            console.error('[DeepSeek] 消息发送失败:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async waitForResponse() {
        try {
            console.log('[DeepSeek] 等待响应完成...');

            // 先等待一下让页面开始生成
            await this.delay(3000);

            const maxWaitTime = 60000; // 1分钟超时
            const checkInterval = 2000; // 2秒检查一次
            const startTime = Date.now();
            let lastLength = 0;
            let stableCount = 0;
            let checkCount = 0;

            while (Date.now() - startTime < maxWaitTime) {
                const elapsed = Math.round((Date.now() - startTime) / 1000);
                checkCount++;
                
                const checkScript = `
                    (function() {
                        try {
                            const bodyText = document.body.textContent;
                            const result = {
                                length: bodyText.length,
                                hasCode: bodyText.includes('def ') || bodyText.includes('function') || bodyText.includes('\`\`\`'),
                                hasReturn: bodyText.includes('return'),
                                isGenerating: bodyText.includes('正在生成') || bodyText.includes('正在思考') || bodyText.includes('Thinking'),
                                hasDeepThink: bodyText.includes('DeepThink') || bodyText.includes('R1'),
                                preview: bodyText.slice(-150)
                            };
                            
                            // 检查输入框状态
                            const textarea = document.querySelector('textarea._27c9245');
                            result.textareaReady = textarea ? (textarea.value === '' && !textarea.disabled) : false;
                            
                            return result;
                        } catch (e) {
                            return { error: e.message };
                        }
                    })()
                `;

                const result = await this.llmController.executeLLMScript(this.session, checkScript);
                const status = result.result?.value || result.result;
                
                if (status && !status.error) {
                    // 检查内容稳定性
                    const lengthChanged = status.length !== lastLength;
                    if (lengthChanged) {
                        stableCount = 0;
                    } else {
                        stableCount++;
                    }
                    lastLength = status.length;
                    
                    console.log(`[DeepSeek] 检查 ${checkCount} (${elapsed}s): 长度=${status.length}, 代码=${status.hasCode}, 生成中=${status.isGenerating}, 稳定=${stableCount}`);
                    
                    // 🔧 多重完成判断条件
                    const isComplete = 
                        // 主要条件：有代码内容且不在生成中且内容稳定
                        (status.hasCode && !status.isGenerating && stableCount >= 2) ||
                        // 备用条件1：输入框就绪且有合理内容
                        (status.textareaReady && status.length > 500 && stableCount >= 1) ||
                        // 备用条件2：等待时间较长且有内容且稳定
                        (elapsed > 30 && status.length > 300 && stableCount >= 2) ||
                        // 备用条件3：有返回语句且不在生成
                        (status.hasReturn && !status.isGenerating && elapsed > 15);

                    if (isComplete) {
                        console.log('[DeepSeek] ✅ 响应完成检测成功！');
                        console.log(`[DeepSeek] 最终状态: 长度=${status.length}, 稳定次数=${stableCount}`);
                        console.log(`[DeepSeek] 内容预览: ${status.preview}`);
                        
                        // 最后等待一下确保完全稳定
                        await this.delay(1000);
                        return { 
                            success: true, 
                            finalLength: status.length,
                            method: 'multi_condition_check',
                            waitTime: elapsed
                        };
                    }
                    
                    // 每10次检查输出详细信息
                    if (checkCount % 5 === 0) {
                        console.log(`[DeepSeek] 详细状态:`, status);
                    }
                } else {
                    console.warn(`[DeepSeek] 状态检测失败:`, status?.error);
                }
                
                await this.delay(checkInterval);
            }

            // 超时处理 - 不要失败，继续执行
            console.log('[DeepSeek] ⚠️ 等待响应超时，但继续执行内容提取');
            return { 
                success: true, 
                timeout: true,
                finalLength: lastLength,
                method: 'timeout_continue'
            };

        } catch (error) {
            console.error('[DeepSeek] 响应等待异常:', error.message);
            // 即使出错也继续执行
            return { 
                success: true, 
                error: error.message,
                method: 'error_continue'
            };
        }
    }
    async extractPageContent(userInputText = null) {
        try {
            console.log('[DeepSeek] ==================== 开始通用DOM结构分析提取 ====================');

            const extractScript = `
                (function() {
                    console.log('开始通用DOM结构分析提取脚本');
                    
                    try {
                        // 1. 分析页面的对话结构模式
                        console.log('1. 分析对话结构模式...');
                        
                        const allElements = document.querySelectorAll('*');
                        let messageContainers = [];
                        
                        for (let element of allElements) {
                            const text = element.textContent;
                            const hasText = text && text.trim().length > 50 && text.trim().length < 8000;
                            
                            // 跳过明显的UI元素
                            const className = element.className || '';
                            const classNameStr = typeof className === 'string' ? className : className.toString();
                            
                            const isUIElement = element.tagName === 'SCRIPT' || 
                                            element.tagName === 'STYLE' || 
                                            element.tagName === 'HEAD' ||
                                            classNameStr.includes('header') ||
                                            classNameStr.includes('sidebar') ||
                                            classNameStr.includes('nav') ||
                                            classNameStr.includes('menu') ||
                                            classNameStr.includes('footer') ||
                                            classNameStr.includes('toolbar');
                            
                            if (hasText && !isUIElement) {
                                const directTextLength = Array.from(element.childNodes)
                                    .filter(node => node.nodeType === Node.TEXT_NODE)
                                    .reduce((sum, node) => sum + node.textContent.trim().length, 0);
                                
                                const hasCodeBlocks = element.querySelector('pre, code, [class*="code"]');
                                const hasMarkdown = element.querySelector('[class*="markdown"]');
                                
                                if (directTextLength > 30 || hasCodeBlocks || hasMarkdown) {
                                    try {
                                        const rect = element.getBoundingClientRect();
                                        messageContainers.push({
                                            element: element,
                                            text: text.trim(),
                                            textLength: text.trim().length,
                                            hasCodeBlocks: !!hasCodeBlocks,
                                            hasMarkdown: !!hasMarkdown,
                                            directTextLength: directTextLength,
                                            rect: rect
                                        });
                                    } catch (e) {
                                        continue;
                                    }
                                }
                            }
                        }
                        
                        console.log('找到候选消息容器:', messageContainers.length, '个');
                        
                        // 2. 按位置和特征分析
                        messageContainers.sort((a, b) => a.rect.top - b.rect.top);
                        
                        messageContainers.forEach((container, index) => {
                            const { text, textLength, hasCodeBlocks, hasMarkdown } = container;
                            
                            const hasJSON = text.includes('{') && text.includes('}');
                            const hasQuotes = (text.match(/"/g) || []).length > 4;
                            const hasColons = (text.match(/:/g) || []).length > 2;
                            const hasBrackets = text.includes('[') && text.includes(']');
                            
                            let structuredScore = 0;
                            if (hasJSON) structuredScore += 3;
                            if (hasCodeBlocks) structuredScore += 3;
                            if (hasMarkdown) structuredScore += 2;
                            if (hasQuotes && hasColons) structuredScore += 2;
                            if (hasBrackets) structuredScore += 1;
                            
                            container.structuredScore = structuredScore;
                            container.hasJSON = hasJSON;
                        });
                        
                        // 3. 识别最可能的AI回复容器
                        let aiCandidates = messageContainers.filter(container => 
                            container.structuredScore >= 3 && 
                            container.textLength > 200 && 
                            container.textLength < 5000 &&
                            container.hasJSON
                        );
                        
                        if (aiCandidates.length === 0) {
                            // 降低标准重试
                            aiCandidates = messageContainers.filter(container => 
                                container.structuredScore >= 2 && 
                                container.textLength > 100 && 
                                container.hasJSON
                            );
                        }
                        
                        if (aiCandidates.length === 0) {
                            return {
                                success: false,
                                error: '未找到合适的AI回复容器'
                            };
                        }
                        
                        // 选择最佳候选
                        const bestAIReply = aiCandidates.reduce((best, current) => {
                            if (current.structuredScore > best.structuredScore) {
                                return current;
                            } else if (current.structuredScore === best.structuredScore && current.rect.top > best.rect.top) {
                                return current;
                            }
                            return best;
                        });
                        
                        console.log('选择最佳AI回复容器，得分:', bestAIReply.structuredScore);
                        
                        // 4. 从选定容器中提取结构化内容
                        const aiElement = bestAIReply.element;
                        let extractedContent = '';
                        
                        // 优先从代码块提取
                        if (bestAIReply.hasCodeBlocks) {
                            console.log('尝试从代码块提取...');
                            const codeBlocks = aiElement.querySelectorAll('pre, code, [class*="code-block"]');
                            
                            for (let block of codeBlocks) {
                                const codeText = block.textContent.trim();
                                if (codeText.includes('{') && codeText.length > 50) {
                                    const jsonStart = codeText.indexOf('{');
                                    if (jsonStart !== -1) {
                                        const fromJson = codeText.substring(jsonStart);
                                        let braceCount = 0;
                                        let jsonEnd = -1;
                                        let inString = false;
                                        
                                        for (let i = 0; i < fromJson.length; i++) {
                                            const char = fromJson[i];
                                            
                                            if (char === '"' && (i === 0 || fromJson[i-1] !== '\\\\')) {
                                                inString = !inString;
                                            }
                                            
                                            if (!inString) {
                                                if (char === '{') {
                                                    braceCount++;
                                                } else if (char === '}') {
                                                    braceCount--;
                                                    if (braceCount === 0) {
                                                        jsonEnd = i + 1;
                                                        break;
                                                    }
                                                }
                                            }
                                        }
                                        
                                        if (jsonEnd !== -1) {
                                            extractedContent = fromJson.substring(0, jsonEnd);
                                            console.log('从代码块提取JSON成功');
                                            break;
                                        }
                                    }
                                }
                            }
                        }
                        
                        // 从整个元素文本提取
                        if (!extractedContent) {
                            console.log('从整个元素文本提取...');
                            const fullText = aiElement.textContent;
                            
                            if (fullText.includes('{')) {
                                let bestJson = '';
                                let searchIndex = 0;
                                
                                while (searchIndex < fullText.length) {
                                    const jsonStart = fullText.indexOf('{', searchIndex);
                                    if (jsonStart === -1) break;
                                    
                                    const fromJson = fullText.substring(jsonStart);
                                    let braceCount = 0;
                                    let jsonEnd = -1;
                                    let inString = false;
                                    
                                    for (let i = 0; i < fromJson.length; i++) {
                                        const char = fromJson[i];
                                        
                                        if (char === '"' && (i === 0 || fromJson[i-1] !== '\\\\')) {
                                            inString = !inString;
                                        }
                                        
                                        if (!inString) {
                                            if (char === '{') {
                                                braceCount++;
                                            } else if (char === '}') {
                                                braceCount--;
                                                if (braceCount === 0) {
                                                    jsonEnd = i + 1;
                                                    break;
                                                }
                                            }
                                        }
                                    }
                                    
                                    if (jsonEnd !== -1) {
                                        const jsonContent = fromJson.substring(0, jsonEnd);
                                        if (jsonContent.length > bestJson.length && jsonContent.length > 100) {
                                            bestJson = jsonContent;
                                        }
                                    }
                                    
                                    searchIndex = jsonStart + 1;
                                }
                                
                                if (bestJson) {
                                    extractedContent = bestJson;
                                    console.log('从文本提取JSON成功');
                                }
                            }
                        }
                        
                        if (!extractedContent || extractedContent.length < 10) {
                            return {
                                success: false,
                                error: '提取的内容无效或过短'
                            };
                        }
                        
                        console.log('DOM结构分析提取完成，内容长度:', extractedContent.length);
                        
                        return {
                            success: true,
                            method: 'dom_structure_analysis',
                            content: extractedContent,
                            originalLength: bestAIReply.textLength,
                            cleanedLength: extractedContent.length,
                            structuredScore: bestAIReply.structuredScore
                        };
                        
                    } catch (innerError) {
                        console.error('DOM结构分析提取脚本错误:', innerError);
                        return {
                            success: false,
                            error: 'DOM结构分析失败: ' + innerError.message,
                            stack: innerError.stack
                        };
                    }
                })()
            `;

            console.log('[DeepSeek] 执行DOM结构分析脚本');

            const result = await this.llmController.executeLLMScript(this.session, extractScript, {
                awaitPromise: false,
                timeout: 30000
            });

            console.log('[DeepSeek] 脚本执行结果:', result.success);

            if (!result.success) {
                throw new Error('脚本执行失败: ' + result.error);
            }

            let extractedContent = null;
            if (result.result && result.result.value !== undefined) {
                extractedContent = result.result.value;
            } else if (result.result) {
                extractedContent = result.result;
            }

            if (!extractedContent || !extractedContent.success) {
                throw new Error(extractedContent?.error || 'DOM结构分析提取失败');
            }

            console.log('[DeepSeek] DOM结构分析提取成功');
            console.log('[DeepSeek] 结构化得分:', extractedContent.structuredScore);
            console.log('[DeepSeek] 原始长度:', extractedContent.originalLength);
            console.log('[DeepSeek] 清理后长度:', extractedContent.cleanedLength);
            console.log('[DeepSeek] 提取内容预览:', extractedContent.content.substring(0, 100));

            const userInput = userInputText || this.session.lastPrompt || '';
            const conversationTurns = [{
                turnIndex: 0,
                query: userInput,
                response: extractedContent.content
            }];

            const usage = {
                prompt_tokens: Math.round((userInput?.length || 0) / 4),
                completion_tokens: Math.round(extractedContent.content.length / 4),
                total_tokens: Math.round(((userInput?.length || 0) + extractedContent.content.length) / 4)
            };

            const extractionInfo = {
                method: extractedContent.method,
                originalLength: extractedContent.originalLength,
                cleanedLength: extractedContent.cleanedLength,
                structuredScore: extractedContent.structuredScore,
                userInputProvided: !!userInput,
                cleaningRatio: Math.round((1 - extractedContent.cleanedLength / extractedContent.originalLength) * 100)
            };

            const formattedContent = await this.formatToNativeAPIStyle({
                conversationTurns,
                usage,
                extractionInfo
            });
            
            console.log('[DeepSeek] 最终结果构建完成');
            console.log('[DeepSeek] 结构化得分:', extractionInfo.structuredScore);
            
            return formattedContent;

        } catch (error) {
            console.error('[DeepSeek] DOM结构分析提取失败:', error.message);
            
            return {
                error: error.message,
                id: "chatcmpl-" + Date.now(),
                created: Math.floor(Date.now() / 1000),
                model: "DeepSeek Chat",
                messages: [],
                usage: { prompt_tokens: -1, completion_tokens: -1, total_tokens: -1 },
                provider: "deepseek"
            };
        }
    }
    async formatToNativeAPIStyle(content) {
        try {
            const messages = [];
            const conversationId = await this.getChatId();

            for (const turn of content.conversationTurns) {
                if (turn.query) {
                    messages.push({
                        role: "user",
                        content: turn.query
                    });
                }

                if (turn.response) {
                    messages.push({
                        role: "assistant",
                        content: turn.response
                    });
                }
            }

            return {
                id: "chatcmpl-" + (conversationId || Date.now()),
                created: Math.floor(Date.now() / 1000),
                model: "DeepSeek Chat",
                messages: messages,
                usage: content.usage || {
                    prompt_tokens: -1,
                    completion_tokens: -1,
                    total_tokens: -1
                },
                provider: "deepseek",
                conversationId: conversationId
            };

        } catch (error) {
            console.error('[DeepSeek] 格式转换失败:', error.message);
            return {
                error: error.message,
                messages: []
            };
        }
    }

    // ==================== 流式响应处理 ====================

    async* handleChatStream(prompt, filePaths = null, stream = true, newChat = false) {
        try {
            console.log('[DeepSeek] 开始流式聊天处理...');

            this.session.lastPrompt = prompt;
            const result = await this.sendMessage(prompt, filePaths, newChat, stream);

            if (result.success) {
                if (stream) {
                    const response = result.response;
                    yield {
                        type: 'start',
                        provider: 'deepseek',
                        conversationId: result.conversationId
                    };

                    yield {
                        type: 'content',
                        data: response,
                        finished: false
                    };

                    yield {
                        type: 'complete',
                        data: response,
                        finished: true,
                        conversationId: result.conversationId
                    };
                } else {
                    yield result.response;
                }
            } else {
                yield {
                    type: 'error',
                    error: result.error,
                    provider: 'deepseek'
                };
            }

        } catch (error) {
            console.error('[DeepSeek] 流式聊天处理失败:', error.message);
            yield {
                type: 'error',
                error: error.message,
                provider: 'deepseek'
            };
        }
    }

    // ==================== 工具方法 ====================

    async uploadFiles(filePaths) {
        console.warn('[DeepSeek] DeepSeek暂不支持文件上传功能');
        return true;
    }

    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async cleanup() {
        try {
            console.log('[DeepSeek] 清理DeepSeek发布器资源...');
            this.session = null;
            this.llmController = null;
            this.loggedIn = false;
            this.conversationId = null;
        } catch (error) {
            console.error('[DeepSeek] 资源清理失败:', error.message);
        }
    }

    async getStatus() {
        try {
            const isLoggedIn = await this.checkLoggedIn();
            const conversationId = await this.getChatId();

            return {
                provider: 'deepseek',
                loggedIn: isLoggedIn,
                conversationId: conversationId,
                features: this.config.features,
                lastChecked: Date.now()
            };
        } catch (error) {
            return {
                provider: 'deepseek',
                error: error.message,
                lastChecked: Date.now()
            };
        }
    }
}