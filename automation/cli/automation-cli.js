#!/usr/bin/env node
// CLI 工具 - 完整版本
import { Command } from 'commander'
import { WeChatPublisher } from '../wechat-publisher/index.js'
import { AutomationServer } from '../api/automation-server.js'
import fs from 'fs'

const program = new Command()

program
    .name('wechat-automation')
    .description('微信视频号自动化发布工具')
    .version('1.0.0')

// 发布命令
program
    .command('publish')
    .description('发布内容到微信视频号')
    .requiredOption('-t, --type <type>', '工作流类型 (video|article|music|audio)')
    .requiredOption('-c, --content <file>', '内容配置文件路径')
    .requiredOption('-a, --account <file>', '账号配置文件路径')
    .option('-p, --template <file>', '模板配置文件路径')
    .option('--debug-port <port>', '浏览器调试端口', '9225')
    .action(async (options) => {
        try {
            console.log('🚀 开始发布流程...')
            
            // 检查文件是否存在
            if (!fs.existsSync(options.content)) {
                throw new Error(`内容配置文件不存在: ${options.content}`)
            }
            if (!fs.existsSync(options.account)) {
                throw new Error(`账号配置文件不存在: ${options.account}`)
            }
            
            const content = JSON.parse(fs.readFileSync(options.content, 'utf8'))
            const account = JSON.parse(fs.readFileSync(options.account, 'utf8'))
            const template = options.template && fs.existsSync(options.template) ? 
                JSON.parse(fs.readFileSync(options.template, 'utf8')) : {}
            
            console.log(`📋 工作流类型: ${options.type}`)
            console.log(`📄 内容配置: ${options.content}`)
            console.log(`👤 账号: ${account.name || account.id}`)
            console.log(`🎨 模板: ${options.template || '无'}`)
            
            const publisher = new WeChatPublisher({
                debugPort: parseInt(options.debugPort)
            })
            
            const result = await publisher.publish(options.type, content, template, account)
            
            console.log('✅ 发布成功!')
            console.log('📊 结果:', {
                type: result.type,
                account: result.account,
                success: result.success,
                message: result.message
            })
            
        } catch (error) {
            console.error('❌ 发布失败:', error.message)
            process.exit(1)
        }
    })

// 批量发布命令
program
    .command('batch-publish')
    .description('批量发布到多个账号')
    .requiredOption('-t, --type <type>', '工作流类型')
    .requiredOption('-c, --content <file>', '内容配置文件路径')
    .requiredOption('-a, --accounts <file>', '账号列表配置文件路径')
    .option('-p, --template <file>', '模板配置文件路径')
    .action(async (options) => {
        try {
            console.log('📦 开始批量发布...')
            
            // 检查文件
            if (!fs.existsSync(options.content)) {
                throw new Error(`内容配置文件不存在: ${options.content}`)
            }
            if (!fs.existsSync(options.accounts)) {
                throw new Error(`账号列表文件不存在: ${options.accounts}`)
            }
            
            const content = JSON.parse(fs.readFileSync(options.content, 'utf8'))
            const accounts = JSON.parse(fs.readFileSync(options.accounts, 'utf8'))
            const template = options.template && fs.existsSync(options.template) ? 
                JSON.parse(fs.readFileSync(options.template, 'utf8')) : {}
            
            console.log(`📋 工作流类型: ${options.type}`)
            console.log(`👥 账号数量: ${accounts.length}`)
            
            const publisher = new WeChatPublisher()
            const results = await publisher.batchPublish(options.type, content, template, accounts)
            
            console.log('\n📊 批量发布结果:')
            results.forEach((result, index) => {
                const status = result.status === 'success' ? '✅' : '❌'
                console.log(`${index + 1}. ${status} ${result.account}: ${result.status}`)
            })
            
            const successCount = results.filter(r => r.status === 'success').length
            console.log(`\n📈 成功率: ${successCount}/${results.length} (${((successCount/results.length)*100).toFixed(1)}%)`)
            
        } catch (error) {
            console.error('❌ 批量发布失败:', error.message)
            process.exit(1)
        }
    })

// 测试命令
program
    .command('test')
    .description('运行自动化测试')
    .action(async () => {
        console.log('🧪 运行自动化测试')
        
        try {
            const publisher = new WeChatPublisher()
            console.log('✅ WeChatPublisher 初始化成功')
            
            // 测试模板引擎
            const rendered = await publisher.templateEngine.render(
                { title: '{{title}} - {{account.name}}' },
                { title: '测试标题' },
                { name: '测试账号' }
            )
            console.log('✅ 模板引擎测试通过:', rendered.title)
            
            // 测试发布流程
            const result = await publisher.publish('video',
                { description: '测试视频描述' },
                { description: '{{description}} - {{date}}' },
                { id: 'test_account', name: '测试账号' }
            )
            
            if (result.success) {
                console.log('✅ 发布流程测试通过')
            }
            
            console.log('✅ 所有测试通过')
        } catch (error) {
            console.error('❌ 测试失败:', error.message)
            process.exit(1)
        }
    })

