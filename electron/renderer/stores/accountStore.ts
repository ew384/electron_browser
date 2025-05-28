/**
 * 账号状态管理 - Zustand轻量级状态管理
 */
import { create } from 'zustand';
import type { BrowserAccount, AccountConfig } from '@shared/types';

interface AccountStore {
  // 状态
  accounts: BrowserAccount[];
  isLoading: boolean;
  error: string | null;
  
  // 基础操作
  createAccount: () => Promise<void>;
  updateAccount: (id: string, updates: Partial<BrowserAccount>) => void;
  deleteAccount: (id: string) => Promise<void>;
  
  // 实例管理
  startInstance: (accountId: string, config?: AccountConfig) => Promise<void>;
  stopInstance: (accountId: string) => Promise<void>;
  
  // 预留扩展方法
  updateFingerprint: (accountId: string, fingerprint: any) => Promise<void>;
  updateProxy: (accountId: string, proxy: any) => Promise<void>;
  executeBehavior: (accountId: string, behavior: any) => Promise<void>;
  
  // 工具方法
  clearError: () => void;
  refreshAccounts: () => Promise<void>;
}

export const useAccountStore = create<AccountStore>((set, get) => ({
  // 初始状态
  accounts: [],
  isLoading: false,
  error: null,

  // 创建账号
  createAccount: async () => {
    set({ isLoading: true, error: null });
    
    try {
      const newAccount: BrowserAccount = {
        id: `account_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: `账号 ${get().accounts.length + 1}`,
        status: 'idle',
        createdAt: Date.now()
      };
      
      set(state => ({ 
        accounts: [...state.accounts, newAccount],
        isLoading: false
      }));
      
      // 成功提示
      console.log('账号创建成功:', newAccount.name);
      
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : '创建账号失败',
        isLoading: false 
      });
    }
  },

  // 更新账号
  updateAccount: (id, updates) => {
    set(state => ({
      accounts: state.accounts.map(account => 
        account.id === id 
          ? { ...account, ...updates, updatedAt: Date.now() }
          : account
      )
    }));
  },

  // 删除账号
  deleteAccount: async (id) => {
    set({ isLoading: true, error: null });
    
    try {
      // 先停止实例
      await get().stopInstance(id);
      
      set(state => ({
        accounts: state.accounts.filter(account => account.id !== id),
        isLoading: false
      }));
      
      console.log('账号删除成功:', id);
      
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : '删除账号失败',
        isLoading: false 
      });
    }
  },

  // 启动实例
  startInstance: async (accountId, config) => {
    const { updateAccount } = get();
    
    try {
      updateAccount(accountId, { status: 'idle' });
      
      const response = await window.electronAPI?.createBrowserInstance(accountId, config);
      
      if (response?.success) {
        updateAccount(accountId, { status: 'running' });
        console.log('浏览器实例启动成功:', accountId);
      } else {
        throw new Error(response?.error || '启动失败');
      }
      
    } catch (error) {
      updateAccount(accountId, { status: 'error' });
      set({ error: error instanceof Error ? error.message : '启动实例失败' });
      throw error;
    }
  },

  // 停止实例
  stopInstance: async (accountId) => {
    const { updateAccount } = get();
    
    try {
      const response = await window.electronAPI?.destroyBrowserInstance(accountId);
      
      if (response?.success) {
        updateAccount(accountId, { status: 'idle' });
        console.log('浏览器实例停止成功:', accountId);
      } else {
        throw new Error(response?.error || '停止失败');
      }
      
    } catch (error) {
      set({ error: error instanceof Error ? error.message : '停止实例失败' });
      throw error;
    }
  },

  // 预留扩展方法
  updateFingerprint: async (accountId, fingerprint) => {
    try {
      const response = await window.electronAPI?.injectFingerprint(accountId, fingerprint);
      if (!response?.success) {
        throw new Error(response?.error || '指纹更新失败');
      }
      console.log('指纹更新成功:', accountId);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : '指纹更新失败' });
      throw error;
    }
  },

  updateProxy: async (accountId, proxy) => {
    try {
      const response = await window.electronAPI?.updateProxy(accountId, proxy);
      if (!response?.success) {
        throw new Error(response?.error || '代理更新失败');
      }
      console.log('代理更新成功:', accountId);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : '代理更新失败' });
      throw error;
    }
  },

  executeBehavior: async (accountId, behavior) => {
    try {
      const response = await window.electronAPI?.executeBehavior(accountId, behavior);
      if (!response?.success) {
        throw new Error(response?.error || '行为执行失败');
      }
      console.log('行为执行成功:', accountId);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : '行为执行失败' });
      throw error;
    }
  },

  // 工具方法
  clearError: () => {
    set({ error: null });
  },

  refreshAccounts: async () => {
    // 预留账号刷新逻辑
    console.log('刷新账号列表');
  }
}));