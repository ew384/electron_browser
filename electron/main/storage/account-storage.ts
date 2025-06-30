// electron/main/storage/account-storage.ts - 扩展现有存储类

import * as fs from 'fs';
import * as path from 'path';
import {
  BrowserAccount,
  AccountCookie,
  AccountGroup,
  LoginSession,
  PlatformType,
  CookieStatus,
  BatchOperation
} from '../shared/types';

export class AccountStorage {
  private accountsFile: string;
  private cookiesFile: string;
  private groupsFile: string;
  private sessionsFile: string;
  private accounts: Map<string, BrowserAccount> = new Map();
  private cookies: Map<string, AccountCookie> = new Map();
  private groups: Map<string, AccountGroup> = new Map();
  private sessions: Map<string, LoginSession> = new Map();

  constructor(dataDir: string = './data') {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    this.accountsFile = path.join(dataDir, 'accounts.json');
    this.cookiesFile = path.join(dataDir, 'cookies.json');
    this.groupsFile = path.join(dataDir, 'groups.json');
    this.sessionsFile = path.join(dataDir, 'sessions.json');

    this.loadAccounts();
    this.loadCookies();
    this.loadGroups();
    this.loadSessions();
  }

  // ==================== 账号管理 ====================

  async saveAccount(account: BrowserAccount): Promise<void> {
    // 确保必要字段有默认值
    if (!account.createdAt) {
      account.createdAt = Date.now();
    }
    if (!account.status) {
      account.status = 'idle';
    }
    if (!account.cookieStatus) {
      account.cookieStatus = 'unknown';
    }

    this.accounts.set(account.id, account);
    await this.saveAccounts();
    console.log(`[AccountStorage] Account saved: ${account.id} (${account.platform || 'no platform'})`);
  }

  async getAccount(accountId: string): Promise<BrowserAccount | null> {
    return this.accounts.get(accountId) || null;
  }

  async getAllAccounts(): Promise<BrowserAccount[]> {
    return Array.from(this.accounts.values());
  }

  async getAccountsByPlatform(platform: PlatformType): Promise<BrowserAccount[]> {
    return Array.from(this.accounts.values()).filter(account => account.platform === platform);
  }

  async getAccountsByGroup(groupId: string): Promise<BrowserAccount[]> {
    return Array.from(this.accounts.values()).filter(account => account.group === groupId);
  }

  async updateAccount(accountId: string, updates: Partial<BrowserAccount>): Promise<void> {
    const account = this.accounts.get(accountId);
    if (account) {
      Object.assign(account, updates);
      await this.saveAccounts();
      console.log(`[AccountStorage] Account updated: ${accountId}`);
    }
  }

  async deleteAccount(accountId: string): Promise<void> {
    // 删除相关的 cookie
    await this.deleteAccountCookies(accountId);

    // 从分组中移除
    for (const group of this.groups.values()) {
      const index = group.accountIds.indexOf(accountId);
      if (index > -1) {
        group.accountIds.splice(index, 1);
      }
    }

    this.accounts.delete(accountId);
    await this.saveAccounts();
    await this.saveGroups();
    console.log(`[AccountStorage] Account deleted: ${accountId}`);
  }

  // ==================== Cookie 管理 ====================

  async saveAccountCookie(accountId: string, platform: PlatformType, cookieData: any): Promise<void> {
    const cookieId = `${accountId}_${platform}`;
    const cookie: AccountCookie = {
      id: cookieId,
      accountId,
      platform,
      cookieData,
      createdAt: Date.now(),
      lastValidated: Date.now(),
      isValid: true
    };

    this.cookies.set(cookieId, cookie);
    await this.saveCookies();

    // 更新账号的cookie状态
    await this.updateAccount(accountId, {
      cookieStatus: 'valid',
      lastCookieCheck: Date.now(),
      lastLoginTime: Date.now()
    });

    console.log(`[AccountStorage] Cookie saved for ${accountId}@${platform}`);
  }

  async getAccountCookie(accountId: string, platform: PlatformType): Promise<AccountCookie | null> {
    const cookieId = `${accountId}_${platform}`;
    return this.cookies.get(cookieId) || null;
  }