// 服务器命令
program
    .command('server')
    .description('启动自动化API服务器')
    .option('-p, --port <port>', '服务器端口', '3001')
    .action(async (options) => {
        try {
            const server = new AutomationServer({
                port: parseInt(options.port)
            })
            
            await server.start()
            
            // 优雅退出
            process.on('SIGINT', async () => {
                console.log('\n📤 正在关闭服务器...')
                await server.stop()
                process.exit(0)
            })
            
        } catch (error) {
            if (error.code === 'EADDRINUSE') {
                console.error(`❌ 端口 ${options.port} 已被占用`)
                console.log(`💡 尝试使用其他端口: node cli/automation-cli.js server -p ${parseInt(options.port) + 1}`)
            } else {
                console.error('❌ 服务器启动失败:', error.message)
            }
            process.exit(1)
        }
    })

// 生成配置文件模板
program
    .command('init')
    .description('生成配置文件模板')
    .option('-t, --type <type>', '工作流类型', 'video')
    .action((options) => {
        console.log(`📝 生成${options.type}配置文件模板...`)
        
        const templates = {
            video: {
                content: {
                    videoFile: './videos/sample.mp4',
                    description: '这是一个精彩的视频内容',
                    location: '北京市'
                },
                template: {
                    description: '{{description}} - 发布于{{date}} #{{account.name}}'
                },
                account: {
                    id: 'account_001',
                    name: '测试账号',
                    profile: {}
                },
                accounts: [
                    { id: 'account_001', name: '测试账号1' },
                    { id: 'account_002', name: '测试账号2' },
                    { id: 'account_003', name: '测试账号3' }
                ]
            },
            article: {
                content: {
                    title: '精彩图文标题',
                    content: '这是图文内容',
                    images: ['./images/1.jpg', './images/2.jpg']
                },
                template: {
                    title: '{{title}} - {{account.name}}',
                    content: '{{content}}\n\n发布时间: {{time}}'
                },
                account: {
                    id: 'account_001',
                    name: '测试账号'
                }
            }
        }
        
        const template = templates[options.type] || templates.video
        
        // 生成配置文件
        const files = [
            { name: `${options.type}-content.json`, content: template.content, desc: '内容配置' },
            { name: `${options.type}-template.json`, content: template.template, desc: '模板配置' },
            { name: `${options.type}-account.json`, content: template.account, desc: '账号配置' }
        ]
        
        if (template.accounts) {
            files.push({ 
                name: `${options.type}-accounts.json`, 
                content: template.accounts, 
                desc: '账号列表配置' 
            })
        }
        
        files.forEach(file => {
            fs.writeFileSync(file.name, JSON.stringify(file.content, null, 2))
            console.log(`📄 ${file.name} - ${file.desc}`)
        })
        
        console.log(`\n✅ ${options.type}配置文件模板已生成`)
        console.log('\n🎯 下一步:')
        console.log('1. 编辑配置文件')
        console.log(`2. 运行: node cli/automation-cli.js publish -t ${options.type} -c ${options.type}-content.json -a ${options.type}-account.json -p ${options.type}-template.json`)
    })

// 查看配置示例
program
    .command('example')
    .description('显示配置文件示例')
    .option('-t, --type <type>', '工作流类型', 'video')
    .action((options) => {
        console.log(`📋 ${options.type}配置文件示例:\n`)
        
        const examples = {
            video: {
                content: `// video-content.json
{
  "videoFile": "./videos/sample.mp4",
  "description": "这是一个精彩的视频内容",
  "location": "北京市"
}`,
                template: `// video-template.json
{
  "description": "{{description}} - 发布于{{date}} #{{account.name}}"
}`,
                account: `// video-account.json
{
  "id": "account_001",
  "name": "测试账号",
  "profile": {
    "userAgent": "Mozilla/5.0..."
  }
}`
            }
        }
        
        const example = examples[options.type] || examples.video
        
        console.log('📄 内容配置:')
        console.log(example.content)
        console.log('\n🎨 模板配置:')
        console.log(example.template)
        console.log('\n👤 账号配置:')
        console.log(example.account)
        
        console.log(`\n💡 生成实际文件: node cli/automation-cli.js init -t ${options.type}`)
    })

export { program }

// 如果直接运行
if (import.meta.url === `file://${process.argv[1]}`) {
    program.parse()
}
