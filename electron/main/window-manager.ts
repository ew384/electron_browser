import { BrowserWindow, session } from 'electron';
import { FingerprintGenerator } from './fingerprint/generator';
import { FingerprintValidator } from './fingerprint/validator';
import { BrowserInstance, AccountConfig, FingerprintConfig } from '../shared/types';
import * as path from 'path';

export class WindowManager {
  private instances = new Map<string, BrowserInstance>();
  private fingerprintConfigs = new Map<string, FingerprintConfig>();

  // 存储每个窗口的指纹配置，供 preload 脚本查询
  private static windowFingerprintMap = new Map<number, FingerprintConfig>();

  // 实例计数器确保每个实例都不同
  private static instanceCounter = 0;

  // 确保静态 Map 被正确初始化
  static {
    console.log('[WindowManager] Static windowFingerprintMap initialized');
  }

  async createBrowserInstance(accountId: string, config: AccountConfig): Promise<BrowserInstance> {
    try {
      console.log(`[WindowManager] Creating browser instance for account: ${accountId}`);

      // 检查是否已存在实例
      const existingInstance = this.instances.get(accountId);
      if (existingInstance) {
        const existingWindow = BrowserWindow.fromId(existingInstance.windowId);
        if (existingWindow && !existingWindow.isDestroyed()) {
          console.log(`[WindowManager] Instance already exists for account ${accountId}`);
          existingWindow.focus();
          return existingInstance;
        }
      }

      // 生成完全独特的指纹配置
      const fingerprintConfig = this.generateStrongUniqueFingerprint(accountId);
      this.fingerprintConfigs.set(accountId, fingerprintConfig);

      console.log(`[WindowManager] ✅ Generated GUARANTEED UNIQUE fingerprint for ${accountId}:`, {
        platform: fingerprintConfig.navigator.platform,
        language: fingerprintConfig.navigator.language,
        screenSize: `${fingerprintConfig.screen.width}x${fingerprintConfig.screen.height}`,
        canvasNoise: fingerprintConfig.canvas.noise,
        hardwareConcurrency: fingerprintConfig.navigator.hardwareConcurrency,
        canvasSeed: fingerprintConfig.canvas.seed
      });

      // 验证指纹质量
      const quality = FingerprintValidator.validateFingerprint(fingerprintConfig);
      if (quality.score < 70) {
        console.warn(`[WindowManager] Low fingerprint quality for account ${accountId}:`, quality.issues);
      }

      // 创建独立的session
      const partition = `persist:account-${accountId}`;
      const ses = session.fromPartition(partition);

      // 配置User-Agent
      const userAgent = config.userAgent || this.generateUserAgent(fingerprintConfig);
      ses.setUserAgent(userAgent);
      console.log(`[WindowManager] User-Agent for ${accountId}:`, userAgent);

      // 配置代理
      if (config.proxy) {
        await ses.setProxy({ proxyRules: config.proxy });
        console.log(`[WindowManager] Proxy configured for ${accountId}:`, config.proxy);
      }

      // 设置视口大小
      const viewport = config.viewport || {
        width: fingerprintConfig.screen.width || 1280,
        height: fingerprintConfig.screen.height || 720,
        deviceScaleFactor: fingerprintConfig.screen.pixelRatio || 1
      };

      // 创建浏览器窗口
      const window = new BrowserWindow({
        width: viewport.width,
        height: viewport.height,
        webPreferences: {
          partition,
          preload: path.join(__dirname, '../preload/index.js'),
          contextIsolation: true,
          nodeIntegration: false,
          webSecurity: true,
          allowRunningInsecureContent: false,
          experimentalFeatures: false
        },
        show: false,
        title: `Browser - ${accountId}`
      });

      // 关键：在窗口创建后立即存储指纹配置
      WindowManager.windowFingerprintMap.set(window.id, fingerprintConfig);
      console.log(`[WindowManager] ✅ Stored fingerprint config for window ${window.id}`);

      // 强化的Canvas指纹注入脚本
      const canvasInjectionScript = `
        (function() {
          if (window.__CANVAS_PATCHED__) return;
          window.__CANVAS_PATCHED__ = true;
          
          const accountId = '${accountId}';
          const uniqueSeed = ${fingerprintConfig.canvas.seed || Date.now()};
          
          console.log('[Canvas Protection] Initializing for account:', accountId, 'seed:', uniqueSeed);
          
          // 保存原始方法
          const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
          const originalToBlob = HTMLCanvasElement.prototype.toBlob;
          const originalGetImageData = CanvasRenderingContext2D.prototype.getImageData;
          
          // 重写toDataURL
          HTMLCanvasElement.prototype.toDataURL = function(type, quality) {
            // 对于空canvas，直接返回
            if (this.width === 0 || this.height === 0) {
              return originalToDataURL.call(this, type, quality);
            }
            
            // 创建临时canvas
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = this.width;
            tempCanvas.height = this.height;
            const tempCtx = tempCanvas.getContext('2d');
            
            if (!tempCtx) {
              return originalToDataURL.call(this, type, quality);
            }
            
            // 复制原始内容
            tempCtx.drawImage(this, 0, 0);
            
            // 获取图像数据并添加噪声
            try {
              const imageData = tempCtx.getImageData(0, 0, this.width, this.height);
              const data = imageData.data;
              
              // 使用账号特定的种子生成器
              let seed = uniqueSeed + this.width * this.height;
              function random() {
                seed = (seed * 9301 + 49297) % 233280;
                return seed / 233280;
              }
              
              // 修改像素 - 每个账号有不同的修改模式
              const modifyRate = 0.05 + (uniqueSeed % 100) / 1000; // 5-15%的像素
              let modifiedCount = 0;
              
              for (let i = 0; i < data.length; i += 4) {
                if (random() < modifyRate) {
                  // 不同账号使用不同的噪声强度
                  const noiseStrength = 3 + (uniqueSeed % 5);
                  const offset = Math.floor(random() * noiseStrength * 2) - noiseStrength;
                  
                  // 修改RGB通道
                  data[i] = Math.max(0, Math.min(255, data[i] + offset));
                  data[i+1] = Math.max(0, Math.min(255, data[i+1] + offset));
                  data[i+2] = Math.max(0, Math.min(255, data[i+2] + offset));
                  modifiedCount++;
                }
              }
              
              tempCtx.putImageData(imageData, 0, 0);
              console.log('[Canvas Protection] Modified', modifiedCount, 'pixels out of', data.length/4);
              
            } catch (e) {
              console.error('[Canvas Protection] Failed to inject noise:', e);
            }
            
            const result = originalToDataURL.call(tempCanvas, type, quality);
            console.log('[Canvas Protection] Generated fingerprint for', accountId);
            return result;
          };
          
          // 重写toBlob
          HTMLCanvasElement.prototype.toBlob = function(callback, type, quality) {
            const dataURL = this.toDataURL(type, quality);
            const arr = dataURL.split(',');
            const mime = arr[0].match(/:(.*?);/)[1];
            const bstr = atob(arr[1]);
            let n = bstr.length;
            const u8arr = new Uint8Array(n);
            while(n--) {
              u8arr[n] = bstr.charCodeAt(n);
            }
            const blob = new Blob([u8arr], {type: mime});
            if (callback) callback(blob);
          };
          
          // 测试函数
          window.__testCanvasFingerprint = function() {
            const canvas = document.createElement('canvas');
            canvas.width = 200;
            canvas.height = 50;
            const ctx = canvas.getContext('2d');
            
            ctx.textBaseline = 'top';
            ctx.font = '14px Arial';
            ctx.fillStyle = '#f60';
            ctx.fillRect(125, 1, 62, 20);
            ctx.fillStyle = '#069';
            ctx.fillText('BrowserLeaks.com', 2, 15);
            ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
            ctx.fillText('BrowserLeaks.com', 4, 17);
            
            return canvas.toDataURL();
          };
          
          console.log('[Canvas Protection] ✅ Canvas fingerprint protection active for:', accountId);
        })();
      `;

      // 强化的配置注入 - 使用多种方式确保配置传递
      const injectConfigScript = `
        (function() {
          console.log('[WindowManager-Inject] 🚀 强制注入配置...');
          
          // 方法1: 直接设置全局变量
          window.__FINGERPRINT_CONFIG__ = ${JSON.stringify(fingerprintConfig)};
          window.__ACCOUNT_ID__ = '${accountId}';
          
          // 方法2: 设置到 window 原型上
          Object.defineProperty(window, '_FINGERPRINT_CONFIG_', {
            value: ${JSON.stringify(fingerprintConfig)},
            writable: false,
            enumerable: false,
            configurable: false
          });
          
          // 方法3: 立即执行指纹注入
          if (typeof applyFingerprintInjection === 'function') {
            applyFingerprintInjection(${JSON.stringify(fingerprintConfig)}, '${accountId}');
          }
          
          console.log('[WindowManager-Inject] ✅ 配置注入完成');
          console.log('[WindowManager-Inject] 账号:', '${accountId}');
          console.log('[WindowManager-Inject] 平台:', '${fingerprintConfig.navigator.platform}');
          console.log('[WindowManager-Inject] Canvas种子:', ${fingerprintConfig.canvas.seed});
        })();
      `;

      // 在DOM准备前注入
      window.webContents.once('dom-ready', () => {
        console.log(`[WindowManager] DOM-READY: 强制注入配置到窗口 ${window.id}`);
        window.webContents.executeJavaScript(injectConfigScript).catch(err =>
          console.error('[WindowManager] 配置注入失败:', err)
        );
        // 同时注入Canvas保护
        window.webContents.executeJavaScript(canvasInjectionScript).catch(err =>
          console.error('[WindowManager] Canvas注入失败:', err)
        );
      });

      // 在页面加载前也注入一次 - 这是最关键的
      window.webContents.on('will-navigate', (event, url) => {
        console.log(`[WindowManager] WILL-NAVIGATE: 窗口 ${window.id} 导航到:`, url);

        // 先注入Canvas保护
        window.webContents.executeJavaScript(canvasInjectionScript).catch(err =>
          console.error('[WindowManager] 导航时Canvas注入失败:', err)
        );

        // 再注入配置
        window.webContents.executeJavaScript(injectConfigScript).catch(err =>
          console.error('[WindowManager] 导航时配置注入失败:', err)
        );
      });

      // 页面完全加载后再次确保
      window.webContents.once('did-finish-load', () => {
        console.log(`[WindowManager] DID-FINISH-LOAD: 最终配置检查 窗口 ${window.id}`);

        const finalScript = `
          (function() {
            console.log('[WindowManager-Final] 🎯 最终配置验证...');
            
            if (!window.__FINGERPRINT_CONFIG__) {
              console.log('[WindowManager-Final] 紧急注入配置!');
              window.__FINGERPRINT_CONFIG__ = ${JSON.stringify(fingerprintConfig)};
              window.__ACCOUNT_ID__ = '${accountId}';
              
              // 手动触发重新注入
              if (window.electronAPI && window.electronAPI.forceReinject) {
                window.electronAPI.forceReinject();
              }
            }
            
            // 测试Canvas指纹
            if (window.__testCanvasFingerprint) {
              const fp = window.__testCanvasFingerprint();
              console.log('[WindowManager-Final] Canvas指纹测试:', fp.substring(0, 50) + '...');
            }
            
            console.log('[WindowManager-Final] 配置状态:', !!window.__FINGERPRINT_CONFIG__);
            console.log('[WindowManager-Final] Canvas保护:', !!window.__CANVAS_PATCHED__);
            console.log('[WindowManager-Final] 账号ID:', window.__ACCOUNT_ID__);
          })();
        `;

        window.webContents.executeJavaScript(finalScript).catch(err =>
          console.error('[WindowManager] 最终配置注入失败:', err)
        );
      });

      // 加载默认页面
      const startUrl = config.startUrl || 'https://browserleaks.com/canvas';
      console.log(`[WindowManager] Loading URL for ${accountId}: ${startUrl}`);

      await window.loadURL(startUrl);
      window.show();

      const instance: BrowserInstance = {
        accountId,
        windowId: window.id,
        status: 'running',
        url: startUrl
      };

      this.instances.set(accountId, instance);
      console.log(`[WindowManager] ✅ Browser instance created successfully for account ${accountId}, window ID: ${window.id}`);

      // 监听窗口关闭事件
      window.on('closed', () => {
        console.log(`[WindowManager] Browser window closed for account ${accountId}`);
        instance.status = 'stopped';
        this.instances.delete(accountId);
        WindowManager.windowFingerprintMap.delete(window.id);
        console.log(`[WindowManager] Cleaned up fingerprint config for window ${window.id}`);
      });

      return instance;
    } catch (error) {
      console.error(`[WindowManager] Failed to create browser instance:`, error);
      this.instances.delete(accountId);
      throw error;
    }
  }

