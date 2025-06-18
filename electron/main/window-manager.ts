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
  private async fetchWithTimeout(url: string, timeoutMs: number = 5000): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; WindowManager/1.0)'
        }
      });
      
      clearTimeout(timeoutId);
      return response;
    } catch (error: any) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        throw new Error(`Request timeout after ${timeoutMs}ms`);
      }
      throw error;
    }
  }
  private async isPortAvailable(port: number): Promise<boolean> {
    const checkIPv4 = () => new Promise<boolean>((resolve) => {
      const server = net.createServer();
      
      server.listen(port, '127.0.0.1', () => {
        server.close(() => {
          console.log(`[WindowManager] IPv4 端口 ${port} 可用`);
          resolve(true);
        });
      });

      server.on('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
          console.log(`[WindowManager] IPv4 端口 ${port} 已被占用`);
          resolve(false);
        } else {
          console.log(`[WindowManager] IPv4 端口 ${port} 检查失败:`, err.message);
          resolve(false);
        }
      });
    });

    const checkIPv6 = () => new Promise<boolean>((resolve) => {
      const server = net.createServer();
      
      server.listen(port, '::1', () => {
        server.close(() => {
          console.log(`[WindowManager] IPv6 端口 ${port} 可用`);
          resolve(true);
        });
      });

      server.on('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
          console.log(`[WindowManager] IPv6 端口 ${port} 已被占用`);
          resolve(false);
        } else {
          console.log(`[WindowManager] IPv6 端口 ${port} 检查失败:`, err.message);
          resolve(false);
        }
      });
    });

    const [ipv4Available, ipv6Available] = await Promise.all([
      checkIPv4(),
      checkIPv6()
    ]);

    const isAvailable = ipv4Available && ipv6Available;
    console.log(`[WindowManager] 端口 ${port} 检查结果: IPv4=${ipv4Available}, IPv6=${ipv6Available}, 总体=${isAvailable}`);
    
    return isAvailable;
  }
    private async isPortUsedByChrome(port: number): Promise<boolean> {
    try {
      const response = await this.fetchWithTimeout(`http://localhost:${port}/json/version`, 2000);
      
      if (response.ok) {
        const data = await response.json();
        console.log(`[WindowManager] 端口 ${port} 已被Chrome占用:`, data.Browser);
        return true;
      }
    } catch (error: any) {
      // 连接失败说明没有Chrome在这个端口
      if (error.message.includes('timeout')) {
        console.log(`[WindowManager] 端口 ${port} 检查超时`);
      }
    }
    
    return false;
  }
  // 🔧 新增：找到可用的调试端口
    private async findAvailableDebugPort(): Promise<number> {
    const maxAttempts = 100;

    for (let i = 0; i < maxAttempts; i++) {
      const port = WindowManager.BASE_DEBUG_PORT + i;

      console.log(`[WindowManager] 检查端口 ${port}...`);

      // 1. 先检查是否被Chrome占用
      const usedByChrome = await this.isPortUsedByChrome(port);
      if (usedByChrome) {
        console.log(`[WindowManager] ⚠️ 端口 ${port} 已被其他Chrome实例占用，跳过`);
        continue;
      }

      // 2. 检查端口是否可用（IPv4 + IPv6）
      const isAvailable = await this.isPortAvailable(port);
      if (isAvailable) {
        console.log(`[WindowManager] ✅ 找到可用端口: ${port}`);
        return port;
      }

      console.log(`[WindowManager] ❌ 端口 ${port} 不可用，尝试下一个`);
    }

    throw new Error(`无法在 ${WindowManager.BASE_DEBUG_PORT}-${WindowManager.BASE_DEBUG_PORT + maxAttempts} 范围内找到可用端口`);
  }

  async createBrowserInstance(accountId: string, config: AccountConfig): Promise<BrowserInstance> {
    try {
      console.log(`[WindowManager] Creating Chrome browser instance for account: ${accountId}`);

      const existingInstance = this.instances.get(accountId);
      if (existingInstance) {
        console.log(`[WindowManager] Instance already exists for account ${accountId}`);
        return existingInstance;
      }

      const fingerprintConfig = FingerprintGenerator.generateFingerprint(accountId);
      this.fingerprintConfigs.set(accountId, fingerprintConfig);

      console.log(`[WindowManager] ✅ Generated fingerprint for ${accountId}:`, {
        platform: fingerprintConfig.navigator.platform,
        language: fingerprintConfig.navigator.language,
        screenSize: `${fingerprintConfig.screen.width}x${fingerprintConfig.screen.height}`,
        canvasNoise: fingerprintConfig.canvas.noise
      });

      const quality = FingerprintValidator.validateFingerprint(fingerprintConfig);
      if (quality.score < 70) {
        console.warn(`[WindowManager] Low fingerprint quality for account ${accountId}:`, quality.issues);
      }

      const chromeInfo = await this.launchRealChrome(accountId, fingerprintConfig, config);

      const instance: BrowserInstance = {
        accountId,
        windowId: chromeInfo.port,
        status: 'running',
        url: config.startUrl || 'chrome://newtab/'
      };

      this.instances.set(accountId, instance);
      this.chromeProcesses.set(accountId, chromeInfo.process);
      this.chromeDebugPorts.set(accountId, chromeInfo.port);

      console.log(`[WindowManager] ✅ Chrome browser launched successfully for account ${accountId}, debug port: ${chromeInfo.port}`);

      chromeInfo.process.on('exit', (code) => {
        console.log(`[WindowManager] Chrome process exited for account ${accountId} with code:`, code);
        this.instances.delete(accountId);
        this.chromeProcesses.delete(accountId);
        this.chromeDebugPorts.delete(accountId);
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
    const debugPort = await this.findAvailableDebugPort();
    
    if (!fs.existsSync(userDataDir)) {
      fs.mkdirSync(userDataDir, { recursive: true });
    }

    const injectionScript = this.generateSimpleInjectionScript(fingerprintConfig, accountId);
    const scriptPath = path.join(userDataDir, 'fingerprint-injection.js');
    fs.writeFileSync(scriptPath, injectionScript);

    const chromeArgs = [
      `--user-data-dir=${userDataDir}`,
      `--remote-debugging-port=${debugPort}`,
      '--remote-debugging-address=127.0.0.1',
      '--no-first-run',
      //'--no-default-browser-check',
      '--disable-features=VizDisplayCompositor',
      '--disable-dev-shm-usage',
      //'--disable-web-security',
      //'--disable-features=Translate',
      //'--no-sandbox',
      `--window-size=${fingerprintConfig.screen.width},${fingerprintConfig.screen.height}`,
      `--user-agent=${this.generateUserAgent(fingerprintConfig)}`,
    ];

    if (config.proxy) {
      chromeArgs.push(`--proxy-server=${config.proxy}`);
    }

    if (fingerprintConfig.navigator.language) {
      chromeArgs.push(`--lang=${fingerprintConfig.navigator.language}`);
    }

    const startUrl = config.startUrl || 'about:blank';
    chromeArgs.push(startUrl);

    const chromePath = this.findChromePath();

    console.log(`[WindowManager] 🚀 启动Chrome - 账号: ${accountId}, 端口: ${debugPort}`);
    console.log(`[WindowManager] 🔗 启动URL: ${startUrl}`);
    console.log(`[WindowManager] ⚙️ 关键参数: --remote-debugging-port=${debugPort} --remote-debugging-address=127.0.0.1`);

    const chromeProcess = spawn(chromePath, chromeArgs, {
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    chromeProcess.stdout?.on('data', (data) => {
      const output = data.toString().trim();
      if (output.includes('DevTools listening') || output.includes('started')) {
        console.log(`[Chrome-${accountId}-${debugPort}] ${output}`);
      }
    });

    chromeProcess.stderr?.on('data', (data) => {
      const output = data.toString().trim();
      if (output.includes('DevTools') || output.includes('listening') || output.includes('bind')) {
        console.log(`[Chrome-${accountId}-${debugPort}] STDERR: ${output}`);
      }
    });

    chromeProcess.on('error', (error) => {
      console.error(`[WindowManager] Chrome进程启动失败 - 账号: ${accountId}, 端口: ${debugPort}`, error);
    });

    await this.waitForChromeReady(debugPort, accountId);

    return {
      process: chromeProcess,
      port: debugPort
    };
  }

  // 🔧 修复：Chrome就绪检测，使用新的 fetch 方法
  private async waitForChromeReady(port: number, accountId: string, timeout = 20000): Promise<void> {
    const startTime = Date.now();
    let lastError = '';

    console.log(`[WindowManager] 等待Chrome就绪 - 账号: ${accountId}, 端口: ${port}`);

    while (Date.now() - startTime < timeout) {
      try {
        const response = await this.fetchWithTimeout(`http://127.0.0.1:${port}/json/version`, 3000);
        
        if (response.ok) {
          const data = await response.json();
          console.log(`[WindowManager] ✅ Chrome就绪 - 账号: ${accountId}, 端口: ${port}, 版本: ${data.Browser}`);
          
          // 验证调试端口独占性
          try {
            const pagesResponse = await this.fetchWithTimeout(`http://127.0.0.1:${port}/json`, 3000);
            if (pagesResponse.ok) {
              const pagesData = await pagesResponse.json();
              console.log(`[WindowManager] 📄 活动页面数: ${pagesData.length}`);
            }
          } catch (error) {
            console.warn(`[WindowManager] 获取页面信息失败:`, error);
          }
          
          return;
        } else {
          lastError = `HTTP ${response.status}`;
        }
      } catch (error: any) {
        lastError = error.message;
        
        if (error.message.includes('ECONNREFUSED')) {
          // Chrome还在启动，继续等待
        } else if (error.message.includes('timeout')) {
          console.warn(`[WindowManager] Chrome连接超时 - 账号: ${accountId}, 端口: ${port}`);
        } else {
          console.warn(`[WindowManager] Chrome连接异常 - 账号: ${accountId}, 端口: ${port}:`, error.message);
        }
      }

      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.error(`[WindowManager] ❌ Chrome启动超时 - 账号: ${accountId}, 端口: ${port}`);
    console.error(`[WindowManager] 最后错误: ${lastError}`);
    
    try {
      const isUsed = await this.isPortUsedByChrome(port);
      console.error(`[WindowManager] 端口 ${port} Chrome状态: ${isUsed ? '被占用' : '未被占用'}`);
    } catch (error) {
      console.error(`[WindowManager] 无法检查端口状态:`, error);
    }

    throw new Error(`Chrome failed to start for account ${accountId} on port ${port} within ${timeout}ms. Last error: ${lastError}`);
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