  async updateCookieStatus(accountId: string, platform: PlatformType, isValid: boolean): Promise<void> {
    const cookieId = `${accountId}_${platform}`;
    const cookie = this.cookies.get(cookieId);

    if (cookie) {
      cookie.isValid = isValid;
      cookie.lastValidated = Date.now();
      await this.saveCookies();
    }

    // 更新账号状态
    const status: CookieStatus = isValid ? 'valid' : 'invalid';
    await this.updateAccount(accountId, {
      cookieStatus: status,
      lastCookieCheck: Date.now()
    });

    console.log(`[AccountStorage] Cookie status updated: ${accountId}@${platform} = ${isValid}`);
  }

  async deleteAccountCookies(accountId: string): Promise<void> {
    const cookiesToDelete = Array.from(this.cookies.keys()).filter(key => key.startsWith(accountId + '_'));
    cookiesToDelete.forEach(key => this.cookies.delete(key));
    await this.saveCookies();
    console.log(`[AccountStorage] Deleted ${cookiesToDelete.length} cookies for account ${accountId}`);
  }

  async getAllCookies(): Promise<AccountCookie[]> {
    return Array.from(this.cookies.values());
  }

  // ==================== 分组管理 ====================

  async saveGroup(group: AccountGroup): Promise<void> {
    if (!group.createdAt) {
      group.createdAt = Date.now();
    }
    this.groups.set(group.id, group);
    await this.saveGroups();
    console.log(`[AccountStorage] Group saved: ${group.id}`);
  }

  async getGroup(groupId: string): Promise<AccountGroup | null> {
    return this.groups.get(groupId) || null;
  }

  async getAllGroups(): Promise<AccountGroup[]> {
    return Array.from(this.groups.values());
  }

  async addAccountToGroup(accountId: string, groupId: string): Promise<void> {
    const group = this.groups.get(groupId);
    if (group && !group.accountIds.includes(accountId)) {
      group.accountIds.push(accountId);
      await this.saveGroups();

      // 更新账号的分组信息
      await this.updateAccount(accountId, { group: groupId });
    }
  }

  async removeAccountFromGroup(accountId: string, groupId: string): Promise<void> {
    const group = this.groups.get(groupId);
    if (group) {
      const index = group.accountIds.indexOf(accountId);
      if (index > -1) {
        group.accountIds.splice(index, 1);
        await this.saveGroups();

        // 清除账号的分组信息
        await this.updateAccount(accountId, { group: undefined });
      }
    }
  }

  async deleteGroup(groupId: string): Promise<void> {
    const group = this.groups.get(groupId);
    if (group) {
      // 清除所有账号的分组信息
      for (const accountId of group.accountIds) {
        await this.updateAccount(accountId, { group: undefined });
      }
    }

    this.groups.delete(groupId);
    await this.saveGroups();
    console.log(`[AccountStorage] Group deleted: ${groupId}`);
  }

  // ==================== 登录会话管理 ====================

  async saveLoginSession(session: LoginSession): Promise<void> {
    this.sessions.set(session.id, session);
    await this.saveSessions();
  }

  async getLoginSession(sessionId: string): Promise<LoginSession | null> {
    return this.sessions.get(sessionId) || null;
  }

