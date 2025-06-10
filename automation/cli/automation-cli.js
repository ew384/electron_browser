#!/usr/bin/env node
// automation/cli/automation-cli.js - 修复版本
import { Command } from 'commander'
import fs from 'fs'
import path from 'path'

// 🔧 修复：使用正确的导入路径
// 原来的路径：'../wechat-publisher/index.js' (不存在)
// 新的路径：'../core/index.js' (实际存在)
import { UniversalPublisher } from '../core/index.js'

const program = new Command()

program
    .name('automation-cli')
    .description('多平台自动化发布工具')
    .version('2.0.0')

// 发布命令 - 修复版本
program
    .command('publish')
    .description('发布内容到指定平台')
    .requiredOption('-t, --type <type>', '工作流类型 (video|article|music|audio)')
    .requiredOption('-c, --content <file>', '内容配置文件路径')
    .requiredOption('-a, --account <file>', '账号配置文件路径')
    .option('-p, --template <file>', '模板配置文件路径')
    .option('--platform <platform>', '目标平台 (wechat|douyin|xiaohongshu|kuaishou)', 'wechat')
    .option('--debug-port <port>', '浏览器调试端口', '9225')
    .action(async (options) => {
        try {
            console.log('🚀 开始发布流程...')
            console.log(`📋 工作流类型: ${options.type}`)
            console.log(`🎯 目标平台: ${options.platform}`)
            console.log(`📄 内容配置: ${options.content}`)
            console.log(`👤 账号配置: ${options.account}`)
            console.log(`🎨 模板配置: ${options.template || '无'}`)

            // 检查文件是否存在
            if (!fs.existsSync(options.content)) {
                throw new Error(`内容配置文件不存在: ${options.content}`)
            }
            if (!fs.existsSync(options.account)) {
                throw new Error(`账号配置文件不存在: ${options.account}`)
            }

            // 读取配置文件
            const content = JSON.parse(fs.readFileSync(options.content, 'utf8'))
            const account = JSON.parse(fs.readFileSync(options.account, 'utf8'))
            const template = options.template && fs.existsSync(options.template) ?
                JSON.parse(fs.readFileSync(options.template, 'utf8')) : {}

            // 🔧 修复：使用新的 UniversalPublisher
            const publisher = new UniversalPublisher({
                debugPort: parseInt(options.debugPort)
            })

            // 🔧 修复：使用新的单平台发布方法
            const result = await publisher.publish(
                options.platform,     // 平台ID
                options.type,         // 工作流类型
                content,              // 内容数据
                template,             // 模板配置
                account               // 账号配置
            )

            console.log('✅ 发布成功!')
            console.log('📊 结果:', {
                platform: options.platform,
                type: result.type || options.type,
                account: account.name || account.id,
                success: result.success,
                message: result.message || '发布完成'
            })

        } catch (error) {
            console.error('❌ 发布失败:', error.message)

            // 提供详细的错误信息和建议
            if (error.message.includes('Cannot find module')) {
                console.error('\n🔧 模块导入错误建议:')
                console.error('1. 检查文件路径是否正确')
                console.error('2. 确保使用 .js 扩展名')
                console.error('3. 验证目标文件是否存在')
            }

            if (error.message.includes('ECONNREFUSED')) {
                console.error('\n🔧 连接错误建议:')
                console.error('1. 检查浏览器是否启动并开启调试端口')
                console.error('2. 确认调试端口号是否正确')
                console.error(`3. 尝试访问: http://localhost:${options.debugPort}/json`)
            }

            process.exit(1)
        }
    })

