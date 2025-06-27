/**
     * 关闭下载标签页
     * @param {string} accountId - 浏览器账号ID
     * @param {string} tabId - 标签页ID
     */// automation/engines/downloaders/douyin-downloader.js
// 抖音视频下载器 - 参考发布器的标签页创建方式

import fs from 'fs';
import path from 'path';

export class DouyinDownloader {
    constructor(chromeController) {
        this.chromeController = chromeController;
    }

    /**
     * 下载抖音视频主方法
     * @param {string} douyinUrl - 抖音视频URL
     * @param {string} outputDir - 输出目录
     * @returns {Object} 下载结果
     */
    async downloadVideo(douyinUrl, outputDir = '/oper/work/endian/rpa-platform/downloads/douyin/') {
        console.log(`📥 开始下载抖音视频: ${douyinUrl}`);

        try {
            // 1. 获取media组的浏览器实例
            const browsers = await this.chromeController.electronAPI.getBrowserInstances();
            const mediaBrowser = browsers.find(browser =>
                browser.group === 'media' && browser.status === 'running'
            );

            if (!mediaBrowser) {
                // 如果没有media组浏览器，使用任意运行中的浏览器
                const runningBrowser = browsers.find(browser => browser.status === 'running');
                if (!runningBrowser) {
                    throw new Error('没有可用的运行中浏览器实例');
                }
                console.log(`⚠️ 未找到media组浏览器，使用: ${runningBrowser.accountId}`);
                var browserInstance = runningBrowser;
            } else {
                console.log(`✅ 找到media组浏览器: ${mediaBrowser.accountId}`);
                var browserInstance = mediaBrowser;
            }

            console.log(`✅ 使用浏览器实例: ${browserInstance.accountId} (端口: ${browserInstance.debugPort})`);

            // 2. 直接创建标签页导航到抖音视频页面
            const tabResponse = await this._createDownloadTab(browserInstance.accountId, douyinUrl);

            if (!tabResponse.success) {
                throw new Error(`创建下载标签页失败: ${tabResponse.error}`);
            }

            console.log(`✅ 下载标签页创建成功: ${tabResponse.tabId}`);

            // 3. 等待视频页面加载完成，并尝试滚动触发视频加载
            await this.delay(3000); // 先等待基本页面加载

            // 执行页面滚动和交互，参考Python代码中的logic
            await this._triggerVideoLoading(browserInstance.accountId, tabResponse.tabId);

            // 再等待视频开始加载
            await this.delay(5000);

            // 4. 提取视频真实下载URL
            const videoUrl = await this._extractVideoUrlFromTab(browserInstance.accountId, tabResponse.tabId);

            // 5. 下载视频文件
            const fileName = this._generateFileName();
            const filePath = await this._downloadVideoFile(videoUrl, outputDir, fileName);

            // 6. 清理标签页
            await this._closeDownloadTab(browserInstance.accountId, tabResponse.tabId);

            console.log(`✅ 抖音视频下载成功: ${filePath}`);

            return {
                success: true,
                filePath: filePath,
                fileName: fileName,
                originalUrl: douyinUrl,
                videoUrl: videoUrl,
                fileSize: fs.statSync(filePath).size
            };

        } catch (error) {
            console.error(`❌ 抖音视频下载失败: ${error.message}`);
            throw error;
        }
    }

