// automation/engines/downloaders/douyin-downloader.js
// 抖音视频下载器 - 支持真实视频和音频+图片混合内容

import fs from 'fs';
import path from 'path';

export class DouyinDownloader {
    constructor(chromeController) {
        this.chromeController = chromeController;
    }

    /**
     * 下载抖音内容主方法（支持视频和音频+图片）
     * @param {string} douyinUrl - 抖音内容URL
     * @param {string} outputDir - 输出目录
     * @returns {Object} 下载结果
     */
    async downloadContent(douyinUrl, outputDir = './downloads/douyin/') {
        console.log(`📥 开始下载抖音内容: ${douyinUrl}`);

        try {
            // 1. 获取浏览器实例
            const browserInstance = await this._getBrowserInstance();
            console.log(`✅ 使用浏览器实例: ${browserInstance.accountId} (端口: ${browserInstance.debugPort})`);

            // 2. 创建下载标签页
            const tabResponse = await this._createDownloadTab(browserInstance.accountId, douyinUrl);
            if (!tabResponse.success) {
                throw new Error(`创建下载标签页失败: ${tabResponse.error}`);
            }
            console.log(`✅ 下载标签页创建成功: ${tabResponse.tabId}`);

            // 3. 等待页面加载并分析内容
            await this.delay(5000);
            const contentAnalysis = await this._analyzeContent(browserInstance.accountId, tabResponse.tabId);

            // 4. 根据内容类型执行不同的下载策略
            let downloadResult;
            if (contentAnalysis.contentType === 'real_video') {
                downloadResult = await this._downloadVideo(contentAnalysis, outputDir);
            } else if (contentAnalysis.contentType === 'audio_image_mix') {
                downloadResult = await this._downloadAudioImages(contentAnalysis, outputDir, douyinUrl);
            } else {
                throw new Error(`不支持的内容类型: ${contentAnalysis.contentType}`);
            }

            // 5. 清理标签页
            await this._closeDownloadTab(browserInstance.accountId, tabResponse.tabId);

            console.log(`✅ 抖音内容下载成功: ${downloadResult.summary}`);
            return downloadResult;

        } catch (error) {
            console.error(`❌ 抖音内容下载失败: ${error.message}`);
            throw error;
        }
    }

