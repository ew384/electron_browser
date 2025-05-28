import { BrowserWindow, session } from 'electron';
import { FingerprintGenerator } from './fingerprint/generator';
import { FingerprintValidator } from './fingerprint/validator';
import { BrowserInstance, AccountConfig, FingerprintConfig } from '../shared/types';
import * as path from 'path';

export class WindowManager {
  private instances = new Map<string, BrowserInstance>();
  private fingerprintConfigs = new Map<string, FingerprintConfig>();

  async createBrowserInstance(accountId: string, config: AccountConfig): Promise<BrowserInstance> {
    try {
      // 生成或使用现有指纹配置
      let fingerprintConfig = this.fingerprintConfigs.get(accountId);
      if (!fingerprintConfig) {
        fingerprintConfig = config.fingerprint || FingerprintGenerator.generateFingerprint(accountId);
        this.fingerprintConfigs.set(accountId, fingerprintConfig);
      }

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

      // 配置代理
      if (config.proxy) {
        await ses.setProxy({ proxyRules: config.proxy });
      }

      // 设置视口大小
      const viewport = config.viewport || {
        width: fingerprintConfig.screen.width,
        height: fingerprintConfig.screen.height,
        deviceScaleFactor: fingerprintConfig.screen.pixelRatio
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
        show: false
      });

      // 在窗口加载前设置指纹配置
      window.webContents.on('dom-ready', () => {
        window.webContents.executeJavaScript(`
          window.__FINGERPRINT_CONFIG__ = ${JSON.stringify(fingerprintConfig)};
        `);
      });

      // 监听页面加载事件
      window.webContents.once('did-finish-load', () => {
        window.show();
        console.log(`[WindowManager] Browser instance created for account ${accountId}`);
      });

      const instance: BrowserInstance = {
        accountId,
        windowId: window.id,
        status: 'starting'
      };

      this.instances.set(accountId, instance);

      // 更新状态
      window.webContents.once('did-finish-load', () => {
        instance.status = 'running';
      });

      window.on('closed', () => {
        instance.status = 'stopped';
        this.instances.delete(accountId);
        this.fingerprintConfigs.delete(accountId);
      });

      return instance;
    } catch (error) {
      console.error(`[WindowManager] Failed to create browser instance:`, error);
      throw error;
    }
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

  getFingerprintConfig(accountId: string): FingerprintConfig | null {
    return this.fingerprintConfigs.get(accountId) || null;
  }

  updateFingerprintConfig(accountId: string, config: FingerprintConfig): void {
    this.fingerprintConfigs.set(accountId, config);
  }

  getInstance(accountId: string): BrowserInstance | null {
    return this.instances.get(accountId) || null;
  }

  getAllInstances(): BrowserInstance[] {
    return Array.from(this.instances.values());
  }

  async closeInstance(accountId: string): Promise<void> {
    const instance = this.instances.get(accountId);
    if (instance) {
      const window = BrowserWindow.fromId(instance.windowId);
      if (window && !window.isDestroyed()) {
        window.close();
      }
    }
  }
}
