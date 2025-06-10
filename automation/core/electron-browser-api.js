// automation/core/electron-browser-api.js - 新增文件
// 用于调用 electron_browser 的 HTTP API

export class ElectronBrowserAPI {
    constructor(config = {}) {
        this.baseUrl = config.baseUrl || 'http://localhost:9528'
        this.timeout = config.timeout || 5000
        this.retryAttempts = config.retryAttempts || 3
        this.retryDelay = config.retryDelay || 1000
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
     * 获取特定账号的浏览器实例
     */
    async getBrowserInstanceByAccount(accountId) {
        try {
            const browsers = await this.getBrowserInstances()

            // 优先查找精确匹配的账号ID
            let targetBrowser = browsers.find(browser =>
                browser.accountId === accountId || browser.id === accountId
            )

            if (targetBrowser) {
                console.log(`✅ 找到账号 ${accountId} 的浏览器实例，端口: ${targetBrowser.debugPort}`)
                return targetBrowser
            }

            // 如果没找到精确匹配，查找运行中的实例
            const runningBrowsers = browsers.filter(browser => browser.status === 'running')

            if (runningBrowsers.length > 0) {
                targetBrowser = runningBrowsers[0]
                console.log(`⚠️ 未找到账号 ${accountId} 的专用实例，使用运行中的实例: ${targetBrowser.debugPort}`)
                return targetBrowser
            }

            throw new Error(`未找到账号 ${accountId} 的浏览器实例，且没有其他运行中的实例`)

        } catch (error) {
            console.error(`❌ 获取账号 ${accountId} 的浏览器实例失败:`, error.message)
            throw error
        }
    }

    /**
     * 获取可用的调试端口
     */
    async getAvailableDebugPort(accountId) {
        try {
            const browserInstance = await this.getBrowserInstanceByAccount(accountId)

            if (browserInstance && browserInstance.debugPort) {
                // 验证端口是否真的可用
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
     * 获取浏览器实例的标签页
     */
    async getBrowserTabs(accountId) {
        try {
            const response = await this.httpRequest(`/api/browser/${accountId}/tabs`)

            if (response.success) {
                return response.tabs
            } else {
                throw new Error(response.error || '获取标签页失败')
            }
        } catch (error) {
            console.error(`❌ 获取浏览器标签页失败:`, error.message)
            throw error
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
     * 智能获取最佳端口（主要方法）
     */
    async getOptimalDebugPort(account) {
        console.log(`🎯 为账号 ${account.id} 智能获取调试端口...`)

        try {
            // 1. 检查 Electron API 是否可用
            const isAvailable = await this.checkAvailability()

            if (!isAvailable) {
                console.log('⚠️ Electron API 不可用，使用默认端口范围')
                return await this.fallbackPortDetection()
            }

            // 2. 尝试刷新实例状态
            await this.refreshBrowserInstances()

            // 3. 获取账号特定的端口
            const port = await this.getAvailableDebugPort(account.id)

            console.log(`✅ 智能端口获取成功: ${port}`)
            return port

        } catch (error) {
            console.log(`⚠️ 智能端口获取失败: ${error.message}，使用备用检测`)
            return await this.fallbackPortDetection()
        }
    }

    /**
     * 备用端口检测（当API不可用时）
     */
    async fallbackPortDetection() {
        console.log('🔍 执行备用端口检测...')

        // 检测常用端口范围：9711-9720
        const portRange = Array.from({ length: 10 }, (_, i) => 9711 + i)

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
     * 获取调试信息
     */
    async getDebugInfo() {
        try {
            const [healthStatus, browsers] = await Promise.all([
                this.httpRequest('/api/health').catch(() => ({ available: false })),
                this.getBrowserInstances().catch(() => [])
            ])

            return {
                apiAvailable: !!healthStatus.success,
                apiEndpoint: this.baseUrl,
                browsersCount: browsers.length,
                runningBrowsers: browsers.filter(b => b.status === 'running').length,
                availablePorts: browsers
                    .filter(b => b.debugPort)
                    .map(b => ({ accountId: b.accountId, port: b.debugPort, status: b.status }))
            }
        } catch (error) {
            return {
                apiAvailable: false,
                error: error.message
            }
        }
    }
}