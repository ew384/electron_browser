import * as fs from 'fs/promises';
import * as path from 'path';
import { app } from 'electron';
import { BrowserAccount } from '../../shared/types';

export class AccountStorage {
  private readonly storageDir: string;
  private readonly accountsFile: string;

  constructor() {
    // 使用 Electron 的 userData 目录
    try {
      this.storageDir = path.join(app.getPath('userData'), 'accounts');
    } catch (error) {
      // 如果在非 Electron 环境下，使用当前工作目录
      this.storageDir = path.join(process.cwd(), 'data', 'accounts');
    }
    this.accountsFile = path.join(this.storageDir, 'accounts.json');
    this.ensureStorageDir();
  }

  private async ensureStorageDir() {
    try {
      await fs.mkdir(this.storageDir, { recursive: true });
      console.log('[AccountStorage] Storage directory ensured:', this.storageDir);
    } catch (error: any) {
      console.error('[AccountStorage] Failed to create storage directory:', error);
    }
  }

  async saveAccount(account: BrowserAccount): Promise<void> {
    try {
      console.log('[AccountStorage] Saving account:', account.id, account.name);
      const accounts = await this.getAllAccounts();
      const existingIndex = accounts.findIndex(a => a.id === account.id);

      if (existingIndex >= 0) {
        accounts[existingIndex] = account;
        console.log('[AccountStorage] Updated existing account:', account.id);
      } else {
        accounts.push(account);
        console.log('[AccountStorage] Added new account:', account.id);
      }

      await fs.writeFile(this.accountsFile, JSON.stringify(accounts, null, 2));
      console.log('[AccountStorage] Accounts file written successfully');
    } catch (error: any) {
      console.error('[AccountStorage] Failed to save account:', error);
      throw error;
    }
  }

  async getAllAccounts(): Promise<BrowserAccount[]> {
    try {
      console.log('[AccountStorage] Reading accounts from:', this.accountsFile);
      const data = await fs.readFile(this.accountsFile, 'utf8');
      const accounts = JSON.parse(data);
      console.log('[AccountStorage] Loaded accounts:', accounts.length);
      return accounts;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        console.log('[AccountStorage] No accounts file found, returning empty array');
        return [];
      }
      console.error('[AccountStorage] Failed to load accounts:', error);
      throw error;
    }
  }

  async getAccount(accountId: string): Promise<BrowserAccount | null> {
    try {
      const accounts = await this.getAllAccounts();
      const account = accounts.find(a => a.id === accountId) || null;
      console.log('[AccountStorage] Get account result:', accountId, account ? 'found' : 'not found');
      return account;
    } catch (error: any) {
      console.error('[AccountStorage] Failed to get account:', error);
      return null;
    }
  }

  async deleteAccount(accountId: string): Promise<void> {
    try {
      console.log('[AccountStorage] Deleting account:', accountId);
      const accounts = await this.getAllAccounts();
      const filteredAccounts = accounts.filter(a => a.id !== accountId);
      await fs.writeFile(this.accountsFile, JSON.stringify(filteredAccounts, null, 2));
      console.log('[AccountStorage] Account deleted successfully');
    } catch (error: any) {
      console.error('[AccountStorage] Failed to delete account:', error);
      throw error;
    }
  }
}