    /**
     * 分析抖音内容类型和提取下载URL
     * @param {string} accountId - 浏览器账号ID
     * @param {string} tabId - 标签页ID
     * @returns {Object} 内容分析结果
     */
    async _analyzeContent(accountId, tabId) {
        console.log(`🔍 分析抖音内容类型...`);

        const analysisScript = `
            (function() {
                console.log('🔍 开始分析抖音内容...');
                
                const result = {
                    contentType: 'unknown',
                    videoData: null,
                    audioData: null,
                    imageData: [],
                    isAudioImageMix: false
                };
                
                // 1. 分析video元素
                const videos = document.querySelectorAll('video');
                console.log(\`找到 \${videos.length} 个video元素\`);
                
                for (let i = 0; i < videos.length; i++) {
                    const video = videos[i];
                    const currentSrc = video.currentSrc;
                    
                    console.log(\`Video \${i + 1}:\`);
                    console.log(\`  currentSrc: \${currentSrc || '无'}\`);
                    console.log(\`  duration: \${video.duration}\`);
                    console.log(\`  size: \${video.videoWidth}x\${video.videoHeight}\`);
                    
                    if (currentSrc && !currentSrc.startsWith('blob:')) {
                        // 检查是否为音频文件
                        if (currentSrc.includes('.mp3') || currentSrc.includes('.m4a') || currentSrc.includes('.aac')) {
                            console.log('🎵 检测到音频内容');
                            result.audioData = {
                                url: currentSrc,
                                duration: video.duration,
                                confidence: 90
                            };
                            result.isAudioImageMix = true;
                        }
                        // 检查是否为真实视频
                        else if (video.videoWidth > 0 && video.videoHeight > 0 && video.duration > 0) {
                            console.log('📹 检测到真实视频');
                            result.videoData = {
                                url: currentSrc,
                                duration: video.duration,
                                width: video.videoWidth,
                                height: video.videoHeight,
                                confidence: 85
                            };
                        }
                    }
                }
                
                // 2. 如果是音频内容，提取相关图片
                if (result.isAudioImageMix) {
                    console.log('🖼️ 提取音频内容相关图片...');
                    
                    const resourceEntries = performance.getEntriesByType('resource');
                    const contentImages = [];
                    
                    resourceEntries.forEach(entry => {
                        const url = entry.name;
                        const urlLower = url.toLowerCase();
                        
                        if ((urlLower.includes('.jpg') || urlLower.includes('.jpeg') || 
                             urlLower.includes('.png') || urlLower.includes('.webp')) &&
                            url.includes('p3-pc-sign.douyinpic.com/tos-cn-i-0813')) {
                            
                            contentImages.push({
                                url: url,
                                confidence: 90,
                                size: entry.transferSize || 0
                            });
                        } else if (urlLower.includes('.jpg') || urlLower.includes('.jpeg') || 
                                   urlLower.includes('.png') || urlLower.includes('.webp')) {
                            if (url.includes('douyinpic.com') && 
                                !url.includes('avatar') && 
                                !url.includes('icon')) {
                                contentImages.push({
                                    url: url,
                                    confidence: 60,
                                    size: entry.transferSize || 0
                                });
                            }
                        }
                    });
                    
                    // 按置信度排序
                    contentImages.sort((a, b) => b.confidence - a.confidence);
                    result.imageData = contentImages.slice(0, 10); // 最多取10张图片
                    
                    console.log(\`提取到 \${result.imageData.length} 张内容图片\`);
                }
                
                // 3. 确定内容类型
                if (result.videoData) {
                    result.contentType = 'real_video';
                } else if (result.audioData && result.imageData.length > 0) {
                    result.contentType = 'audio_image_mix';
                } else if (result.audioData) {
                    result.contentType = 'audio_only';
                } else {
                    result.contentType = 'unknown';
                }
                
                console.log(\`📋 内容分析完成: \${result.contentType}\`);
                
                return result;
            })()
        `;

        const response = await this.chromeController.httpRequest(
            `http://localhost:9528/api/browser/${accountId}/tabs/${tabId}/execute-script`,
            {
                method: 'POST',
                body: JSON.stringify({
                    script: analysisScript,
                    returnByValue: true,
                    awaitPromise: false
                })
            }
        );

        if (!response.success || !response.result?.value) {
            throw new Error('内容分析失败');
        }

        const analysis = response.result.value;
        console.log(`📊 内容分析结果: ${analysis.contentType}`);

        if (analysis.contentType === 'audio_image_mix') {
            console.log(`🎵 音频: ${analysis.audioData?.url?.substring(0, 80)}...`);
            console.log(`🖼️ 图片: ${analysis.imageData?.length} 张`);
        } else if (analysis.contentType === 'real_video') {
            console.log(`📹 视频: ${analysis.videoData?.url?.substring(0, 80)}...`);
        }

        return analysis;
    }

    /**
     * 下载真实视频文件
     * @param {Object} contentAnalysis - 内容分析结果
     * @param {string} outputDir - 输出目录
     * @returns {Object} 下载结果
     */
    async _downloadVideo(contentAnalysis, outputDir) {
        console.log(`📹 开始下载视频文件...`);

        const videoData = contentAnalysis.videoData;
        const videoDir = path.join(outputDir, 'video');

        // 确保目录存在
        if (!fs.existsSync(videoDir)) {
            fs.mkdirSync(videoDir, { recursive: true });
        }

        // 生成文件名
        const fileName = this._generateFileName('video', 'mp4');
        const filePath = path.join(videoDir, fileName);

        // 下载视频文件
        await this._downloadFile(videoData.url, filePath);
        const fileSize = fs.statSync(filePath).size;

        return {
            success: true,
            type: 'video',
            files: [{
                fileName: fileName,
                filePath: filePath,
                fileSize: fileSize,
                url: videoData.url
            }],
            summary: `视频文件: ${fileName}`,
            details: {
                duration: videoData.duration,
                resolution: `${videoData.width}x${videoData.height}`,
                fileSize: this._formatFileSize(fileSize)
            }
        };
    }

