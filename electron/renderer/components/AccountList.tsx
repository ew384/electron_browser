// electron/renderer/components/AccountList.tsx - 扩展的账号列表组件

import React, { useState, useEffect } from 'react';
import { AccountCard } from './AccountCard';
import { CreateAccountDialog } from './CreateAccountDialog';
import { EditAccountDialog } from './EditAccountDialog';
import { ImportAccountDialog } from './ImportAccountDialog';
import { BatchOperationToolbar } from './BatchOperationToolbar';
import { AccountFilters } from './AccountFilters';
import { AccountStats } from './AccountStats';
import { useAccountStore } from '../stores/accountStore';
import { BrowserAccount, PlatformType } from '../../shared/types';

export const AccountList: React.FC = () => {
  const {
    // 数据状态
    accounts,
    platforms,
    groups,
    stats,
    isLoading,
    error,

    // UI状态
    selectedAccountIds,
    isBatchMode,
    showCreateDialog,
    showImportDialog,
    filters,

    // Actions
    loadAccounts,
    refreshAll,
    selectAccount,
    deselectAccount,
    toggleAccountSelection,
    selectAllAccounts,
    clearSelection,
    setBatchMode,
    setShowCreateDialog,
    setShowImportDialog,
    setFilters,
    clearFilters,
    searchAccounts,
    createAccount,
    updateAccount,
    deleteAccount,
    batchDeleteAccounts,
    startLogin,
    batchLogin,
    validateCookie,
    batchValidateCookies,
    exportAccounts,

    // 计算属性
    getFilteredAccounts,
    getSelectedAccounts
  } = useAccountStore();

  const [editingAccount, setEditingAccount] = useState<BrowserAccount | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  // 初始化加载数据
  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  // 处理搜索
  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      if (searchQuery.trim()) {
        searchAccounts(searchQuery);
      } else {
        loadAccounts();
      }
    }, 300);

    return () => clearTimeout(debounceTimer);
  }, [searchQuery, searchAccounts, loadAccounts]);

  const filteredAccounts = getFilteredAccounts();
  const selectedAccounts = getSelectedAccounts();

  const handleCreateAccount = async (accountData: Partial<BrowserAccount>) => {
    const success = await createAccount(accountData);
    if (success) {
      setShowCreateDialog(false);
    }
    return success;
  };

  const handleEditAccount = async (accountId: string, updates: Partial<BrowserAccount>) => {
    const success = await updateAccount(accountId, updates);
    if (success) {
      setEditingAccount(null);
    }
    return success;
  };

  const handleDeleteAccount = async (accountId: string) => {
    const success = await deleteAccount(accountId);
    if (success) {
      setShowDeleteConfirm(null);
    }
  };

  const handleBatchDelete = async () => {
    if (selectedAccountIds.length === 0) return;

    const success = await batchDeleteAccounts(selectedAccountIds);
    if (success) {
      setBatchMode(false);
    }
  };

  const handleLogin = async (accountId: string, platform: PlatformType) => {
    await startLogin(accountId, platform);
  };

  const handleBatchLogin = async (platform: PlatformType) => {
    if (selectedAccountIds.length === 0) return;
    await batchLogin(selectedAccountIds, platform);
  };

  const handleValidateCookie = async (accountId: string, platform: PlatformType) => {
    await validateCookie(accountId, platform);
  };

  const handleBatchValidateCookies = async () => {
    if (selectedAccountIds.length === 0) return;
    await batchValidateCookies(selectedAccountIds);
  };

  const handleExportAccounts = async (accountIds?: string[]) => {
    await exportAccounts(accountIds);
  };

  const handleFilterChange = (newFilters: any) => {
    setFilters(newFilters);
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* 顶部工具栏 */}
      <div className="bg-white border-b border-gray-200 p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">账号管理</h1>
            <p className="text-sm text-gray-600 mt-1">
              当前已添加 {filteredAccounts.length}/{accounts.length} 个账号
            </p>
          </div>

          <div className="flex items-center space-x-3">
            {/* 刷新按钮 */}
            <button
              onClick={refreshAll}
              disabled={isLoading}
              className="px-4 py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-md transition-colors"
              title="刷新数据"
            >
              🔄 刷新
            </button>

            {/* 批量模式切换 */}
            <button
              onClick={() => {
                setBatchMode(!isBatchMode);
                if (isBatchMode) clearSelection();
              }}
              className={`px-4 py-2 rounded-md transition-colors ${isBatchMode
                  ? 'bg-blue-500 text-white hover:bg-blue-600'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
            >
              {isBatchMode ? '退出批量' : '批量操作'}
            </button>

            {/* 导入按钮 */}
            <button
              onClick={() => setShowImportDialog(true)}
              className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors"
            >
              📥 导入账号
            </button>

            {/* 添加账号按钮 */}
            <button
              onClick={() => setShowCreateDialog(true)}
              className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
            >
              ➕ 添加账号
            </button>
          </div>
        </div>

        {/* 搜索框 */}
        <div className="mb-4">
          <div className="relative">
            <input
              type="text"
              placeholder="输入账号名称搜索..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <span className="text-gray-400">🔍</span>
            </div>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* 筛选器 */}
        <AccountFilters
          filters={filters}
          platforms={platforms}
          groups={groups}
          onFiltersChange={handleFilterChange}
          onClearFilters={clearFilters}
        />

        {/* 统计信息 */}
        {stats && <AccountStats stats={stats} />}
      </div>

      {/* 批量操作工具栏 */}
      {isBatchMode && (
        <BatchOperationToolbar
          selectedCount={selectedAccountIds.length}
          totalCount={filteredAccounts.length}
          selectedAccounts={selectedAccounts}
          onSelectAll={selectAllAccounts}
          onClearSelection={clearSelection}
          onBatchLogin={handleBatchLogin}
          onBatchValidateCookies={handleBatchValidateCookies}
          onBatchDelete={handleBatchDelete}
          onExport={() => handleExportAccounts(selectedAccountIds)}
        />
      )}

      {/* 主内容区域 */}
      <div className="flex-1 overflow-hidden">
        {/* 错误提示 */}
        {error && (
          <div className="mx-4 mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex">
              <span className="text-red-500 mr-2">⚠️</span>
              <div>
                <h3 className="text-red-800 font-medium">操作失败</h3>
                <p className="text-red-700 text-sm mt-1">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* 加载状态 */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <div className="flex items-center space-x-3">
              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
              <span className="text-gray-600">加载中...</span>
            </div>
          </div>
        )}

        {/* 账号列表 */}
        {!isLoading && (
          <div className="p-4">
            {filteredAccounts.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-6xl text-gray-300 mb-4">📱</div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  {searchQuery || Object.keys(filters).length > 0 ? '没有找到匹配的账号' : '还没有账号'}
                </h3>
                <p className="text-gray-500 mb-6">
                  {searchQuery || Object.keys(filters).length > 0
                    ? '尝试调整搜索条件或筛选器'
                    : '点击"添加账号"按钮创建第一个账号'
                  }
                </p>
                {!searchQuery && Object.keys(filters).length === 0 && (
                  <button
                    onClick={() => setShowCreateDialog(true)}
                    className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                  >
                    ➕ 添加第一个账号
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredAccounts.map((account) => (
                  <AccountCard
                    key={account.id}
                    account={account}
                    isSelected={selectedAccountIds.includes(account.id)}
                    isBatchMode={isBatchMode}
                    onSelect={toggleAccountSelection}
                    onEdit={setEditingAccount}
                    onDelete={(accountId) => setShowDeleteConfirm(accountId)}
                    onLogin={handleLogin}
                    onValidateCookie={handleValidateCookie}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 对话框 */}
      {showCreateDialog && (
        <CreateAccountDialog
          platforms={platforms}
          groups={groups}
          onSubmit={handleCreateAccount}
          onCancel={() => setShowCreateDialog(false)}
        />
      )}

      {editingAccount && (
        <EditAccountDialog
          account={editingAccount}
          platforms={platforms}
          groups={groups}
          onSubmit={(updates) => handleEditAccount(editingAccount.id, updates)}
          onCancel={() => setEditingAccount(null)}
        />
      )}

      {showImportDialog && (
        <ImportAccountDialog
          onCancel={() => setShowImportDialog(false)}
        />
      )}

      {/* 删除确认对话框 */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-medium text-gray-900 mb-4">确认删除</h3>
            <p className="text-gray-600 mb-6">
              确定要删除这个账号吗？此操作无法撤销。
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
              >
                取消
              </button>
              <button
                onClick={() => handleDeleteAccount(showDeleteConfirm)}
                className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors"
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};