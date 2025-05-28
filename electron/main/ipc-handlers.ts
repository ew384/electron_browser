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
  try {
    // 如果没有ID，生成一个
    if (!account.id) {
      account.id = `account_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    // 如果没有指纹配置，自动生成
    if (!account.config?.fingerprint) {
      const fingerprint = FingerprintGenerator.generateFingerprint(account.id);
      account.config = { ...account.config, fingerprint };
    }

    // 设置默认状态
    account.status = account.status || 'idle';
    account.createdAt = account.createdAt || Date.now();

    // 保存到存储
    await accountStorage.saveAccount(account);

    console.log('[IPC] Account created:', account.id, account.name);
    return { success: true, account };
  } catch (error: any) {
    console.error('[IPC] Failed to create account:', error);
    return { success: false, error: error.message };
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

    // 合并配置
    const finalConfig = {
      ...account.config,
      ...config
    };

    // 创建浏览器实例
    const instance = await windowManager.createBrowserInstance(accountId, finalConfig);

    // 更新账号状态
    account.status = 'running';
    await accountStorage.saveAccount(account);

    console.log('[IPC] Browser instance created:', instance);
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

// 指纹管理
ipcMain.handle('get-fingerprint-config', async (event) => {
  const webContents = event.sender;
  const window = BrowserWindow.fromWebContents(webContents);

  // 通过窗口ID找到对应的账号
  for (const instance of windowManager.getAllInstances()) {
    if (instance.windowId === window?.id) {
      const config = windowManager.getFingerprintConfig(instance.accountId);
      return { success: true, config };
    }
  }

  return { success: false, error: 'No fingerprint config found' };
});

ipcMain.handle('update-fingerprint-config', async (event, config: FingerprintConfig) => {
  const webContents = event.sender;
  const window = BrowserWindow.fromWebContents(webContents);

  for (const instance of windowManager.getAllInstances()) {
    if (instance.windowId === window?.id) {
      windowManager.updateFingerprintConfig(instance.accountId, config);

      // 通知所有相关窗口配置已更新
      webContents.send('fingerprint-config-updated', config);

      return { success: true };
    }
  }

  return { success: false, error: 'Failed to update fingerprint config' };
});

ipcMain.handle('validate-fingerprint', async (event, config: FingerprintConfig) => {
  try {
    const quality = FingerprintValidator.validateFingerprint(config);
    return { success: true, quality };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('generate-fingerprint', async (event, seed?: string) => {
  try {
    const config = FingerprintGenerator.generateFingerprint(seed);
    const quality = FingerprintValidator.validateFingerprint(config);
    return { success: true, config, quality };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// 应用信息
ipcMain.handle('get-app-version', async () => {
  return process.env.npm_package_version || '1.0.0';
});