    /**
     * 下载音频+图片混合内容
     * @param {Object} contentAnalysis - 内容分析结果
     * @param {string} outputDir - 输出目录
     * @param {string} originalUrl - 原始抖音URL
     * @returns {Object} 下载结果
     */
    async _downloadAudioImages(contentAnalysis, outputDir, originalUrl) {
        console.log(`🎵 开始下载音频+图片内容...`);

        const audioData = contentAnalysis.audioData;
        const imageData = contentAnalysis.imageData;

        // 创建时间戳文件夹
        const timestamp = this._generateTimestamp();
        const articleDir = path.join(outputDir, 'article', timestamp);

        if (!fs.existsSync(articleDir)) {
            fs.mkdirSync(articleDir, { recursive: true });
        }

        console.log(`📁 创建文件夹: ${articleDir}`);

        const downloadedFiles = [];

        // 1. 下载音频文件
        if (audioData) {
            console.log(`🎵 下载音频文件...`);
            const audioFileName = `audio.mp3`;
            const audioFilePath = path.join(articleDir, audioFileName);

            await this._downloadFile(audioData.url, audioFilePath);
            const audioFileSize = fs.statSync(audioFilePath).size;

            downloadedFiles.push({
                type: 'audio',
                fileName: audioFileName,
                filePath: audioFilePath,
                fileSize: audioFileSize,
                url: audioData.url
            });

            console.log(`✅ 音频下载完成: ${audioFileName} (${this._formatFileSize(audioFileSize)})`);
        }

        // 2. 下载图片文件
        if (imageData && imageData.length > 0) {
            console.log(`🖼️ 下载 ${imageData.length} 张图片...`);

            for (let i = 0; i < imageData.length; i++) {
                const image = imageData[i];
                const imageExt = this._getFileExtension(image.url) || 'jpg';
                const imageFileName = `image_${i + 1}.${imageExt}`;
                const imageFilePath = path.join(articleDir, imageFileName);

                try {
                    await this._downloadFile(image.url, imageFilePath);
                    const imageFileSize = fs.statSync(imageFilePath).size;

                    downloadedFiles.push({
                        type: 'image',
                        fileName: imageFileName,
                        filePath: imageFilePath,
                        fileSize: imageFileSize,
                        url: image.url
                    });

                    console.log(`✅ 图片${i + 1}下载完成: ${imageFileName} (${this._formatFileSize(imageFileSize)})`);
                } catch (error) {
                    console.warn(`⚠️ 图片${i + 1}下载失败: ${error.message}`);
                }
            }
        }

        // 3. 保存元数据
        const metadataPath = path.join(articleDir, 'metadata.json');
        const metadata = {
            originalUrl: originalUrl,
            downloadTime: new Date().toISOString(),
            contentType: 'audio_image_mix',
            audioInfo: audioData ? {
                duration: audioData.duration,
                url: audioData.url
            } : null,
            imageCount: imageData ? imageData.length : 0,
            files: downloadedFiles.map(f => ({
                type: f.type,
                fileName: f.fileName,
                fileSize: f.fileSize
            }))
        };

        fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

        const totalSize = downloadedFiles.reduce((sum, file) => sum + file.fileSize, 0);

        return {
            success: true,
            type: 'audio_image_mix',
            folder: articleDir,
            files: downloadedFiles,
            summary: `音频+图片: ${downloadedFiles.filter(f => f.type === 'audio').length} 音频, ${downloadedFiles.filter(f => f.type === 'image').length} 图片`,
            details: {
                folderName: timestamp,
                totalFiles: downloadedFiles.length,
                totalSize: this._formatFileSize(totalSize),
                audioDuration: audioData?.duration,
                imageCount: imageData?.length || 0
            }
        };
    }

