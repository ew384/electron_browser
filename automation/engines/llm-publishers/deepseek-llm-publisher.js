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
                // 保存prompt用于后续提取
                this.session.lastPrompt = prompt;
                
                const sendResult = await this.sendPromptMessage(prompt);
                if (!sendResult.success) {
                    throw new Error(sendResult.error);
                }

                const responseResult = await this.waitForResponse();
                if (!responseResult.success) {
                    throw new Error(responseResult.error);
                }

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

    async extractPageContent() {
        try {
            console.log('[DeepSeek] 开始智能内容提取...');

            const extractScript = `
                (function() {
                    try {
                        const questionText = ${JSON.stringify(this.session.lastPrompt || '问题')};
                        
                        console.log('=== 开始DeepSeek智能内容提取 ===');
                        
                        // 🔧 策略1：基于时间顺序的DOM查找（最可靠）
                        function findLatestContent() {
                            // 查找所有可能包含对话的容器
                            const containers = [
                                // 通用对话容器模式
                                '[role="main"]',
                                '[class*="chat"]',
                                '[class*="conversation"]',
                                '[class*="message"]',
                                '[class*="dialog"]',
                                '[class*="response"]',
                                
                                // 主要内容区域
                                'main',
                                '#main',
                                '.main',
                                '#content',
                                '.content'
                            ];
                            
                            for (const selector of containers) {
                                const container = document.querySelector(selector);
                                if (container) {
                                    const text = container.textContent;
                                    if (text && text.includes(questionText) && text.length > questionText.length + 100) {
                                        console.log('找到对话容器:', selector);
                                        return { element: container, method: 'conversation_container', selector };
                                    }
                                }
                            }
                            
                            return null;
                        }
                        
                        // 🔧 策略2：基于DOM层次结构的查找
                        function findByDOMStructure() {
                            const allElements = document.querySelectorAll('*');
                            
                            // 直接查找最符合条件的元素
                            for (const el of allElements) {
                                const text = el.textContent?.trim();
                                if (!text || !text.includes(questionText)) continue;
                                
                                // 检查基本条件
                                if (text.length < 100) continue; // 内容太短
                                if (text.length > 10000) continue; // 内容太长，可能包含整个页面
                                
                                // 检查是否是有意义的内容容器
                                const isContentContainer = el.children.length === 0 || 
                                                        Array.from(el.children).every(child => 
                                                            ['span', 'strong', 'em', 'code', 'br', 'p', 'div'].includes(child.tagName.toLowerCase())
                                                        );
                                
                                // 计算内容密度（文本 vs HTML）
                                const contentDensity = text.length / el.innerHTML.length;
                                
                                // 简单条件：内容密度高且是内容容器
                                if (contentDensity > 0.5 && isContentContainer) {
                                    console.log('找到DOM结构匹配元素:', el.tagName, el.className);
                                    return { 
                                        element: el, 
                                        method: 'dom_structure_analysis'
                                    };
                                }
                            }
                            
                            return null;
                        }
                        
                        // 🔧 策略3：基于内容模式的识别
                        function findByContentPattern() {
                            const fullText = document.body.textContent;
                            const questionIndex = fullText.indexOf(questionText);
                            
                            if (questionIndex === -1) {
                                return null;
                            }
                            
                            // 智能内容分割 - 查找自然边界
                            const beforeQuestion = fullText.substring(0, questionIndex);
                            const afterQuestion = fullText.substring(questionIndex);
                            
                            // 查找结束标记
                            const endMarkers = [
                                '\\n\\n\\n', // 多个换行
                                'New chat',
                                '@keyframes',
                                'position:',
                                'z-index:',
                                '.intercom',
                                'AI-generated',
                                '© 2024',
                                'Terms of Service',
                                'Privacy Policy'
                            ];
                            
                            let endIndex = afterQuestion.length;
                            for (const marker of endMarkers) {
                                const index = afterQuestion.indexOf(marker);
                                if (index !== -1 && index < endIndex) {
                                    endIndex = index;
                                }
                            }
                            
                            const extractedContent = afterQuestion.substring(0, endIndex).trim();
                            
                            if (extractedContent.length > 50) {
                                return {
                                    content: extractedContent,
                                    method: 'content_pattern_matching',
                                    boundaries: { start: questionIndex, end: questionIndex + endIndex }
                                };
                            }
                            
                            return null;
                        }
                        
                        // 辅助函数已移除，不再需要复杂的深度计算
                        
                        // 🚀 执行多策略提取
                        let result = null;
                        let extractionMethod = '';
                        let extractedText = '';
                        
                        // 尝试策略1：对话容器查找
                        result = findLatestContent();
                        if (result) {
                            extractedText = result.element.textContent.trim();
                            extractionMethod = result.method;
                            console.log('使用策略1:', result.method);
                        }
                        
                        // 尝试策略2：DOM结构查找
                        if (!result || extractedText.length < 100) {
                            result = findByDOMStructure();
                            if (result) {
                                extractedText = result.element.textContent.trim();
                                extractionMethod = result.method;
                                console.log('使用策略2:', result.method);
                            }
                        }
                        
                        // 尝试策略3：内容模式匹配
                        if (!result || extractedText.length < 100) {
                            result = findByContentPattern();
                            if (result) {
                                extractedText = result.content;
                                extractionMethod = result.method;
                                console.log('使用策略3:', result.method);
                            }
                        }
                        // 🔧 备用策略4：基于实际DOM结构的代码块提取（如果前面策略都失败）
                        if (!result || extractedText.length < 100) {
                            console.log('尝试备用策略4: DOM结构代码块提取');
                            
                            // 查找代码块容器
                            const codeSelectors = [
                                '.md-code-block',
                                '.md-code-block-dark', 
                                'pre',
                                '[class*="code"]'
                            ];
                            
                            let bestCodeBlock = null;
                            let maxLength = 0;
                            
                            for (const selector of codeSelectors) {
                                const elements = document.querySelectorAll(selector);
                                for (const el of elements) {
                                    const text = el.textContent?.trim();
                                    if (text && text.length > maxLength) {
                                        maxLength = text.length;
                                        bestCodeBlock = text;
                                    }
                                }
                            }
                            
                            if (bestCodeBlock && bestCodeBlock.length > 50) {
                                extractedText = bestCodeBlock;
                                extractionMethod = 'dom_code_block_extraction';
                                console.log('备用策略4成功:', extractionMethod, '长度:', extractedText.length);
                            }
                        }
                        // 🔧 备用策略5：查找markdown段落内容（处理<br>标签格式）
                        if (!result || extractedText.length < 100) {
                            console.log('尝试备用策略5: Markdown段落提取');
                            
                            // 查找markdown段落元素
                            const markdownSelectors = [
                                '.ds-markdown-paragraph',
                                '[class*="markdown"]',
                                'p[class*="ds-"]'
                            ];
                            
                            let bestMarkdownContent = null;
                            let maxLength = 0;
                            
                            for (const selector of markdownSelectors) {
                                const elements = document.querySelectorAll(selector);
                                for (const el of elements) {
                                    const html = el.innerHTML;
                                    const text = el.textContent?.trim();
                                    
                                    // 检查是否包含JSON特征或有意义的内容
                                    if (text && text.length > 50 && 
                                        (text.includes('"') || text.includes('{') || text.includes('需求类型'))) {
                                        
                                        // 处理<br>标签，转换为真正的换行符
                                        const processedText = html
                                            .replace(/<br\\s*\\/?>/gi, '\\n')  // 将<br>替换为换行符
                                            .replace(/<[^>]*>/g, '')          // 移除其他HTML标签
                                            .trim();
                                        
                                        if (processedText.length > maxLength) {
                                            maxLength = processedText.length;
                                            bestMarkdownContent = processedText;
                                        }
                                    }
                                }
                            }
                            
                            if (bestMarkdownContent && bestMarkdownContent.length > 50) {
                                extractedText = bestMarkdownContent;
                                extractionMethod = 'markdown_paragraph_extraction';
                                console.log('备用策略5成功:', extractionMethod, '长度:', extractedText.length);
                            }
                        }                        
                        if (!extractedText || extractedText.length < 50) {
                            console.error('所有提取策略都失败');
                            return {
                                success: false,
                                error: '无法提取有效内容',
                                conversationTurns: []
                            };
                        }
                        
                        // 🔧 智能内容清理
                        let cleanedContent = extractedText;
                        // 检查是否是JSON格式内容，如果是则进行轻度清理
                        const isJsonContent = extractedText.includes('"需求类型"') || 
                                            extractedText.includes('"下一步操作"') ||
                                            (extractedText.trim().startsWith('{') && extractedContent.trim().endsWith('}'));

                        if (isJsonContent) {
                            console.log('检测到JSON格式内容，使用轻度清理');
                            // 只做基本清理
                            cleanedContent = extractedText
                                .replace(/Copy\\s*Download/gi, '')
                                .replace(/Copy/g, '')
                                .replace(/Download/g, '')
                                .trim();
                        } else {
                            // 移除问题文本本身（如果在开头）
                            if (cleanedContent.startsWith(questionText)) {
                                cleanedContent = cleanedContent.substring(questionText.length).trim();
                            }
                            
                            // 深度清理模式
                            const deepCleanPatterns = [
                                // UI按钮和操作
                                /[a-z]+CopyDownload/gi,
                                /Copy\\s*Download/gi,
                                /\\s+Copy\\s+/g,
                                /\\s+Download\\s+/g,
                                
                                // DeepSeek特有元素
                                /New chat DeepThink \\(R1\\)Search/g,
                                /DeepThink \\(R1\\)/g,
                                /AI-generated[^\\n]*/gi,
                                
                                // CSS和样式（完整清理）
                                /@[a-z-]+\\s*\\{[^}]*\\}/gi,
                                /\\.[a-z-]+[^{]*\\{[^}]*\\}/gi,
                                /[a-z-]+:\\s*[^;]*;/gi,
                                /rgba?\\([^)]*\\)/gi,
                                /[0-9]+px/gi,
                                
                                // 其他UI垃圾
                                /intercom[^\\s]*/gi,
                                /Search(?!\\w)/g,
                                /\\s{3,}/g
                            ];
                            
                            deepCleanPatterns.forEach(pattern => {
                                cleanedContent = cleanedContent.replace(pattern, ' ');
                            });
                            
                            // 最终格式化
                            cleanedContent = cleanedContent
                                .replace(/\\s+/g, ' ')
                                .replace(/\\n{3,}/g, '\\n\\n')
                                .trim();
                        }
                        // 简单的内容有效性检查
                        if (cleanedContent.length < 20) {
                            console.error('清理后内容过短');
                            return {
                                success: false,
                                error: '提取的内容过短',
                                conversationTurns: []
                            };
                        }
                        
                        console.log('提取完成:', {
                            method: extractionMethod,
                            originalLength: extractedText.length,
                            cleanedLength: cleanedContent.length
                        });
                        
                        return {
                            conversationTurns: [{
                                turnIndex: 0,
                                query: questionText,
                                response: cleanedContent
                            }],
                            usage: {
                                prompt_tokens: Math.round(questionText.length / 4),
                                completion_tokens: Math.round(cleanedContent.length / 4),
                                total_tokens: Math.round((questionText.length + cleanedContent.length) / 4)
                            },
                            extractionInfo: {
                                method: extractionMethod,
                                originalLength: extractedText.length,
                                cleanedLength: cleanedContent.length
                            }
                        };
                        
                    } catch (error) {
                        console.error('内容提取失败:', error);
                        return {
                            error: error.message,
                            conversationTurns: []
                        };
                    }
                })()
            `;

            const result = await this.llmController.executeLLMScript(this.session, extractScript, {
                awaitPromise: true,
                timeout: 30000
            });

            if (result.success && result.result) {
                const extractedContent = result.result?.value || result.result;
                
                if (extractedContent.error) {
                    throw new Error(extractedContent.error);
                }

                console.log('[DeepSeek] ✅ 智能内容提取完成');
                console.log(`[DeepSeek] 提取信息:`, extractedContent.extractionInfo);

                const formattedContent = await this.formatToNativeAPIStyle(extractedContent);
                return formattedContent;
            } else {
                throw new Error('脚本执行失败: ' + (result.error || '未知错误'));
            }

        } catch (error) {
            console.error('[DeepSeek] 智能内容提取失败:', error.message);
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