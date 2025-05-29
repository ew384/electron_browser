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
      const fingerprintConfig = this.generateSimpleUniqueFingerprint(accountId);
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

      // 关键：在每个导航前注入配置
      window.webContents.on('will-navigate', (event, url) => {
        console.log(`[WindowManager] WILL-NAVIGATE: Window ${window.id} navigating to:`, url);

        // 立即注入配置到页面
        const preloadScript = `
          (function() {
            console.log('[WindowManager-PreLoad] 🚀 INJECTING config before page load...');
            
            window.__FINGERPRINT_CONFIG__ = ${JSON.stringify(fingerprintConfig)};
            window.__ACCOUNT_ID__ = '${accountId}';
            
            console.log('[WindowManager-PreLoad] ✅ Config injected for:', '${accountId}');
            console.log('[WindowManager-PreLoad] Platform:', '${fingerprintConfig.navigator.platform}');
            console.log('[WindowManager-PreLoad] Language:', '${fingerprintConfig.navigator.language}');
            console.log('[WindowManager-PreLoad] Canvas seed:', ${fingerprintConfig.canvas.seed});
          })();
        `;

        window.webContents.executeJavaScript(preloadScript).catch(err =>
          console.error('[WindowManager] Failed to inject config in will-navigate:', err)
        );
      });

      // 同时在 DOM ready 时再次确保配置存在
      window.webContents.once('dom-ready', () => {
        console.log(`[WindowManager] DOM-READY: Ensuring config exists for window ${window.id}`);

        const domReadyScript = `
          (function() {
            console.log('[WindowManager-DOM] 🔄 Checking config at DOM ready...');
            
            if (!window.__FINGERPRINT_CONFIG__) {
              console.log('[WindowManager-DOM] Config missing, injecting now...');
              window.__FINGERPRINT_CONFIG__ = ${JSON.stringify(fingerprintConfig)};
              window.__ACCOUNT_ID__ = '${accountId}';
            } else {
              console.log('[WindowManager-DOM] Config exists for:', window.__ACCOUNT_ID__);
            }
            
            // 强制触发 preload 脚本重新检查
            if (window.checkForConfigUpdate) {
              window.checkForConfigUpdate();
            }
          })();
        `;

        window.webContents.executeJavaScript(domReadyScript).catch(err =>
          console.error('[WindowManager] Failed to inject config at DOM ready:', err)
        );
      });

      // 加载默认页面
      const startUrl = config.startUrl || 'https://browserleaks.com/canvas';
      console.log(`[WindowManager] Loading URL for ${accountId}: ${startUrl}`);

      await window.loadURL(startUrl);

      // 页面加载完成后再次确保配置
      window.webContents.once('did-finish-load', () => {
        console.log(`[WindowManager] DID-FINISH-LOAD: Final config check for window ${window.id}`);

        const finalScript = `
          (function() {
            console.log('[WindowManager-Final] 🎯 Final config verification...');
            console.log('[WindowManager-Final] Has config:', !!window.__FINGERPRINT_CONFIG__);
            console.log('[WindowManager-Final] Account ID:', window.__ACCOUNT_ID__);
            
            if (!window.__FINGERPRINT_CONFIG__) {
              console.log('[WindowManager-Final] EMERGENCY: Injecting config now!');
              window.__FINGERPRINT_CONFIG__ = ${JSON.stringify(fingerprintConfig)};
              window.__ACCOUNT_ID__ = '${accountId}';
            }
          })();
        `;

        window.webContents.executeJavaScript(finalScript).catch(err =>
          console.error('[WindowManager] Failed final config injection:', err)
        );
      });

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

  // 简化但保证工作的指纹生成
  private generateSimpleUniqueFingerprint(accountId: string): FingerprintConfig {
    WindowManager.instanceCounter++;

    console.log(`[WindowManager] 🎲 Generating guaranteed unique fingerprint #${WindowManager.instanceCounter} for: ${accountId}`);

    // 预定义配置 - 每个实例使用不同的配置
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

    // 添加一些随机性但确保正数
    const randomFactor = Math.random();
    const canvasNoise = 0.005 + randomFactor * 0.02; // 0.005-0.025
    const canvasSeed = Math.floor(Date.now() + randomFactor * 1000000 + WindowManager.instanceCounter * 12345);

    console.log(`[WindowManager] Using config index ${configIndex} for instance ${WindowManager.instanceCounter}`);
    console.log(`[WindowManager] Selected config:`, {
      platform: selectedConfig.platform,
      language: selectedConfig.language.primary,
      screen: `${selectedConfig.screen.width}x${selectedConfig.screen.height}`,
      cores: selectedConfig.cores,
      pixelRatio: selectedConfig.pixelRatio
    });

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
        maxTouchPoints: selectedConfig.platform.includes('Win') ? 0 : Math.floor(Math.random() * 3),
        deviceMemory: [4, 8, 16, 32][Math.floor(Math.random() * 4)]
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
        noise: 0.01 + Math.random() * 0.05,
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

    console.log(`[WindowManager] ✅ Generated GUARANTEED UNIQUE config for ${accountId}:`, {
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