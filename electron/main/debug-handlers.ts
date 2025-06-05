// electron/main/debug-handlers.ts
import { ipcMain } from 'electron'
import { StandalonePageAnalyzer, analyzePageByAccountId } from '../../tools/page-analyzer/index.js'

/**
 * 为Electron主进程添加页面分析器调试功能
 */
export class DebugHandlers {
    private windowManager: any
    private analyzer: StandalonePageAnalyzer

    constructor(windowManager: any) {
        this.windowManager = windowManager
        this.analyzer = new StandalonePageAnalyzer()
        this.setupHandlers()
    }

    private setupHandlers() {
        // 开发者工具：分析页面元素
        ipcMain.handle('dev:analyze-page', async (event, accountId: string) => {
            try {
                console.log(`[DebugHandlers] 开始分析账号 ${accountId} 的页面`)

                const result = await analyzePageByAccountId(accountId, this.windowManager)

                return {
                    success: true,
                    data: result,
                    message: '页面分析完成'
                }
            } catch (error) {
                console.error('[DebugHandlers] 页面分析失败:', error)
                return {
                    success: false,
                    error: error.message
                }
            }
        })

        // 获取所有运行中的浏览器实例
        ipcMain.handle('dev:get-running-browsers', async () => {
            try {
                const instances = this.windowManager.getAllInstances()
                const runningInstances = instances.filter((instance: any) => instance.status === 'running')

                return {
                    success: true,
                    data: runningInstances.map((instance: any) => ({
                        accountId: instance.accountId,
                        status: instance.status,
                        url: instance.url,
                        debugPort: this.windowManager.getChromeDebugPort(instance.accountId)
                    }))
                }
            } catch (error) {
                return {
                    success: false,
                    error: error.message
                }
            }
        })

        // 获取指定账号的调试端口
        ipcMain.handle('dev:get-debug-port', async (event, accountId: string) => {
            try {
                const port = this.windowManager.getChromeDebugPort(accountId)

                if (!port) {
                    return {
                        success: false,
                        error: '未找到调试端口，请确保浏览器实例正在运行'
                    }
                }

                return {
                    success: true,
                    data: { accountId, debugPort: port }
                }
            } catch (error) {
                return {
                    success: false,
                    error: error.message
                }
            }
        })
    }
}

// tools/page-analyzer/package.json
{
    "name": "page-analyzer",
        "version": "1.0.0",
            "type": "module",
                "description": "独立页面元素分析器",
                    "main": "index.js",
                        "scripts": {
        "analyze": "node index.js",
            "test": "node test.js"
    },
    "dependencies": {
        "ws": "^8.14.2",
            "node-fetch": "^3.3.2"
    },
    "devDependencies": {
        "@types/ws": "^8.5.8"
    }
}

// tools/page-analyzer/cli.js
#!/usr/bin / env node

import { analyzePageByPort } from './index.js'
import { program } from 'commander'

program
    .name('page-analyzer')
    .description('页面元素分析器CLI工具')
    .version('1.0.0')

program
    .command('analyze')
    .description('分析指定调试端口的页面')
    .argument('<port>', 'Chrome调试端口')
    .option('-o, --output <dir>', '输出目录', './output')
    .option('-t, --timeout <ms>', '超时时间(毫秒)', '30000')
    .action(async (port, options) => {
        try {
            console.log(`🔍 正在分析端口 ${port} 的页面...`)

            const result = await analyzePageByPort(parseInt(port), {
                timeout: parseInt(options.timeout)
            })

            console.log('✅ 分析完成!')
            console.log(`📊 平台: ${result.summary.platformName}`)
            console.log(`🎯 找到元素: ${result.summary.foundElements}/${result.summary.totalElements}`)
            console.log(`📈 置信度: ${result.summary.confidence}%`)

            if (result.extensionCode) {
                console.log('📦 Chrome扩展代码已生成')
            }

        } catch (error) {
            console.error('❌ 分析失败:', error.message)
            process.exit(1)
        }
    })

program
    .command('list-tabs')
    .description('列出指定端口的所有标签页')
    .argument('<port>', 'Chrome调试端口')
    .action(async (port) => {
        try {
            const response = await fetch(`http://localhost:${port}/json`)
            const tabs = await response.json()

            console.log(`📑 端口 ${port} 的标签页列表:`)
            tabs.forEach((tab, index) => {
                console.log(`  ${index + 1}. ${tab.title}`)
                console.log(`     URL: ${tab.url}`)
                console.log(`     类型: ${tab.type}`)
                console.log('')
            })
        } catch (error) {
            console.error('❌ 获取标签页失败:', error.message)
            process.exit(1)
        }
    })

program.parse()

// tools/page-analyzer/README.md
# 页面元素分析器

独立的页面元素分析工具，用于自动检测网页元素并生成Chrome扩展代码。

## 功能特性

    - 🎯 ** 智能元素检测 **: 自动识别上传按钮、输入框、提交按钮等关键元素
        - 🏷️ ** 多平台支持 **: 内置微信视频号、抖音、YouTube等平台配置
            - 🔧 ** 选择器生成 **: 生成稳定可靠的CSS选择器和XPath
                - 📦 ** 扩展代码生成 **: 一键生成完整的Chrome扩展项目
                    - 🔌 ** CDP协议 **: 基于Chrome DevTools Protocol，无需额外依赖

