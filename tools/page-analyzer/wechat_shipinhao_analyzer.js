import WebSocket from 'ws'
import fetch from 'node-fetch'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export class WeChatShipinhaoAnalyzer {
  constructor() {
    this.elements = {
      uploadArea: {
        selectors: [
          'div.center',
          'div.ant-upload.ant-upload-drag',
          'div.upload-content',
          'div.post-upload-wrap'
        ],
        description: '视频上传区域',
        priority: 'critical'
      },
      
      fileInput: {
        selectors: [
          'input[type="file"]'
        ],
        description: '文件选择输入框',
        priority: 'critical'
      },
      
      uploadIcon: {
        selectors: [
          'span.add-icon.weui-icon-outlined-add',
          '.add-icon'
        ],
        description: '上传加号图标',
        priority: 'high'
      },
      
      uploadTip: {
        selectors: [
          'div.upload-tip'
        ],
        description: '上传提示文字',
        priority: 'medium'
      },
      
      videoDescription: {
        selectors: [
          'input[placeholder*="概括视频主要内容"]',
          'textarea[placeholder*="视频描述"]'
        ],
        description: '视频描述输入框',
        priority: 'high'
      },
      
      locationSearch: {
        selectors: [
          'input[placeholder="搜索附近位置"]'
        ],
        description: '位置搜索框',
        priority: 'medium'
      }
    }
    
    this.outputDir = path.join(__dirname, 'output')
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true })
    }
  }

  async analyze(debugPort) {
    console.log(`[微信视频号分析器] 连接端口: ${debugPort}`)
    
    try {
      const response = await fetch(`http://localhost:${debugPort}/json`)
      const tabs = await response.json()
      
      const wechatTab = tabs.find(tab => 
        tab.url.includes('channels.weixin.qq.com') && tab.type === 'page'
      )
      
      if (!wechatTab) {
        throw new Error('未找到微信视频号标签页')
      }
      
      console.log(`[微信视频号分析器] 分析页面: ${wechatTab.url}`)
      
      const result = await this.analyzeTab(wechatTab)
      const outputFile = this.saveResult(result)
      
      console.log(`[微信视频号分析器] 结果保存至: ${outputFile}`)
      return result
      
    } catch (error) {
      console.error(`[微信视频号分析器] 错误:`, error.message)
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
        console.log('[微信视频号分析器] WebSocket连接成功')
        
        ws.send(JSON.stringify({
          id: messageId++,
          method: 'Runtime.enable'
        }))
        
        const script = this.createIframeAnalysisScript()
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

  createIframeAnalysisScript() {
    const elements = JSON.stringify(this.elements)
    
    return `
(async function() {
  console.log('[微信视频号分析器] 开始iframe分析');
  
  const elements = ${elements};
  
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  const result = {
    url: window.location.href,
    timestamp: new Date().toISOString(),
    iframeAnalysis: true,
    elements: {}
  };
  
  function getIframeDocument() {
    const iframes = document.querySelectorAll('iframe');
    for (const iframe of iframes) {
      try {
        if (iframe.contentDocument && iframe.contentDocument.body) {
          const text = iframe.contentDocument.body.textContent || '';
          if (text.includes('上传时长') || text.includes('视频描述')) {
            return iframe.contentDocument;
          }
        }
      } catch (e) {
        // 跨域iframe，无法访问
      }
    }
    return null;
  }
  
  const iframeDoc = getIframeDocument();
  const searchDoc = iframeDoc || document;
  
  console.log('使用文档:', iframeDoc ? 'iframe' : 'main', '元素数量:', searchDoc.querySelectorAll('*').length);
  
  function findElement(config) {
    for (const selector of config.selectors) {
      try {
        const element = searchDoc.querySelector(selector);
        if (element) {
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
              disabled: element.disabled || false,
              visible: isVisible(element),
              cssSelector: generateSelector(element)
            }
          };
        }
      } catch (error) {
        console.warn('选择器错误:', selector, error);
      }
    }
    return { found: false };
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
      const classes = element.className.split(' ').filter(c => c.trim()).slice(0, 2);
      if (classes.length > 0) {
        return '.' + classes.join('.');
      }
    }
    
    const tagName = element.tagName.toLowerCase();
    
    if (element.type) {
      return tagName + '[type="' + element.type + '"]';
    }
    
    if (element.placeholder) {
      return tagName + '[placeholder="' + element.placeholder + '"]';
    }
    
    return tagName;
  }
  
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
    readyForAutomation: foundCritical >= 2,
    analysisMethod: iframeDoc ? 'iframe' : 'main'
  };
  
  console.log('微信视频号分析完成:', result.summary);
  return result;
})()
    `;
  }

  saveResult(result) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filename = `wechat-analysis-${timestamp}.json`
    const filepath = path.join(this.outputDir, filename)
    
    fs.writeFileSync(filepath, JSON.stringify(result, null, 2))
    return filepath
  }
}

export async function analyzeWeChatShipinhao(debugPort) {
  const analyzer = new WeChatShipinhaoAnalyzer()
  return await analyzer.analyze(debugPort)
}

// 命令行运行
if (import.meta.url === `file://${process.argv[1]}`) {
  const port = process.argv[2] || 9223
  
  analyzeWeChatShipinhao(parseInt(port))
    .then(result => {
      console.log('\n🎉 微信视频号分析完成!')
      console.log(`📊 分析方法: ${result.summary.analysisMethod}`)
      console.log(`🎯 找到元素: ${result.summary.foundElements}/${result.summary.totalElements}`)
      console.log(`⭐ 关键元素: ${result.summary.foundCriticalElements}/${result.summary.criticalElements}`)
      console.log(`📈 置信度: ${result.summary.confidence}%`)
      console.log(`🤖 自动化就绪: ${result.summary.readyForAutomation ? '是' : '否'}`)
      
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
                console.log(`      类名: ${element.element.className}`)
              }
              if (element.element.placeholder) {
                console.log(`      提示: ${element.element.placeholder}`)
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
      }
    })
    .catch(error => {
      console.error('\n❌ 分析失败:', error.message)
      process.exit(1)
    })
}
