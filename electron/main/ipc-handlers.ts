import { ipcMain, BrowserWindow } from 'electron';
import { WindowManager } from './window-manager';
import { FingerprintGenerator } from './fingerprint/generator';
import { FingerprintValidator } from './fingerprint/validator';
import { AccountStorage } from './storage/account-storage';
import { FingerprintConfig, BrowserAccount, AccountConfig } from '../shared/types';

const windowManager = new WindowManager();
const accountStorage = new AccountStorage();

// 账号管理
ipcMain.handle('create-account', async (event, account: BrowserAccount) => {
  console.log('[IPC] create-account called with:', account);
  try {
    // 验证输入
    if (!account) {
      throw new Error('Account data is required');
    }

    // 如果没有ID，生成一个
    if (!account.id) {
      account.id = `account_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      console.log('[IPC] Generated account ID:', account.id);
    }

    // 如果没有指纹配置，自动生成独特的指纹
    if (!account.config?.fingerprint) {
      console.log('[IPC] Generating unique fingerprint for account:', account.id);
      const fingerprint = FingerprintGenerator.generateFingerprint(account.id);
      account.config = { ...account.config, fingerprint };

      console.log('[IPC] Generated fingerprint details:', {
        platform: fingerprint.navigator.platform,
        language: fingerprint.navigator.language,
        screenSize: `${fingerprint.screen.width}x${fingerprint.screen.height}`,
        canvasNoise: fingerprint.canvas.noise
      });
    }

    // 设置默认状态
    account.status = account.status || 'idle';
    account.createdAt = account.createdAt || Date.now();

    console.log('[IPC] Saving account to storage:', account.id);
    // 保存到存储
    await accountStorage.saveAccount(account);

    console.log('[IPC] Account created successfully:', account.id, account.name);
    return { success: true, account };
  } catch (error: any) {
    console.error('[IPC] Failed to create account:', error);
    return { success: false, error: error?.message || String(error) };
  }
});

ipcMain.handle('get-accounts', async () => {
  try {
    const accounts = await accountStorage.getAllAccounts();

    // 同步实例状态
    for (const account of accounts) {
      const instance = windowManager.getInstance(account.id);
      if (instance) {
        account.status = instance.status === 'running' ? 'running' : 'idle';
      } else {
        account.status = 'idle';
      }
    }

    return { success: true, accounts };
  } catch (error: any) {
    console.error('[IPC] Failed to get accounts:', error);
    return { success: false, error: error.message, accounts: [] };
  }
});

ipcMain.handle('delete-account', async (event, accountId: string) => {
  try {
    // 先关闭浏览器实例
    await windowManager.closeInstance(accountId);

    // 删除账号数据
    await accountStorage.deleteAccount(accountId);

    console.log('[IPC] Account deleted:', accountId);
    return { success: true };
  } catch (error: any) {
    console.error('[IPC] Failed to delete account:', error);
    return { success: false, error: error.message };
  }
});

// 浏览器实例管理
ipcMain.handle('create-browser-instance', async (event, accountId: string, config?: AccountConfig) => {
  try {
    console.log('[IPC] Creating browser instance for account:', accountId);

    // 获取账号信息
    const account = await accountStorage.getAccount(accountId);
    if (!account) {
      throw new Error(`Account ${accountId} not found`);
    }

    // 确保账号有指纹配置
    if (!account.config?.fingerprint) {
      console.log('[IPC] Account missing fingerprint, generating new one');
      const fingerprint = FingerprintGenerator.generateFingerprint(accountId);
      account.config = { ...account.config, fingerprint };
      await accountStorage.saveAccount(account);
    }

    // 合并配置
    const finalConfig = {
      ...account.config,
      ...config
    };

    console.log('[IPC] Final config for browser instance:', {
      accountId,
      hasFingerprint: !!finalConfig.fingerprint,
      platform: finalConfig.fingerprint?.navigator.platform,
      proxy: finalConfig.proxy,
      startUrl: finalConfig.startUrl
    });

    // 创建浏览器实例
    const instance = await windowManager.createBrowserInstance(accountId, finalConfig);

    // 更新账号状态
    account.status = 'running';
    await accountStorage.saveAccount(account);

    console.log('[IPC] Browser instance created successfully:', {
      accountId: instance.accountId,
      windowId: instance.windowId,
      status: instance.status
    });

    return { success: true, instance };
  } catch (error: any) {
    console.error('[IPC] Failed to create browser instance:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('close-browser-instance', async (event, accountId: string) => {
  try {
    console.log('[IPC] Closing browser instance for account:', accountId);

    await windowManager.closeInstance(accountId);

    // 更新账号状态
    const account = await accountStorage.getAccount(accountId);
    if (account) {
      account.status = 'idle';
      await accountStorage.saveAccount(account);
    }

    return { success: true };
  } catch (error: any) {
    console.error('[IPC] Failed to close browser instance:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-browser-instances', async () => {
  try {
    const instances = windowManager.getAllInstances();
    return { success: true, instances };
  } catch (error: any) {
    return { success: false, error: error.message, instances: [] };
  }
});

// 指纹管理 - 改进版本
ipcMain.handle('get-fingerprint-config', async (event) => {
  try {
    const webContents = event.sender;
    const window = BrowserWindow.fromWebContents(webContents);

    if (!window) {
      console.warn('[IPC] No window found for fingerprint config request');
      return { success: false, error: 'No window context' };
    }

    console.log('[IPC] Getting fingerprint config for window:', window.id);

    // 方法1: 通过窗口ID查找配置
    const config = (WindowManager as any).getFingerprintConfigForWindow(window.id);
    if (config) {
      console.log('[IPC] Found fingerprint config via window ID');
      return { success: true, config };
    }

    // 方法2: 通过实例查找
    for (const instance of windowManager.getAllInstances()) {
      if (instance.windowId === window.id) {
        const instanceConfig = windowManager.getFingerprintConfig(instance.accountId);
        if (instanceConfig) {
          console.log('[IPC] Found fingerprint config via instance');
          return { success: true, config: instanceConfig };
        }
      }
    }

    console.warn('[IPC] No fingerprint config found for window', window.id);
    return { success: false, error: 'No fingerprint config found' };
  } catch (error: any) {
    console.error('[IPC] Error getting fingerprint config:', error);
    return { success: false, error: error.message };
  }
});

// 新增：专门为窗口获取指纹配置的处理器
ipcMain.handle('get-window-fingerprint-config', async (event) => {
  try {
    const webContents = event.sender;
    const window = BrowserWindow.fromWebContents(webContents);

    if (!window) {
      return null;
    }

    console.log('[IPC] Direct window fingerprint config request for window:', window.id);

    // 直接从 WindowManager 获取
    const config = (WindowManager as any).getFingerprintConfigForWindow(window.id);

    if (config) {
      console.log('[IPC] Successfully retrieved window fingerprint config');
    } else {
      console.warn('[IPC] No fingerprint config found for window', window.id);
    }

    return config;
  } catch (error) {
    console.error('[IPC] Error in get-window-fingerprint-config:', error);
    return null;
  }
});

ipcMain.handle('update-fingerprint-config', async (event, config: FingerprintConfig) => {
  try {
    const webContents = event.sender;
    const window = BrowserWindow.fromWebContents(webContents);

    if (!window) {
      return { success: false, error: 'No window context' };
    }

    console.log('[IPC] Updating fingerprint config for window:', window.id);

    let updated = false;

    // 查找并更新对应的实例配置
    for (const instance of windowManager.getAllInstances()) {
      if (instance.windowId === window.id) {
        windowManager.updateFingerprintConfig(instance.accountId, config);

        // 同时更新账号存储
        const account = await accountStorage.getAccount(instance.accountId);
        if (account) {
          account.config = { ...account.config, fingerprint: config };
          await accountStorage.saveAccount(account);
        }

        // 通知窗口配置已更新
        webContents.send('fingerprint-config-updated', config);
        updated = true;

        console.log('[IPC] Fingerprint config updated for account:', instance.accountId);
        break;
      }
    }

    if (!updated) {
      console.warn('[IPC] Could not find instance to update fingerprint config');
      return { success: false, error: 'Instance not found' };
    }

    return { success: true };
  } catch (error: any) {
    console.error('[IPC] Failed to update fingerprint config:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('validate-fingerprint', async (event, config: FingerprintConfig) => {
  try {
    const quality = FingerprintValidator.validateFingerprint(config);
    console.log('[IPC] Fingerprint validation result:', quality);
    return { success: true, quality };
  } catch (error: any) {
    console.error('[IPC] Fingerprint validation failed:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('generate-fingerprint', async (event, seed?: string) => {
  try {
    console.log('[IPC] Generating fingerprint with seed:', seed);

    const config = FingerprintGenerator.generateFingerprint(seed);
    const quality = FingerprintValidator.validateFingerprint(config);

    console.log('[IPC] Generated fingerprint:', {
      platform: config.navigator.platform,
      language: config.navigator.language,
      screenSize: `${config.screen.width}x${config.screen.height}`,
      quality: quality.score
    });

    return { success: true, config, quality };
  } catch (error: any) {
    console.error('[IPC] Failed to generate fingerprint:', error);
    return { success: false, error: error.message };
  }
});

// 应用信息
ipcMain.handle('get-app-version', async () => {
  return process.env.npm_package_version || '1.0.0';
});

// 调试和测试相关
ipcMain.handle('debug-fingerprint-status', async (event) => {
  try {
    const webContents = event.sender;
    const window = BrowserWindow.fromWebContents(webContents);

    if (!window) {
      return { success: false, error: 'No window context' };
    }

    const instances = windowManager.getAllInstances();
    const currentInstance = instances.find(inst => inst.windowId === window.id);

    const status = {
      windowId: window.id,
      instanceFound: !!currentInstance,
      accountId: currentInstance?.accountId,
      totalInstances: instances.length,
      fingerprintConfigExists: false
    };

    if (currentInstance) {
      const config = windowManager.getFingerprintConfig(currentInstance.accountId);
      status.fingerprintConfigExists = !!config;
    }

    console.log('[IPC] Debug fingerprint status:', status);
    return { success: true, status };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

console.log('[IPC] ✅ All IPC handlers registered successfully');
// 调试相关的 IPC 处理器
ipcMain.handle('debug-window-info', async (event) => {
  try {
    const webContents = event.sender;
    const window = BrowserWindow.fromWebContents(webContents);

    if (!window) {
      return {
        success: false,
        error: 'No window found',
        context: 'main-window-likely'
      };
    }

    const allWindows = BrowserWindow.getAllWindows();
    const allInstances = windowManager.getAllInstances();

    // 检查当前窗口是否是浏览器实例
    const currentInstance = allInstances.find(inst => inst.windowId === window.id);

    const debugInfo = {
      success: true,
      currentWindow: {
        id: window.id,
        title: window.getTitle(),
        url: window.webContents.getURL()
      },
      isMainWindow: window.getTitle().includes('防关联浏览器') || window.webContents.getURL().includes('localhost:9527'),
      isBrowserInstance: !!currentInstance,
      browserInstanceInfo: currentInstance ? {
        accountId: currentInstance.accountId,
        status: currentInstance.status
      } : null,
      allWindows: allWindows.map(w => ({
        id: w.id,
        title: w.getTitle(),
        url: w.webContents.getURL()
      })),
      allInstances: allInstances.map(inst => ({
        accountId: inst.accountId,
        windowId: inst.windowId,
        status: inst.status
      }))
    };

    console.log('[Debug] Window info:', debugInfo);
    return debugInfo;
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('debug-fingerprint-detailed', async (event) => {
  try {
    const webContents = event.sender;
    const window = BrowserWindow.fromWebContents(webContents);

    if (!window) {
      return { success: false, error: 'No window context' };
    }

    const allInstances = windowManager.getAllInstances();
    const currentInstance = allInstances.find(inst => inst.windowId === window.id);

    const debugInfo = {
      windowId: window.id,
      windowTitle: window.getTitle(),
      windowUrl: window.webContents.getURL(),
      instanceFound: !!currentInstance,
      accountId: currentInstance?.accountId,
      fingerprintFromWindowManager: null as any,
      fingerprintFromStaticMap: null as any,
      allInstancesCount: allInstances.length,
      allInstances: allInstances.map(inst => ({
        accountId: inst.accountId,
        windowId: inst.windowId,
        hasFingerprintConfig: !!windowManager.getFingerprintConfig(inst.accountId)
      }))
    };

    if (currentInstance) {
      debugInfo.fingerprintFromWindowManager = windowManager.getFingerprintConfig(currentInstance.accountId);
      // 尝试访问静态方法
      try {
        debugInfo.fingerprintFromStaticMap = (WindowManager as any).getFingerprintConfigForWindow(window.id);
      } catch (e) {
        debugInfo.fingerprintFromStaticMap = 'Error accessing static method: ' + e;
      }
    }

    console.log('[Debug] Detailed fingerprint info:', debugInfo);
    return { success: true, info: debugInfo };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('debug-force-set-fingerprint', async (event) => {
  try {
    const webContents = event.sender;
    const window = BrowserWindow.fromWebContents(webContents);

    if (!window) {
      return { success: false, error: 'No window context' };
    }

    // 生成一个测试指纹配置
    const testConfig = FingerprintGenerator.generateFingerprint('debug-test-' + window.id);

    // 强制设置到静态 Map 中
    (WindowManager as any).windowFingerprintMap = (WindowManager as any).windowFingerprintMap || new Map();
    (WindowManager as any).windowFingerprintMap.set(window.id, testConfig);

    console.log('[Debug] Force set fingerprint for window', window.id);

    // 通知 preload 脚本重新注入
    webContents.send('fingerprint-config-updated', testConfig);

    return {
      success: true,
      windowId: window.id,
      configSet: true,
      platform: testConfig.navigator.platform,
      language: testConfig.navigator.language
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// 获取Chrome调试端口（供外部ChromeDriver使用）
ipcMain.handle('get-chrome-debug-port', async (event, accountId: string) => {
  try {
    console.log('[IPC] Getting Chrome debug port for account:', accountId);

    const port = windowManager.getChromeDebugPort(accountId);
    if (port) {
      console.log('[IPC] Found debug port:', port, 'for account:', accountId);
      return { success: true, port };
    } else {
      console.warn('[IPC] No debug port found for account:', accountId);
      return { success: false, error: 'Chrome instance not found or not running' };
    }
  } catch (error: any) {
    console.error('[IPC] Error getting debug port:', error);
    return { success: false, error: error.message };
  }
});