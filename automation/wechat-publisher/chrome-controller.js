// Chrome 浏览器控制器 - 优化版本
import WebSocket from 'ws'
import fetch from 'node-fetch'

export class ChromeController {
    constructor(config) {
        this.config = {
            ...config,
            timeout: config.timeout || 15000, // 增加超时时间
            retryAttempts: config.retryAttempts || 3
        }
        this.sessions = new Map()
        console.log('🌐 ChromeController 初始化完成 (优化版本)')
    }
    
    async createSession(account) {
        console.log(`🔗 创建浏览器会话: ${account.id}`)
        
        try {
            // 获取现有标签页
            const response = await fetch(`http://localhost:${this.config.debugPort}/json`)
            const tabs = await response.json()
            
            // 查找微信视频号页面
            let targetTab = tabs.find(tab => 
                tab.url.includes('channels.weixin.qq.com') && tab.type === 'page'
            )
            
            if (!targetTab) {
                throw new Error('未找到微信视频号标签页，请先在浏览器中打开微信视频号页面')
            }
            
            console.log(`✅ 找到目标页面: ${targetTab.title}`)
            
            const session = {
                id: account.id,
                debugPort: this.config.debugPort,
                tabId: targetTab.id,
                websocket: null,
                account,
                wsUrl: targetTab.webSocketDebuggerUrl,
                messageQueue: [],
                commandId: 1
            }
            
            // 建立WebSocket连接
            await this.connectWebSocket(session)
            
            // 启用必要的Chrome DevTools域
            await this.enableDomains(session)
            
            this.sessions.set(account.id, session)
            return session
            
        } catch (error) {
            console.error('❌ 浏览器会话创建失败:', error.message)
            throw error
        }
    }
    
