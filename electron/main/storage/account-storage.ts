import * as fs from 'fs/promises';
import * as path from 'path';
import { BrowserAccount } from '../../shared/types';

export class AccountStorage {
  private readonly storageDir: string;
  private readonly accountsFile: string;

  constructor() {
    // 简化路径处理，避免依赖 electron app
    this.storageDir = path.join(process.cwd(), 'data', 'accounts');
    this.accountsFile = path.join(this.storageDir, 'accounts.json');
    this.ensureStorageDir();
  }

  private async ensureStorageDir() {
    try {
      await fs.mkdir(this.storageDir, { recursive: true });
    } catch (error: any) {
      console.error('Failed to create storage directory:', error);
    }
  }

  async saveAccount(account: BrowserAccount): Promise<void> {
    try {
      const accounts = await this.getAllAccounts();
      const existingIndex = accounts.findIndex(a => a.id === account.id);
      
      if (existingIndex >= 0) {
        accounts[existingIndex] = account;
      } else {
        accounts.push(account);
      }
      
      await fs.writeFile(this.accountsFile, JSON.stringify(accounts, null, 2));
    } catch (error: any) {
      console.error('Failed to save account:', error);
      throw error;
    }
  }

  async getAllAccounts(): Promise<BrowserAccount[]> {
    try {
      const data = await fs.readFile(this.accountsFile, 'utf8');
      return JSON.parse(data);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return [];
      }
      console.error('Failed to load accounts:', error);
      throw error;
    }
  }

  async getAccount(accountId: string): Promise<BrowserAccount | null> {
    try {
      const accounts = await this.getAllAccounts();
      return accounts.find(a => a.id === accountId) || null;
    } catch (error: any) {
      console.error('Failed to get account:', error);
      return null;
    }
  }

  async deleteAccount(accountId: string): Promise<void> {
    try {
      const accounts = await this.getAllAccounts();
      const filteredAccounts = accounts.filter(a => a.id !== accountId);
      await fs.writeFile(this.accountsFile, JSON.stringify(filteredAccounts, null, 2));
    } catch (error: any) {
      console.error('Failed to delete account:', error);
      throw error;
    }
  }
}
