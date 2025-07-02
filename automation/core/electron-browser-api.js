// automation/core/electron-browser-api.js - 新增文件
// 用于调用 electron_browser 的 HTTP API

export class ElectronBrowserAPI {
    constructor(config = {}) {
        this.baseUrl = config.baseUrl || 'http://127.0.0.1:9528'
        this.timeout = config.timeout || 5000
        this.retryAttempts = config.retryAttempts || 3
        this.retryDelay = config.retryDelay || 1000
        // 🔧 新增：LLM用户和端口配置
        this.llmConfig = {
            users: ['test1', 'user_1', 'user_2'], // LLM用户列表
            sharedInstanceId: 'llm_shared',             // LLM共享实例ID
            fixedPort: 9712                             // LLM固定端口
        }
    }
    /**
    * 🔧 新增：判断是否为LLM用户
    */
    isLLMUser(accountId) {
        return this.llmConfig.users.includes(accountId);
    }
    /**
     * 获取特定账号的浏览器实例 - 分离式修复版本
     */
    async getBrowserInstanceByAccount(accountId) {
        try {
            console.log(`🔍 获取浏览器实例: ${accountId}`);
            console.log(`🔍 [DEBUG] llmConfig.users:`, this.llmConfig.users);
            console.log(`🔍 [DEBUG] isLLMUser(${accountId}) = ${this.isLLMUser(accountId)}`);

            // 🔧 LLM 用户特殊处理：映射到 LLM 专用浏览器
            if (this.isLLMUser(accountId)) {
                console.log(`🤖 检测到LLM用户: ${accountId}，使用 LLM 专用浏览器`);

                // 获取所有浏览器实例
                const browsers = await this.getBrowserInstances();

                // 查找 group="LLM" 且状态为 running 的浏览器
                const llmBrowser = browsers.find(browser =>
                    browser.group === 'LLM' && browser.status === 'running'
                );

                if (llmBrowser) {
                    console.log(`✅ 找到 LLM 专用浏览器: ${llmBrowser.accountId} (端口: ${llmBrowser.debugPort})`);

                    // 🔧 关键修复：返回完整的浏览器信息，确保后续HTTP请求使用正确的accountId
                    return {
                        accountId: llmBrowser.accountId,      // 真实浏览器账号（用于 API 调用）
                        id: llmBrowser.accountId,             // 兼容性
                        debugPort: llmBrowser.debugPort,
                        status: llmBrowser.status,
                        name: llmBrowser.name,
                        group: llmBrowser.group,
                        originalLLMUser: accountId,           // 保留原始 LLM 用户信息
                        isLLMSharedInstance: true,
                        // 🔧 新增：添加浏览器的完整信息
                        browserInfo: llmBrowser
                    };
                }

                throw new Error(`LLM 专用浏览器未运行，请确保 group="LLM" 的浏览器正在运行`);
            }

            // 🔧 非LLM用户：使用原有逻辑（不变）
            return await this.getRegularBrowserInstance(accountId);

        } catch (error) {
            console.error(`❌ 获取浏览器实例失败: ${error.message}`);
            throw error;
        }
    }

    /**
     * 🔧 新增：获取LLM专用浏览器实例
     */
    async getLLMBrowserInstance(originalAccountId) {
        try {
            console.log(`🤖 为用户 ${originalAccountId} 查找 LLM 专用浏览器`);

            // 1. 获取所有浏览器实例
            const browsers = await this.getBrowserInstances();

            // 2. 查找 group="LLM" 且状态为 running 的浏览器
            const llmBrowser = browsers.find(browser =>
                browser.group === 'LLM' && browser.status === 'running'
            );

            if (llmBrowser) {
                console.log(`✅ 找到 LLM 专用浏览器: ${llmBrowser.accountId} (端口: ${llmBrowser.debugPort})`);
                return {
                    ...llmBrowser,
                    originalAccountId: originalAccountId,
                    id: llmBrowser.accountId // 确保有 id 字段
                };
            }

            throw new Error('未找到运行中的 LLM 专用浏览器，请确保 group="LLM" 的浏览器正在运行');

        } catch (error) {
            console.error(`❌ 获取 LLM 专用浏览器失败: ${error.message}`);
            throw error;
        }
    }