    async connectWebSocket(session) {
        console.log('🔗 建立WebSocket连接...')
        
        session.websocket = new WebSocket(session.wsUrl)
        
        // 设置消息处理器
        session.websocket.on('message', (data) => {
            try {
                const message = JSON.parse(data)
                session.messageQueue.push(message)
                
                // 保持最近100条消息
                if (session.messageQueue.length > 100) {
                    session.messageQueue.shift()
                }
            } catch (e) {
                // 忽略解析错误
            }
        })
        
        session.websocket.on('error', (error) => {
            console.error('WebSocket错误:', error.message)
        })
        
        // 等待连接建立
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('WebSocket连接超时'))
            }, 10000)
            
            session.websocket.on('open', () => {
                clearTimeout(timeout)
                console.log('✅ WebSocket连接成功')
                resolve()
            })
            
            session.websocket.on('error', (error) => {
                clearTimeout(timeout)
                reject(error)
            })
        })
    }
    
    async enableDomains(session) {
        console.log('🔧 启用Chrome DevTools域...')
        
        const domains = ['Runtime', 'Page', 'DOM']
        
        for (const domain of domains) {
            try {
                await this.sendCommand(session, `${domain}.enable`)
                console.log(`   ✅ ${domain}.enable 成功`)
            } catch (error) {
                console.log(`   ⚠️ ${domain}.enable 失败: ${error.message}`)
                // 继续尝试其他域
            }
        }
    }
    
    async navigateToUploadPage(session, workflowType) {
        const urls = {
            video: 'https://channels.weixin.qq.com/platform/post/create',
            article: 'https://channels.weixin.qq.com/platform/post/finderNewLifeCreate',
            music: 'https://channels.weixin.qq.com/platform/post/createMusic',
            audio: 'https://channels.weixin.qq.com/platform/post/createAudio'
        }
        
        const targetUrl = urls[workflowType]
        console.log(`🔄 导航到 ${workflowType} 上传页面`)
        console.log(`   目标URL: ${targetUrl}`)
        
        try {
            // 检查当前页面URL
            const currentUrl = await this.getCurrentUrl(session)
            console.log(`   当前URL: ${currentUrl}`)
            
            if (currentUrl === targetUrl) {
                console.log('✅ 已在目标页面')
                return true
            }
            
            // 导航到目标页面
            console.log('🔄 执行页面导航...')
            await this.sendCommand(session, 'Page.navigate', { url: targetUrl })
            
            // 等待页面加载完成
            await this.waitForPageLoad(session)
            
            console.log('✅ 页面导航成功')
            return true
            
        } catch (error) {
            console.error('⚠️ 页面导航失败:', error.message)
            console.log('💡 请手动在浏览器中导航到目标页面')
            return false
        }
    }
    
    async getCurrentUrl(session) {
        try {
            const result = await this.sendCommand(session, 'Runtime.evaluate', {
                expression: 'window.location.href',
                returnByValue: true
            })
            return result.result.value
        } catch (error) {
            console.log('⚠️ 获取当前URL失败')
            return null
        }
    }
    
    async waitForPageLoad(session) {
        console.log('⏳ 等待页面加载完成...')
        
        try {
            // 等待页面加载事件或超时
            const startTime = Date.now()
            const maxWait = 15000 // 15秒超时
            
            while (Date.now() - startTime < maxWait) {
                try {
                    const readyState = await this.sendCommand(session, 'Runtime.evaluate', {
                        expression: 'document.readyState',
                        returnByValue: true,
                        timeout: 3000
                    })
                    
                    if (readyState.result.value === 'complete') {
                        console.log('✅ 页面加载完成')
                        // 额外等待2秒确保动态内容加载
                        await new Promise(resolve => setTimeout(resolve, 2000))
                        return true
                    }
                    
                    await new Promise(resolve => setTimeout(resolve, 1000))
                } catch (error) {
                    // 如果评估失败，继续等待
                    await new Promise(resolve => setTimeout(resolve, 1000))
                }
            }
            
            console.log('⚠️ 页面加载超时，继续执行')
            return false
            
        } catch (error) {
            console.log('⚠️ 页面加载检查失败:', error.message)
            return false
        }
    }
    
    async sendCommand(session, method, params = {}) {
        if (!session.websocket || session.websocket.readyState !== WebSocket.OPEN) {
            throw new Error('WebSocket连接不可用')
        }
        
        const commandId = session.commandId++
        const message = JSON.stringify({ id: commandId, method, params })
        
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error(`命令 ${method} 执行超时 (${this.config.timeout}ms)`))
            }, this.config.timeout)
            
            // 监听响应
            const checkResponse = () => {
                const response = session.messageQueue.find(msg => msg.id === commandId)
                if (response) {
                    clearTimeout(timeout)
                    
                    if (response.error) {
                        reject(new Error(`${method}: ${response.error.message}`))
                    } else {
                        resolve(response.result || {})
                    }
                    return true
                }
                return false
            }
            
            // 立即检查是否已有响应
            if (!checkResponse()) {
                // 设置定期检查
                const interval = setInterval(() => {
                    if (checkResponse()) {
                        clearInterval(interval)
                    }
                }, 100)
                
                // 清理定时器
                setTimeout(() => {
                    clearInterval(interval)
                }, this.config.timeout)
            }
            
            // 发送命令
            try {
                session.websocket.send(message)
            } catch (error) {
                clearTimeout(timeout)
                reject(new Error(`发送命令失败: ${error.message}`))
            }
        })
    }
    
    async executeScript(session, script) {
        console.log('📜 执行页面脚本...')
        
        try {
            const result = await this.sendCommand(session, 'Runtime.evaluate', {
                expression: script,
                returnByValue: true,
                awaitPromise: false
            })
            
            return result
        } catch (error) {
            console.error('❌ 脚本执行失败:', error.message)
            throw error
        }
    }
    
    async closeSession(sessionId) {
        const session = this.sessions.get(sessionId)
        if (session) {
            try {
                if (session.websocket && session.websocket.readyState === WebSocket.OPEN) {
                    session.websocket.close()
                }
            } catch (e) {
                // 忽略关闭错误
            }
            this.sessions.delete(sessionId)
            console.log(`🔌 会话已关闭: ${sessionId}`)
        }
    }
}
