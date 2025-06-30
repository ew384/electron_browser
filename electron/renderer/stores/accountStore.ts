// electron/renderer/stores/accountStore.ts - 扩展的账号状态管理

import { create } from 'zustand';
import {
  BrowserAccount,
  AccountGroup,
  LoginSession,
  PlatformType,
  PlatformConfig,
  CookieStatus,
  AccountStatus
} from '../../shared/types';

interface AccountFilters {
  platform?: PlatformType;
  status?: AccountStatus;
  cookieStatus?: CookieStatus;
  group?: string;
  searchQuery?: string;
}

interface AccountStats {
  total: number;
  byPlatform: Record<string, number>;
  byStatus: Record<string, number>;
  byCookieStatus: Record<string, number>;
}

interface AccountStoreState {
  // ==================== 数据状态 ====================
  accounts: BrowserAccount[];
  groups: AccountGroup[];
  platforms: PlatformConfig[];
  loginSessions: LoginSession[];
  stats: AccountStats | null;

  // ==================== UI状态 ====================
  selectedAccountIds: string[];
  filters: AccountFilters;
  isLoading: boolean;
  isBatchMode: boolean;
  showCreateDialog: boolean;
  showGroupDialog: boolean;
  showImportDialog: boolean;

  // ==================== 错误状态 ====================
  error: string | null;

  // ==================== Actions ====================

  // 数据加载
  loadAccounts: () => Promise<void>;
  loadGroups: () => Promise<void>;
  loadPlatforms: () => Promise<void>;
  loadStats: () => Promise<void>;
  refreshAll: () => Promise<void>;

  // 账号管理
  createAccount: (accountData: Partial<BrowserAccount>) => Promise<boolean>;
  updateAccount: (accountId: string, updates: Partial<BrowserAccount>) => Promise<boolean>;
  deleteAccount: (accountId: string) => Promise<boolean>;
  batchDeleteAccounts: (accountIds: string[]) => Promise<boolean>;

  // 分组管理
  createGroup: (groupData: Partial<AccountGroup>) => Promise<boolean>;
  deleteGroup: (groupId: string) => Promise<boolean>;
  addAccountToGroup: (accountId: string, groupId: string) => Promise<boolean>;
  removeAccountFromGroup: (accountId: string, groupId: string) => Promise<boolean>;

  // 登录管理
  startLogin: (accountId: string, platform: PlatformType) => Promise<string | null>;
  batchLogin: (accountIds: string[], platform: PlatformType) => Promise<boolean>;
  checkLoginStatus: (sessionId: string) => Promise<LoginSession | null>;
  cancelLogin: (sessionId: string) => Promise<boolean>;

  // Cookie管理
  validateCookie: (accountId: string, platform: PlatformType) => Promise<boolean>;
  batchValidateCookies: (accountIds: string[]) => Promise<boolean>;

  // 筛选和搜索
  setFilters: (filters: Partial<AccountFilters>) => void;
  clearFilters: () => void;
  searchAccounts: (query: string) => Promise<void>;

  // 选择管理
  selectAccount: (accountId: string) => void;
  deselectAccount: (accountId: string) => void;
  selectAllAccounts: () => void;
  clearSelection: () => void;
  toggleAccountSelection: (accountId: string) => void;

  // UI状态管理
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setBatchMode: (enabled: boolean) => void;
  setShowCreateDialog: (show: boolean) => void;
  setShowGroupDialog: (show: boolean) => void;
  setShowImportDialog: (show: boolean) => void;

  // 计算属性
  getFilteredAccounts: () => BrowserAccount[];
  getAccountsByGroup: (groupId: string) => BrowserAccount[];
  getAccountsByPlatform: (platform: PlatformType) => BrowserAccount[];
  getSelectedAccounts: () => BrowserAccount[];

  // 导入导出
  exportAccounts: (accountIds?: string[]) => Promise<boolean>;
  importAccounts: (accountsData: Partial<BrowserAccount>[]) => Promise<boolean>;
}