## 安装使用

### 1. 作为模块使用

\`\`\`javascript
import { analyzePageByPort, StandalonePageAnalyzer } from './index.js'

// 分析指定调试端口的页面
const result = await analyzePageByPort(9222)
console.log('分析结果:', result)

// 或者使用类实例
const analyzer = new StandalonePageAnalyzer()
const result = await analyzer.analyzeByDebugPort(9222)
\`\`\`

### 2. 命令行使用

\`\`\`bash
# 安装依赖
npm install

# 分析页面
node cli.js analyze 9222

# 列出标签页
node cli.js list-tabs 9222

# 查看帮助
node cli.js --help
\`\`\`

### 3. 集成到Electron项目

在Electron主进程中集成调试功能：

\`\`\`typescript
import { DebugHandlers } from './debug-handlers'

// 在窗口管理器初始化后
const debugHandlers = new DebugHandlers(windowManager)
\`\`\`

然后在渲染进程中调用：

\`\`\`javascript
// 分析页面
const result = await window.electronAPI.invoke('dev:analyze-page', accountId)

// 获取调试端口
const portInfo = await window.electronAPI.invoke('dev:get-debug-port', accountId)
\`\`\`

## 工作流程

1. **连接浏览器**: 通过Chrome调试端口连接到浏览器实例
2. **注入脚本**: 向页面注入分析脚本
3. **检测平台**: 根据URL自动识别平台类型
4. **元素分析**: 使用预定义规则查找关键元素
5. **生成选择器**: 为每个元素生成多种类型的选择器
6. **生成扩展**: 基于分析结果生成Chrome扩展代码
7. **保存结果**: 将结果保存为JSON和扩展项目文件

## 输出结果

### 分析报告 (JSON)
\`\`\`json
{
  "url": "https://channels.weixin.qq.com/platform/post/create",
  "title": "视频号创作者平台",
  "platform": "channels.weixin.qq.com",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "elements": {
    "uploadButton": {
      "found": true,
      "description": "视频上传按钮",
      "element": {
        "tagName": "input",
        "xpath": "//input[@type='file']",
        "cssSelector": "input[type='file']",
        "uniqueSelector": "[data-testid='upload-input']"
      }
    }
  },
  "summary": {
    "totalElements": 5,
    "foundElements": 4,
    "platformName": "微信视频号",
    "confidence": 80
  }
}
\`\`\`

### Chrome扩展项目
- `manifest.json` - 扩展清单文件
- `content.js` - 内容脚本，提供自动化API
- `popup.html` - 弹窗界面
- `popup.js` - 弹窗脚本

## 配置平台

可以通过修改 `loadPlatformConfigs()` 方法添加新平台：

\`\`\`javascript
'your-platform.com': {
  name: '你的平台',
  patterns: [/your-platform\.com/],
  elements: {
    uploadButton: {
      selectors: ['.your-upload-btn'],
      description: '上传按钮',
      priority: 'high'
    }
  }
}
\`\`\`

## 注意事项

- 确保Chrome浏览器启用了远程调试功能
- 分析器需要在页面完全加载后运行
- 生成的选择器可能随页面更新而失效，建议定期重新分析
- 仅用于开发和测试目的，请遵守目标网站的使用条款

## 故障排除

### 连接失败
- 检查Chrome调试端口是否正确
- 确认浏览器实例正在运行
- 验证防火墙设置

### 元素检测失败
- 页面可能尚未完全加载
- 元素可能是动态生成的
- 需要更新平台配置中的选择器

### 扩展安装失败
- 检查manifest.json格式
- 确认权限配置正确
- 使用Chrome开发者模式加载扩展

// tools/page-analyzer/test.js
import { analyzePageByPort } from './index.js'
import { spawn } from 'child_process'

/**
 * 测试脚本
 */
async function runTests() {
  console.log('🧪 开始页面分析器测试...')
  
  // 启动一个测试用的Chrome实例
  const chrome = spawn('google-chrome', [
    '--remote-debugging-port=9333',
    '--user-data-dir=/tmp/test-chrome',
    '--no-first-run',
    'https://channels.weixin.qq.com/platform/post/create'
  ], { detached: true })
  
  // 等待Chrome启动
  await new Promise(resolve => setTimeout(resolve, 3000))
  
  try {
    console.log('📊 正在分析微信视频号页面...')
    const result = await analyzePageByPort(9333, { timeout: 15000 })
    
    console.log('✅ 测试通过!')
    console.log(`平台: ${ result.summary.platformName } `)
    console.log(`元素检测: ${ result.summary.foundElements } /${result.summary.totalElements}`)
console.log(`置信度: ${result.summary.confidence}%`)

// 验证关键元素
const expectedElements = ['uploadButton', 'titleInput', 'publishButton']
const foundElements = Object.keys(result.elements).filter(name =>
    result.elements[name].found && expectedElements.includes(name)
)

console.log(`关键元素: ${foundElements.join(', ')}`)

if (foundElements.length >= 2) {
    console.log('✅ 测试成功: 找到足够的关键元素')
} else {
    console.log('⚠️  测试警告: 找到的关键元素较少')
}
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message)
} finally {
    // 清理
    chrome.kill()
    console.log('🧹 清理完成')
}
}

runTests()