  // 强化的指纹生成 - 确保显著差异
  private generateStrongUniqueFingerprint(accountId: string): FingerprintConfig {
    WindowManager.instanceCounter++;

    console.log(`[WindowManager] 🎲 生成强化唯一指纹 #${WindowManager.instanceCounter} for: ${accountId}`);

    // 预定义配置 - 每个实例使用完全不同的配置
    const allConfigs = [
      {
        platform: 'Win32',
        language: { primary: 'en-US', list: ['en-US', 'en'] },
        screen: { width: 1920, height: 1080 },
        cores: 8,
        pixelRatio: 1,
        webgl: { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)' }
      },
      {
        platform: 'MacIntel',
        language: { primary: 'zh-CN', list: ['zh-CN', 'zh', 'en'] },
        screen: { width: 1366, height: 768 },
        cores: 6,
        pixelRatio: 2,
        webgl: { vendor: 'Google Inc. (AMD)', renderer: 'ANGLE (AMD, AMD Radeon RX 6700 XT Direct3D11 vs_5_0 ps_5_0, D3D11)' }
      },
      {
        platform: 'Linux x86_64',
        language: { primary: 'ja-JP', list: ['ja-JP', 'ja', 'en'] },
        screen: { width: 1440, height: 900 },
        cores: 4,
        pixelRatio: 1,
        webgl: { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)' }
      },
      {
        platform: 'Linux i686',
        language: { primary: 'de-DE', list: ['de-DE', 'de', 'en'] },
        screen: { width: 2560, height: 1440 },
        cores: 12,
        pixelRatio: 2,
        webgl: { vendor: 'Mozilla', renderer: 'Mozilla' }
      },
      {
        platform: 'Win32',
        language: { primary: 'fr-FR', list: ['fr-FR', 'fr', 'en'] },
        screen: { width: 1680, height: 1050 },
        cores: 16,
        pixelRatio: 1,
        webgl: { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4080 Direct3D11 vs_5_0 ps_5_0, D3D11)' }
      }
    ];

    // 使用实例计数器选择配置，确保每个实例都不同
    const configIndex = (WindowManager.instanceCounter - 1) % allConfigs.length;
    const selectedConfig = allConfigs[configIndex];

    // 强化的随机性 - 基于账号ID和时间戳
    const seedBase = accountId + Date.now() + WindowManager.instanceCounter;
    const hash = this.simpleHash(seedBase);
    const randomFactor = (hash % 1000) / 1000;

    // 更强的Canvas噪声
    const canvasNoise = 0.02 + randomFactor * 0.08; // 0.02-0.10，更强噪声
    const canvasSeed = Math.floor(hash + randomFactor * 1000000 + WindowManager.instanceCounter * 54321);

    console.log(`[WindowManager] 使用配置 ${configIndex} 实例 ${WindowManager.instanceCounter}`);
    console.log(`[WindowManager] 强化随机种子:`, hash, '噪声:', canvasNoise);

    const uniqueConfig: FingerprintConfig = {
      canvas: {
        enabled: true,
        noise: canvasNoise,
        seed: canvasSeed,
        algorithm: 'gaussian' as const
      },
      navigator: {
        enabled: true,
        platform: selectedConfig.platform,
        language: selectedConfig.language.primary,
        languages: [...selectedConfig.language.list],
        hardwareConcurrency: selectedConfig.cores,
        maxTouchPoints: selectedConfig.platform.includes('Win') ? 0 : Math.floor(randomFactor * 5),
        deviceMemory: [4, 8, 16, 32][Math.floor(randomFactor * 4)]
      },
      webgl: {
        enabled: true,
        vendor: selectedConfig.webgl.vendor,
        renderer: selectedConfig.webgl.renderer,
        unmaskedVendor: selectedConfig.webgl.vendor,
        unmaskedRenderer: selectedConfig.webgl.renderer
      },
      screen: {
        enabled: true,
        width: selectedConfig.screen.width,
        height: selectedConfig.screen.height,
        pixelRatio: selectedConfig.pixelRatio,
        colorDepth: 24
      },
      audio: {
        enabled: true,
        noise: 0.02 + randomFactor * 0.08,
        seed: canvasSeed
      },
      fonts: {
        enabled: true,
        available: ['Arial', 'Times New Roman', 'Helvetica', 'Courier New', 'Verdana'],
        measurementMethod: 'canvas' as const
      },
      timezone: {
        enabled: true,
        name: 'America/New_York',
        offset: -300
      }
    };

    console.log(`[WindowManager] ✅ 生成强化唯一配置 ${accountId}:`, {
      instance: WindowManager.instanceCounter,
      platform: uniqueConfig.navigator.platform,
      language: uniqueConfig.navigator.language,
      cores: uniqueConfig.navigator.hardwareConcurrency,
      screen: `${uniqueConfig.screen.width}x${uniqueConfig.screen.height}`,
      pixelRatio: uniqueConfig.screen.pixelRatio,
      canvasNoise: uniqueConfig.canvas.noise,
      canvasSeed: uniqueConfig.canvas.seed
    });

    return uniqueConfig;
  }

  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }

  private generateUserAgent(fingerprint: FingerprintConfig): string {
    const { platform } = fingerprint.navigator;
    const chromeVersion = '120.0.6099.109';

    const userAgents: Record<string, string> = {
      'Win32': `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`,
      'MacIntel': `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`,
      'Linux x86_64': `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`,
      'Linux i686': `Mozilla/5.0 (X11; Linux i686) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`
    };

    return userAgents[platform] || userAgents['Win32'];
  }

  // 静态方法，供 preload 脚本调用
  static getFingerprintConfigForWindow(windowId: number): FingerprintConfig | null {
    console.log(`[WindowManager] Static method called for window ${windowId}`);
    console.log(`[WindowManager] Map has ${WindowManager.windowFingerprintMap.size} entries`);
    console.log(`[WindowManager] Map keys:`, Array.from(WindowManager.windowFingerprintMap.keys()));

    const config = WindowManager.windowFingerprintMap.get(windowId);
    console.log(`[WindowManager] Found config for window ${windowId}:`, !!config);

    return config || null;
  }

  getFingerprintConfig(accountId: string): FingerprintConfig | null {
    return this.fingerprintConfigs.get(accountId) || null;
  }

  updateFingerprintConfig(accountId: string, config: FingerprintConfig): void {
    this.fingerprintConfigs.set(accountId, config);

    const instance = this.instances.get(accountId);
    if (instance) {
      WindowManager.windowFingerprintMap.set(instance.windowId, config);
    }
  }

  getInstance(accountId: string): BrowserInstance | null {
    return this.instances.get(accountId) || null;
  }

  getAllInstances(): BrowserInstance[] {
    return Array.from(this.instances.values());
  }

  async closeInstance(accountId: string): Promise<void> {
    console.log(`[WindowManager] Closing instance for account: ${accountId}`);
    const instance = this.instances.get(accountId);
    if (instance) {
      const window = BrowserWindow.fromId(instance.windowId);
      if (window && !window.isDestroyed()) {
        window.close();
      }
      this.instances.delete(accountId);
      WindowManager.windowFingerprintMap.delete(instance.windowId);
    }
  }
}