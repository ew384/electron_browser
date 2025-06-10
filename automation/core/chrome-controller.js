// automation/core/chrome-controller.js - 修复版本
// 集成 ElectronBrowserAPI 实现动态端口获取

import { getPlatformConfig } from '../config/platforms.js'
import { ElectronBrowserAPI } from './electron-browser-api.js'
export class ChromeController {
    constructor(config = {}) {
        this.config = {
            electronApiUrl: config.electronApiUrl || 'http://localhost:9528',
            timeout: config.timeout || 15000,
            retryAttempts: config.retryAttempts || 3,
            ...config
        }
        this.sessions = new Map()
        this.electronAPI = new ElectronBrowserAPI({
            baseUrl: this.config.electronApiUrl,
            timeout: 5000,
            retryAttempts: 2
        })
    }

    async createSession(account) {
        console.log(`🔗 创建浏览器会话: ${account.id}`)

        try {
            // 🔧 修改：不再直接连接WebSocket，而是验证API可用性
            const debugInfo = await this.electronAPI.getDebugInfo()

            if (!debugInfo.apiAvailable) {
                throw new Error('Electron Browser Manager API 不可用')
            }

            // 获取账号对应的浏览器实例
            const browserInstance = await this.electronAPI.getBrowserInstanceByAccount(account.id)

            if (!browserInstance || browserInstance.status !== 'running') {
                throw new Error(`账号 ${account.id} 的浏览器实例未运行`)
            }

            // 创建会话对象（不包含WebSocket连接）
            const session = {
                id: account.id,
                platform: account.platform || 'wechat',
                account: account,
                browserInstance: browserInstance,
                debugPort: browserInstance.debugPort,
                chromeController: this
            }

            this.sessions.set(account.id, session)

            // 🔧 修改：通过API导航到上传页面
            await this.navigateToUploadPage(session)

            console.log(`✅ 会话创建成功: ${account.id} - 端口: ${browserInstance.debugPort}`)
            return session

        } catch (error) {
            console.error(`❌ 浏览器会话创建失败: ${error.message}`)
            throw error
        }
    }

    /**
     * 🔧 修改：通过HTTP API执行脚本
     */
    async executeScript(session, script) {
        console.log('📜 执行页面脚本（通过API）...')

        try {
            const response = await fetch(`${this.config.electronApiUrl}/api/browser/${session.id}/execute-script`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    script: script,
                    returnByValue: true,
                    awaitPromise: true
                })
            })

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`)
            }

            const result = await response.json()

            if (!result.success) {
                throw new Error(result.error)
            }

            return result

        } catch (error) {
            console.error(`❌ 脚本执行失败: ${error.message}`)
            throw error
        }
    }

    /**
     * 🔧 修改：通过HTTP API上传文件
     */
    async uploadFile(session, filePath, base64Data, fileName, mimeType) {
        console.log('📤 上传文件（通过API）...')

        try {
            const response = await fetch(`${this.config.electronApiUrl}/api/browser/${session.id}/upload-file`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    filePath: filePath,
                    base64Data: base64Data,
                    fileName: fileName,
                    mimeType: mimeType,
                    selector: 'input[type="file"]'
                })
            })

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`)
            }

            const result = await response.json()

            if (!result.success) {
                throw new Error(result.error)
            }

            console.log(`✅ 文件上传成功: ${result.fileName}`)
            return result

        } catch (error) {
            console.error(`❌ 文件上传失败: ${error.message}`)
            throw error
        }
    }

    /**
     * 🔧 修改：通过HTTP API导航页面
     */
    async navigateToUploadPage(session) {
        const platformConfig = getPlatformConfig(session.platform)
        if (!platformConfig) {
            throw new Error(`不支持的平台: ${session.platform}`)
        }

        const uploadUrl = platformConfig.urls.upload

        try {
            console.log(`🔄 导航到${platformConfig.name}上传页面: ${uploadUrl}`)

            const response = await fetch(`${this.config.electronApiUrl}/api/browser/${session.id}/navigate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    url: uploadUrl
                })
            })

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`)
            }

            const result = await response.json()

            if (!result.success) {
                throw new Error(result.error)
            }

            // 等待页面加载
            await this.delay(3000)

            console.log(`✅ 已导航到${platformConfig.name}上传页面`)
            return true

        } catch (error) {
            console.error(`❌ 导航失败: ${error.message}`)
            throw error
        }
    }

    /**
     * 🔧 修改：通过HTTP API等待条件
     */
    async waitForCondition(session, condition, timeout = 30000) {
        console.log('⏳ 等待条件满足...')

        try {
            const response = await fetch(`${this.config.electronApiUrl}/api/browser/${session.id}/wait-for`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    condition: condition,
                    timeout: timeout,
                    interval: 1000
                })
            })

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`)
            }

            const result = await response.json()

            if (!result.success) {
                throw new Error(result.error)
            }

            console.log('✅ 条件满足')
            return result

        } catch (error) {
            console.error(`❌ 等待条件失败: ${error.message}`)
            throw error
        }
    }

    // 🔧 保留原有的其他方法，但移除WebSocket相关代码
    async closeSession(sessionId) {
        const session = this.sessions.get(sessionId)
        if (session) {
            // 不再需要关闭WebSocket连接
            this.sessions.delete(sessionId)
            console.log(`🔌 会话已关闭: ${sessionId}`)
        }
    }

    getSession(sessionId) {
        return this.sessions.get(sessionId)
    }

    getAllSessions() {
        return Array.from(this.sessions.values())
    }

    async cleanup() {
        console.log('🧹 清理所有浏览器会话...')
        for (const sessionId of this.sessions.keys()) {
            await this.closeSession(sessionId)
        }
        console.log('✅ 所有会话已清理')
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms))
    }

    async getDebugInfo() {
        return await this.electronAPI.getDebugInfo()
    }
}