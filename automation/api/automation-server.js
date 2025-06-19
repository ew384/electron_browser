// API 服务器
import express from 'express'

export class AutomationServer {
    constructor(options = {}) {
        this.port = options.port || 3211
        this.app = express()
        this.setupRoutes()
    }
    
    setupRoutes() {
        this.app.use(express.json())
        
        this.app.get('/health', (req, res) => {
            res.json({ status: 'ok', timestamp: new Date().toISOString() })
        })
        
        this.app.get('/api/workflows', (req, res) => {
            res.json({
                workflows: [
                    { type: 'video', name: '视频发布' },
                    { type: 'article', name: '图文发布' },
                    { type: 'music', name: '音乐发布' },
                    { type: 'audio', name: '音频发布' }
                ]
            })
        })
    }
    
    async start() {
        return new Promise((resolve) => {
            this.server = this.app.listen(this.port, () => {
                console.log(`🚀 API服务器启动在端口 ${this.port}`)
                resolve()
            })
        })
    }
}
