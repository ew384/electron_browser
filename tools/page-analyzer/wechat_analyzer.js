import WebSocket from 'ws'
import fetch from 'node-fetch'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export class WeChatShipinhaoAnalyzer {
    constructor() {
        // 定义不同内容类型的页面元素配置
        this.contentTypes = {
            video: {
                url: 'channels.weixin.qq.com/platform/post/create',
                name: '视频上传',
                elements: {
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

                    videoDescription: {
                        selectors: [
                            'input[placeholder*="概括视频主要内容"]',
                            'textarea[placeholder*="视频描述"]',
                            'textarea[placeholder*="说点什么"]'
                        ],
                        description: '视频描述输入框',
                        priority: 'high'
                    },

                    locationSearch: {
                        selectors: [
                            'input[placeholder="搜索附近位置"]',
                            'input[placeholder*="位置"]'
                        ],
                        description: '位置搜索框',
                        priority: 'medium'
                    },

                    musicAgreement: {
                        selectors: [
                            'i.weui-desktop-icon-checkbox',
                            '.weui-desktop-icon-checkbox',
                            'input[type="checkbox"]',
                            'input[type="checkbox"][class*="agreement"]',
                            'input[type="checkbox"][class*="notice"]',
                            '.agreement-checkbox input',
                            '.notice-checkbox input'
                        ],
                        description: '音乐人发表须知勾选框',
                        priority: 'critical'
                    },

                    agreementText: {
                        selectors: [
                            'label:contains("我已阅读")',
                            'span:contains("视频号音乐人发表须知")',
                            'div:contains("我已阅读")',
                            '.agreement-text'
                        ],
                        description: '协议文本',
                        priority: 'medium'
                    },

                    publishButton: {
                        selectors: [
                            'button[class*="publish"]',
                            'button:contains("发布")',
                            'button:contains("发表")',
                            'button:contains("发表音乐")',
                            '.publish-btn',
                            '.weui-desktop-btn.weui-desktop-btn_primary',
                            'button.weui-desktop-btn_primary'
                        ],
                        description: '发布按钮',
                        priority: 'high'
                    }
                }
            },

            article: {
                url: 'channels.weixin.qq.com/platform/post/finderNewLifeCreate',
                name: '图文上传',
                elements: {
                    titleInput: {
                        selectors: [
                            'input[placeholder*="标题"]',
                            'input[placeholder*="请输入标题"]',
                            '.title-input input'
                        ],
                        description: '图文标题输入框',
                        priority: 'critical'
                    },

                    contentEditor: {
                        selectors: [
                            'div[contenteditable="true"]',
                            '.editor-content',
                            '.rich-text-editor',
                            'textarea[placeholder*="正文"]'
                        ],
                        description: '图文内容编辑器',
                        priority: 'critical'
                    },

                    imageUpload: {
                        selectors: [
                            'div.image-upload',
                            'input[type="file"][accept*="image"]',
                            '.upload-image',
                            'div[class*="img-upload"]'
                        ],
                        description: '图片上传区域',
                        priority: 'critical'
                    },

                    coverUpload: {
                        selectors: [
                            'div.cover-upload',
                            '.cover-image-upload',
                            'input[accept*="image"][class*="cover"]'
                        ],
                        description: '封面图片上传',
                        priority: 'high'
                    },

                    tagInput: {
                        selectors: [
                            'input[placeholder*="标签"]',
                            'input[placeholder*="话题"]',
                            '.tag-input'
                        ],
                        description: '标签输入框',
                        priority: 'medium'
                    },

                    locationSearch: {
                        selectors: [
                            'input[placeholder="搜索附近位置"]',
                            'input[placeholder*="位置"]'
                        ],
                        description: '位置搜索框',
                        priority: 'medium'
                    },

                    publishButton: {
                        selectors: [
                            'button[class*="publish"]',
                            'button:contains("发布")',
                            'button:contains("发表")',
                            '.publish-btn',
                            '.weui-desktop-btn.weui-desktop-btn_primary',
                            'button.weui-desktop-btn_primary'
                        ],
                        description: '发布按钮',
                        priority: 'high'
                    },

                    saveDraftButton: {
                        selectors: [
                            'button[class*="draft"]',
                            'button:contains("保存草稿")',
                            '.save-draft'
                        ],
                        description: '保存草稿按钮',
                        priority: 'medium'
                    }
                }
            },

            music: {
                url: 'channels.weixin.qq.com/platform/post/createMusic',
                name: '音乐上传',
                elements: {
                    musicUpload: {
                        selectors: [
                            'input[type="file"][accept*="audio"]',
                            'div.music-upload',
                            '.audio-upload-area',
                            'div[class*="music-upload"]'
                        ],
                        description: '音乐文件上传',
                        priority: 'critical'
                    },

                    musicTitle: {
                        selectors: [
                            'input[placeholder*="歌曲名"]',
                            'input[placeholder*="音乐标题"]',
                            '.music-title-input'
                        ],
                        description: '音乐标题输入',
                        priority: 'critical'
                    },

                    artistName: {
                        selectors: [
                            'input[placeholder*="歌手"]',
                            'input[placeholder*="艺术家"]',
                            'input[placeholder*="演唱者"]'
                        ],
                        description: '歌手/艺术家名称',
                        priority: 'high'
                    },

                    albumName: {
                        selectors: [
                            'input[placeholder*="专辑"]',
                            'input[placeholder*="专辑名称"]'
                        ],
                        description: '专辑名称',
                        priority: 'medium'
                    },

                    musicCover: {
                        selectors: [
                            'input[type="file"][accept*="image"][class*="cover"]',
                            '.music-cover-upload',
                            'div[class*="album-cover"]'
                        ],
                        description: '音乐封面上传',
                        priority: 'high'
                    },

                    musicDescription: {
                        selectors: [
                            'textarea[placeholder*="音乐描述"]',
                            'textarea[placeholder*="说点什么"]',
                            '.music-desc-input'
                        ],
                        description: '音乐描述',
                        priority: 'medium'
                    },

                    publishButton: {
                        selectors: [
                            'button[class*="publish"]',
                            'button:contains("发布")',
                            'button:contains("发表")',
                            '.publish-btn',
                            '.weui-desktop-btn.weui-desktop-btn_primary',
                            'button.weui-desktop-btn_primary'
                        ],
                        description: '发布按钮',
                        priority: 'high'
                    }
                }
            },

            audio: {
                url: 'channels.weixin.qq.com/platform/post/createAudio',
                name: '音频上传',
                elements: {
                    audioUpload: {
                        selectors: [
                            'input[type="file"][accept*="audio"]',
                            'div.audio-upload',
                            '.audio-upload-area',
                            'div[class*="audio-upload"]'
                        ],
                        description: '音频文件上传',
                        priority: 'critical'
                    },

                    audioTitle: {
                        selectors: [
                            'input[placeholder*="音频标题"]',
                            'input[placeholder*="标题"]',
                            '.audio-title-input'
                        ],
                        description: '音频标题输入',
                        priority: 'critical'
                    },

                    audioCover: {
                        selectors: [
                            'input[type="file"][accept*="image"][class*="cover"]',
                            '.audio-cover-upload',
                            'div[class*="audio-cover"]'
                        ],
                        description: '音频封面上传',
                        priority: 'high'
                    },

                    audioDescription: {
                        selectors: [
                            'textarea[placeholder*="音频描述"]',
                            'textarea[placeholder*="说点什么"]',
                            'div[contenteditable="true"]'
                        ],
                        description: '音频描述',
                        priority: 'high'
                    },

                    categorySelect: {
                        selectors: [
                            'select[class*="category"]',
                            '.category-select',
                            'div[class*="category-dropdown"]'
                        ],
                        description: '音频分类选择',
                        priority: 'medium'
                    },

                    tagInput: {
                        selectors: [
                            'input[placeholder*="标签"]',
                            'input[placeholder*="话题"]',
                            '.tag-input'
                        ],
                        description: '标签输入框',
                        priority: 'medium'
                    },

                    publishButton: {
                        selectors: [
                            'button[class*="publish"]',
                            'button:contains("发布")',
                            '.publish-btn'
                        ],
                        description: '发布按钮',
                        priority: 'high'
                    }
                }
            }
        }

        this.outputDir = path.join(__dirname, 'output')
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true })
        }
    }

    // 检测当前页面属于哪种内容类型
    detectContentType(url) {
        // 直接匹配完整的路径部分
        if (url.includes('/post/create') && !url.includes('Music') && !url.includes('Audio') && !url.includes('Life')) {
            return 'video'
        }
        if (url.includes('/post/finderNewLifeCreate')) {
            return 'article'
        }
        if (url.includes('/post/createMusic')) {
            return 'music'
        }
        if (url.includes('/post/createAudio')) {
            return 'audio'
        }
        return null
    }

    async analyze(debugPort, specificType = null) {
        console.log(`[微信视频号分析器] 连接端口: ${debugPort}`)

        try {
            const response = await fetch(`http://localhost:${debugPort}/json`)
            const tabs = await response.json()

            const wechatTabs = tabs.filter(tab =>
                tab.url.includes('channels.weixin.qq.com') && tab.type === 'page'
            )

            if (wechatTabs.length === 0) {
                throw new Error('未找到微信视频号标签页')
            }

            const results = []

            for (const tab of wechatTabs) {
                const contentType = this.detectContentType(tab.url)

                if (specificType && contentType !== specificType) {
                    continue
                }

                if (contentType) {
                    console.log(`[微信视频号分析器] 分析${this.contentTypes[contentType].name}页面: ${tab.url}`)

                    const result = await this.analyzeTab(tab, contentType)
                    result.contentType = contentType
                    result.contentTypeName = this.contentTypes[contentType].name

                    results.push(result)

                    const outputFile = this.saveResult(result, contentType)
                    console.log(`[微信视频号分析器] ${this.contentTypes[contentType].name}结果保存至: ${outputFile}`)
                }
            }

            if (results.length === 0) {
                throw new Error(specificType ?
                    `未找到${specificType}类型的页面` :
                    '未找到任何可分析的微信视频号页面'
                )
            }

            return results.length === 1 ? results[0] : results

        } catch (error) {
            console.error(`[微信视频号分析器] 错误:`, error.message)
            throw error
        }
    }

    async analyzeTab(tab, contentType) {
        return new Promise((resolve, reject) => {
            const ws = new WebSocket(tab.webSocketDebuggerUrl)
            let messageId = 1

            const timeout = setTimeout(() => {
                ws.close()
                reject(new Error('分析超时'))
            }, 30000)

            ws.on('open', () => {
                console.log(`[微信视频号分析器] WebSocket连接成功 - ${this.contentTypes[contentType].name}`)

                ws.send(JSON.stringify({
                    id: messageId++,
                    method: 'Runtime.enable'
                }))

                const script = this.createIframeAnalysisScript(contentType)
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

    createIframeAnalysisScript(contentType) {
        const elements = JSON.stringify(this.contentTypes[contentType].elements)
        const contentTypeName = this.contentTypes[contentType].name

        return `
(async function() {
  console.log('[微信视频号分析器] 开始${contentTypeName}页面iframe分析');
  
  const elements = ${elements};
  
  await new Promise(resolve => setTimeout(resolve, 5000));

  // 激活动态元素的函数
  async function activateDynamicElements(searchDoc) {
    console.log('[激活器] 开始激活动态元素');
    
    const testInputs = {
      video: {
        description: '测试视频内容描述',
        location: '北京市'
      },
      article: {
        title: '测试图文标题',
        content: '这是一段测试图文内容',
        tags: '测试标签'
      },
      music: {
        title: '测试音乐标题',
        artist: '测试歌手',
        album: '测试专辑',
        description: '测试音乐描述'
      },
      audio: {
        title: '测试音频标题', 
        description: '测试音频描述内容'
      }
    };
    
    const currentInputs = testInputs['${contentType}'] || {};

    // 创建测试图片文件的函数
    function createTestImageFile() {
      // 创建一个 1x1 像素的透明 PNG 图片
      const canvas = document.createElement('canvas');
      canvas.width = 100;
      canvas.height = 100;
      const ctx = canvas.getContext('2d');
      
      // 绘制一个简单的测试图案
      ctx.fillStyle = '#4CAF50';
      ctx.fillRect(0, 0, 100, 100);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '12px Arial';
      ctx.fillText('Test', 35, 55);
      
      return new Promise((resolve) => {
        canvas.toBlob((blob) => {
          const file = new File([blob], 'test-image.png', { 
            type: 'image/png',
            lastModified: Date.now()
          });
          resolve(file);
        }, 'image/png');
      });
    }

    // 创建测试音频文件的函数
    function createTestAudioFile() {
      // 创建双声道音频文件 (Web Audio API)
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const sampleRate = audioContext.sampleRate;
      const duration = 3; // 3秒音频
      const frameCount = sampleRate * duration;
      
      // 创建双声道音频缓冲区
      const audioBuffer = audioContext.createBuffer(2, frameCount, sampleRate); // 2 = 双声道
      const leftChannel = audioBuffer.getChannelData(0);
      const rightChannel = audioBuffer.getChannelData(1);
      
      // 生成立体声音频数据
      for (let i = 0; i < frameCount; i++) {
        const time = i / sampleRate;
        
        // 左声道：440Hz 正弦波
        leftChannel[i] = Math.sin(2 * Math.PI * 440 * time) * 0.3;
        
        // 右声道：880Hz 正弦波 + 相位差
        rightChannel[i] = Math.sin(2 * Math.PI * 880 * time + Math.PI / 4) * 0.3;
      }
      
      // 将 AudioBuffer 转换为立体声 WAV Blob
      const wavData = audioBufferToWav(audioBuffer);
      return new File([wavData], 'test-stereo-audio.wav', { 
        type: 'audio/wav',
        lastModified: Date.now()
      });
    }

    // AudioBuffer 转 WAV 的辅助函数
    function audioBufferToWav(buffer) {
      const length = buffer.length;
      const numberOfChannels = buffer.numberOfChannels;
      const sampleRate = buffer.sampleRate;
      const arrayBuffer = new ArrayBuffer(44 + length * numberOfChannels * 2);
      const view = new DataView(arrayBuffer);
      
      // WAV 文件头
      const writeString = (offset, string) => {
        for (let i = 0; i < string.length; i++) {
          view.setUint8(offset + i, string.charCodeAt(i));
        }
      };
      
      writeString(0, 'RIFF');
      view.setUint32(4, 36 + length * numberOfChannels * 2, true);
      writeString(8, 'WAVE');
      writeString(12, 'fmt ');
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true); // PCM
      view.setUint16(22, numberOfChannels, true); // 声道数
      view.setUint32(24, sampleRate, true);
      view.setUint32(28, sampleRate * numberOfChannels * 2, true); // 字节率
      view.setUint16(32, numberOfChannels * 2, true); // 块对齐
      view.setUint16(34, 16, true); // 位深度
      writeString(36, 'data');
      view.setUint32(40, length * numberOfChannels * 2, true);
      
      // 交错立体声音频数据
      let offset = 44;
      for (let i = 0; i < length; i++) {
        for (let channel = 0; channel < numberOfChannels; channel++) {
          const channelData = buffer.getChannelData(channel);
          const sample = Math.max(-1, Math.min(1, channelData[i]));
          view.setInt16(offset, sample * 0x7FFF, true);
          offset += 2;
        }
      }
      
      return new Blob([arrayBuffer], { type: 'audio/wav' });
    }

    // 模拟文件上传的函数
    async function simulateFileUpload(fileInput, file) {
      try {
        console.log('[激活器] 模拟文件上传:', file.name, file.type);
        
        // 创建 FileList 对象
        const dt = new DataTransfer();
        dt.items.add(file);
        
        // 设置文件到 input
        Object.defineProperty(fileInput, 'files', {
          value: dt.files,
          configurable: true
        });
        
        // 触发相关事件
        const events = ['change', 'input'];
        for (const eventType of events) {
          const event = new Event(eventType, { bubbles: true });
          fileInput.dispatchEvent(event);
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        console.log('[激活器] 文件上传事件已触发');
        return true;
      } catch (error) {
        console.warn('[激活器] 文件上传模拟失败:', error.message);
        return false;
      }
    }
    
    // 输入文字到各种输入框
    const inputActions = [
      // 视频描述
      {
        selectors: ['input[placeholder*="概括视频主要内容"]', 'textarea[placeholder*="视频描述"]', 'textarea[placeholder*="说点什么"]'],
        value: currentInputs.description || '测试内容描述',
        type: 'input'
      },
      // 图文标题
      {
        selectors: ['input[placeholder*="标题"]', 'input[placeholder*="请输入标题"]'],
        value: currentInputs.title || '测试标题',
        type: 'input'
      },
      // 图文内容
      {
        selectors: ['div[contenteditable="true"]', 'textarea[placeholder*="正文"]'],
        value: currentInputs.content || '测试内容',
        type: 'content'
      },
      // 音乐相关
      {
        selectors: ['input[placeholder*="歌曲名"]', 'input[placeholder*="音乐标题"]'],
        value: currentInputs.title || '测试音乐',
        type: 'input'
      },
      {
        selectors: ['input[placeholder*="歌手"]', 'input[placeholder*="艺术家"]'],
        value: currentInputs.artist || '测试歌手',
        type: 'input'
      },
      // 音频相关
      {
        selectors: ['input[placeholder*="音频标题"]'],
        value: currentInputs.title || '测试音频',
        type: 'input'
      }
    ];
    
    // 执行文本输入
    for (const action of inputActions) {
      for (const selector of action.selectors) {
        try {
          const element = searchDoc.querySelector(selector);
          if (element && isVisible(element)) {
            console.log('[激活器] 向元素输入内容:', selector);
            
            // 聚焦元素
            element.focus();
            await new Promise(resolve => setTimeout(resolve, 500));
            
            if (action.type === 'content') {
              // 可编辑div
              element.innerHTML = action.value;
              element.textContent = action.value;
            } else {
              // 普通输入框
              element.value = action.value;
            }
            
            // 触发各种事件来激活动态元素
            const events = ['input', 'change', 'keyup', 'keydown', 'blur'];
            for (const eventType of events) {
              const event = new Event(eventType, { bubbles: true });
              element.dispatchEvent(event);
              await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            console.log('[激活器] 成功输入:', action.value.slice(0, 20));
            break; // 找到一个有效元素就跳出
          }
        } catch (error) {
          console.warn('[激活器] 输入失败:', selector, error.message);
        }
      }
    }
    
    // 等待文本输入效果
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 处理协议勾选（主要针对音乐上传）
    if ('${contentType}' === 'music') {
      console.log('[激活器] 处理音乐人发表须知勾选');
      
      const checkboxSelectors = [
        'i.weui-desktop-icon-checkbox',
        '.weui-desktop-icon-checkbox',
        'input[type="checkbox"]',
        'input[type="checkbox"][class*="agreement"]'
      ];
      
      for (const selector of checkboxSelectors) {
        try {
          const checkbox = searchDoc.querySelector(selector);
          if (checkbox) {
            console.log('[激活器] 找到协议复选框元素:', selector, checkbox.tagName);
            
            // 检查是否已经勾选（通过CSS类名判断）
            const isChecked = checkbox.classList.contains('weui-desktop-icon-checkbox_checked') ||
                             checkbox.classList.contains('checked') ||
                             checkbox.checked;
            
            if (!isChecked) {
              console.log('[激活器] 复选框未勾选，开始点击激活');
              
              // 对于自定义图标复选框，直接点击
              if (checkbox.tagName.toLowerCase() === 'i') {
                checkbox.click();
                
                // 也尝试点击父元素（可能是label或包装div）
                if (checkbox.parentElement) {
                  checkbox.parentElement.click();
                }
              } else {
                // 标准复选框处理
                checkbox.checked = true;
                checkbox.click();
              }
              
              // 触发相关事件
              const events = ['change', 'click', 'input', 'mousedown', 'mouseup'];
              for (const eventType of events) {
                try {
                  const event = new Event(eventType, { bubbles: true, cancelable: true });
                  checkbox.dispatchEvent(event);
                  if (checkbox.parentElement) {
                    checkbox.parentElement.dispatchEvent(event);
                  }
                } catch (e) {
                  console.warn('[激活器] 事件触发失败:', eventType, e.message);
                }
                await new Promise(resolve => setTimeout(resolve, 100));
              }
              
              console.log('[激活器] 协议复选框点击完成');
              
              // 检查是否成功勾选
              await new Promise(resolve => setTimeout(resolve, 500));
              const nowChecked = checkbox.classList.contains('weui-desktop-icon-checkbox_checked') ||
                                checkbox.classList.contains('checked') ||
                                checkbox.checked;
              
              if (nowChecked) {
                console.log('[激活器] ✅ 协议复选框勾选成功');
              } else {
                console.log('[激活器] ⚠️ 协议复选框可能未成功勾选，尝试其他方式');
                
                // 尝试模拟鼠标点击
                const clickEvent = new MouseEvent('click', {
                  bubbles: true,
                  cancelable: true,
                  view: window
                });
                checkbox.dispatchEvent(clickEvent);
              }
              
              break;
            } else {
              console.log('[激活器] 协议复选框已经勾选');
              break;
            }
          }
        } catch (error) {
          console.warn('[激活器] 协议勾选失败:', selector, error.message);
        }
      }
      
      // 等待协议勾选生效
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
    
    // 处理文件上传
    if ('${contentType}' === 'video') {
      console.log('[激活器] 开始处理视频上传');
      
      const videoSelectors = [
        'input[type="file"][accept*="video"]',
        'input[type="file"]'
      ];
      
      for (const selector of videoSelectors) {
        try {
          const fileInput = searchDoc.querySelector(selector);
          if (fileInput) {
            console.log('[激活器] 找到视频输入框:', selector);
            const testVideo = await createTestVideoFile();
            const uploadSuccess = await simulateFileUpload(fileInput, testVideo);
            
            if (uploadSuccess) {
              console.log('[激活器] 视频上传模拟成功');
              break;
            }
          }
        } catch (error) {
          console.warn('[激活器] 视频上传处理失败:', selector, error.message);
        }
      }
    }
    
    if ('${contentType}' === 'article') {
      console.log('[激活器] 开始处理图片上传');
      
      const imageSelectors = [
        'input[type="file"][accept*="image"]',
        'input[type="file"]'
      ];
      
      for (const selector of imageSelectors) {
        try {
          const fileInput = searchDoc.querySelector(selector);
          if (fileInput) {
            console.log('[激活器] 找到文件输入框:', selector);
            const testImage = await createTestImageFile();
            const uploadSuccess = await simulateFileUpload(fileInput, testImage);
            
            if (uploadSuccess) {
              console.log('[激活器] 图片上传模拟成功');
              break;
            }
          }
        } catch (error) {
          console.warn('[激活器] 图片上传处理失败:', selector, error.message);
        }
      }
    }
    
    if ('${contentType}' === 'music' || '${contentType}' === 'audio') {
      console.log('[激活器] 开始处理音频上传');
      
      const audioSelectors = [
        'input[type="file"][accept*="audio"]',
        'input[type="file"]'
      ];
      
      for (const selector of audioSelectors) {
        try {
          const fileInput = searchDoc.querySelector(selector);
          if (fileInput) {
            console.log('[激活器] 找到音频输入框:', selector);
            const testAudio = createTestAudioFile();
            const uploadSuccess = await simulateFileUpload(fileInput, testAudio);
            
            if (uploadSuccess) {
              console.log('[激活器] 音频上传模拟成功');
              break;
            }
          }
        } catch (error) {
          console.warn('[激活器] 音频上传处理失败:', selector, error.message);
        }
      }
    }
    
    // 等待动态元素出现
    console.log('[激活器] 等待动态元素激活...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    return true;
  }
  
  const result = {
    url: window.location.href,
    timestamp: new Date().toISOString(),
    contentType: '${contentType}',
    contentTypeName: '${contentTypeName}',
    iframeAnalysis: true,
    elements: {}
  };
  
  function getIframeDocument() {
    const iframes = document.querySelectorAll('iframe');
    console.log('找到iframe数量:', iframes.length);
    
    for (let i = 0; i < iframes.length; i++) {
      const iframe = iframes[i];
      try {
        if (iframe.contentDocument && iframe.contentDocument.body) {
          const text = iframe.contentDocument.body.textContent || '';
          const html = iframe.contentDocument.body.innerHTML || '';
          
          console.log('iframe ' + i + ' 内容预览:', text.slice(0, 200));
          
          // 根据内容类型检测相关iframe
          const typeKeywords = {
            video: ['上传时长', '视频描述', '视频上传'],
            article: ['图文', '标题', '正文', '文章'],
            music: ['音乐', '歌曲', '专辑', '歌手', '音频文件', '发表音乐'],
            audio: ['音频', '播客', '录音', '发表音频', '拖拽到此处上传']
          };
          
          const keywords = typeKeywords['${contentType}'] || [];
          const hasRelevantContent = keywords.some(keyword => 
            text.includes(keyword) || html.includes(keyword)
          );
          
          if (hasRelevantContent) {
            console.log('找到相关iframe:', i, '关键词匹配');
            return iframe.contentDocument;
          }
        }
      } catch (e) {
        console.log('iframe ' + i + ' 跨域无法访问:', e.message);
      }
    }
    
    return null;
  }
  
  const iframeDoc = getIframeDocument();
  const searchDoc = iframeDoc || document;
  
  console.log('使用文档:', iframeDoc ? 'iframe' : 'main', '元素数量:', searchDoc.querySelectorAll('*').length);
  
  // 第一次扫描 - 检测初始状态
  console.log('=== 第一次扫描：初始状态 ===');
  const initialScan = {};
  for (const [name, config] of Object.entries(elements)) {
    initialScan[name] = findElement(config);
  }
  
  // 激活动态元素
  await activateDynamicElements(searchDoc);
  
  // 第二次扫描 - 检测激活后状态
  console.log('=== 第二次扫描：激活后状态 ===');
  
  function findElement(config) {
    for (const selector of config.selectors) {
      try {
        let element = null;
        
        // 特殊处理包含 :contains 的选择器
        if (selector.includes(':contains')) {
          const match = selector.match(/^(.+):contains\\("(.+)"\\)$/);
          if (match) {
            const [, baseSelector, text] = match;
            const elements = searchDoc.querySelectorAll(baseSelector);
            for (const el of elements) {
              if (el.textContent && el.textContent.includes(text)) {
                element = el;
                break;
              }
            }
          }
        } else {
          element = searchDoc.querySelector(selector);
        }
        
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
              accept: element.accept || '',
              disabled: element.disabled || false,
              visible: isVisible(element),
              cssSelector: generateSelector(element),
              boundingRect: element.getBoundingClientRect()
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
      return tagName + '[placeholder*="' + element.placeholder + '"]';
    }
    
    if (element.accept) {
      return tagName + '[accept*="' + element.accept + '"]';
    }
    
    return tagName;
  }
  
  // 分析所有元素
  for (const [name, config] of Object.entries(elements)) {
    console.log('查找:', name, '(' + config.description + ')');
    
    const elementResult = findElement(config);
    
    // 比较初始状态和激活后状态
    const wasFoundInitially = initialScan[name].found;
    const foundNow = elementResult.found;
    
    let activationStatus = '';
    if (!wasFoundInitially && foundNow) {
      activationStatus = ' [动态激活]';
      console.log('🎯 动态激活成功:', name);
    } else if (wasFoundInitially && foundNow) {
      activationStatus = ' [初始可见]';
    } else if (!wasFoundInitially && !foundNow) {
      activationStatus = ' [未激活]';
    }
    
    result.elements[name] = {
      ...elementResult,
      description: config.description,
      priority: config.priority,
      expectedSelectors: config.selectors,
      activationStatus: activationStatus.trim(),
      wasInitiallyVisible: wasFoundInitially
    };
    
    if (elementResult.found) {
      console.log('✅ 找到', name + activationStatus + ':', elementResult.element.cssSelector);
      if (elementResult.element.textContent) {
        console.log('   文本:', elementResult.element.textContent);
      }
      if (elementResult.element.placeholder) {
        console.log('   提示:', elementResult.element.placeholder);
      }
    } else {
      console.log('❌ 未找到', name + activationStatus);
    }
  }
  
  // 生成分析摘要
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
    readyForAutomation: foundCritical >= Math.min(2, criticalCount),
    analysisMethod: iframeDoc ? 'iframe' : 'main',
    pageType: '${contentType}'
  };
  
  console.log('${contentTypeName}分析完成:', result.summary);
  return result;
})()
    `;
    }

    saveResult(result, contentType) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
        const filename = `wechat-${contentType}-analysis-${timestamp}.json`
        const filepath = path.join(this.outputDir, filename)

        fs.writeFileSync(filepath, JSON.stringify(result, null, 2))
        return filepath
    }

    // 生成详细的分析报告
    generateReport(results) {
        const isArray = Array.isArray(results)
        const resultArray = isArray ? results : [results]

        console.log('\n🎉 微信视频号多平台分析完成!')
        console.log('=' * 50)

        resultArray.forEach((result, index) => {
            if (isArray) {
                console.log(`\n📋 ${result.contentTypeName} (${index + 1}/${resultArray.length})`)
                console.log('-' * 30)
            }

            console.log(`📊 分析方法: ${result.summary.analysisMethod}`)
            console.log(`🎯 找到元素: ${result.summary.foundElements}/${result.summary.totalElements}`)
            console.log(`⭐ 关键元素: ${result.summary.foundCriticalElements}/${result.summary.criticalElements}`)
            console.log(`📈 置信度: ${result.summary.confidence}%`)
            console.log(`🔑 关键置信度: ${result.summary.criticalConfidence}%`)
            console.log(`🤖 自动化就绪: ${result.summary.readyForAutomation ? '是' : '否'}`)

            console.log(`\n📋 ${result.contentTypeName}元素详情:`)

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
                            if (element.element.accept) {
                                console.log(`      接受: ${element.element.accept}`)
                            }
                            console.log(`      可见: ${element.element.visible ? '是' : '否'}`)
                            if (element.activationStatus) {
                                console.log(`      状态: ${element.activationStatus}`)
                            }
                            if (element.activationStatus === '[动态激活]') {
                                console.log(`      🎯 通过用户交互激活`)
                            }
                        } else {
                            console.log(`  ${status} ${element.description}: 未找到`)
                            if (element.activationStatus) {
                                console.log(`      状态: ${element.activationStatus}`)
                            }
                        }
                    })
                }
            })

            if (result.summary.readyForAutomation) {
                console.log(`\n🚀 ${result.contentTypeName}自动化建议:`)
                console.log('  ✅ 页面已准备好进行自动化操作')
                console.log('  ✅ 可以基于检测到的选择器开发Chrome扩展')
            } else {
                console.log(`\n⚠️  ${result.contentTypeName}自动化注意:`)
                console.log('  ❌ 关键元素检测不完整，需要进一步调试')
            }
        })

        if (isArray) {
            const readyCount = resultArray.filter(r => r.summary.readyForAutomation).length
            console.log(`\n📊 总体状况: ${readyCount}/${resultArray.length} 个页面类型已准备好自动化`)
        }
    }
}

// 便捷分析函数
export async function analyzeWeChatShipinhao(debugPort, contentType = null) {
    const analyzer = new WeChatShipinhaoAnalyzer()
    return await analyzer.analyze(debugPort, contentType)
}

// 分析特定内容类型的便捷函数
export async function analyzeWeChatVideo(debugPort) {
    return await analyzeWeChatShipinhao(debugPort, 'video')
}

export async function analyzeWeChatArticle(debugPort) {
    return await analyzeWeChatShipinhao(debugPort, 'article')
}

export async function analyzeWeChatMusic(debugPort) {
    return await analyzeWeChatShipinhao(debugPort, 'music')
}

export async function analyzeWeChatAudio(debugPort) {
    return await analyzeWeChatShipinhao(debugPort, 'audio')
}

// 命令行运行
if (import.meta.url === `file://${process.argv[1]}`) {
    const port = process.argv[2] || 9223
    const contentType = process.argv[3] || null // video, article, music, audio

    analyzeWeChatShipinhao(parseInt(port), contentType)
        .then(result => {
            const analyzer = new WeChatShipinhaoAnalyzer()
            analyzer.generateReport(result)
        })
        .catch(error => {
            console.error('\n❌ 分析失败:', error.message)
            process.exit(1)
        })
}