export const useAccountStore = create<AccountStoreState>((set, get) => ({
  // ==================== 初始状态 ====================
  accounts: [],
  groups: [],
  platforms: [],
  loginSessions: [],
  stats: null,
  selectedAccountIds: [],
  filters: {},
  isLoading: false,
  isBatchMode: false,
  showCreateDialog: false,
  showGroupDialog: false,
  showImportDialog: false,
  error: null,

  // ==================== 数据加载 ====================

  loadAccounts: async () => {
    set({ isLoading: true, error: null });
    try {
      const result = await window.electronAPI.getAccounts();
      if (result.success) {
        set({ accounts: result.accounts || [] });
      } else {
        set({ error: result.error || 'Failed to load accounts' });
      }
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Unknown error' });
    } finally {
      set({ isLoading: false });
    }
  },

  loadGroups: async () => {
    try {
      const result = await window.electronAPI.getAllGroups();
      if (result.success) {
        set({ groups: result.data || [] });
      } else {
        console.error('Failed to load groups:', result.error);
      }
    } catch (error) {
      console.error('Failed to load groups:', error);
    }
  },

  loadPlatforms: async () => {
    try {
      const result = await window.electronAPI.getPlatformConfigs();
      if (result.success) {
        set({ platforms: result.data || [] });
      } else {
        console.error('Failed to load platforms:', result.error);
      }
    } catch (error) {
      console.error('Failed to load platforms:', error);
    }
  },

  loadStats: async () => {
    try {
      const result = await window.electronAPI.getAccountStats();
      if (result.success) {
        set({ stats: result.data || null });
      }
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  },

  refreshAll: async () => {
    const { loadAccounts, loadGroups, loadPlatforms, loadStats } = get();
    await Promise.all([
      loadAccounts(),
      loadGroups(),
      loadPlatforms(),
      loadStats()
    ]);
  },

  // ==================== 账号管理 ====================

  createAccount: async (accountData: Partial<BrowserAccount>) => {
    set({ isLoading: true, error: null });
    try {
      const result = await window.electronAPI.createAccountExtended(accountData);
      if (result.success) {
        const { accounts } = get();
        set({ accounts: [...accounts, result.data!] });
        await get().loadStats();
        return true;
      } else {
        set({ error: result.error || 'Failed to create account' });
        return false;
      }
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Unknown error' });
      return false;
    } finally {
      set({ isLoading: false });
    }
  },

  updateAccount: async (accountId: string, updates: Partial<BrowserAccount>) => {
    try {
      const result = await window.electronAPI.updateAccount(accountId, updates);
      if (result.success) {
        const { accounts } = get();
        const updatedAccounts = accounts.map(account =>
          account.id === accountId ? { ...account, ...updates } : account
        );
        set({ accounts: updatedAccounts });
        await get().loadStats();
        return true;
      } else {
        set({ error: result.error || 'Failed to update account' });
        return false;
      }
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Unknown error' });
      return false;
    }
  },

  deleteAccount: async (accountId: string) => {
    set({ isLoading: true, error: null });
    try {
      const result = await window.electronAPI.deleteAccount(accountId);
      if (result.success) {
        const { accounts, selectedAccountIds } = get();
        set({
          accounts: accounts.filter(account => account.id !== accountId),
          selectedAccountIds: selectedAccountIds.filter(id => id !== accountId)
        });
        await get().loadStats();
        return true;
      } else {
        set({ error: result.error || 'Failed to delete account' });
        return false;
      }
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Unknown error' });
      return false;
    } finally {
      set({ isLoading: false });
    }
  },

  batchDeleteAccounts: async (accountIds: string[]) => {
    set({ isLoading: true, error: null });
    try {
      const result = await window.electronAPI.batchDeleteAccounts(accountIds);
      if (result.success) {
        const { accounts } = get();
        set({
          accounts: accounts.filter(account => !accountIds.includes(account.id)),
          selectedAccountIds: []
        });
        await get().loadStats();
        return true;
      } else {
        set({ error: result.error || 'Failed to delete accounts' });
        return false;
      }
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Unknown error' });
      return false;
    } finally {
      set({ isLoading: false });
    }
  },

  // ==================== 分组管理 ====================

  createGroup: async (groupData: Partial<AccountGroup>) => {
    try {
      const result = await window.electronAPI.createGroup(groupData);
      if (result.success) {
        const { groups } = get();
        set({ groups: [...groups, result.data!] });
        return true;
      } else {
        set({ error: result.error || 'Failed to create group' });
        return false;
      }
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Unknown error' });
      return false;
    }
  },

  deleteGroup: async (groupId: string) => {
    try {
      const result = await window.electronAPI.deleteGroup(groupId);
      if (result.success) {
        const { groups } = get();
        set({ groups: groups.filter(group => group.id !== groupId) });
        // 刷新账号数据，因为分组信息已被清除
        await get().loadAccounts();
        return true;
      } else {
        set({ error: result.error || 'Failed to delete group' });
        return false;
      }
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Unknown error' });
      return false;
    }
  },

  addAccountToGroup: async (accountId: string, groupId: string) => {
    try {
      const result = await window.electronAPI.addAccountToGroup(accountId, groupId);
      if (result.success) {
        await get().updateAccount(accountId, { group: groupId });
        return true;
      } else {
        set({ error: result.error || 'Failed to add account to group' });
        return false;
      }
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Unknown error' });
      return false;
    }
  },

  removeAccountFromGroup: async (accountId: string, groupId: string) => {
    try {
      const result = await window.electronAPI.removeAccountFromGroup(accountId, groupId);
      if (result.success) {
        await get().updateAccount(accountId, { group: undefined });
        return true;
      } else {
        set({ error: result.error || 'Failed to remove account from group' });
        return false;
      }
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Unknown error' });
      return false;
    }
  },

  // ==================== 登录管理 ====================

  startLogin: async (accountId: string, platform: PlatformType) => {
    set({ isLoading: true, error: null });
    try {
      const result = await window.electronAPI.startLoginFlow(accountId, platform);
      if (result.success) {
        // 更新账号状态
        await get().updateAccount(accountId, { status: 'logging_in' });
        return result.data?.sessionId || null;
      } else {
        set({ error: result.error || 'Failed to start login' });
        return null;
      }
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Unknown error' });
      return null;
    } finally {
      set({ isLoading: false });
    }
  },

  batchLogin: async (accountIds: string[], platform: PlatformType) => {
    set({ isLoading: true, error: null });
    try {
      const result = await window.electronAPI.batchLogin(accountIds, platform);
      if (result.success) {
        // 更新所有账号状态
        for (const accountId of accountIds) {
          await get().updateAccount(accountId, { status: 'logging_in' });
        }
        return true;
      } else {
        set({ error: result.error || 'Failed to start batch login' });
        return false;
      }
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Unknown error' });
      return false;
    } finally {
      set({ isLoading: false });
    }
  },

  checkLoginStatus: async (sessionId: string) => {
    try {
      const result = await window.electronAPI.checkLoginStatus(sessionId);
      if (result.success) {
        return result.data?.session || null;
      }
      return null;
    } catch (error) {
      console.error('Failed to check login status:', error);
      return null;
    }
  },

  cancelLogin: async (sessionId: string) => {
    try {
      const result = await window.electronAPI.cancelLoginFlow(sessionId);
      return result.success;
    } catch (error) {
      console.error('Failed to cancel login:', error);
      return false;
    }
  },

  // ==================== Cookie管理 ====================

  validateCookie: async (accountId: string, platform: PlatformType) => {
    try {
      const result = await window.electronAPI.validateAccountCookie(accountId, platform);
      if (result.success) {
        // 更新账号的cookie状态
        const cookieStatus: CookieStatus = result.data?.isValid ? 'valid' : 'invalid';
        await get().updateAccount(accountId, { cookieStatus });
        return result.data?.isValid || false;
      }
      return false;
    } catch (error) {
      console.error('Failed to validate cookie:', error);
      return false;
    }
  },

  batchValidateCookies: async (accountIds: string[]) => {
    set({ isLoading: true, error: null });
    try {
      const result = await window.electronAPI.batchValidateCookies(accountIds);
      if (result.success) {
        // 更新所有账号的cookie状态
        if (result.data?.results) {
          for (const validationResult of result.data.results) {
            const cookieStatus: CookieStatus = validationResult.isValid ? 'valid' : 'invalid';
            await get().updateAccount(validationResult.accountId, { cookieStatus });
          }
        }
        return true;
      } else {
        set({ error: result.error || 'Failed to validate cookies' });
        return false;
      }
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Unknown error' });
      return false;
    } finally {
      set({ isLoading: false });
    }
  },

  // ==================== 筛选和搜索 ====================

  setFilters: (filters: Partial<AccountFilters>) => {
    set(state => ({ filters: { ...state.filters, ...filters } }));
  },

  clearFilters: () => {
    set({ filters: {} });
  },

  searchAccounts: async (query: string) => {
    if (!query.trim()) {
      await get().loadAccounts();
      return;
    }

    set({ isLoading: true, error: null });
    try {
      const result = await window.electronAPI.searchAccounts(query);
      if (result.success) {
        set({ accounts: result.data || [] });
      } else {
        set({ error: result.error || 'Search failed' });
      }
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Unknown error' });
    } finally {
      set({ isLoading: false });
    }
  },

  // ==================== 选择管理 ====================

  selectAccount: (accountId: string) => {
    set(state => ({
      selectedAccountIds: [...new Set([...state.selectedAccountIds, accountId])]
    }));
  },

  deselectAccount: (accountId: string) => {
    set(state => ({
      selectedAccountIds: state.selectedAccountIds.filter(id => id !== accountId)
    }));
  },

  selectAllAccounts: () => {
    const { getFilteredAccounts } = get();
    const allAccountIds = getFilteredAccounts().map(account => account.id);
    set({ selectedAccountIds: allAccountIds });
  },

  clearSelection: () => {
    set({ selectedAccountIds: [] });
  },

  toggleAccountSelection: (accountId: string) => {
    const { selectedAccountIds } = get();
    if (selectedAccountIds.includes(accountId)) {
      get().deselectAccount(accountId);
    } else {
      get().selectAccount(accountId);
    }
  },

  // ==================== UI状态管理 ====================

  setLoading: (loading: boolean) => set({ isLoading: loading }),
  setError: (error: string | null) => set({ error }),
  setBatchMode: (enabled: boolean) => set({ isBatchMode: enabled }),
  setShowCreateDialog: (show: boolean) => set({ showCreateDialog: show }),
  setShowGroupDialog: (show: boolean) => set({ showGroupDialog: show }),
  setShowImportDialog: (show: boolean) => set({ showImportDialog: show }),

  // ==================== 计算属性 ====================

  getFilteredAccounts: () => {
    const { accounts, filters } = get();

    return accounts.filter(account => {
      if (filters.platform && account.platform !== filters.platform) return false;
      if (filters.status && account.status !== filters.status) return false;
      if (filters.cookieStatus && account.cookieStatus !== filters.cookieStatus) return false;
      if (filters.group && account.group !== filters.group) return false;
      if (filters.searchQuery) {
        const query = filters.searchQuery.toLowerCase();
        return account.name.toLowerCase().includes(query) ||
          account.username?.toLowerCase().includes(query) ||
          account.notes?.toLowerCase().includes(query);
      }
      return true;
    });
  },

  getAccountsByGroup: (groupId: string) => {
    const { accounts } = get();
    return accounts.filter(account => account.group === groupId);
  },

  getAccountsByPlatform: (platform: PlatformType) => {
    const { accounts } = get();
    return accounts.filter(account => account.platform === platform);
  },

  getSelectedAccounts: () => {
    const { accounts, selectedAccountIds } = get();
    return accounts.filter(account => selectedAccountIds.includes(account.id));
  },

  // ==================== 导入导出 ====================

  exportAccounts: async (accountIds?: string[]) => {
    set({ isLoading: true, error: null });
    try {
      const result = await window.electronAPI.exportAccounts(accountIds);
      if (result.success) {
        // 触发文件下载
        const dataStr = JSON.stringify(result.data, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `accounts_export_${new Date().toISOString().split('T')[0]}.json`;
        link.click();
        URL.revokeObjectURL(url);
        return true;
      } else {
        set({ error: result.error || 'Failed to export accounts' });
        return false;
      }
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Unknown error' });
      return false;
    } finally {
      set({ isLoading: false });
    }
  },

  importAccounts: async (accountsData: Partial<BrowserAccount>[]) => {
    set({ isLoading: true, error: null });
    try {
      const result = await window.electronAPI.importAccounts(accountsData);
      if (result.success) {
        await get().loadAccounts();
        await get().loadStats();
        return true;
      } else {
        set({ error: result.error || 'Failed to import accounts' });
        return false;
      }
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Unknown error' });
      return false;
    } finally {
      set({ isLoading: false });
    }
  }
}));