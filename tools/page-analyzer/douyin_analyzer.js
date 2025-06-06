import WebSocket from 'ws'
import fetch from 'node-fetch'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export class DouyinCreatorAnalyzer {
    constructor() {
        this.elements = {
            // 顶部标签页切换
            tabContainer: {
                selectors: [
                    'div.tab-container-DjaX1b',
                    'div[class*="tab-container"]',
                    '.tab-container'
                ],
                description: '标签页容器',
                priority: 'critical'
            },

            videoTab: {
                selectors: [
                    'div.tab-item-BcCLTS:nth-child(1)',
                    'div[class*="tab-item"]:contains("发布视频")',
                    '.tab-item-BcCLTS:first-child'
                ],
                description: '发布视频标签页',
                priority: 'critical'
            },

            imageTextTab: {
                selectors: [
                    'div.tab-item-BcCLTS:nth-child(2)',
                    'div[class*="tab-item"]:contains("发布图文")',
                    '.tab-item-BcCLTS:nth-child(2)'
                ],
                description: '发布图文标签页',
                priority: 'critical'
            },

            panoramaTab: {
                selectors: [
                    'div.tab-item-BcCLTS:nth-child(3)',
                    'div[class*="tab-item"]:contains("发布全景视频")',
                    '.tab-item-BcCLTS:nth-child(3)'
                ],
                description: '发布全景视频标签页',
                priority: 'critical'
            },

            activeTab: {
                selectors: [
                    'div.tab-item-BcCLTS.active-i8Pu0m',
                    'div[class*="tab-item"][class*="active"]',
                    '.tab-item-BcCLTS.active-i8Pu0m'
                ],
                description: '当前激活的标签页',
                priority: 'high'
            },

            // 上传按钮（不同内容类型）
            uploadButton: {
                selectors: [
                    'button.container-drag-btn-k6XmB4',
                    'button[class*="container-drag-btn"]',
                    'button.semi-button-primary[class*="drag-btn"]'
                ],
                description: '上传按钮',
                priority: 'critical'
            },

            uploadVideoButton: {
                selectors: [
                    'button:contains("上传视频")',
                    'button .semi-button-content-right:contains("上传视频")',
                    'button[class*="drag-btn"] span:contains("上传视频")'
                ],
                description: '上传视频按钮',
                priority: 'critical'
            },

            uploadImageButton: {
                selectors: [
                    'button:contains("上传图文")',
                    'button .semi-button-content-right:contains("上传图文")',
                    'button[class*="drag-btn"] span:contains("上传图文")'
                ],
                description: '上传图文按钮',
                priority: 'critical'
            },

            uploadPanoramaButton: {
                selectors: [
                    'button:contains("上传全景视频")',
                    'button .semi-button-content-right:contains("上传全景视频")',
                    'button[class*="drag-btn"] span:contains("上传全景视频")'
                ],
                description: '上传全景视频按钮',
                priority: 'critical'
            },

            // 文件输入和拖拽区域
            fileInput: {
                selectors: [
                    'input[type="file"]',
                    'input[accept*="video"]',
                    'input[accept*="image"]'
                ],
                description: '文件选择输入框',
                priority: 'critical'
            },

            dragArea: {
                selectors: [
                    'div[class*="drag-area"]',
                    'div[class*="upload-area"]',
                    'div[class*="drop-zone"]'
                ],
                description: '拖拽上传区域',
                priority: 'high'
            },

            // 内容描述和标题
            titleInput: {
                selectors: [
                    'input[placeholder*="填写作品标题"]',
                    'input[placeholder*="标题"]',
                    'textarea[placeholder*="标题"]'
                ],
                description: '作品标题输入框',
                priority: 'high'
            },

            descriptionInput: {
                selectors: [
                    'textarea[placeholder*="添加作品描述"]',
                    'textarea[placeholder*="描述"]',
                    'div[contenteditable="true"][placeholder*="描述"]'
                ],
                description: '作品描述输入框',
                priority: 'high'
            },

            // 发布设置
            publishButton: {
                selectors: [
                    'button:contains("发布")',
                    'button[class*="publish"]',
                    'button.semi-button:contains("发布")'
                ],
                description: '发布按钮',
                priority: 'critical'
            },

            draftButton: {
                selectors: [
                    'button:contains("存草稿")',
                    'button[class*="draft"]',
                    'button:contains("保存草稿")'
                ],
                description: '存草稿按钮',
                priority: 'medium'
            },

            // 封面设置
            coverUpload: {
                selectors: [
                    'div[class*="cover-upload"]',
                    'button:contains("上传封面")',
                    'div[class*="poster-upload"]'
                ],
                description: '封面上传区域',
                priority: 'medium'
            },

            // 标签和话题
            tagInput: {
                selectors: [
                    'input[placeholder*="添加话题"]',
                    'input[placeholder*="话题"]',
                    'div[class*="tag-input"]'
                ],
                description: '话题标签输入框',
                priority: 'medium'
            },

            // 位置信息
            locationInput: {
                selectors: [
                    'input[placeholder*="添加位置"]',
                    'input[placeholder*="位置"]',
                    'div[class*="location-input"]'
                ],
                description: '位置信息输入框',
                priority: 'low'
            },

            // 隐私设置
            privacySettings: {
                selectors: [
                    'div[class*="privacy-setting"]',
                    'div[class*="visible-setting"]',
                    'select[class*="privacy"]'
                ],
                description: '隐私设置选项',
                priority: 'medium'
            },

            // 学习链接
            learnLink: {
                selectors: [
                    'a.learn-link-cmfbHv',
                    'a[class*="learn-link"]',
                    'a[href*="creator-school"]'
                ],
                description: '学习更多链接',
                priority: 'low'
            }
        }

        this.outputDir = path.join(__dirname, 'output')
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true })
        }
    }

    async analyze(debugPort) {
        console.log(`[抖音创作者分析器] 连接端口: ${debugPort}`)

        try {
            const response = await fetch(`http://localhost:${debugPort}/json`)
            const tabs = await response.json()

            const douyinTab = tabs.find(tab =>
                (tab.url.includes('creator.douyin.com') || tab.url.includes('douyin.com')) &&
                tab.type === 'page'
            )

            if (!douyinTab) {
                throw new Error('未找到抖音创作者中心标签页')
            }

            console.log(`[抖音创作者分析器] 分析页面: ${douyinTab.url}`)

            const result = await this.analyzeTab(douyinTab)
            const outputFile = this.saveResult(result)

            console.log(`[抖音创作者分析器] 结果保存至: ${outputFile}`)
            return result

        } catch (error) {
            console.error(`[抖音创作者分析器] 错误:`, error.message)
            throw error
        }
    }

    async analyzeTab(tab) {
        return new Promise((resolve, reject) => {
            const ws = new WebSocket(tab.webSocketDebuggerUrl)
            let messageId = 1

            const timeout = setTimeout(() => {
                ws.close()
                reject(new Error('分析超时'))
            }, 30000)

            ws.on('open', () => {
                console.log('[抖音创作者分析器] WebSocket连接成功')

                ws.send(JSON.stringify({
                    id: messageId++,
                    method: 'Runtime.enable'
                }))

                const script = this.createAnalysisScript()
                ws.send(JSON.stringify({
                    id: messageId,
                    method: 'Runtime.evaluate',
                    params: {
                        expression: script,
                        awaitPromise: true,
                        returnByValue: true
                    }
                }))
            })

            ws.on('message', (data) => {
                const message = JSON.parse(data)

                if (message.id === messageId && message.result) {
                    clearTimeout(timeout)

                    if (message.result.result && message.result.result.value) {
                        resolve(message.result.result.value)
                    } else if (message.result.exceptionDetails) {
                        reject(new Error(message.result.exceptionDetails.text))
                    } else {
                        reject(new Error('分析脚本执行失败'))
                    }

                    ws.close()
                }
            })

            ws.on('error', (error) => {
                clearTimeout(timeout)
                reject(error)
            })
        })
    }

    createAnalysisScript() {
        const elements = JSON.stringify(this.elements)

        return `
(async function() {
  console.log('[抖音创作者分析器] 开始页面分析');
  
  const elements = ${elements};
  
  // 等待页面加载完成
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  const result = {
    url: window.location.href,
    timestamp: new Date().toISOString(),
    platform: 'douyin',
    elements: {},
    pageInfo: {
      title: document.title,
      currentTab: null,
      uploadType: null
    }
  };
  
  // 检测当前激活的标签页
  function detectCurrentTab() {
    const activeTab = document.querySelector('div[class*="tab-item"][class*="active"]');
    if (activeTab) {
      const text = activeTab.textContent.trim();
      if (text.includes('视频')) return 'video';
      if (text.includes('图文')) return 'imageText';
      if (text.includes('全景')) return 'panorama';
    }
    return 'unknown';
  }
  
  result.pageInfo.currentTab = detectCurrentTab();
  result.pageInfo.uploadType = result.pageInfo.currentTab;
  
  function findElement(config) {
    for (const selector of config.selectors) {
      try {
        // 处理包含 :contains() 的选择器
        if (selector.includes(':contains(')) {
          const match = selector.match(/^(.+):contains\\("(.+)"\\)$/);
          if (match) {
            const [, baseSelector, text] = match;
            const elements = document.querySelectorAll(baseSelector || '*');
            for (const element of elements) {
              if (element.textContent && element.textContent.includes(text)) {
                return createElementInfo(element, selector);
              }
            }
          }
          continue;
        }
        
        const element = document.querySelector(selector);
        if (element) {
          return createElementInfo(element, selector);
        }
      } catch (error) {
        console.warn('选择器错误:', selector, error);
      }
    }
    return { found: false };
  }
  
  function createElementInfo(element, selector) {
    return {
      found: true,
      selector: selector,
      element: {
        tagName: element.tagName.toLowerCase(),
        className: element.className || '',
        id: element.id || '',
        textContent: element.textContent ? element.textContent.trim().slice(0, 100) : '',
        placeholder: element.placeholder || '',
        type: element.type || '',
        accept: element.accept || '',
        disabled: element.disabled || false,
        visible: isVisible(element),
        cssSelector: generateSelector(element),
        attributes: getRelevantAttributes(element)
      }
    };
  }
  
  function isVisible(element) {
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' && 
           style.visibility !== 'hidden' && 
           parseFloat(style.opacity) > 0 &&
           rect.width > 0 && 
           rect.height > 0;
  }
  
  function generateSelector(element) {
    if (element.id) {
      return '#' + element.id;
    }
    
    if (element.className) {
      const classes = element.className.split(' ').filter(c => c.trim()).slice(0, 3);
      if (classes.length > 0) {
        return '.' + classes.join('.');
      }
    }
    
    const tagName = element.tagName.toLowerCase();
    
    if (element.type) {
      return tagName + '[type="' + element.type + '"]';
    }
    
    if (element.placeholder) {
      return tagName + '[placeholder*="' + element.placeholder.slice(0, 20) + '"]';
    }
    
    return tagName;
  }
  
  function getRelevantAttributes(element) {
    const attrs = {};
    const relevantAttrs = ['data-testid', 'role', 'aria-label', 'name', 'value'];
    
    relevantAttrs.forEach(attr => {
      if (element.hasAttribute(attr)) {
        attrs[attr] = element.getAttribute(attr);
      }
    });
    
    return attrs;
  }
  
  // 分析所有元素
  for (const [name, config] of Object.entries(elements)) {
    console.log('查找:', name, '(' + config.description + ')');
    
    const elementResult = findElement(config);
    result.elements[name] = {
      ...elementResult,
      description: config.description,
      priority: config.priority,
      expectedSelectors: config.selectors
    };
    
    if (elementResult.found) {
      console.log('✅ 找到', name + ':', elementResult.element.cssSelector);
      if (elementResult.element.textContent) {
        console.log('   文本:', elementResult.element.textContent);
      }
    } else {
      console.log('❌ 未找到', name);
    }
  }
  
  // 统计分析结果
  const foundCount = Object.values(result.elements).filter(e => e.found).length;
  const totalCount = Object.keys(result.elements).length;
  const criticalCount = Object.values(result.elements).filter(e => e.priority === 'critical').length;
  const foundCritical = Object.values(result.elements).filter(e => e.found && e.priority === 'critical').length;
  
  result.summary = {
    foundElements: foundCount,
    totalElements: totalCount,
    criticalElements: criticalCount,
    foundCriticalElements: foundCritical,
    confidence: totalCount > 0 ? Math.round((foundCount / totalCount) * 100) : 0,
    criticalConfidence: criticalCount > 0 ? Math.round((foundCritical / criticalCount) * 100) : 0,
    readyForAutomation: foundCritical >= 3, // 至少需要找到3个关键元素
    currentUploadType: result.pageInfo.currentTab,
    platformReady: foundCritical >= 3 && foundCount >= Math.floor(totalCount * 0.6)
  };
  
  console.log('抖音创作者分析完成:', result.summary);
  return result;
})()
    `;
    }

    saveResult(result) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
        const filename = `douyin-analysis-${timestamp}.json`
        const filepath = path.join(this.outputDir, filename)

        fs.writeFileSync(filepath, JSON.stringify(result, null, 2))
        return filepath
    }
}