    /**
     * 智能获取最佳端口（主要方法）- 修复版本，支持LLM用户重定向
     */
    async getOptimalDebugPort(account) {
        console.log(`🎯 为账号 ${account.id} 智能获取调试端口...`)

        try {
            // 🔧 LLM用户特殊处理
            if (this.isLLMUser(account.id)) {
                console.log(`🤖 LLM用户，直接返回固定端口: ${this.llmConfig.fixedPort}`);
                const isValid = await this.validateDebugPort(this.llmConfig.fixedPort);
                if (isValid) {
                    return this.llmConfig.fixedPort;
                } else {
                    throw new Error(`LLM端口 ${this.llmConfig.fixedPort} 不可用`);
                }
            }

            // 🔧 非LLM用户：原有逻辑
            const isAvailable = await this.checkAvailability();

            if (!isAvailable) {
                console.log('⚠️ Electron API 不可用，使用默认端口范围')
                return await this.fallbackPortDetection()
            }

            await this.refreshBrowserInstances()
            const port = await this.getAvailableDebugPort(account.id)

            console.log(`✅ 智能端口获取成功: ${port}`)
            return port

        } catch (error) {
            console.log(`⚠️ 智能端口获取失败: ${error.message}，使用备用检测`)
            return await this.fallbackPortDetection()
        }
    }

    /**
     * 获取调试信息 - 增强版本
     */
    async getDebugInfo() {
        try {
            const [healthStatus, browsers] = await Promise.all([
                this.httpRequest('/api/health').catch(() => ({ available: false })),
                this.getBrowserInstances().catch(() => [])
            ])

            // 🔧 增强：分析LLM浏览器状态
            const llmBrowsers = browsers.filter(b => b.group === 'LLM');
            const runningLLMBrowsers = llmBrowsers.filter(b => b.status === 'running');

            return {
                apiAvailable: !!healthStatus.success,
                apiEndpoint: this.baseUrl,
                browsersCount: browsers.length,
                runningBrowsers: browsers.filter(b => b.status === 'running').length,
                availablePorts: browsers
                    .filter(b => b.debugPort)
                    .map(b => ({
                        accountId: b.accountId,
                        port: b.debugPort,
                        status: b.status,
                        group: b.group || 'default'
                    })),
                // 🔧 新增：LLM相关详细信息
                llm: {
                    users: this.llmConfig.users,
                    sharedInstanceId: this.llmConfig.sharedInstanceId,
                    fixedPort: this.llmConfig.fixedPort,
                    portAvailable: await this.validateDebugPort(this.llmConfig.fixedPort),
                    // LLM浏览器状态
                    llmBrowsersTotal: llmBrowsers.length,
                    llmBrowsersRunning: runningLLMBrowsers.length,
                    llmBrowserDetails: runningLLMBrowsers.map(b => ({
                        accountId: b.accountId,
                        name: b.name,
                        debugPort: b.debugPort,
                        tabsCount: b.tabsCount,
                        url: b.url
                    }))
                }
            }
        } catch (error) {
            return {
                apiAvailable: false,
                error: error.message
            }
        }
    }

    /**
     * 🔧 新增：获取常规浏览器实例（原有逻辑）
     */
    async getRegularBrowserInstance(accountId) {
        try {
            console.log(`📱 获取常规浏览器实例: ${accountId}`);

            // 原有的获取逻辑
            const browsers = await this.getBrowserInstances();

            // 优先查找精确匹配的账号ID
            let targetBrowser = browsers.find(browser =>
                browser.accountId === accountId || browser.id === accountId
            );

            if (targetBrowser) {
                console.log(`✅ 找到账号 ${accountId} 的浏览器实例，端口: ${targetBrowser.debugPort}`);
                return targetBrowser;
            }

            // 如果没找到精确匹配，查找运行中的实例
            const runningBrowsers = browsers.filter(browser => browser.status === 'running');

            if (runningBrowsers.length > 0) {
                targetBrowser = runningBrowsers[0];
                console.log(`⚠️ 未找到账号 ${accountId} 的专用实例，使用运行中的实例: ${targetBrowser.debugPort}`);
                return targetBrowser;
            }

            throw new Error(`未找到账号 ${accountId} 的浏览器实例，且没有其他运行中的实例`);

        } catch (error) {
            console.error(`❌ 获取常规浏览器实例失败:`, error.message);
            throw error;
        }
    }

    /**
     * 获取所有浏览器实例
     */
    async getBrowserInstances() {
        try {
            console.log('🔍 从 Electron API 获取浏览器实例...')
            const response = await this.httpRequest('/api/browsers')

            if (response.success) {
                console.log(`✅ 获取到 ${response.browsers.length} 个浏览器实例`)
                return response.browsers
            } else {
                throw new Error(response.error || 'API 返回失败')
            }
        } catch (error) {
            console.error('❌ 获取浏览器实例失败:', error.message)
            throw error
        }
    }