    /**
     * 获取可用的浏览器实例
     */
    async _getBrowserInstance() {
        const browsers = await this.chromeController.electronAPI.getBrowserInstances();

        // 优先选择media组浏览器
        let browserInstance = browsers.find(browser =>
            browser.group === 'media' && browser.status === 'running'
        );

        // 如果没有media组，选择任意运行中的浏览器
        if (!browserInstance) {
            browserInstance = browsers.find(browser => browser.status === 'running');
        }

        if (!browserInstance) {
            throw new Error('没有可用的运行中浏览器实例');
        }

        return browserInstance;
    }

    /**
     * 创建下载专用标签页
     */
    async _createDownloadTab(accountId, douyinUrl) {
        console.log(`🔄 创建下载标签页: ${douyinUrl}`);

        try {
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
     * 关闭下载标签页
     */
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
     * 下载文件到本地
     * @param {string} url - 文件URL
     * @param {string} filePath - 本地文件路径
     */
    async _downloadFile(url, filePath) {
        console.log(`📥 下载文件: ${path.basename(filePath)}`);

        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': '*/*',
            'Referer': 'https://www.douyin.com/',
            'sec-fetch-dest': 'audio',
            'sec-fetch-mode': 'cors',
            'sec-fetch-site': 'cross-site'
        };

        const response = await fetch(url, {
            headers: headers,
            method: 'GET'
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const totalSize = parseInt(response.headers.get('content-length') || '0');
        const fileStream = fs.createWriteStream(filePath);
        let downloadedSize = 0;

        const reader = response.body.getReader();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            fileStream.write(value);
            downloadedSize += value.length;

            // 显示进度
            if (totalSize > 0) {
                const progress = Math.round((downloadedSize / totalSize) * 100);
                process.stdout.write(`\r📥 下载进度: ${progress}% (${this._formatFileSize(downloadedSize)}/${this._formatFileSize(totalSize)})`);
            }
        }

        fileStream.end();
        console.log(`\n✅ 文件下载完成: ${filePath}`);
    }

    /**
     * 生成文件名
     * @param {string} type - 文件类型 ('video', 'audio', 'image')
     * @param {string} ext - 文件扩展名
     * @returns {string} 文件名
     */
    _generateFileName(type, ext) {
        const now = new Date();
        const timestamp = now.toISOString()
            .replace(/[-:]/g, '')
            .replace(/\..+/, '')
            .replace('T', '_');
        return `douyin_${type}_${timestamp}.${ext}`;
    }

    /**
     * 生成时间戳文件夹名
     * @returns {string} 时间戳
     */
    _generateTimestamp() {
        const now = new Date();
        return now.toISOString()
            .replace(/[-:]/g, '')
            .replace(/\..+/, '')
            .replace('T', '_');
    }

    /**
     * 获取文件扩展名
     * @param {string} url - 文件URL
     * @returns {string} 扩展名
     */
    _getFileExtension(url) {
        try {
            const urlObj = new URL(url);
            const pathname = urlObj.pathname;
            const match = pathname.match(/\.([a-zA-Z0-9]+)$/);
            return match ? match[1] : null;
        } catch (e) {
            return null;
        }
    }

    /**
     * 格式化文件大小
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
     */
    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ==================== 兼容性方法 ====================

    /**
     * 兼容原有的downloadVideo方法
     * @param {string} douyinUrl - 抖音URL
     * @param {string} outputDir - 输出目录
     * @returns {Object} 下载结果
     */
    async downloadVideo(douyinUrl, outputDir) {
        return this.downloadContent(douyinUrl, outputDir);
    }
}