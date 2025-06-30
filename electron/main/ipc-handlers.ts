// electron/main/ipc-handlers.ts - 扩展现有IPC处理器

import { ipcMain } from 'electron';
import {
  BrowserAccount,
  AccountGroup,
  LoginSession,
  PlatformType,
  AccountCookie,
  PlatformConfig
} from '../shared/types';
import { windowManager, accountStorage } from './index';
import { LoginManager } from './login-manager';

// 创建 LoginManager 实例
const loginManager = new LoginManager(windowManager, accountStorage);

console.log('[IPC-Handlers] 初始化扩展的账号管理功能');

// ==================== 扩展的账号管理 ====================

// 创建账号（扩展版本，支持平台选择）
ipcMain.handle('create-account-extended', async (event, accountData: Partial<BrowserAccount>) => {
  console.log('[IPC] create-account-extended called with:', accountData);
  try {
    // 验证必要字段
    if (!accountData.name) {
      throw new Error('Account name is required');
    }

    // 生成账号ID
    const accountId = accountData.id || `account_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // 创建完整的账号对象
    const account: BrowserAccount = {
      id: accountId,
      name: accountData.name,
      platform: accountData.platform,
      group: accountData.group,
      notes: accountData.notes,
      status: 'idle',
      cookieStatus: 'unknown',
      createdAt: Date.now(),
      config: accountData.config,
      tags: accountData.tags || []
    };

    // 如果没有指纹配置，自动生成
    if (!account.config?.fingerprint) {
      const { FingerprintGenerator } = await import('./fingerprint/generator');
      account.config = {
        ...account.config,
        fingerprint: FingerprintGenerator.generateFingerprint(accountId)
      };
    }

    await accountStorage.saveAccount(account);

    console.log('[IPC] Extended account created successfully:', accountId);
    return { success: true, account };

  } catch (error: any) {
    console.error('[IPC] Failed to create extended account:', error);
    return { success: false, error: error?.message || String(error) };
  }
});

// 更新账号信息
ipcMain.handle('update-account', async (event, accountId: string, updates: Partial<BrowserAccount>) => {
  try {
    await accountStorage.updateAccount(accountId, updates);
    console.log('[IPC] Account updated:', accountId);
    return { success: true };
  } catch (error: any) {
    console.error('[IPC] Failed to update account:', error);
    return { success: false, error: error.message };
  }
});

// 按平台获取账号
ipcMain.handle('get-accounts-by-platform', async (event, platform: PlatformType) => {
  try {
    const accounts = await accountStorage.getAccountsByPlatform(platform);
    return { success: true, accounts };
  } catch (error: any) {
    console.error('[IPC] Failed to get accounts by platform:', error);
    return { success: false, error: error.message, accounts: [] };
  }
});

// 搜索账号
ipcMain.handle('search-accounts', async (event, query: string) => {
  try {
    const accounts = await accountStorage.searchAccounts(query);
    return { success: true, accounts };
  } catch (error: any) {
    console.error('[IPC] Failed to search accounts:', error);
    return { success: false, error: error.message, accounts: [] };
  }
});

// 获取账号统计信息
ipcMain.handle('get-account-stats', async () => {
  try {
    const stats = await accountStorage.getAccountStats();
    return { success: true, stats };
  } catch (error: any) {
    console.error('[IPC] Failed to get account stats:', error);
    return { success: false, error: error.message };
  }
});

// ==================== 登录流程管理 ====================

// 开始登录流程
ipcMain.handle('start-login-flow', async (event, accountId: string, platform: PlatformType) => {
  try {
    console.log(`[IPC] Starting login flow for ${accountId}@${platform}`);
    const sessionId = await loginManager.startLoginFlow(accountId, platform);
    return { success: true, sessionId };
  } catch (error: any) {
    console.error('[IPC] Failed to start login flow:', error);
    return { success: false, error: error.message };
  }
});

// 检查登录状态
ipcMain.handle('check-login-status', async (event, sessionId: string) => {
  try {
    const session = await loginManager.checkLoginStatus(sessionId);
    return { success: true, session };
  } catch (error: any) {
    console.error('[IPC] Failed to check login status:', error);
    return { success: false, error: error.message };
  }
});

// 完成登录流程
ipcMain.handle('complete-login-flow', async (event, sessionId: string) => {
  try {
    await loginManager.completeLoginFlow(sessionId);
    return { success: true };
  } catch (error: any) {
    console.error('[IPC] Failed to complete login flow:', error);
    return { success: false, error: error.message };
  }
});

// 取消登录流程
ipcMain.handle('cancel-login-flow', async (event, sessionId: string) => {
  try {
    await loginManager.cancelLoginFlow(sessionId);
    return { success: true };
  } catch (error: any) {
    console.error('[IPC] Failed to cancel login flow:', error);
    return { success: false, error: error.message };
  }
});

// 批量登录
ipcMain.handle('batch-login', async (event, accountIds: string[], platform: PlatformType) => {
  try {
    console.log(`[IPC] Starting batch login for ${accountIds.length} accounts`);
    const result = await loginManager.batchLogin(accountIds, platform);
    return { success: true, ...result };
  } catch (error: any) {
    console.error('[IPC] Failed to start batch login:', error);
    return { success: false, error: error.message };
  }
});

// ==================== Cookie 管理 ====================

// 验证账号Cookie
ipcMain.handle('validate-account-cookie', async (event, accountId: string, platform: PlatformType) => {
  try {
    const isValid = await loginManager.validateAccountCookie(accountId, platform);
    return { success: true, isValid };
  } catch (error: any) {
    console.error('[IPC] Failed to validate cookie:', error);
    return { success: false, error: error.message, isValid: false };
  }
});

// 批量验证Cookie
ipcMain.handle('batch-validate-cookies', async (event, accountIds: string[]) => {
  try {
    console.log(`[IPC] Starting batch cookie validation for ${accountIds.length} accounts`);
    const result = await loginManager.batchValidateCookies(accountIds);
    return { success: true, ...result };
  } catch (error: any) {
    console.error('[IPC] Failed to batch validate cookies:', error);
    return { success: false, error: error.message };
  }
});

// 获取账号Cookie
ipcMain.handle('get-account-cookie', async (event, accountId: string, platform: PlatformType) => {
  try {
    const cookie = await accountStorage.getAccountCookie(accountId, platform);
    return { success: true, cookie };
  } catch (error: any) {
    console.error('[IPC] Failed to get account cookie:', error);
    return { success: false, error: error.message };
  }
});

// 删除账号Cookie
ipcMain.handle('delete-account-cookies', async (event, accountId: string) => {
  try {
    await accountStorage.deleteAccountCookies(accountId);
    return { success: true };
  } catch (error: any) {
    console.error('[IPC] Failed to delete account cookies:', error);
    return { success: false, error: error.message };
  }
});

// ==================== 分组管理 ====================

// 创建分组
ipcMain.handle('create-group', async (event, groupData: Partial<AccountGroup>) => {
  try {
    if (!groupData.name) {
      throw new Error('Group name is required');
    }

    const group: AccountGroup = {
      id: groupData.id || `group_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      name: groupData.name,
      description: groupData.description,
      color: groupData.color,
      platform: groupData.platform,
      createdAt: Date.now(),
      accountIds: groupData.accountIds || []
    };

    await accountStorage.saveGroup(group);
    console.log('[IPC] Group created:', group.id);
    return { success: true, group };

  } catch (error: any) {
    console.error('[IPC] Failed to create group:', error);
    return { success: false, error: error.message };
  }
});

