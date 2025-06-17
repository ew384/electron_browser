// 在 electron/main/window-manager.ts 中修改端口分配逻辑

import { BrowserWindow, session } from 'electron';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as net from 'net'; // 新增：用于端口检测
import { FingerprintGenerator } from './fingerprint/generator';
import { FingerprintValidator } from './fingerprint/validator';
import { BrowserInstance, AccountConfig, FingerprintConfig } from '../shared/types';

export class WindowManager {
  private instances = new Map<string, BrowserInstance>();
  private fingerprintConfigs = new Map<string, FingerprintConfig>();
  private chromeProcesses = new Map<string, ChildProcess>(); // 跟踪Chrome进程
  private chromeDebugPorts = new Map<string, number>(); // 存储调试端口

  // 存储每个窗口的指纹配置，供 preload 脚本查询
  private static windowFingerprintMap = new Map<number, FingerprintConfig>();

  // 🔧 修改：从9711开始分配端口
  private static BASE_DEBUG_PORT = 9711;
  private static instanceCounter = 0;

  // 🔧 新增：检查端口是否可用
  private async isPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = net.createServer();

      server.listen(port, 'localhost', () => {
        server.close(() => {
          console.log(`[WindowManager] 端口 ${port} 可用`);
          resolve(true);
        });
      });

