// automation/core/chrome-controller.js - 增强版本
// 添加自动导航到平台上传页面的功能

import { getPlatformConfig } from '../config/platforms.js'

export class ChromeController {
    constructor(config = {}) {
        this.config = {
            debugPort: config.debugPort || 9711,
            timeout: config.timeout || 15000,
            retryAttempts: config.retryAttempts || 3,
            ...config
        }
        this.sessions = new Map()
    }

    async createSession(account) {
        console.log(`🔗 创建浏览器会话: ${account.id}`)

        try {
            // 1. 连接到Chrome调试端口
            const response = await fetch(`http://localhost:${this.config.debugPort}/json`)
            if (!response.ok) {
                throw new Error(`无法连接到Chrome调试端口 ${this.config.debugPort}。请确保Chrome以调试模式启动：chrome --remote-debugging-port=${this.config.debugPort}`)
            }

            const tabs = await response.json()
            console.log(`📋 找到 ${tabs.length} 个浏览器标签页`)

            // 2. 获取平台配置
            const platformId = account.platform || 'wechat'
            const platformConfig = getPlatformConfig(platformId)
            if (!platformConfig) {
                throw new Error(`不支持的平台: ${platformId}`)
            }

            // 3. 查找或创建目标页面
            let targetTab = await this.findOrCreateTargetTab(tabs, platformConfig, account)

            // 4. 建立WebSocket连接
            const wsUrl = targetTab.webSocketDebuggerUrl
            const ws = await this.connectWebSocket(wsUrl)

            // 5. 创建会话对象
            const session = {
                id: account.id,
                platform: platformId,
                platformConfig: platformConfig,
                account: account,
                tabId: targetTab.id,
                webSocket: ws,
                chromeController: this // 添加对自己的引用
            }

            this.sessions.set(account.id, session)

            // 6. 启用必要的Chrome DevTools域
            await this.enableDomains(session)

            // 7. 导航到上传页面（如果需要）
            await this.navigateToUploadPage(session)

            console.log(`✅ 会话创建成功: ${account.id} (${platformConfig.name})`)
            return session

        } catch (error) {
            console.error(`❌ 浏览器会话创建失败: ${error.message}`)
            throw error
        }
    }

    /**
     * 查找或创建目标标签页
     */
    async findOrCreateTargetTab(tabs, platformConfig, account) {
        const uploadUrl = platformConfig.urls.upload
        const loginUrl = platformConfig.urls.login
        const dashboardUrl = platformConfig.urls.dashboard

        // 1. 优先查找已存在的上传页面
        let targetTab = tabs.find(tab =>
            tab.url && (
                tab.url.includes(uploadUrl) ||
                tab.url.includes(platformConfig.urls.upload.split('/').slice(0, 3).join('/')) // 匹配域名
            )
        )

        if (targetTab) {
            console.log(`📱 找到现有的${platformConfig.name}上传页面`)
            return targetTab
        }

        // 2. 查找登录页面或仪表板页面
        targetTab = tabs.find(tab =>
            tab.url && (
                tab.url.includes(loginUrl) ||
                tab.url.includes(dashboardUrl) ||
                tab.url.includes(platformConfig.urls.login?.split('/').slice(0, 3).join('/'))
            )
        )

        if (targetTab) {
            console.log(`📱 找到现有的${platformConfig.name}页面，将导航到上传页面`)
            return targetTab
        }

        // 3. 查找空白标签页或新建标签页
        targetTab = tabs.find(tab =>
            !tab.url ||
            tab.url === 'about:blank' ||
            tab.url === 'chrome://newtab/' ||
            tab.title === 'New Tab'
        )

        if (targetTab) {
            console.log(`📱 找到空白标签页，将导航到${platformConfig.name}上传页面`)
            return targetTab
        }

        // 4. 如果没有合适的标签页，创建新标签页
        console.log(`📱 创建新标签页用于${platformConfig.name}`)
        const newTabResponse = await fetch(`http://localhost:${this.config.debugPort}/json/new?${uploadUrl}`)
        if (!newTabResponse.ok) {
            throw new Error('无法创建新标签页')
        }

        const newTab = await newTabResponse.json()
        console.log(`✅ 新标签页创建成功: ${newTab.id}`)

        // 等待新标签页加载
        await this.delay(2000)

        return newTab
    }

    /**
     * 建立WebSocket连接
     */
    async connectWebSocket(wsUrl) {
        return new Promise((resolve, reject) => {
            const ws = new WebSocket(wsUrl)

            ws.onopen = () => {
                console.log('🔌 WebSocket连接已建立')
                resolve(ws)
            }

            ws.onerror = (error) => {
                console.error('❌ WebSocket连接失败:', error)
                reject(new Error('WebSocket连接失败'))
            }

            ws.onclose = () => {
                console.log('🔌 WebSocket连接已关闭')
            }

            // 设置超时
            setTimeout(() => {
                if (ws.readyState !== WebSocket.OPEN) {
                    ws.close()
                    reject(new Error('WebSocket连接超时'))
                }
            }, this.config.timeout)
        })
    }

    /**
     * 启用Chrome DevTools域
     */
    async enableDomains(session) {
        const domains = ['Runtime', 'Page', 'DOM', 'Network']

        for (const domain of domains) {
            await this.sendCommand(session, `${domain}.enable`)
        }

        console.log('🔧 Chrome DevTools域已启用')
    }