    /**
     * 创建下载专用标签页
     * @param {string} accountId - 浏览器账号ID
     * @param {string} douyinUrl - 抖音视频URL
     * @returns {Object} 标签页创建结果
     */
    async _createDownloadTab(accountId, douyinUrl) {
        console.log(`🔄 创建下载标签页: ${douyinUrl}`);

        try {
            // 直接调用浏览器API创建标签页并导航
            const response = await this.chromeController.httpRequest(
                `http://localhost:9528/api/browser/${accountId}/tabs`,
                {
                    method: 'POST',
                    body: JSON.stringify({
                        url: douyinUrl,
                        platform: 'douyin_download'
                    })
                }
            );

            if (!response.success) {
                throw new Error(response.error);
            }

            console.log(`✅ 标签页创建成功，导航到: ${douyinUrl}`);
            return {
                success: true,
                tabId: response.tabId,
                sessionKey: response.sessionKey
            };

        } catch (error) {
            console.error(`❌ 创建下载标签页失败: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * 从标签页提取视频URL - 使用CDP方法（参考Python逻辑）
     * @param {string} accountId - 浏览器账号ID
     * @param {string} tabId - 标签页ID
     * @returns {string} 视频下载URL
     */
    async _extractVideoUrlFromTab(accountId, tabId) {
        console.log(`🔍 从标签页提取视频URL: ${tabId}`);

        try {
            // 方法1: 启用CDP网络监听（关键！参考Python代码）
            console.log('🌐 启用CDP网络监听...');
            await this._enableCDPNetworkMonitoring(accountId, tabId);

            // 方法2: 触发页面交互，确保视频开始加载
            await this._triggerVideoPlayback(accountId, tabId);

            // 方法3: 等待并收集网络请求
            console.log('⏳ 等待网络请求...');
            await this.delay(3000);

            // 方法4: 从多个来源提取URL
            const videoUrl = await this._extractFromMultipleSources(accountId, tabId);

            return videoUrl;

        } catch (error) {
            console.error(`❌ 视频URL提取失败: ${error.message}`);
            throw error;
        }
    }

    /**
     * 启用CDP网络监听（参考Python的execute_cdp_cmd逻辑）
     */
    async _enableCDPNetworkMonitoring(accountId, tabId) {
        const enableScript = `
            (function() {
                return new Promise((resolve) => {
                    try {
                        console.log('🔧 启用网络监听...');
                        
                        // 存储捕获的请求
                        window._videoRequests = [];
                        
                        // 方法1: 拦截fetch（类似CDP Network.enable）
                        if (!window._fetchIntercepted) {
                            const originalFetch = window.fetch;
                            window.fetch = function(...args) {
                                const url = args[0];
                                if (typeof url === 'string' && _isVideoUrl(url)) {
                                    console.log('🎥 Fetch拦截到视频URL:', url);
                                    window._videoRequests.push({
                                        type: 'fetch',
                                        url: url,
                                        timestamp: Date.now()
                                    });
                                }
                                return originalFetch.apply(this, args);
                            };
                            window._fetchIntercepted = true;
                        }
                        
                        // 方法2: 拦截XHR请求
                        if (!window._xhrIntercepted) {
                            const originalOpen = XMLHttpRequest.prototype.open;
                            XMLHttpRequest.prototype.open = function(method, url, ...args) {
                                if (typeof url === 'string' && _isVideoUrl(url)) {
                                    console.log('🎥 XHR拦截到视频URL:', url);
                                    window._videoRequests.push({
                                        type: 'xhr',
                                        url: url,
                                        timestamp: Date.now()
                                    });
                                }
                                return originalOpen.apply(this, arguments);
                            };
                            window._xhrIntercepted = true;
                        }
                        
                        // 方法3: Performance Observer（类似Python的performance entries）
                        if (!window._performanceObserver) {
                            const observer = new PerformanceObserver((list) => {
                                for (const entry of list.getEntries()) {
                                    if (entry.name && _isVideoUrl(entry.name)) {
                                        console.log('🎥 Performance捕获到视频URL:', entry.name);
                                        window._videoRequests.push({
                                            type: 'performance',
                                            url: entry.name,
                                            timestamp: Date.now(),
                                            duration: entry.duration
                                        });
                                    }
                                }
                            });
                            observer.observe({entryTypes: ['resource']});
                            window._performanceObserver = observer;
                        }
                        
                        // 视频URL检测函数
                        function _isVideoUrl(url) {
                            if (!url || typeof url !== 'string') return false;
                            
                            const urlLower = url.toLowerCase();
                            
                            // 抖音视频特征（更新后的检测规则）
                            const videoIndicators = [
                                '.mp4',
                                'douyinstatic.com',
                                'uuu_',
                                '/obj/douyin-pc-web/',
                                'lf-douyin-pc-web',
                                'douyinvod.com',
                                'bytedance.com'
                            ];
                            
                            const hasVideoIndicator = videoIndicators.some(indicator => 
                                urlLower.includes(indicator));
                            
                            // 排除音频和其他文件
                            const excludePatterns = [
                                '.mp3', '.aac', '.m4a',
                                '.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg',
                                '.woff', '.ttf', '.eot', '.json', '.xml', '.html', '.webp'
                            ];
                            
                            const hasExcludePattern = excludePatterns.some(pattern => 
                                urlLower.includes(pattern));
                            
                            return hasVideoIndicator && !hasExcludePattern;
                        }
                        
                        resolve({ success: true, message: 'CDP网络监听已启用' });
                        
                    } catch (e) {
                        resolve({ success: false, error: e.message });
                    }
                });
            })()
        `;

        const response = await this.chromeController.httpRequest(
            `http://localhost:9528/api/browser/${accountId}/tabs/${tabId}/execute-script`,
            {
                method: 'POST',
                body: JSON.stringify({
                    script: enableScript,
                    returnByValue: true,
                    awaitPromise: true
                })
            }
        );

        if (response.success) {
            console.log('✅ CDP网络监听启用成功');
        } else {
            console.warn('⚠️ CDP网络监听启用失败');
        }
    }

    /**
     * 触发视频播放（参考Python代码的交互逻辑）
     */
    async _triggerVideoPlayback(accountId, tabId) {
        const playbackScript = `
            (function() {
                try {
                    console.log('🎬 触发视频播放...');
                    
                    // 1. 滚动页面（参考Python代码）
                    window.scrollTo(0, 300);
                    
                    // 2. 查找并播放所有video元素
                    const videos = document.querySelectorAll('video');
                    console.log(\`找到 \${videos.length} 个video元素\`);
                    
                    videos.forEach((video, index) => {
                        console.log(\`处理video \${index + 1}\`);
                        
                        // 点击video元素
                        video.click();
                        
                        // 尝试播放
                        if (video.paused) {
                            video.play().catch(e => 
                                console.log(\`播放失败: \${e.message}\`));
                        }
                        
                        // 触发loadstart事件（可能触发网络请求）
                        video.load();
                    });
                    
                    // 3. 查找播放按钮
                    const playSelectors = [
                        '[data-e2e="video-play-button"]',
                        '.play-button',
                        '[aria-label*="播放"]',
                        '[aria-label*="play"]',
                        '.video-play-icon',
                        '.play-icon'
                    ];
                    
                    playSelectors.forEach(selector => {
                        const buttons = document.querySelectorAll(selector);
                        buttons.forEach(button => {
                            console.log(\`点击播放按钮: \${selector}\`);
                            button.click();
                        });
                    });
                    
                    // 4. 触发鼠标事件
                    const videoContainers = document.querySelectorAll(
                        '[data-e2e="video-container"], .video-container, .video-player'
                    );
                    videoContainers.forEach(container => {
                        container.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                        container.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
                    });
                    
                    return { success: true };
                    
                } catch (e) {
                    return { success: false, error: e.message };
                }
            })()
        `;

        await this.chromeController.httpRequest(
            `http://localhost:9528/api/browser/${accountId}/tabs/${tabId}/execute-script`,
            {
                method: 'POST',
                body: JSON.stringify({
                    script: playbackScript,
                    returnByValue: true
                })
            }
        );
    }

    /**
     * 从多个来源提取视频URL（参考Python代码的多方法组合）
     */
    async _extractFromMultipleSources(accountId, tabId) {
        const extractScript = `
            (function() {
                return new Promise((resolve) => {
                    try {
                        console.log('🔍 从多个来源提取视频URL...');
                        
                        let foundUrls = [];
                        
                        // 来源1: 检查拦截到的请求
                        if (window._videoRequests && window._videoRequests.length > 0) {
                            console.log(\`来源1: 拦截请求 - 找到 \${window._videoRequests.length} 个\`);
                            foundUrls = foundUrls.concat(
                                window._videoRequests.map(req => req.url)
                            );
                        }
                        
                        // 来源2: Performance API
                        const resourceEntries = performance.getEntriesByType('resource');
                        const performanceUrls = resourceEntries
                            .map(entry => entry.name)
                            .filter(url => {
                                const urlLower = url.toLowerCase();
                                return (urlLower.includes('douyinstatic.com') && 
                                       urlLower.includes('.mp4')) ||
                                       urlLower.includes('uuu_265.mp4') ||
                                       (urlLower.includes('lf-douyin-pc-web') && 
                                        urlLower.includes('.mp4'));
                            });
                        
                        if (performanceUrls.length > 0) {
                            console.log(\`来源2: Performance API - 找到 \${performanceUrls.length} 个\`);
                            foundUrls = foundUrls.concat(performanceUrls);
                        }
                        
                        // 来源3: 检查video元素的src
                        const videos = document.querySelectorAll('video');
                        videos.forEach(video => {
                            if (video.src && video.src.includes('.mp4')) {
                                console.log('来源3: Video.src -', video.src);
                                foundUrls.push(video.src);
                            }
                            if (video.currentSrc && video.currentSrc.includes('.mp4')) {
                                console.log('来源3: Video.currentSrc -', video.currentSrc);
                                foundUrls.push(video.currentSrc);
                            }
                        });
                        
                        // 去重和排序
                        const uniqueUrls = [...new Set(foundUrls)];
                        const sortedUrls = uniqueUrls.sort((a, b) => {
                            // 优先级: lf-douyin-pc-web > douyinstatic > 其他
                            const aScore = a.includes('lf-douyin-pc-web') ? 3 : 
                                          a.includes('douyinstatic') ? 2 : 1;
                            const bScore = b.includes('lf-douyin-pc-web') ? 3 : 
                                          b.includes('douyinstatic') ? 2 : 1;
                            return bScore - aScore;
                        });
                        
                        console.log(\`总共找到 \${sortedUrls.length} 个候选URL\`);
                        sortedUrls.forEach((url, i) => {
                            console.log(\`  \${i + 1}. \${url.substring(0, 80)}...\`);
                        });
                        
                        if (sortedUrls.length > 0) {
                            resolve({
                                success: true,
                                videoUrl: sortedUrls[0],
                                allUrls: sortedUrls,
                                method: 'multi_source_cdp'
                            });
                        } else {
                            resolve({
                                success: false,
                                error: '未找到视频URL',
                                debug: {
                                    interceptedRequests: window._videoRequests ? window._videoRequests.length : 0,
                                    performanceEntries: resourceEntries.length,
                                    videoElements: videos.length
                                }
                            });
                        }
                        
                    } catch (e) {
                        resolve({
                            success: false,
                            error: e.message,
                            stack: e.stack
                        });
                    }
                });
            })()
        `;

        const response = await this.chromeController.httpRequest(
            `http://localhost:9528/api/browser/${accountId}/tabs/${tabId}/execute-script`,
            {
                method: 'POST',
                body: JSON.stringify({
                    script: extractScript,
                    returnByValue: true,
                    awaitPromise: true
                })
            }
        );

        if (!response.success) {
            throw new Error(response.error);
        }

        const extractResult = response.result.value;

        if (!extractResult.success) {
            throw new Error(`视频URL提取失败: ${extractResult.error || '未找到视频URL'}`);
        }

        console.log(`✅ 视频URL提取成功，使用方法: ${extractResult.method}`);
        return extractResult.videoUrl;
    }

    /**
     * 触发视频加载（参考Python代码逻辑）
     * @param {string} accountId - 浏览器账号ID
     * @param {string} tabId - 标签页ID
     */
    async _triggerVideoLoading(accountId, tabId) {
        console.log(`🔄 触发视频加载和交互...`);

        const triggerScript = `
            (function() {
                try {
                    console.log('🔄 执行页面交互触发视频加载...');
                    
                    // 1. 滚动页面，类似Python代码中的滚动逻辑
                    window.scrollTo(0, 300);
                    console.log('✅ 页面已滚动');
                    
                    // 2. 查找并点击视频区域
                    const videoElements = document.querySelectorAll('video');
                    console.log(\`找到 \${videoElements.length} 个video元素\`);
                    
                    videoElements.forEach((video, index) => {
                        console.log(\`处理第 \${index + 1} 个video元素\`);
                        
                        // 尝试播放视频
                        if (video.paused) {
                            video.play().catch(e => console.log(\`播放失败: \${e.message}\`));
                        }
                        
                        // 触发交互事件
                        video.click();
                        
                        // 检查video属性
                        console.log(\`Video \${index + 1} 信息:\`);
                        console.log(\`  src: \${video.src || '无'}\`);
                        console.log(\`  currentSrc: \${video.currentSrc || '无'}\`);
                        console.log(\`  readyState: \${video.readyState}\`);
                        console.log(\`  networkState: \${video.networkState}\`);
                    });
                    
                    // 3. 查找可能的播放按钮并点击
                    const playButtons = document.querySelectorAll('[data-e2e="video-play-button"], .play-button, [aria-label*="播放"], [aria-label*="play"]');
                    console.log(\`找到 \${playButtons.length} 个可能的播放按钮\`);
                    
                    playButtons.forEach((button, index) => {
                        console.log(\`点击播放按钮 \${index + 1}\`);
                        button.click();
                    });
                    
                    // 4. 触发鼠标事件，模拟用户交互
                    const videoContainers = document.querySelectorAll('[data-e2e="video-container"], .video-container, .video-player');
                    videoContainers.forEach((container, index) => {
                        console.log(\`触发容器 \${index + 1} 的鼠标事件\`);
                        container.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                        container.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
                    });
                    
                    return { success: true, message: '页面交互完成' };
                    
                } catch (e) {
                    console.error('页面交互异常:', e);
                    return { success: false, error: e.message };
                }
            })()
        `;

        try {
            const response = await this.chromeController.httpRequest(
                `http://localhost:9528/api/browser/${accountId}/tabs/${tabId}/execute-script`,
                {
                    method: 'POST',
                    body: JSON.stringify({
                        script: triggerScript,
                        returnByValue: true,
                        awaitPromise: false
                    })
                }
            );

            if (response.success) {
                console.log(`✅ 页面交互触发完成`);
            } else {
                console.warn(`⚠️ 页面交互触发失败: ${response.error}`);
            }

        } catch (error) {
            console.warn(`⚠️ 页面交互触发异常: ${error.message}`);
        }
    }
    async _closeDownloadTab(accountId, tabId) {
        try {
            await this.chromeController.httpRequest(
                `http://localhost:9528/api/browser/${accountId}/tabs/${tabId}`,
                { method: 'DELETE' }
            );
            console.log(`✅ 下载标签页已关闭: ${tabId}`);
        } catch (error) {
            console.warn(`⚠️ 关闭下载标签页失败: ${error.message}`);
        }
    }

    /**
     * 下载视频文件
     * @param {string} videoUrl - 视频下载URL
     * @param {string} outputDir - 输出目录
     * @param {string} fileName - 文件名
     * @returns {string} 文件完整路径
     */
    async _downloadVideoFile(videoUrl, outputDir, fileName) {
        console.log(`📥 开始下载视频文件: ${fileName}`);

        try {
            // 确保输出目录存在
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
                console.log(`✅ 创建输出目录: ${outputDir}`);
            }

            const filePath = path.join(outputDir, fileName);

            // 设置下载请求的headers
            const headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': '*/*',
                'Referer': 'https://www.douyin.com/',
                'sec-fetch-dest': 'video',
                'sec-fetch-mode': 'cors',
                'sec-fetch-site': 'cross-site'
            };

            // 使用fetch下载文件
            const response = await fetch(videoUrl, {
                headers: headers,
                method: 'GET'
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const totalSize = parseInt(response.headers.get('content-length') || '0');
            console.log(`📊 文件大小: ${this._formatFileSize(totalSize)}`);

            // 创建写入流
            const fileStream = fs.createWriteStream(filePath);
            let downloadedSize = 0;

            // 读取响应流并写入文件
            const reader = response.body.getReader();

            while (true) {
                const { done, value } = await reader.read();

                if (done) break;

                fileStream.write(value);
                downloadedSize += value.length;

                // 显示下载进度
                if (totalSize > 0) {
                    const progress = Math.round((downloadedSize / totalSize) * 100);
                    process.stdout.write(`\r📥 下载进度: ${progress}% (${this._formatFileSize(downloadedSize)}/${this._formatFileSize(totalSize)})`);
                }
            }

            fileStream.end();
            console.log(`\n✅ 视频文件下载完成: ${filePath}`);

            return filePath;

        } catch (error) {
            console.error(`❌ 视频文件下载失败: ${error.message}`);
            throw new Error(`视频下载失败: ${error.message}`);
        }
    }

    /**
     * 生成基于时间戳的文件名
     * @returns {string} 文件名
     */
    _generateFileName() {
        const now = new Date();
        const timestamp = now.toISOString()
            .replace(/[-:]/g, '')
            .replace(/\..+/, '')
            .replace('T', '_');

        return `douyin_${timestamp}.mp4`;
    }

    /**
     * 格式化文件大小显示
     * @param {number} bytes - 字节数
     * @returns {string} 格式化后的大小
     */
    _formatFileSize(bytes) {
        if (bytes === 0) return '0 B';

        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));

        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * 延迟工具方法
     * @param {number} ms - 延迟毫秒数
     * @returns {Promise} Promise对象
     */
    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}