export async function analyzeDouyinCreator(debugPort) {
    const analyzer = new DouyinCreatorAnalyzer()
    return await analyzer.analyze(debugPort)
}

// 命令行运行
if (import.meta.url === `file://${process.argv[1]}`) {
    const port = process.argv[2] || 9223

    analyzeDouyinCreator(parseInt(port))
        .then(result => {
            console.log('\n🎉 抖音创作者分析完成!')
            console.log(`🏠 当前页面: ${result.url}`)
            console.log(`📋 当前标签: ${result.pageInfo.currentTab}`)
            console.log(`🎯 找到元素: ${result.summary.foundElements}/${result.summary.totalElements}`)
            console.log(`⭐ 关键元素: ${result.summary.foundCriticalElements}/${result.summary.criticalElements}`)
            console.log(`📈 整体置信度: ${result.summary.confidence}%`)
            console.log(`🔥 关键置信度: ${result.summary.criticalConfidence}%`)
            console.log(`🤖 自动化就绪: ${result.summary.readyForAutomation ? '是' : '否'}`)
            console.log(`🚀 平台就绪: ${result.summary.platformReady ? '是' : '否'}`)

            console.log('\n📋 元素详情:')

            const priorities = ['critical', 'high', 'medium', 'low']
            priorities.forEach(priority => {
                const priorityElements = Object.entries(result.elements).filter(([, el]) => el.priority === priority)

                if (priorityElements.length > 0) {
                    const icon = { critical: '🔴', high: '🟠', medium: '🟡', low: '🔵' }[priority]
                    console.log(`\n${icon} ${priority.toUpperCase()}:`)

                    priorityElements.forEach(([name, element]) => {
                        const status = element.found ? '✅' : '❌'

                        if (element.found) {
                            console.log(`  ${status} ${element.description}`)
                            console.log(`      选择器: ${element.element.cssSelector}`)
                            console.log(`      标签: <${element.element.tagName}>`)
                            if (element.element.className) {
                                console.log(`      类名: ${element.element.className.split(' ').slice(0, 2).join(' ')}`)
                            }
                            if (element.element.placeholder) {
                                console.log(`      提示: ${element.element.placeholder}`)
                            }
                            if (element.element.textContent) {
                                console.log(`      文本: ${element.element.textContent.slice(0, 50)}`)
                            }
                            console.log(`      可见: ${element.element.visible ? '是' : '否'}`)
                        } else {
                            console.log(`  ${status} ${element.description}: 未找到`)
                        }
                    })
                }
            })

            if (result.summary.readyForAutomation) {
                console.log('\n🚀 自动化建议:')
                console.log('  ✅ 页面已准备好进行自动化操作')
                console.log('  ✅ 可以基于检测到的选择器开发Chrome扩展')
                console.log(`  📝 当前上传类型: ${result.pageInfo.currentTab}`)

                const criticalElements = Object.entries(result.elements)
                    .filter(([, el]) => el.found && el.priority === 'critical')

                console.log('\n  🎯 可用的关键操作元素:')
                criticalElements.forEach(([name, element]) => {
                    console.log(`    • ${element.description}: ${element.element.cssSelector}`)
                })
            } else {
                console.log('\n⚠️  自动化提醒:')
                console.log('  ❌ 页面尚未完全准备好自动化操作')
                console.log('  💡 建议检查页面加载状态或调整元素选择器')
            }
        })
        .catch(error => {
            console.error('\n❌ 分析失败:', error.message)
            console.error('💡 请确保:')
            console.error('  1. Chrome浏览器已启动调试模式')
            console.error('  2. 抖音创作者中心页面已打开')
            console.error('  3. 调试端口正确 (默认: 9223)')
            process.exit(1)
        })
}