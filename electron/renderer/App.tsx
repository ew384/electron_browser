/**
 * 主应用组件 - React入口
 */
import React from 'react';
import { AccountList } from './components/AccountList';
import { Header } from './components/Header';
import { StatusBar } from './components/StatusBar';
import { useAccountStore } from './stores/accountStore';

export default function App() {
  const { accounts, createAccount, isLoading } = useAccountStore();

  return (
    <div className="h-screen bg-gray-900 text-white flex flex-col">
      <Header />
      
      <main className="flex-1 p-6 overflow-auto">
        <div className="max-w-6xl mx-auto">
          {/* 快速操作区 */}
          <div className="mb-6">
            <button 
              onClick={createAccount}
              disabled={isLoading}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 
                         rounded-lg font-medium transition-colors duration-200
                         flex items-center space-x-2"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>创建中...</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  <span>创建账号</span>
                </>
              )}
            </button>
          </div>
          
          {/* 账号列表区 */}
          <div className="bg-gray-800 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">账号管理</h2>
              <span className="text-gray-400 text-sm">
                共 {accounts.length} 个账号
              </span>
            </div>
            
            <AccountList accounts={accounts} />
          </div>
        </div>
      </main>
      
      <StatusBar />
    </div>
  );
}