// 获取所有分组
ipcMain.handle('get-all-groups', async () => {
  try {
    const groups = await accountStorage.getAllGroups();
    return { success: true, groups };
  } catch (error: any) {
    console.error('[IPC] Failed to get groups:', error);
    return { success: false, error: error.message, groups: [] };
  }
});

// 获取分组详情
ipcMain.handle('get-group', async (event, groupId: string) => {
  try {
    const group = await accountStorage.getGroup(groupId);
    return { success: true, group };
  } catch (error: any) {
    console.error('[IPC] Failed to get group:', error);
    return { success: false, error: error.message };
  }
});

// 添加账号到分组
ipcMain.handle('add-account-to-group', async (event, accountId: string, groupId: string) => {
  try {
    await accountStorage.addAccountToGroup(accountId, groupId);
    return { success: true };
  } catch (error: any) {
    console.error('[IPC] Failed to add account to group:', error);
    return { success: false, error: error.message };
  }
});

// 从分组移除账号
ipcMain.handle('remove-account-from-group', async (event, accountId: string, groupId: string) => {
  try {
    await accountStorage.removeAccountFromGroup(accountId, groupId);
    return { success: true };
  } catch (error: any) {
    console.error('[IPC] Failed to remove account from group:', error);
    return { success: false, error: error.message };
  }
});

// 删除分组
ipcMain.handle('delete-group', async (event, groupId: string) => {
  try {
    await accountStorage.deleteGroup(groupId);
    return { success: true };
  } catch (error: any) {
    console.error('[IPC] Failed to delete group:', error);
    return { success: false, error: error.message };
  }
});

// ==================== 平台配置 ====================