    /**
     * 导航到上传页面
     */
    async navigateToUploadPage(session) {
        const uploadUrl = session.platformConfig.urls.upload

        try {
            // 获取当前页面URL
            const currentUrlResult = await this.sendCommand(session, 'Runtime.evaluate', {
                expression: 'window.location.href',
                returnByValue: true
            })

            const currentUrl = currentUrlResult.result.value
            console.log(`📍 当前页面: ${currentUrl}`)

            // 检查是否已经在上传页面
            if (currentUrl && currentUrl.includes(uploadUrl)) {
                console.log(`✅ 已在${session.platformConfig.name}上传页面`)
                return true
            }

            // 导航到上传页面
            console.log(`🔄 导航到${session.platformConfig.name}上传页面: ${uploadUrl}`)
            await this.sendCommand(session, 'Page.navigate', { url: uploadUrl })

            // 等待页面加载完成
            await this.waitForPageLoad(session)

            console.log(`✅ 已导航到${session.platformConfig.name}上传页面`)
            return true

        } catch (error) {
            console.error(`❌ 导航失败: ${error.message}`)

            // 如果导航失败，尝试通过JavaScript重定向
            try {
                console.log('🔄 尝试JavaScript重定向...')
                await this.executeScript(session, `window.location.href = '${uploadUrl}'`)
                await this.waitForPageLoad(session)
                console.log('✅ JavaScript重定向成功')
                return true
            } catch (jsError) {
                console.error(`❌ JavaScript重定向也失败: ${jsError.message}`)
                throw new Error(`无法导航到上传页面: ${error.message}`)
            }
        }
    }

    /**
     * 等待页面加载完成
     */
    async waitForPageLoad(session, timeout = 15000) {
        console.log('⏳ 等待页面加载完成...')

        const startTime = Date.now()

        while (Date.now() - startTime < timeout) {
            try {
                // 检查文档状态
                const readyStateResult = await this.sendCommand(session, 'Runtime.evaluate', {
                    expression: 'document.readyState',
                    returnByValue: true
                })

                const readyState = readyStateResult.result.value

                if (readyState === 'complete') {
                    // 额外等待确保动态内容加载
                    await this.delay(2000)
                    console.log('✅ 页面加载完成')
                    return true
                }

                console.log(`📄 页面状态: ${readyState}`)
                await this.delay(1000)

            } catch (error) {
                console.log(`⚠️ 检查页面状态失败: ${error.message}`)
                await this.delay(1000)
            }
        }

        console.log('⚠️ 页面加载超时，但继续执行')
        return false
    }

    /**
     * 发送Chrome DevTools命令
     */
    async sendCommand(session, method, params = {}) {
        return new Promise((resolve, reject) => {
            const id = Date.now() + Math.random()
            const command = {
                id: id,
                method: method,
                params: params
            }

            const timeoutId = setTimeout(() => {
                reject(new Error(`命令超时: ${method}`))
            }, this.config.timeout)

            const messageHandler = (event) => {
                const data = JSON.parse(event.data)

                if (data.id === id) {
                    clearTimeout(timeoutId)
                    session.webSocket.removeEventListener('message', messageHandler)

                    if (data.error) {
                        reject(new Error(`Chrome DevTools错误: ${data.error.message}`))
                    } else {
                        resolve(data)
                    }
                }
            }

            session.webSocket.addEventListener('message', messageHandler)
            session.webSocket.send(JSON.stringify(command))
        })
    }

    /**
     * 执行JavaScript脚本
     */
    async executeScript(session, script) {
        console.log('📜 执行页面脚本...')

        try {
            const result = await this.sendCommand(session, 'Runtime.evaluate', {
                expression: script,
                returnByValue: true,
                awaitPromise: true
            })

            if (result.result.exceptionDetails) {
                throw new Error(`脚本执行错误: ${result.result.exceptionDetails.exception.description}`)
            }

            return result
        } catch (error) {
            console.error(`❌ 脚本执行失败: ${error.message}`)
            throw error
        }
    }

    /**
     * 关闭会话
     */
    async closeSession(sessionId) {
        const session = this.sessions.get(sessionId)
        if (session) {
            if (session.webSocket) {
                session.webSocket.close()
            }
            this.sessions.delete(sessionId)
            console.log(`🔌 会话已关闭: ${sessionId}`)
        }
    }

    /**
     * 获取会话
     */
    getSession(sessionId) {
        return this.sessions.get(sessionId)
    }

    /**
     * 获取所有会话
     */
    getAllSessions() {
        return Array.from(this.sessions.values())
    }

    /**
     * 清理所有会话
     */
    async cleanup() {
        console.log('🧹 清理所有浏览器会话...')

        for (const sessionId of this.sessions.keys()) {
            await this.closeSession(sessionId)
        }

        console.log('✅ 所有会话已清理')
    }

    /**
     * 延迟工具方法
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms))
    }

    /**
     * 检查Chrome调试端口是否可用
     */
    async checkChromeDebugPort() {
        try {
            const response = await fetch(`http://localhost:${this.config.debugPort}/json/version`)
            if (response.ok) {
                const version = await response.json()
                console.log(`🌐 Chrome调试端口可用: ${version.Browser}`)
                return true
            }
            return false
        } catch (error) {
            console.error(`❌ Chrome调试端口检查失败: ${error.message}`)
            return false
        }
    }

    /**
     * 获取浏览器信息
     */
    async getBrowserInfo() {
        try {
            const response = await fetch(`http://localhost:${this.config.debugPort}/json/version`)
            const info = await response.json()
            return {
                browser: info.Browser,
                userAgent: info['User-Agent'],
                v8Version: info['V8-Version'],
                webkitVersion: info['WebKit-Version']
            }
        } catch (error) {
            throw new Error(`无法获取浏览器信息: ${error.message}`)
        }
    }
}