  async updateLoginSession(sessionId: string, updates: Partial<LoginSession>): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      Object.assign(session, updates);
      await this.saveSessions();
    }
  }

  async deleteLoginSession(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
    await this.saveSessions();
  }

  async getActiveLoginSessions(): Promise<LoginSession[]> {
    return Array.from(this.sessions.values()).filter(
      session => session.status === 'pending' || session.status === 'waiting_user'
    );
  }

  // ==================== 批量操作 ====================

  async getAccountsForBatchOperation(accountIds: string[]): Promise<BrowserAccount[]> {
    return accountIds.map(id => this.accounts.get(id)).filter(Boolean) as BrowserAccount[];
  }

  async updateAccountsStatus(accountIds: string[], status: Partial<BrowserAccount>): Promise<void> {
    for (const accountId of accountIds) {
      await this.updateAccount(accountId, status);
    }
  }

  // ==================== 数据持久化 ====================

  private async saveAccounts(): Promise<void> {
    const data = Array.from(this.accounts.values());
    await fs.promises.writeFile(this.accountsFile, JSON.stringify(data, null, 2));
  }

  private async saveCookies(): Promise<void> {
    const data = Array.from(this.cookies.values());
    await fs.promises.writeFile(this.cookiesFile, JSON.stringify(data, null, 2));
  }

  private async saveGroups(): Promise<void> {
    const data = Array.from(this.groups.values());
    await fs.promises.writeFile(this.groupsFile, JSON.stringify(data, null, 2));
  }

  private async saveSessions(): Promise<void> {
    const data = Array.from(this.sessions.values());
    await fs.promises.writeFile(this.sessionsFile, JSON.stringify(data, null, 2));
  }

  private loadAccounts(): void {
    try {
      if (fs.existsSync(this.accountsFile)) {
        const data = JSON.parse(fs.readFileSync(this.accountsFile, 'utf-8'));
        data.forEach((account: BrowserAccount) => {
          this.accounts.set(account.id, account);
        });
        console.log(`[AccountStorage] Loaded ${this.accounts.size} accounts`);
      }
    } catch (error) {
      console.error('[AccountStorage] Failed to load accounts:', error);
    }
  }

  private loadCookies(): void {
    try {
      if (fs.existsSync(this.cookiesFile)) {
        const data = JSON.parse(fs.readFileSync(this.cookiesFile, 'utf-8'));
        data.forEach((cookie: AccountCookie) => {
          if (cookie.id) {
            this.cookies.set(cookie.id, cookie);
          }
        });
        console.log(`[AccountStorage] Loaded ${this.cookies.size} cookies`);
      }
    } catch (error) {
      console.error('[AccountStorage] Failed to load cookies:', error);
    }
  }

  private loadGroups(): void {
    try {
      if (fs.existsSync(this.groupsFile)) {
        const data = JSON.parse(fs.readFileSync(this.groupsFile, 'utf-8'));
        data.forEach((group: AccountGroup) => {
          this.groups.set(group.id, group);
        });
        console.log(`[AccountStorage] Loaded ${this.groups.size} groups`);
      }
    } catch (error) {
      console.error('[AccountStorage] Failed to load groups:', error);
    }
  }

  private loadSessions(): void {
    try {
      if (fs.existsSync(this.sessionsFile)) {
        const data = JSON.parse(fs.readFileSync(this.sessionsFile, 'utf-8'));
        data.forEach((session: LoginSession) => {
          this.sessions.set(session.id, session);
        });
        console.log(`[AccountStorage] Loaded ${this.sessions.size} sessions`);
      }
    } catch (error) {
      console.error('[AccountStorage] Failed to load sessions:', error);
    }
  }

  // ==================== 统计和查询 ====================

  async getAccountStats(): Promise<{
    total: number;
    byPlatform: Record<string, number>;
    byStatus: Record<string, number>;
    byCookieStatus: Record<string, number>;
  }> {
    const accounts = Array.from(this.accounts.values());

    const byPlatform: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    const byCookieStatus: Record<string, number> = {};

    accounts.forEach(account => {
      // 按平台统计
      const platform = account.platform || 'unknown';
      byPlatform[platform] = (byPlatform[platform] || 0) + 1;

      // 按状态统计
      byStatus[account.status] = (byStatus[account.status] || 0) + 1;

      // 按Cookie状态统计
      const cookieStatus = account.cookieStatus || 'unknown';
      byCookieStatus[cookieStatus] = (byCookieStatus[cookieStatus] || 0) + 1;
    });

    return {
      total: accounts.length,
      byPlatform,
      byStatus,
      byCookieStatus
    };
  }

  async searchAccounts(query: string): Promise<BrowserAccount[]> {
    const lowerQuery = query.toLowerCase();
    return Array.from(this.accounts.values()).filter(account =>
      account.name.toLowerCase().includes(lowerQuery) ||
      account.username?.toLowerCase().includes(lowerQuery) ||
      account.notes?.toLowerCase().includes(lowerQuery) ||
      account.platform?.toLowerCase().includes(lowerQuery)
    );
  }
}