// 获取平台配置列表
ipcMain.handle('get-platform-configs', async () => {
  try {
    const configs = loginManager.getPlatformConfigs();
    return { success: true, configs };
  } catch (error: any) {
    console.error('[IPC] Failed to get platform configs:', error);
    return { success: false, error: error.message, configs: [] };
  }
});

// 获取特定平台配置
ipcMain.handle('get-platform-config', async (event, platform: PlatformType) => {
  try {
    const config = loginManager.getPlatformConfig(platform);
    return { success: true, config };
  } catch (error: any) {
    console.error('[IPC] Failed to get platform config:', error);
    return { success: false, error: error.message };
  }
});

// ==================== 会话管理 ====================

// 获取活跃登录会话
ipcMain.handle('get-active-login-sessions', async () => {
  try {
    const sessions = loginManager.getActiveSessions();
    return { success: true, sessions };
  } catch (error: any) {
    console.error('[IPC] Failed to get active sessions:', error);
    return { success: false, error: error.message, sessions: [] };
  }
});

// 获取账号的登录会话
ipcMain.handle('get-account-login-sessions', async (event, accountId: string) => {
  try {
    const sessions = await loginManager.getSessionsByAccount(accountId);
    return { success: true, sessions };
  } catch (error: any) {
    console.error('[IPC] Failed to get account sessions:', error);
    return { success: false, error: error.message, sessions: [] };
  }
});

// ==================== 批量操作 ====================

// 批量更新账号状态
ipcMain.handle('batch-update-accounts', async (event, accountIds: string[], updates: Partial<BrowserAccount>) => {
  try {
    await accountStorage.updateAccountsStatus(accountIds, updates);
    console.log(`[IPC] Batch updated ${accountIds.length} accounts`);
    return { success: true };
  } catch (error: any) {
    console.error('[IPC] Failed to batch update accounts:', error);
    return { success: false, error: error.message };
  }
});

// 批量删除账号
ipcMain.handle('batch-delete-accounts', async (event, accountIds: string[]) => {
  try {
    for (const accountId of accountIds) {
      await accountStorage.deleteAccount(accountId);
    }
    console.log(`[IPC] Batch deleted ${accountIds.length} accounts`);
    return { success: true };
  } catch (error: any) {
    console.error('[IPC] Failed to batch delete accounts:', error);
    return { success: false, error: error.message };
  }
});

// ==================== 应用生命周期 ====================

// 应用关闭时清理资源
ipcMain.handle('cleanup-login-manager', async () => {
  try {
    await loginManager.cleanup();
    return { success: true };
  } catch (error: any) {
    console.error('[IPC] Failed to cleanup login manager:', error);
    return { success: false, error: error.message };
  }
});

// ==================== 导入导出 ====================

// 导出账号数据
ipcMain.handle('export-accounts', async (event, accountIds?: string[]) => {
  try {
    let accounts: BrowserAccount[];

    if (accountIds && accountIds.length > 0) {
      accounts = await accountStorage.getAccountsForBatchOperation(accountIds);
    } else {
      accounts = await accountStorage.getAllAccounts();
    }

    // 移除敏感信息
    const exportData = accounts.map(account => ({
      ...account,
      config: undefined, // 不导出指纹配置
      debugPort: undefined
    }));

    return { success: true, data: exportData };
  } catch (error: any) {
    console.error('[IPC] Failed to export accounts:', error);
    return { success: false, error: error.message };
  }
});

// 导入账号数据
ipcMain.handle('import-accounts', async (event, accountsData: Partial<BrowserAccount>[]) => {
  try {
    const results: { success: boolean; accountId?: string; error?: string }[] = [];

    for (const accountData of accountsData) {
      try {
        // 生成新的ID避免冲突
        const newAccountId = `imported_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

        const account: BrowserAccount = {
          ...accountData,
          id: newAccountId,
          name: accountData.name || `Imported Account ${newAccountId}`,
          status: 'idle',
          cookieStatus: 'unknown',
          createdAt: Date.now()
        };

        // 重新生成指纹配置
        if (!account.config?.fingerprint) {
          const { FingerprintGenerator } = await import('./fingerprint/generator');
          account.config = {
            ...account.config,
            fingerprint: FingerprintGenerator.generateFingerprint(newAccountId)
          };
        }

        await accountStorage.saveAccount(account);
        results.push({ success: true, accountId: newAccountId });

      } catch (error: any) {
        results.push({ success: false, error: error.message });
      }
    }

    const successCount = results.filter(r => r.success).length;
    console.log(`[IPC] Imported ${successCount}/${accountsData.length} accounts`);

    return { success: true, results, successCount };
  } catch (error: any) {
    console.error('[IPC] Failed to import accounts:', error);
    return { success: false, error: error.message };
  }
});

console.log('[IPC-Handlers] ✅ 扩展的账号管理IPC处理器已注册完成');