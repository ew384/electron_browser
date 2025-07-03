// automation/core/chrome-controller.js - 简化版本（业务层协调器）
import { ElectronBrowserAPI } from './electron-browser-api.js'

export class ChromeController {
    constructor(config = {}) {
        this.config = {
            electronApiUrl: config.electronApiUrl || 'http://127.0.0.1:9528',
            timeout: config.timeout || 15000,
            retryAttempts: config.retryAttempts || 3,
            ...config
        }

        // 🔧 简化：只保留会话管理，移除WebSocket操作
        this.sessions = new Map()
        this.electronAPI = new ElectronBrowserAPI({
            baseUrl: this.config.electronApiUrl,
            timeout: 5000,
            retryAttempts: 2
        })
    }

    // 🔧 修改：创建标签页级会话
    async createSession(account, platformId) {
        console.log(`🔗 创建浏览器会话: ${account.id} - ${platformId}`)

        try {
            // 获取浏览器实例
            const browserInstance = await this.electronAPI.getBrowserInstanceByAccount(account.id)
            if (!browserInstance || browserInstance.status !== 'running') {
                throw new Error(`账号 ${account.id} 的浏览器实例未运行`)
            }

            // 🔧 新增：为该平台创建专用标签页
            const platformConfig = await this.getPlatformConfig(platformId)
            const uploadUrl = platformConfig?.urls?.upload

            const tabResponse = await this.httpRequest(`${this.config.electronApiUrl}/api/browser/${account.id}/tabs`, {
                method: 'POST',
                body: JSON.stringify({
                    url: uploadUrl,
                    platform: platformId
                })
            })

            if (!tabResponse.success) {
                throw new Error(`创建标签页失败: ${tabResponse.error}`)
            }

            // 创建会话对象
            const sessionId = `${account.id}-${platformId}-${tabResponse.tabId}`
            const session = {
                id: sessionId,
                accountId: account.id,
                tabId: tabResponse.tabId,
                platform: platformId,
                account: account,
                browserInstance: browserInstance,
                debugPort: browserInstance.debugPort,
                sessionKey: tabResponse.sessionKey,
                createdAt: Date.now()
            }

            this.sessions.set(sessionId, session)
            console.log(`✅ 会话创建成功: ${sessionId}`)
            return session

        } catch (error) {
            console.error(`❌ 浏览器会话创建失败: ${error.message}`)
            throw error
        }
    }

    // 🔧 简化：通过HTTP API执行脚本
    async executeScript(session, script) {
        console.log(`📜 执行页面脚本: ${session.platform}`)

        try {
            const response = await this.httpRequest(
                `${this.config.electronApiUrl}/api/browser/${session.accountId}/tabs/${session.tabId}/execute-script`,
                {
                    method: 'POST',
                    body: JSON.stringify({
                        script: script,
                        returnByValue: true,
                        awaitPromise: true
                    }),
                    timeout: 720000
                }
            )

            if (!response.success) {
                throw new Error(response.error)
            }

            return response

        } catch (error) {
            console.error(`❌ 脚本执行失败: ${error.message}`)
            throw error
        }
    }

    // 🔧 简化：通过HTTP API上传文件
    async uploadFile(session, filePath, base64Data, fileName, mimeType) {
        console.log(`📤 上传文件: ${session.platform}`)

        try {
            const response = await this.httpRequest(
                `${this.config.electronApiUrl}/api/browser/${session.accountId}/tabs/${session.tabId}/upload-file`,
                {
                    method: 'POST',
                    body: JSON.stringify({
                        filePath: filePath,
                        base64Data: base64Data,
                        fileName: fileName,
                        mimeType: mimeType,
                        selector: 'input[type="file"]'
                    })
                }
            )

            if (!response.success) {
                throw new Error(response.error)
            }

            console.log(`✅ 文件上传成功: ${response.fileName}`)
            return response

        } catch (error) {
            console.error(`❌ 文件上传失败: ${error.message}`)
            throw error
        }
    }
    // 🔧 新增：直接文件上传方法
    async uploadFileDirectly(session, selector, filePath) {
        console.log(`📤 使用 DevTools Protocol 直接上传文件: ${filePath}`)
        
        try {
            const response = await this.httpRequest(
                `${this.config.electronApiUrl}/api/browser/${session.accountId}/tabs/${session.tabId}/set-file-input`,
                {
                    method: 'POST',
                    body: JSON.stringify({
                        selector: selector,
                        filePath: filePath
                    })
                }
            )

            if (!response.success) {
                throw new Error(response.error)
            }

            console.log(`✅ 文件直接上传成功: ${filePath}`)
            return response

        } catch (error) {
            console.error(`❌ DevTools Protocol 文件上传失败: ${error.message}`)
            throw error
        }
    }
    // 🔧 简化：通过HTTP API导航页面
    async navigateToUploadPage(session) {
        const platformConfig = await this.getPlatformConfig(session.platform)
        if (!platformConfig) {
            throw new Error(`不支持的平台: ${session.platform}`)
        }

        const uploadUrl = platformConfig.urls.upload

        try {
            console.log(`🔄 导航到${platformConfig.name}上传页面: ${uploadUrl}`)

            const response = await this.httpRequest(
                `${this.config.electronApiUrl}/api/browser/${session.accountId}/tabs/${session.tabId}/navigate`,
                {
                    method: 'POST',
                    body: JSON.stringify({ url: uploadUrl })
                }
            )

            if (!response.success) {
                throw new Error(response.error)
            }

            await this.delay(3000) // 等待页面加载
            console.log(`✅ 已导航到${platformConfig.name}上传页面`)
            return true

        } catch (error) {
            console.error(`❌ 导航失败: ${error.message}`)
            throw error
        }
    }