// 多平台发布命令 - 新增
program
    .command('multi-publish')
    .description('多平台并行发布')
    .requiredOption('-c, --content <file>', '内容配置文件路径')
    .requiredOption('-p, --platforms <platforms>', '平台列表，逗号分隔 (wechat,douyin,xiaohongshu,kuaishou)')
    .requiredOption('-a, --accounts <file>', '账号配置文件路径 (JSON数组)')
    .option('-t, --template <file>', '模板配置文件路径')
    .option('--debug-ports <ports>', '调试端口列表，逗号分隔', '9225,9226,9227,9228')
    .action(async (options) => {
        try {
            console.log('📦 开始多平台并行发布...')

            // 解析参数
            const platforms = options.platforms.split(',').map(p => p.trim())
            const debugPorts = options.debugPorts.split(',').map(p => parseInt(p.trim()))

            // 检查文件
            if (!fs.existsSync(options.content)) {
                throw new Error(`内容配置文件不存在: ${options.content}`)
            }
            if (!fs.existsSync(options.accounts)) {
                throw new Error(`账号配置文件不存在: ${options.accounts}`)
            }

            // 读取配置
            const content = JSON.parse(fs.readFileSync(options.content, 'utf8'))
            const accounts = JSON.parse(fs.readFileSync(options.accounts, 'utf8'))
            const template = options.template && fs.existsSync(options.template) ?
                JSON.parse(fs.readFileSync(options.template, 'utf8')) : {}

            console.log(`📋 目标平台: ${platforms.join(', ')}`)
            console.log(`👥 账号数量: ${accounts.length}`)

            if (platforms.length !== accounts.length) {
                throw new Error(`平台数量(${platforms.length})与账号数量(${accounts.length})不匹配`)
            }

            // 🔧 修复：使用新的 UniversalPublisher
            const publisher = new UniversalPublisher({
                debugPort: debugPorts[0]
            })

            // 🔧 修复：使用新的多平台发布方法
            const result = await publisher.publishMultiPlatform(
                platforms,
                'video',        // 默认视频类型
                content,
                template,
                accounts
            )

            console.log('\n📊 多平台发布结果:')
            result.results.forEach((platformResult, index) => {
                const status = platformResult.success ? '✅' : '❌'
                const platformName = platformResult.platformName || platformResult.platform
                console.log(`${index + 1}. ${status} ${platformName}: ${platformResult.success ? '成功' : platformResult.error}`)
            })

            const successRate = ((result.successCount / result.totalPlatforms) * 100).toFixed(1)
            console.log(`\n📈 成功率: ${result.successCount}/${result.totalPlatforms} (${successRate}%)`)

        } catch (error) {
            console.error('❌ 多平台发布失败:', error.message)
            process.exit(1)
        }
    })

// 测试命令 - 修复版本
program
    .command('test')
    .description('运行自动化测试')
    .option('--platform <platform>', '测试平台', 'wechat')
    .action(async (options) => {
        console.log('🧪 运行自动化测试')

        try {
            // 🔧 修复：使用新的 UniversalPublisher
            const publisher = new UniversalPublisher({
                debugPort: 9225
            })
            console.log('✅ UniversalPublisher 初始化成功')

            // 测试平台配置
            const supportedPlatforms = publisher.getSupportedPlatforms()
            console.log('✅ 支持的平台:', supportedPlatforms)

            // 测试平台配置获取
            const platformConfig = publisher.getPlatformConfig(options.platform)
            if (platformConfig) {
                console.log(`✅ ${options.platform} 平台配置获取成功:`, platformConfig.name)
            } else {
                console.log(`⚠️ ${options.platform} 平台配置不存在`)
            }

            // 测试内容预览
            const testContent = {
                title: '测试视频标题',
                description: '这是一个测试视频的描述内容，用于验证系统功能是否正常工作。',
                location: '北京市'
            }

            const previews = await publisher.previewContent([options.platform], testContent)
            console.log('✅ 内容预览生成成功:', previews.length, '个预览')

            console.log('✅ 所有测试通过')
        } catch (error) {
            console.error('❌ 测试失败:', error.message)
            console.error('详细错误:', error.stack)
            process.exit(1)
        }
    })