    /**
     * 验证调试端口是否可用
     */
    async validateDebugPort(port) {
        try {
            const response = await fetch(`http://localhost:${port}/json/version`, {
                method: 'GET',
                timeout: 3000
            })

            if (response.ok) {
                const version = await response.json()
                console.log(`🔍 端口 ${port} 验证成功: ${version.Browser}`)
                return true
            }
            return false
        } catch (error) {
            console.log(`🔍 端口 ${port} 验证失败: ${error.message}`)
            return false
        }
    }


    /**
     * 获取可用的调试端口
     */
    async getAvailableDebugPort(accountId) {
        try {
            const browserInstance = await this.getRegularBrowserInstance(accountId)

            if (browserInstance && browserInstance.debugPort) {
                const isValid = await this.validateDebugPort(browserInstance.debugPort)

                if (isValid) {
                    console.log(`✅ 验证成功，端口 ${browserInstance.debugPort} 可用`)
                    return browserInstance.debugPort
                } else {
                    console.log(`⚠️ 端口 ${browserInstance.debugPort} 验证失败`)
                }
            }

            // 如果账号特定的端口不可用，尝试获取任何可用端口
            const browsers = await this.getBrowserInstances()
            const runningBrowsers = browsers.filter(browser =>
                browser.status === 'running' && browser.debugPort
            )

            for (const browser of runningBrowsers) {
                const isValid = await this.validateDebugPort(browser.debugPort)
                if (isValid) {
                    console.log(`✅ 找到可用的备用端口: ${browser.debugPort}`)
                    return browser.debugPort
                }
            }

            throw new Error('没有找到可用的调试端口')

        } catch (error) {
            console.error('❌ 获取调试端口失败:', error.message)
            throw error
        }
    }

    /**
     * 备用端口检测（当API不可用时）
     */
    async fallbackPortDetection() {
        console.log('🔍 执行备用端口检测...')

        // 检测常用端口范围：9711-9720（不包括9712，因为那是LLM专用）
        const portRange = [9711, 9713, 9714, 9715, 9716, 9717, 9718, 9719, 9720]

        for (const port of portRange) {
            const isValid = await this.validateDebugPort(port)
            if (isValid) {
                console.log(`✅ 备用检测找到可用端口: ${port}`)
                return port
            }
        }

        // 如果都不可用，返回默认端口
        console.log('⚠️ 未找到可用端口，返回默认端口 9711')
        return 9711
    }

    /**
     * 检查 Electron API 是否可用
     */
    async checkAvailability() {
        try {
            const response = await this.httpRequest('/api/health')
            return response.success
        } catch (error) {
            console.log(`⚠️ Electron API 不可用: ${error.message}`)
            return false
        }
    }

    /**
     * 刷新浏览器实例状态
     */
    async refreshBrowserInstances() {
        try {
            const response = await this.httpRequest('/api/browsers/refresh', 'POST')
            return response.success
        } catch (error) {
            console.error('❌ 刷新浏览器实例失败:', error.message)
            return false
        }
    }


    /**
     * HTTP 请求工具方法
     */
    async httpRequest(endpoint, method = 'GET', data = null) {
        const url = `${this.baseUrl}${endpoint}`

        for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
            try {
                const options = {
                    method,
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    timeout: this.timeout
                }

                if (data && method !== 'GET') {
                    options.body = JSON.stringify(data)
                }

                const response = await fetch(url, options)

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
                }

                const result = await response.json()
                return result

            } catch (error) {
                console.log(`🔄 HTTP请求尝试 ${attempt}/${this.retryAttempts} 失败: ${error.message}`)

                if (attempt < this.retryAttempts) {
                    await this.delay(this.retryDelay)
                } else {
                    throw error
                }
            }
        }
    }

    /**
     * 延迟工具方法
     */
    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms))
    }
    /**
     * 🔧 新增：获取LLM专用浏览器实例
     */
    async getLLMBrowserInstance(originalAccountId) {
        try {
            console.log(`🤖 为用户 ${originalAccountId} 查找 LLM 专用浏览器`);

            // 1. 获取所有浏览器实例
            const browsers = await this.getBrowserInstances();

            // 2. 查找 group="LLM" 且状态为 running 的浏览器
            const llmBrowser = browsers.find(browser =>
                browser.group === 'LLM' && browser.status === 'running'
            );

            if (llmBrowser) {
                console.log(`✅ 找到 LLM 专用浏览器: ${llmBrowser.accountId} (端口: ${llmBrowser.debugPort})`);
                return {
                    ...llmBrowser,
                    originalAccountId: originalAccountId,
                    id: llmBrowser.accountId // 确保有 id 字段
                };
            }

            throw new Error('未找到运行中的 LLM 专用浏览器，请确保 group="LLM" 的浏览器正在运行');

        } catch (error) {
            console.error(`❌ 获取 LLM 专用浏览器失败: ${error.message}`);
            throw error;
        }
    }
}