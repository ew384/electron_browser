#!/usr/bin/env node
// automation/cli/automation-cli.js - 修复版本
// 移除硬编码端口依赖，集成动态端口获取

import { Command } from 'commander'
import fs from 'fs'
import path from 'path'

// 🔧 修复：使用正确的导入路径
import { UniversalPublisher } from '../core/index.js'

const program = new Command()

program
    .name('automation-cli')
    .description('多平台自动化发布工具 (动态端口版本)')
    .version('2.0.0-fixed')

// 发布命令 - 修复版本
program
    .command('publish')
    .description('发布内容到指定平台（动态端口）')
    .requiredOption('-t, --type <type>', '工作流类型 (video|article|music|audio)')
    .requiredOption('-c, --content <file>', '内容配置文件路径')
    .requiredOption('-a, --account <file>', '账号配置文件路径')
    .option('-p, --template <file>', '模板配置文件路径')
    .option('--platform <platform>', '目标平台 (wechat|douyin|xiaohongshu|kuaishou)', 'wechat')
    .option('--electron-api <url>', 'Electron API地址', 'http://127.0.0.1:9528')
    .option('--debug-port <port>', '强制指定调试端口（可选，留空则动态获取）')
    .option('--timeout <ms>', '操作超时时间', '15000')
    .action(async (options) => {
        try {
            console.log('🚀 开始发布流程（动态端口版本）...')
            console.log(`📋 工作流类型: ${options.type}`)
            console.log(`🎯 目标平台: ${options.platform}`)
            console.log(`📄 内容配置: ${options.content}`)
            console.log(`👤 账号配置: ${options.account}`)
            console.log(`🎨 模板配置: ${options.template || '无'}`)
            console.log(`🔗 Electron API: ${options.electronApi}`)

            if (options.debugPort) {
                console.log(`🔌 强制端口: ${options.debugPort}`)
            } else {
                console.log(`🔌 端口模式: 动态获取`)
            }

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

            // 🔧 修复：清理账号配置中的硬编码端口
            const cleanAccount = { ...account }
            if (cleanAccount.debugPort) {
                console.log(`⚠️ 移除账号配置中的硬编码端口: ${cleanAccount.debugPort}`)
                delete cleanAccount.debugPort
            }

            // 🔧 修复：使用新的 UniversalPublisher（动态端口版本）
            const publisherConfig = {
                electronApiUrl: options.electronApi,
                timeout: parseInt(options.timeout),
                debugPort: options.debugPort ? parseInt(options.debugPort) : null // null表示动态获取
            }

            console.log('🔧 发布器配置:', publisherConfig)
            const publisher = new UniversalPublisher(publisherConfig)

            // 🔧 修复：使用新的单平台发布方法
            const result = await publisher.publish(
                options.platform,     // 平台ID
                options.type,         // 工作流类型
                content,              // 内容数据
                template,             // 模板配置
                cleanAccount          // 清理后的账号配置
            )

            console.log('✅ 发布成功!')
            console.log('📊 结果:', {
                platform: options.platform,
                type: result.type || options.type,
                account: cleanAccount.name || cleanAccount.id,
                success: result.success,
                message: result.message || '发布完成',
                debugPort: result.debugPort || '动态获取'
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

            if (error.message.includes('无法连接到Chrome调试端口') || error.message.includes('ECONNREFUSED')) {
                console.error('\n🔧 Chrome连接错误建议:')
                console.error('1. 确保 Electron Browser Manager 正在运行')
                console.error('2. 在管理器中启动至少一个浏览器实例')
                console.error('3. 检查 Electron API 是否可访问:', options.electronApi)
                console.error('4. 验证端口是否被防火墙阻止')
            }

            if (error.message.includes('未找到')) {
                console.error('\n🔧 元素查找错误建议:')
                console.error('1. 检查目标网站是否更新了页面结构')
                console.error('2. 更新 platforms.js 中的选择器配置')
                console.error('3. 确保页面完全加载后再执行操作')
            }

            process.exit(1)
        }
    })

// 多平台发布命令 - 修复版本
program
    .command('multi-publish')
    .description('多平台并行发布（动态端口）')
    .requiredOption('-c, --content <file>', '内容配置文件路径')
    .requiredOption('-p, --platforms <platforms>', '平台列表，逗号分隔 (wechat,douyin,xiaohongshu,kuaishou)')
    .requiredOption('-a, --accounts <file>', '账号配置文件路径 (JSON数组)')
    .option('-t, --template <file>', '模板配置文件路径')
    .option('--electron-api <url>', 'Electron API地址', 'http://127.0.0.1:9528')
    .option('--timeout <ms>', '操作超时时间', '15000')
    .action(async (options) => {
        try {
            console.log('📦 开始多平台并行发布（动态端口版本）...')

            // 解析参数
            const platforms = options.platforms.split(',').map(p => p.trim())

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

            // 🔧 修复：清理账号配置中的硬编码端口
            const cleanAccounts = accounts.map(account => {
                const cleanAccount = { ...account }
                if (cleanAccount.debugPort) {
                    console.log(`⚠️ 移除账号 ${cleanAccount.id} 的硬编码端口: ${cleanAccount.debugPort}`)
                    delete cleanAccount.debugPort
                }
                return cleanAccount
            })

            // 🔧 修复：使用新的 UniversalPublisher（动态端口版本）
            const publisher = new UniversalPublisher({
                electronApiUrl: options.electronApi,
                timeout: parseInt(options.timeout)
            })

            // 🔧 修复：使用新的多平台发布方法
            const result = await publisher.publishMultiPlatform(
                platforms,
                'video',        // 默认视频类型
                content,
                template,
                cleanAccounts   // 使用清理后的账号配置
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
    .description('运行自动化测试（动态端口）')
    .option('--platform <platform>', '测试平台', 'wechat')
    .option('--electron-api <url>', 'Electron API地址', 'http://127.0.0.1:9528')
    .action(async (options) => {
        console.log('🧪 运行自动化测试（动态端口版本）')

        try {
            // 🔧 修复：使用新的 UniversalPublisher（动态端口版本）
            const publisher = new UniversalPublisher({
                electronApiUrl: options.electronApi
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

            // 🔧 新增：测试动态端口获取
            console.log('\n🔍 测试动态端口获取...')
            const debugInfo = await publisher.chromeController.getDebugInfo()
            console.log('📊 系统状态:', debugInfo)

            console.log('✅ 所有测试通过')
        } catch (error) {
            console.error('❌ 测试失败:', error.message)
            console.error('详细错误:', error.stack)

            if (error.message.includes('无法连接') || error.message.includes('API不可用')) {
                console.error('\n💡 测试失败建议:')
                console.error('1. 确保 Electron Browser Manager 正在运行')
                console.error('2. 检查 Electron API 地址:', options.electronApi)
                console.error('3. 启动至少一个浏览器实例')
            }

            process.exit(1)
        }
    })

// 生成配置文件模板 - 修复版本
program
    .command('init')
    .description('生成配置文件模板（无硬编码端口）')
    .option('-t, --type <type>', '工作流类型', 'video')
    .option('-p, --platform <platform>', '目标平台', 'wechat')
    .action((options) => {
        console.log(`📝 生成${options.type}配置文件模板 (${options.platform}平台)...`)

        const templates = {
            video: {
                content: {
                    videoFile: './videos/sample.mp4',
                    title: '精彩视频分享',
                    description: '这是一个精彩的视频内容，记录了美好的瞬间。包含了生活中的点点滴滴，值得分享给大家。',
                    location: '北京市朝阳区',
                    tags: ['生活', '分享', '精彩'],
                    hashtags: ['生活记录', '美好瞬间']
                },
                template: {
                    description: '{{description}} - 发布于{{date}} #{{account.name}}'
                },
                // 🔧 修复：移除硬编码端口
                account: {
                    id: 'account_001',
                    name: '测试账号',
                    platform: options.platform
                    // debugPort 已移除，系统将动态获取
                },
                // 🔧 修复：清理多账号配置中的硬编码端口
                accounts: [
                    {
                        id: 'wechat_001',
                        name: '微信账号1',
                        platform: 'wechat'
                        // debugPort 已移除
                    },
                    {
                        id: 'douyin_001',
                        name: '抖音账号1',
                        platform: 'douyin'
                        // debugPort 已移除
                    },
                    {
                        id: 'xiaohongshu_001',
                        name: '小红书账号1',
                        platform: 'xiaohongshu'
                        // debugPort 已移除
                    },
                    {
                        id: 'kuaishou_001',
                        name: '快手账号1',
                        platform: 'kuaishou'
                        // debugPort 已移除
                    }
                ]
            }
        }

        const template = templates[options.type] || templates.video

        // 生成配置文件
        const files = [
            { name: `${options.type}-content.json`, content: template.content, desc: '内容配置' },
            { name: `${options.type}-template.json`, content: template.template, desc: '模板配置' },
            { name: `${options.type}-account.json`, content: template.account, desc: '单账号配置（无硬编码端口）' },
            { name: `${options.type}-accounts.json`, content: template.accounts, desc: '多账号配置（无硬编码端口）' }
        ]

        files.forEach(file => {
            fs.writeFileSync(file.name, JSON.stringify(file.content, null, 2))
            console.log(`📄 ${file.name} - ${file.desc}`)
        })

        console.log(`\n✅ ${options.type}配置文件模板已生成（动态端口版本）`)
        console.log('\n📋 重要说明:')
        console.log('• 所有端口配置已移除，系统将自动从 Electron Browser Manager 获取')
        console.log('• 请确保 Electron Browser Manager 在端口 9528 运行')
        console.log('• 在执行前请启动至少一个浏览器实例')

        console.log('\n🎯 使用示例:')
        console.log(`# 单平台发布（动态端口）`)
        console.log(`node cli/automation-cli.js publish -t ${options.type} -c ${options.type}-content.json -a ${options.type}-account.json --platform ${options.platform}`)
        console.log(`# 多平台发布（动态端口）`)
        console.log(`node cli/automation-cli.js multi-publish -c ${options.type}-content.json -p wechat,douyin -a ${options.type}-accounts.json`)
        console.log(`# 测试连接`)
        console.log(`node cli/automation-cli.js test --platform ${options.platform}`)
    })

// 检查系统状态 - 修复版本
program
    .command('status')
    .description('检查系统状态（动态端口版本）')
    .option('--electron-api <url>', 'Electron API地址', 'http://127.0.0.1:9528')
    .action(async (options) => {
        console.log('🔍 检查系统状态（动态端口版本）...\n')

        try {
            // 检查核心模块
            console.log('📦 检查核心模块...')
            const { UniversalPublisher } = await import('../core/index.js')
            console.log('✅ 核心模块导入成功')

            // 初始化发布器
            const publisher = new UniversalPublisher({
                electronApiUrl: options.electronApi
            })
            console.log('✅ UniversalPublisher 初始化成功')

            // 检查支持的平台
            const platforms = publisher.getSupportedPlatforms()
            console.log(`✅ 支持的平台: ${platforms.join(', ')}`)

            // 🔧 新增：检查 Electron API 连接
            console.log('\n🔗 检查 Electron API 连接...')
            const debugInfo = await publisher.chromeController.getDebugInfo()

            console.log(`📡 API状态: ${debugInfo.apiAvailable ? '✅ 可用' : '❌ 不可用'}`)
            console.log(`🔗 API地址: ${debugInfo.apiEndpoint || options.electronApi}`)
            console.log(`🌐 浏览器实例: ${debugInfo.browsersCount || 0} 个`)
            console.log(`🟢 运行中实例: ${debugInfo.runningBrowsers || 0} 个`)

            if (debugInfo.availablePorts && debugInfo.availablePorts.length > 0) {
                console.log('\n🔌 可用端口:')
                debugInfo.availablePorts.forEach(port => {
                    console.log(`   ${port.accountId}: ${port.port} (${port.status})`)
                })
            } else {
                console.log('\n⚠️ 没有可用的浏览器端口')
                console.log('💡 建议: 在 Electron Browser Manager 中启动浏览器实例')
            }

            // 检查配置文件
            console.log('\n📁 检查配置文件...')
            const configFiles = ['video-content.json', 'video-account.json', 'video-template.json']
            configFiles.forEach(file => {
                if (fs.existsSync(file)) {
                    console.log(`✅ ${file} 存在`)

                    // 🔧 新增：检查配置文件中是否还有硬编码端口
                    if (file.includes('account')) {
                        try {
                            const accountData = JSON.parse(fs.readFileSync(file, 'utf8'))
                            const hasDebugPort = Array.isArray(accountData)
                                ? accountData.some(acc => acc.debugPort)
                                : accountData.debugPort

                            if (hasDebugPort) {
                                console.log(`⚠️ ${file} 包含硬编码端口，建议重新生成`)
                            }
                        } catch (error) {
                            console.log(`⚠️ ${file} 格式错误`)
                        }
                    }
                } else {
                    console.log(`⚠️ ${file} 不存在 (运行 'init' 命令生成)`)
                }
            })

            console.log('\n✅ 系统状态检查完成')

            // 🔧 新增：提供改进建议
            if (!debugInfo.apiAvailable) {
                console.log('\n💡 改进建议:')
                console.log('1. 启动 Electron Browser Manager')
                console.log('2. 确保 API 端口 9528 未被占用')
                console.log('3. 检查防火墙设置')
            } else if (debugInfo.runningBrowsers === 0) {
                console.log('\n💡 改进建议:')
                console.log('1. 在 Electron Browser Manager 中创建账号')
                console.log('2. 启动至少一个浏览器实例')
                console.log('3. 确保实例状态为"运行中"')
            }

        } catch (error) {
            console.error('❌ 系统状态检查失败:', error.message)

            if (error.message.includes('Cannot find module')) {
                console.error('\n💡 模块问题建议:')
                console.error('1. 运行 npm install 安装依赖')
                console.error('2. 检查文件路径是否正确')
                console.error('3. 确保在正确的目录执行命令')
            }

            process.exit(1)
        }
    })

// 🔧 新增：端口诊断命令
program
    .command('diagnose')
    .description('诊断端口连接问题')
    .option('--electron-api <url>', 'Electron API地址', 'http://127.0.0.1:9528')
    .option('--port-range <range>', '检测端口范围', '9711-9720')
    .action(async (options) => {
        console.log('🔍 开始端口诊断...\n')

        try {
            // 解析端口范围
            const [startPort, endPort] = options.portRange.split('-').map(p => parseInt(p.trim()))

            console.log(`🔌 检测端口范围: ${startPort}-${endPort}`)

            // 检测每个端口
            const results = []
            for (let port = startPort; port <= endPort; port++) {
                try {
                    const response = await fetch(`http://localhost:${port}/json/version`, {
                        timeout: 2000
                    })

                    if (response.ok) {
                        const version = await response.json()
                        results.push({
                            port,
                            status: '✅ 可用',
                            browser: version.Browser,
                            version: version['Browser']
                        })
                    } else {
                        results.push({
                            port,
                            status: '❌ 响应错误',
                            error: `HTTP ${response.status}`
                        })
                    }
                } catch (error) {
                    results.push({
                        port,
                        status: '❌ 连接失败',
                        error: error.message.includes('ECONNREFUSED') ? '端口未开放' : error.message
                    })
                }
            }

            // 显示结果
            console.log('\n📊 端口检测结果:')
            results.forEach(result => {
                console.log(`   ${result.port}: ${result.status}`)
                if (result.browser) {
                    console.log(`      浏览器: ${result.browser}`)
                } else if (result.error) {
                    console.log(`      错误: ${result.error}`)
                }
            })

            const availablePorts = results.filter(r => r.status.includes('✅'))
            console.log(`\n📈 统计: ${availablePorts.length}/${results.length} 个端口可用`)

            // 检查 Electron API
            console.log('\n🔗 检查 Electron API...')
            try {
                const apiResponse = await fetch(`${options.electronApi}/api/health`, {
                    timeout: 3000
                })

                if (apiResponse.ok) {
                    console.log('✅ Electron API 可用')

                    // 获取 API 中的浏览器信息
                    const browsersResponse = await fetch(`${options.electronApi}/api/browsers`)
                    if (browsersResponse.ok) {
                        const browsersData = await browsersResponse.json()
                        console.log(`📱 API中的浏览器实例: ${browsersData.browsers?.length || 0} 个`)

                        browsersData.browsers?.forEach(browser => {
                            console.log(`   ${browser.accountId}: 端口 ${browser.debugPort} (${browser.status})`)
                        })
                    }
                } else {
                    console.log('❌ Electron API 不可用')
                }
            } catch (error) {
                console.log(`❌ Electron API 连接失败: ${error.message}`)
            }

            console.log('\n✅ 诊断完成')

        } catch (error) {
            console.error('❌ 诊断失败:', error.message)
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