      server.on('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
          console.log(`[WindowManager] 端口 ${port} 已被占用`);
          resolve(false);
        } else {
          console.log(`[WindowManager] 端口 ${port} 检查失败:`, err.message);
          resolve(false);
        }
      });
    });
  }

  // 🔧 新增：找到可用的调试端口
  private async findAvailableDebugPort(): Promise<number> {
    const maxAttempts = 100; // 最多尝试100个端口

    for (let i = 0; i < maxAttempts; i++) {
      const port = WindowManager.BASE_DEBUG_PORT + i;

      console.log(`[WindowManager] 检查端口 ${port} 是否可用...`);

      if (await this.isPortAvailable(port)) {
        console.log(`[WindowManager] ✅ 找到可用端口: ${port}`);
        return port;
      }
    }

    throw new Error(`无法在 ${WindowManager.BASE_DEBUG_PORT}-${WindowManager.BASE_DEBUG_PORT + maxAttempts} 范围内找到可用端口`);
  }

  async createBrowserInstance(accountId: string, config: AccountConfig): Promise<BrowserInstance> {
    try {
      console.log(`[WindowManager] Creating Chrome browser instance for account: ${accountId}`);

      // 检查是否已存在实例
      const existingInstance = this.instances.get(accountId);
      if (existingInstance) {
        console.log(`[WindowManager] Instance already exists for account ${accountId}`);
        return existingInstance;
      }

      // 🎯 复用现有的指纹生成器
      const fingerprintConfig = FingerprintGenerator.generateFingerprint(accountId);
      this.fingerprintConfigs.set(accountId, fingerprintConfig);

      console.log(`[WindowManager] ✅ Generated fingerprint for ${accountId}:`, {
        platform: fingerprintConfig.navigator.platform,
        language: fingerprintConfig.navigator.language,
        screenSize: `${fingerprintConfig.screen.width}x${fingerprintConfig.screen.height}`,
        canvasNoise: fingerprintConfig.canvas.noise
      });

      // 🎯 复用现有的指纹验证器
      const quality = FingerprintValidator.validateFingerprint(fingerprintConfig);
      if (quality.score < 70) {
        console.warn(`[WindowManager] Low fingerprint quality for account ${accountId}:`, quality.issues);
      }

      // 启动真实的Chrome浏览器
      const chromeInfo = await this.launchRealChrome(accountId, fingerprintConfig, config);

      const instance: BrowserInstance = {
        accountId,
        windowId: chromeInfo.port, // 使用调试端口作为标识
        status: 'running',
        url: config.startUrl || 'chrome://newtab/'
      };

      this.instances.set(accountId, instance);
      this.chromeProcesses.set(accountId, chromeInfo.process);
      this.chromeDebugPorts.set(accountId, chromeInfo.port); // 存储调试端口

      console.log(`[WindowManager] ✅ Chrome browser launched successfully for account ${accountId}, debug port: ${chromeInfo.port}`);

      // 监听Chrome进程退出
      chromeInfo.process.on('exit', (code) => {
        console.log(`[WindowManager] Chrome process exited for account ${accountId} with code:`, code);
        this.instances.delete(accountId);
        this.chromeProcesses.delete(accountId);
        this.chromeDebugPorts.delete(accountId); // 清理调试端口
      });

      return instance;
    } catch (error) {
      console.error(`[WindowManager] Failed to create browser instance:`, error);
      this.instances.delete(accountId);
      throw error;
    }
  }

  private async launchRealChrome(accountId: string, fingerprintConfig: FingerprintConfig, config: AccountConfig) {
    const userDataDir = path.join(os.tmpdir(), 'chrome-profiles', accountId);

    // 🔧 修改：使用动态端口分配
    const debugPort = await this.findAvailableDebugPort();
    WindowManager.instanceCounter++;

    // 确保用户数据目录存在
    if (!fs.existsSync(userDataDir)) {
      fs.mkdirSync(userDataDir, { recursive: true });
    }

    // 🎯 简化的指纹注入脚本生成（移除重复的指纹逻辑）
    const injectionScript = this.generateSimpleInjectionScript(fingerprintConfig, accountId);
    const scriptPath = path.join(userDataDir, 'fingerprint-injection.js');
    fs.writeFileSync(scriptPath, injectionScript);

    // 构建Chrome启动参数
    const chromeArgs = [
      `--user-data-dir=${userDataDir}`,
      `--remote-debugging-port=${debugPort}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-features=VizDisplayCompositor',
      '--disable-dev-shm-usage',
      `--window-size=${fingerprintConfig.screen.width},${fingerprintConfig.screen.height}`,
      `--user-agent=${this.generateUserAgent(fingerprintConfig)}`,
    ];

    // 添加代理设置
    if (config.proxy) {
      chromeArgs.push(`--proxy-server=${config.proxy}`);
    }

    // 添加语言设置
    if (fingerprintConfig.navigator.language) {
      chromeArgs.push(`--lang=${fingerprintConfig.navigator.language}`);
    }

    // 
    //const startUrl = config.startUrl || 'https://channels.weixin.qq.com/platform/post/create';
    // 默认打开新标签页页面：
    const startUrl = config.startUrl || 'about:blank';
    chromeArgs.push(startUrl);

    // 查找Chrome可执行文件路径
    const chromePath = this.findChromePath();

    console.log(`[WindowManager] Launching Chrome with debug port ${debugPort}`);
    console.log(`[WindowManager] Starting URL: ${startUrl}`);
    console.log(`[WindowManager] Chrome args:`, chromeArgs.slice(0, 5), '...');

    // 启动Chrome进程
    const chromeProcess = spawn(chromePath, chromeArgs, {
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    // 监听进程输出（用于调试）
    chromeProcess.stdout?.on('data', (data) => {
      const output = data.toString();
      if (output.includes('DevTools listening')) {
        console.log(`[Chrome-${accountId}] ${output.trim()}`);
      }
    });

    chromeProcess.stderr?.on('data', (data) => {
      const output = data.toString();
      if (output.includes('DevTools listening') || output.includes('Chrome started')) {
        console.log(`[Chrome-${accountId}] ${output.trim()}`);
      }
    });

    // 等待Chrome启动
    await this.waitForChromeReady(debugPort);

    return {
      process: chromeProcess,
      port: debugPort
    };
  }

  private findChromePath(): string {
    const platform = os.platform();
    const possiblePaths: Record<string, string[]> = {
      'win32': [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        path.join(os.homedir(), 'AppData\\Local\\Google\\Chrome\\Application\\chrome.exe')
      ],
      'darwin': [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
      ],
      'linux': [
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium'
      ]
    };

    const paths = possiblePaths[platform] || possiblePaths['linux'];

    for (const chromePath of paths) {
      if (fs.existsSync(chromePath)) {
        console.log(`[WindowManager] Found Chrome at: ${chromePath}`);
        return chromePath;
      }
    }

    throw new Error(`Chrome not found on ${platform}. Please install Google Chrome.`);
  }

  private async waitForChromeReady(port: number, timeout = 15000): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        const response = await fetch(`http://localhost:${port}/json/version`);
        if (response.ok) {
          console.log(`[WindowManager] Chrome is ready on port ${port}`);
          return;
        }
      } catch (error) {
        // Chrome还没准备好，继续等待
      }

      await new Promise(resolve => setTimeout(resolve, 200));
    }

    throw new Error(`Chrome failed to start on port ${port} within ${timeout}ms`);
  }

  // 🎯 简化的注入脚本生成（不重复实现指纹逻辑，只传递配置）
  private generateSimpleInjectionScript(fingerprintConfig: FingerprintConfig, accountId: string): string {
    return `
// 指纹配置注入脚本 - ${accountId}
(function() {
  if (window.__FINGERPRINT_INJECTED__) return;
  window.__FINGERPRINT_INJECTED__ = true;
  
  // 设置配置到全局变量，让preload脚本使用
  window.__FINGERPRINT_CONFIG__ = ${JSON.stringify(fingerprintConfig)};
  window.__ACCOUNT_ID__ = '${accountId}';
  
  console.log('[Chrome-Injection] 配置已设置，等待preload脚本处理');
  console.log('[Chrome-Injection] 账号:', '${accountId}');
  console.log('[Chrome-Injection] 平台:', '${fingerprintConfig.navigator.platform}');
  console.log('[Chrome-Injection] 调试端口范围: 9711+');
  
  // 触发事件通知preload脚本
  if (window.electronAPI && window.electronAPI.forceReinject) {
    setTimeout(() => {
      window.electronAPI.forceReinject();
    }, 100);
  }
})();
`;
  }

  // 🎯 简化的UserAgent生成（复用现有逻辑）
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

  // 关闭实例的方法
  async closeInstance(accountId: string): Promise<void> {
    console.log(`[WindowManager] Closing instance for account: ${accountId}`);

    const chromeProcess = this.chromeProcesses.get(accountId);

    if (chromeProcess && !chromeProcess.killed) {
      console.log(`[WindowManager] Terminating Chrome process for account: ${accountId}`);
      chromeProcess.kill('SIGTERM');

      // 如果进程没有正常退出，强制杀死
      setTimeout(() => {
        if (!chromeProcess.killed) {
          chromeProcess.kill('SIGKILL');
        }
      }, 5000);
    }

    this.instances.delete(accountId);
    this.chromeProcesses.delete(accountId);
    this.chromeDebugPorts.delete(accountId); // 清理调试端口
  }

  // 获取Chrome调试端口（供ChromeDriver使用）
  getChromeDebugPort(accountId: string): number | null {
    return this.chromeDebugPorts.get(accountId) || null;
  }

  // 🎯 保留必要的方法，复用现有模块
  static getFingerprintConfigForWindow(windowId: number): FingerprintConfig | null {
    return WindowManager.windowFingerprintMap.get(windowId) || null;
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
}