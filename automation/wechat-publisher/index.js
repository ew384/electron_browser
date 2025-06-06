// 微信发布器主入口 - 更新版本
import { ChromeController } from './chrome-controller.js'
import { WorkflowEngine } from './workflow-engine.js'
import { ElementAnalyzer } from './element-analyzer.js'
import { ContentProcessor } from './content-processor.js'
import { TemplateEngine } from './template-engine.js'
import path from 'path'
import fs from 'fs'

export class WeChatPublisher {
    constructor(options = {}) {
        this.config = {
            debugPort: options.debugPort || 9225,
            timeout: options.timeout || 15000,
            retryAttempts: options.retryAttempts || 3,
            outputDir: options.outputDir || './output',
            serverPort: options.serverPort || 3000,
            ...options
        }
        
        this.chromeController = new ChromeController(this.config)
        this.workflowEngine = new WorkflowEngine(this.config)
        this.elementAnalyzer = new ElementAnalyzer(this.config)
        this.contentProcessor = new ContentProcessor(this.config)
        this.templateEngine = new TemplateEngine(this.config)
        
        this.initOutputDir()
        console.log('🚀 WeChatPublisher 初始化完成')
    }
    
    initOutputDir() {
        if (!fs.existsSync(this.config.outputDir)) {
            fs.mkdirSync(this.config.outputDir, { recursive: true })
        }
    }
    
    async publish(workflowType, content, template, account) {
        console.log(`📱 开始发布 ${workflowType} 到账号: ${account.id}`)
        
        try {
            // 1. 验证输入参数
            this.validateInput(workflowType, content, template)
            
            // 2. 处理内容
            const processedContent = await this.contentProcessor.process(content, workflowType)
            
            // 3. 渲染模板
            const renderData = await this.templateEngine.render(template, processedContent, account)
            
            console.log('📋 渲染后的内容:')
            Object.entries(renderData).forEach(([key, value]) => {
                if (typeof value === 'string' && value.length < 100) {
                    console.log(`   ${key}: ${value}`)
                }
            })
            
            // 4. 启动浏览器会话
            const session = await this.chromeController.createSession(account)
            
            // 5. 传递chromeController引用给session
            session.chromeController = this.chromeController
            
            // 6. 导航到对应页面
            await this.chromeController.navigateToUploadPage(session, workflowType)
            
            // 7. 分析页面元素 (简化版本)
            const pageAnalysis = {
                contentType: workflowType,
                elements: {},
                summary: { readyForAutomation: true }
            }
            
            // 8. 执行自动化工作流
            const result = await this.workflowEngine.execute(session, workflowType, renderData, pageAnalysis)
            
            // 9. 保存结果
            await this.saveResult(workflowType, result, account)
            
            // 10. 清理会话
            await this.chromeController.closeSession(session.id)
            
            console.log(`✅ ${workflowType}发布完成`)
            return result
            
        } catch (error) {
            console.error(`❌ ${workflowType}发布失败:`, error.message)
            throw error
        }
    }
    
    async batchPublish(workflowType, content, template, accounts) {
        console.log(`📦 批量发布 ${workflowType} 到 ${accounts.length} 个账号`)
        
        const results = []
        for (const account of accounts) {
            try {
                console.log(`\n📱 发布到账号: ${account.name || account.id}`)
                
                const variedContent = await this.contentProcessor.generateVariation(content, account)
                const result = await this.publish(workflowType, variedContent, template, account)
                
                results.push({
                    account: account.id,
                    status: 'success',
                    result
                })
                
                // 账号间延迟
                if (accounts.indexOf(account) < accounts.length - 1) {
                    const delay = 5000 + Math.random() * 5000
                    console.log(`⏳ 等待 ${Math.round(delay/1000)} 秒后处理下一个账号...`)
                    await this.delay(delay)
                }
                
            } catch (error) {
                console.error(`❌ 账号 ${account.id} 发布失败:`, error.message)
                results.push({
                    account: account.id,
                    status: 'failed',
                    error: error.message
                })
            }
        }
        
        return results
    }
    
    validateInput(workflowType, content, template) {
        const supportedTypes = ['video', 'article', 'music', 'audio']
        if (!supportedTypes.includes(workflowType)) {
            throw new Error(`不支持的工作流类型: ${workflowType}`)
        }
        
        if (!content || typeof content !== 'object') {
            throw new Error('内容参数无效')
        }
        
        if (!template || typeof template !== 'object') {
            throw new Error('模板参数无效')
        }
    }
    
    async saveResult(workflowType, result, account) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
        const filename = `${workflowType}-publish-${account.id}-${timestamp}.json`
        const filepath = path.join(this.config.outputDir, filename)
        
        const saveData = {
            workflowType,
            account: account.id,
            timestamp: new Date().toISOString(),
            result
        }
        
        fs.writeFileSync(filepath, JSON.stringify(saveData, null, 2))
        console.log(`📄 结果已保存: ${filepath}`)
    }
    
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms))
    }
}