    // 🔧 新增：并发创建多个会话
    async createMultipleSessions(accounts, platforms) {
        console.log(`🔗 并发创建多个会话: ${accounts.length} 账号, ${platforms.length} 平台`)

        const sessionPromises = []

        for (let i = 0; i < platforms.length; i++) {
            const account = accounts[i]
            const platform = platforms[i]

            sessionPromises.push(
                this.createSession(account, platform).catch(error => {
                    console.error(`会话创建失败 ${account.id}-${platform}:`, error.message)
                    return { error: error.message, account: account.id, platform }
                })
            )
        }

        const results = await Promise.all(sessionPromises)

        const validSessions = results.filter(result => !result.error)
        const errors = results.filter(result => result.error)

        console.log(`✅ 成功创建 ${validSessions.length} 个会话, ${errors.length} 个失败`)

        return {
            sessions: validSessions,
            errors: errors,
            successCount: validSessions.length,
            totalCount: results.length
        }
    }

    // 🔧 简化：关闭会话（清理标签页）
    async closeSession(sessionId) {
        const session = this.sessions.get(sessionId)
        if (session) {
            try {
                // 关闭标签页
                await this.httpRequest(
                    `${this.config.electronApiUrl}/api/browser/${session.accountId}/tabs/${session.tabId}`,
                    { method: 'DELETE' }
                )
                console.log(`🔌 标签页已关闭: ${session.tabId}`)
            } catch (error) {
                console.warn(`⚠️ 关闭标签页失败: ${error.message}`)
            }

            this.sessions.delete(sessionId)
            console.log(`🔌 会话已清理: ${sessionId}`)
        }
    }

    // 🔧 新增：批量关闭会话
    async closeMultipleSessions(sessionIds) {
        console.log(`🔌 批量关闭会话: ${sessionIds.length} 个`)

        const closePromises = sessionIds.map(sessionId =>
            this.closeSession(sessionId).catch(error => {
                console.warn(`关闭会话失败 ${sessionId}:`, error.message)
                return { error: error.message, sessionId }
            })
        )

        await Promise.all(closePromises)
        console.log(`✅ 批量会话关闭完成`)
    }

    // 🔧 保留：工具方法
    getSession(sessionId) {
        return this.sessions.get(sessionId)
    }

    getAllSessions() {
        return Array.from(this.sessions.values())
    }

    async cleanup() {
        console.log('🧹 清理所有浏览器会话...')
        const sessionIds = Array.from(this.sessions.keys())
        await this.closeMultipleSessions(sessionIds)
        console.log('✅ 所有会话已清理')
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms))
    }

    async getDebugInfo() {
        return await this.electronAPI.getDebugInfo()
    }

    // 🔧 新增：HTTP请求工具方法
    async httpRequest(url, options = {}) {
        const requestOptions = {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: 15000,
            ...options
        }

        try {
            const response = await fetch(url, requestOptions)

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`)
            }

            return await response.json()

        } catch (error) {
            console.error(`HTTP请求失败 ${url}:`, error.message)
            throw error
        }
    }

    // 🔧 保留：获取平台配置
    async getPlatformConfig(platformId) {
        try {
            // 这里可以从配置文件或API获取平台配置
            const { getPlatformConfig } = await import('../config/platforms.js')
            return getPlatformConfig(platformId)
        } catch (error) {
            console.error('获取平台配置失败:', error.message)
            return null
        }
    }
}