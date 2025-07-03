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
            console.log('[DeepSeek] ==================== 开始增强清理内容提取 ====================');

            const userInput = userInputText || this.session.lastPrompt || '';
            console.log('[DeepSeek] 用户输入长度:', userInput.length);

            const extractScript = `
                (function() {
                    console.log('脚本开始执行');
                    
                    const userInput = arguments[0] || '';
                    console.log('用户输入长度:', userInput.length);
                    
                    try {
                        console.log('获取页面信息');
                        const pageInfo = {
                            url: window.location.href,
                            totalElements: document.querySelectorAll('*').length,
                            bodyTextLength: document.body.textContent.length
                        };
                        console.log('页面元素总数:', pageInfo.totalElements);
                        
                        console.log('查找对话容器');
                        const allElements = document.querySelectorAll('*');
                        let bestContainer = null;
                        let maxScore = 0;
                        
                        for (let i = 0; i < allElements.length; i++) {
                            const element = allElements[i];
                            const text = element.textContent;
                            if (!text || text.length < 200) continue;
                            
                            let score = 0;
                            
                            if (userInput && text.indexOf(userInput) !== -1) score += 10;
                            if (text.indexOf('需求类型') !== -1 || text.indexOf('{') !== -1) score += 8;
                            if (text.length > 500 && text.length < 5000) score += 5;
                            if (text.indexOf('sidebar') === -1 && text.indexOf('header') === -1) score += 2;
                            
                            if (score > maxScore) {
                                maxScore = score;
                                bestContainer = element;
                            }
                        }
                        
                        if (!bestContainer) {
                            console.log('未找到合适的对话容器');
                            return {
                                success: false,
                                error: '未找到对话容器'
                            };
                        }
                        
                        console.log('找到最佳容器，得分:', maxScore);
                        
                        let rawContent = bestContainer.textContent;
                        console.log('原始内容长度:', rawContent.length);
                        
                        // 处理HTML格式和HTML实体
                        if (bestContainer.innerHTML) {
                            console.log('检测到HTML格式，进行预处理');
                            let htmlContent = bestContainer.innerHTML;
                            
                            // 处理HTML实体
                            htmlContent = htmlContent.replace(/&nbsp;/g, ' ');
                            htmlContent = htmlContent.replace(/&amp;/g, '&');
                            htmlContent = htmlContent.replace(/&lt;/g, '<');
                            htmlContent = htmlContent.replace(/&gt;/g, '>');
                            htmlContent = htmlContent.replace(/&quot;/g, '"');
                            htmlContent = htmlContent.replace(/&#39;/g, "'");
                            
                            // 处理HTML标签
                            rawContent = htmlContent
                                .replace(/<br\\s*\\/?>/gi, '\\n')
                                .replace(/<[^>]*>/g, '')
                                .replace(/^\\s+|\\s+$/g, '');
                            console.log('HTML预处理后长度:', rawContent.length);
                        }
                        
                        console.log('开始增强智能清理');
                        let cleaned = rawContent;
                        console.log('清理前长度:', cleaned.length);
                        
                        // 🎯 问题修复1: 移除HTML实体残留
                        console.log('清理HTML实体残留');
                        cleaned = cleaned.replace(/&nbsp;/g, ' ');
                        cleaned = cleaned.replace(/&amp;/g, '&');
                        cleaned = cleaned.replace(/&lt;/g, '<');
                        cleaned = cleaned.replace(/&gt;/g, '>');
                        cleaned = cleaned.replace(/&quot;/g, '"');
                        cleaned = cleaned.replace(/&#39;/g, "'");
                        
                        // 🎯 问题修复2: 移除整个agent prompt模板
                        if (userInput) {
                            console.log('移除agent prompt模板重复');
                            
                            // 查找完整的agent prompt结束位置
                            const agentPromptEndMarkers = [
                                '请确保保留所有之前已经收集到的信息，并与新信息合并。',
                                '"分析说明": "你的分析思路"',
                                '}\\s*请确保保留所有',
                                '请用这样的格式来组织你的分析:'
                            ];
                            
                            let agentPromptEnd = -1;
                            for (let j = 0; j < agentPromptEndMarkers.length; j++) {
                                const marker = agentPromptEndMarkers[j];
                                const index = cleaned.indexOf(marker);
                                if (index !== -1) {
                                    agentPromptEnd = Math.max(agentPromptEnd, index + marker.length);
                                    console.log('找到agent prompt结束标记:', marker, '位置:', index);
                                }
                            }
                            
                            // 如果找到了agent prompt的结束位置，从那里开始提取AI回复
                            if (agentPromptEnd !== -1) {
                                console.log('从agent prompt结束位置开始提取，位置:', agentPromptEnd);
                                cleaned = cleaned.substring(agentPromptEnd);
                                console.log('移除agent prompt后长度:', cleaned.length);
                            } else {
                                // 备用方案：基于用户原始输入查找
                                const originalUserQuery = userInput.split('\\n')[2]; // 提取"用户说: xxx"部分
                                if (originalUserQuery) {
                                    const userQueryMatch = originalUserQuery.match(/"([^"]+)"/);
                                    if (userQueryMatch && userQueryMatch[1]) {
                                        const actualUserQuery = userQueryMatch[1];
                                        console.log('提取到实际用户查询:', actualUserQuery);
                                        
                                        // 查找这个查询之后的AI回复
                                        const queryIndex = cleaned.lastIndexOf(actualUserQuery);
                                        if (queryIndex !== -1) {
                                            cleaned = cleaned.substring(queryIndex + actualUserQuery.length);
                                            console.log('基于实际用户查询提取后长度:', cleaned.length);
                                        }
                                    }
                                }
                            }
                        }
                        
                        // 🎯 清理页面导航垃圾（增强版）
                        console.log('移除页面导航垃圾');
                        cleaned = cleaned.replace(/New chat\\s*&nbsp;[^{]*Today[^{]*/gi, '');
                        cleaned = cleaned.replace(/New chat\\s+Today[^\\n{]*Get App[^\\n{]*/gi, '');
                        cleaned = cleaned.replace(/New chat\\s+Today[^\\n{]*/gi, '');
                        cleaned = cleaned.replace(/Get App\\s*My Profile[^\\n{]*/gi, '');
                        cleaned = cleaned.replace(/用户请求生成[^\\n{]*诗[^\\n{]*/gi, '');
                        cleaned = cleaned.replace(/用户与助理初次问候交流/gi, '');
                        
                        // 清理更多导航元素
                        cleaned = cleaned.replace(/^[\\s\\n]*New chat[^{]*Today[^{]*Get App[^{]*My Profile[^{]*/gi, '');
                        cleaned = cleaned.replace(/\\s*New chat\\s*/gi, ' ');
                        cleaned = cleaned.replace(/\\s*Today\\s*/gi, ' ');
                        cleaned = cleaned.replace(/\\s*Get App\\s*/gi, ' ');
                        cleaned = cleaned.replace(/\\s*My Profile\\s*/gi, ' ');
                        
                        // 🎯 移除结尾垃圾（增强版）
                        console.log('移除结尾垃圾');
                        cleaned = cleaned.replace(/New chat\\s*DeepThink \\(R1\\)\\s*Search\\s*AI-generated[^\\n]*$/gi, '');
                        cleaned = cleaned.replace(/DeepThink \\(R1\\)\\s*Search\\s*AI-generated[^\\n]*$/gi, '');
                        cleaned = cleaned.replace(/AI-generated,?\\s*for reference only\\s*$/gi, '');
                        cleaned = cleaned.replace(/Search\\s*AI-generated[^\\n]*$/gi, '');
                        cleaned = cleaned.replace(/DeepThink \\(R1\\)\\s*$/gi, '');
                        cleaned = cleaned.replace(/Copy\\s*Download\\s*$/gi, '');
                        
                        // 🎯 精确JSON提取
                        console.log('执行精确JSON提取');
                        const jsonStart = cleaned.indexOf('{');
                        if (jsonStart !== -1) {
                            console.log('找到JSON开始位置:', jsonStart);
                            
                            // 提取从{开始的内容
                            const fromJson = cleaned.substring(jsonStart);
                            
                            // 查找JSON结束位置
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
                                const extractedJson = fromJson.substring(0, jsonEnd);
                                console.log('成功提取完整JSON，长度:', extractedJson.length);
                                cleaned = extractedJson;
                            } else {
                                console.log('未找到JSON结束，使用现有清理结果');
                            }
                        } else {
                            console.log('未找到JSON开始位置');
                        }
                        
                        // 最终清理
                        cleaned = cleaned.replace(/\\s+/g, ' ');
                        cleaned = cleaned.replace(/\\n{3,}/g, '\\n\\n');
                        cleaned = cleaned.replace(/^\\s+|\\s+$/g, '');
                        
                        console.log('最终清理后长度:', cleaned.length);
                        
                        if (!cleaned || cleaned.length < 10) {
                            console.log('清理后内容过短或为空');
                            return {
                                success: false,
                                error: '清理后内容无效'
                            };
                        }
                        
                        console.log('内容提取和清理完成');
                        console.log('最终内容预览:', cleaned.substring(0, 200));
                        
                        return {
                            success: true,
                            method: 'enhanced_cleaned_extraction',
                            content: cleaned,
                            originalLength: rawContent.length,
                            cleanedLength: cleaned.length
                        };
                        
                    } catch (innerError) {
                        console.error('脚本内部错误:', innerError);
                        return {
                            success: false,
                            error: 'Script execution error: ' + innerError.message,
                            stack: innerError.stack
                        };
                    }
                })()
            `;

            console.log('[DeepSeek] 执行增强清理脚本');

            const result = await this.llmController.executeLLMScript(this.session, extractScript, {
                awaitPromise: false,
                timeout: 30000,
                args: [userInput]
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
                throw new Error(extractedContent?.error || '内容提取失败');
            }

            console.log('[DeepSeek] 增强清理提取成功');
            console.log('[DeepSeek] 原始长度:', extractedContent.originalLength);
            console.log('[DeepSeek] 清理后长度:', extractedContent.cleanedLength);
            console.log('[DeepSeek] 清理内容预览:', extractedContent.content.substring(0, 100));

            const conversationTurns = [{
                turnIndex: 0,
                query: userInput || '用户输入',
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
                userInputProvided: !!userInput,
                cleaningRatio: Math.round((1 - extractedContent.cleanedLength / extractedContent.originalLength) * 100)
            };

            const formattedContent = await this.formatToNativeAPIStyle({
                conversationTurns,
                usage,
                extractionInfo
            });
            
            console.log('[DeepSeek] 最终结果构建完成');
            console.log('[DeepSeek] 清理比例:', extractionInfo.cleaningRatio, '%');
            
            return formattedContent;

        } catch (error) {
            console.error('[DeepSeek] 增强清理提取失败:', error.message);
            
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