// 生成配置文件模板 - 保持原有功能
program
    .command('init')
    .description('生成配置文件模板')
    .option('-t, --type <type>', '工作流类型', 'video')
    .option('-p, --platform <platform>', '目标平台', 'wechat')
    .action((options) => {
        console.log(`📝 生成${options.type}配置文件模板 (${options.platform}平台)...`)

        const templates = {
            video: {
                content: {
                    videoFile: './videos/sample.mp4',
                    title: '精彩视频分享',
                    description: '这是一个精彩的视频内容，记录了美好的瞬间。',
                    location: '北京市朝阳区',
                    tags: ['生活', '分享', '精彩'],
                    hashtags: ['生活记录', '美好瞬间']
                },
                template: {
                    description: '{{description}} - 发布于{{date}} #{{account.name}}'
                },
                account: {
                    id: 'account_001',
                    name: '测试账号',
                    platform: options.platform,
                    debugPort: 9225
                },
                accounts: [
                    { id: 'wechat_001', name: '微信账号1', platform: 'wechat', debugPort: 9225 },
                    { id: 'douyin_001', name: '抖音账号1', platform: 'douyin', debugPort: 9226 },
                    { id: 'xiaohongshu_001', name: '小红书账号1', platform: 'xiaohongshu', debugPort: 9227 },
                    { id: 'kuaishou_001', name: '快手账号1', platform: 'kuaishou', debugPort: 9228 }
                ]
            }
        }

        const template = templates[options.type] || templates.video

        // 生成配置文件
        const files = [
            { name: `${options.type}-content.json`, content: template.content, desc: '内容配置' },
            { name: `${options.type}-template.json`, content: template.template, desc: '模板配置' },
            { name: `${options.type}-account.json`, content: template.account, desc: '单账号配置' },
            { name: `${options.type}-accounts.json`, content: template.accounts, desc: '多账号配置' }
        ]

        files.forEach(file => {
            fs.writeFileSync(file.name, JSON.stringify(file.content, null, 2))
            console.log(`📄 ${file.name} - ${file.desc}`)
        })

        console.log(`\n✅ ${options.type}配置文件模板已生成`)
        console.log('\n🎯 使用示例:')
        console.log(`# 单平台发布`)
        console.log(`node cli/automation-cli.js publish -t ${options.type} -c ${options.type}-content.json -a ${options.type}-account.json --platform ${options.platform}`)
        console.log(`# 多平台发布`)
        console.log(`node cli/automation-cli.js multi-publish -c ${options.type}-content.json -p wechat,douyin -a ${options.type}-accounts.json`)
    })

// 检查系统状态 - 新增命令
program
    .command('status')
    .description('检查系统状态')
    .action(async () => {
        console.log('🔍 检查系统状态...\n')

        try {
            // 检查核心模块
            console.log('📦 检查核心模块...')
            const { UniversalPublisher } = await import('../core/index.js')
            console.log('✅ 核心模块导入成功')

            // 初始化发布器
            const publisher = new UniversalPublisher({ debugPort: 9225 })
            console.log('✅ UniversalPublisher 初始化成功')

            // 检查支持的平台
            const platforms = publisher.getSupportedPlatforms()
            console.log(`✅ 支持的平台: ${platforms.join(', ')}`)

            // 检查配置文件
            console.log('\n📁 检查配置文件...')
            const configFiles = ['video-content.json', 'video-account.json', 'video-template.json']
            configFiles.forEach(file => {
                if (fs.existsSync(file)) {
                    console.log(`✅ ${file} 存在`)
                } else {
                    console.log(`⚠️ ${file} 不存在`)
                }
            })

            console.log('\n✅ 系统状态检查完成')

        } catch (error) {
            console.error('❌ 系统状态检查失败:', error.message)
            process.exit(1)
        }
    })

// 错误处理
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ 未处理的Promise拒绝:', reason)
    process.exit(1)
})

process.on('uncaughtException', (error) => {
    console.error('❌ 未捕获的异常:', error.message)
    process.exit(1)
})

export { program }

// 如果直接运行
if (import.meta.url === `file://${process.argv[1]}`) {
    program.parse()
}