import { ipcMain, BrowserWindow } from 'electron';
import { WindowManager } from './window-manager';
import { FingerprintGenerator } from './fingerprint/generator';
import { FingerprintValidator } from './fingerprint/validator';
import { FingerprintConfig, BrowserAccount, AccountConfig } from '../shared/types';

const windowManager = new WindowManager();

// 账号管理
ipcMain.handle('create-account', async (event, account: BrowserAccount) => {
  try {
    // 如果没有指纹配置，自动生成
    if (!account.config?.fingerprint) {
      const fingerprint = FingerprintGenerator.generateFingerprint(account.id);
      account.config = { ...account.config, fingerprint };
    }
    
    // 这里应该调用 AccountStorage，暂时简化
    return { success: true, account };
  } catch (error: any) {
    console.error('Failed to create account:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-accounts', async () => {
  try {
    // 暂时返回空数组，实际应该从 AccountStorage 获取
    const accounts: BrowserAccount[] = [];
    return { success: true, accounts };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('delete-account', async (event, accountId: string) => {
  try {
    // 先关闭浏览器实例
    await windowManager.closeInstance(accountId);
    // 这里应该调用 AccountStorage.deleteAccount
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// 浏览器实例管理
ipcMain.handle('create-browser-instance', async (event, accountId: string, config: AccountConfig) => {
  try {
    const instance = await windowManager.createBrowserInstance(accountId, config);
    return { success: true, instance };
  } catch (error: any) {
    console.error('Failed to create browser instance:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('close-browser-instance', async (event, accountId: string) => {
  try {
    await windowManager.closeInstance(accountId);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-browser-instances', async () => {
  try {
    const instances = windowManager.getAllInstances();
    return { success: true, instances };
  } catch (error: any) {
    return { success: false, error: error.message };
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
