import WebSocket from 'ws'
import fetch from 'node-fetch'

async function analyzeIframe(port) {
  try {
    const response = await fetch(`http://localhost:${port}/json`)
    const tabs = await response.json()
    
    const wechatTab = tabs.find(tab => 
      tab.url.includes('channels.weixin.qq.com') && tab.type === 'page'
    )
    
    console.log(`🎯 分析iframe内容: ${wechatTab.url}`)
    
    const ws = new WebSocket(wechatTab.webSocketDebuggerUrl)
    
    ws.on('open', () => {
      console.log('✅ WebSocket连接成功')
      
      ws.send(JSON.stringify({
        id: 1,
        method: 'Runtime.enable'
      }))
      
      setTimeout(() => {
        const script = `
(async function() {
  console.log('开始分析iframe内容');
  
  // 等待iframe完全加载
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  const result = {
    iframes: [],
    wujieContent: []
  };
  
  // 1. 分析所有iframe
  const iframes = document.querySelectorAll('iframe');
  console.log('找到iframe数量:', iframes.length);
  
  for (let i = 0; i < iframes.length; i++) {
    const iframe = iframes[i];
    const iframeInfo = {
      index: i,
      src: iframe.src,
      id: iframe.id,
      className: iframe.className,
      content: null
    };
    
    try {
      if (iframe.contentDocument && iframe.contentDocument.body) {
        const doc = iframe.contentDocument;
        const body = doc.body;
        
        iframeInfo.content = {
          title: doc.title,
          elementCount: doc.querySelectorAll('*').length,
          bodyText: body.textContent ? body.textContent.slice(0, 500) : '',
          hasUploadText: body.textContent ? body.textContent.includes('上传') : false,
          
          // 在iframe中查找关键元素
          uploadElements: [],
          buttons: [],
          inputs: []
        };
        
        // 查找上传相关元素
        const uploadSelectors = [
          '.center',
          '.upload-area',
          '.add-icon',
          'input[type="file"]',
          '[class*="upload"]'
        ];
        
        uploadSelectors.forEach(selector => {
          try {
            const elements = doc.querySelectorAll(selector);
            elements.forEach(el => {
              iframeInfo.content.uploadElements.push({
                selector: selector,
                tagName: el.tagName,
                className: el.className || '',
                textContent: el.textContent ? el.textContent.trim().slice(0, 100) : ''
              });
            });
          } catch (e) {
            // 忽略选择器错误
          }
        });
        
        // 查找按钮
        doc.querySelectorAll('button').forEach(btn => {
          iframeInfo.content.buttons.push({
            textContent: btn.textContent ? btn.textContent.trim() : '',
            className: btn.className || '',
            disabled: btn.disabled
          });
        });
        
        // 查找输入框
        doc.querySelectorAll('input, textarea').forEach(input => {
          iframeInfo.content.inputs.push({
            type: input.type || '',
            placeholder: input.placeholder || '',
            className: input.className || '',
            tagName: input.tagName
          });
        });
        
      }
    } catch (e) {
      iframeInfo.error = e.message;
    }
    
    result.iframes.push(iframeInfo);
  }
  
  // 2. 检查wujie微前端内容
  const wujieApps = document.querySelectorAll('wujie-app');
  wujieApps.forEach((app, index) => {
    result.wujieContent.push({
      index: index,
      className: app.className,
      innerHTML: app.innerHTML.slice(0, 300),
      textContent: app.textContent ? app.textContent.slice(0, 300) : ''
    });
  });
  
  return result;
})()
        `
        
        ws.send(JSON.stringify({
          id: 2,
          method: 'Runtime.evaluate',
          params: {
            expression: script,
            awaitPromise: true,
            returnByValue: true
          }
        }))
      }, 3000)
    })
    
    ws.on('message', (data) => {
      const message = JSON.parse(data)
      
      if (message.id === 2) {
        if (message.result && message.result.result && message.result.result.value) {
          const result = message.result.result.value
          
          console.log('\n📊 iframe分析结果:')
          
          result.iframes.forEach((iframe, i) => {
            console.log(`\n🖼️  iframe ${i + 1}:`)
            console.log(`  URL: ${iframe.src}`)
            console.log(`  ID: ${iframe.id}`)
            console.log(`  类名: ${iframe.className}`)
            
            if (iframe.content) {
              console.log(`  标题: ${iframe.content.title}`)
              console.log(`  元素数: ${iframe.content.elementCount}`)
              console.log(`  包含上传文字: ${iframe.content.hasUploadText ? '✅' : '❌'}`)
              
              if (iframe.content.bodyText) {
                console.log(`  内容预览: ${iframe.content.bodyText}`)
              }
              
              if (iframe.content.uploadElements.length > 0) {
                console.log(`  🎯 找到上传元素:`)
                iframe.content.uploadElements.forEach((el, j) => {
                  console.log(`    ${j+1}. ${el.selector} -> <${el.tagName}> ${el.className}`)
                  if (el.textContent) console.log(`       文本: ${el.textContent}`)
                })
              }
              
              if (iframe.content.buttons.length > 0) {
                console.log(`  🔘 按钮列表:`)
                iframe.content.buttons.slice(0, 5).forEach((btn, j) => {
                  console.log(`    ${j+1}. "${btn.textContent}" | ${btn.className} | 禁用: ${btn.disabled}`)
                })
              }
              
              if (iframe.content.inputs.length > 0) {
                console.log(`  📝 输入框:`)
                iframe.content.inputs.forEach((input, j) => {
                  console.log(`    ${j+1}. <${input.tagName}> type="${input.type}" placeholder="${input.placeholder}"`)
                })
              }
              
            } else if (iframe.error) {
              console.log(`  ❌ 错误: ${iframe.error}`)
            } else {
              console.log(`  ❌ 无法访问内容`)
            }
          })
          
          if (result.wujieContent.length > 0) {
            console.log('\n🚀 Wujie微前端内容:')
            result.wujieContent.forEach((wujie, i) => {
              console.log(`  ${i+1}. 类名: ${wujie.className}`)
              if (wujie.textContent) {
                console.log(`     文本: ${wujie.textContent}`)
              }
            })
          }
          
        } else if (message.result && message.result.exceptionDetails) {
          console.log('❌ 脚本执行出错:', message.result.exceptionDetails.text)
        }
        
        ws.close()
      }
    })
    
    ws.on('error', (error) => {
      console.error('❌ WebSocket错误:', error.message)
    })
    
    setTimeout(() => {
      if (ws.readyState === WebSocket.OPEN) {
        console.log('⏰ 超时，关闭连接')
        ws.close()
      }
    }, 20000)
    
  } catch (error) {
    console.error('❌ iframe分析失败:', error.message)
  }
}

const port = process.argv[2] || 9223
analyzeIframe(port)
