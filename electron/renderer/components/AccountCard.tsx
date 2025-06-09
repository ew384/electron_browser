/**
 * 账号卡片组件 - 单个账号的管理界面
 */
import React, { useState, useEffect } from 'react';
import { useAccountStore } from '../stores/accountStore';
import type { BrowserAccount } from '@shared/types';

interface AccountCardProps {
  account: BrowserAccount;
}

export function AccountCard({ account }: AccountCardProps) {
  const { updateAccount, startInstance, stopInstance, deleteAccount, getDebugPort } = useAccountStore();
  const [isLoading, setIsLoading] = useState(false);

  // 监听账号状态变化，实时更新端口信息
  useEffect(() => {
    const updatePortInfo = async () => {
      if (account.status === 'running' && !account.debugPort) {
        const port = await getDebugPort(account.id);
        if (port && port !== account.debugPort) {
          updateAccount(account.id, { debugPort: port });
        }
      }
    };

    updatePortInfo();
  }, [account.status, account.id, account.debugPort, getDebugPort, updateAccount]);

  const getStatusColor = (status: BrowserAccount['status']) => {
    switch (status) {
      case 'running':
        return 'bg-green-500';
      case 'error':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getStatusText = (status: BrowserAccount['status']) => {
    switch (status) {
      case 'running':
        return '运行中';
      case 'error':
        return '错误';
      default:
        return '空闲';
    }
  };

  const handleStart = async () => {
    setIsLoading(true);
    try {
      await startInstance(account.id);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStop = async () => {
    setIsLoading(true);
    try {
      await stopInstance(account.id);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (window.confirm(`确定要删除账号 "${account.name}" 吗？`)) {
      await deleteAccount(account.id);
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const copyPortToClipboard = async () => {
    if (account.debugPort) {
      try {
        await navigator.clipboard.writeText(account.debugPort.toString());
        // 可以添加一个临时的成功提示
        console.log('端口号已复制到剪贴板:', account.debugPort);
      } catch (error) {
        console.error('复制端口号失败:', error);
      }
    }
  };

  return (
    <div className="bg-gray-700 rounded-lg p-4 hover:bg-gray-650 transition-colors">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="relative">
            <div className="w-12 h-12 bg-gray-600 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <div className={`absolute -bottom-1 -right-1 w-4 h-4 ${getStatusColor(account.status)} rounded-full border-2 border-gray-700`} />
          </div>

          <div className="flex-1">
            <h3 className="font-medium text-white">{account.name}</h3>
            <div className="flex items-center space-x-4 text-sm text-gray-400">
              <span>状态: {getStatusText(account.status)}</span>
              {/* 新增：端口信息显示 */}
              {account.status === 'running' && account.debugPort ? (
                <span
                  className="cursor-pointer hover:text-blue-400 transition-colors flex items-center space-x-1"
                  onClick={copyPortToClipboard}
                  title="点击复制端口号"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                  </svg>
                  <span>端口: {account.debugPort}</span>
                </span>
              ) : account.status === 'running' ? (
                <span className="text-yellow-400">端口: 获取中...</span>
              ) : (
                <span>端口: -</span>
              )}
              <span>创建: {formatDate(account.createdAt)}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {/* 新增：端口显示按钮（在运行状态下） */}
          {account.status === 'running' && account.debugPort && (
            <div className="px-3 py-1 bg-blue-600/20 text-blue-400 rounded-md text-xs font-mono border border-blue-600/30">
              :{account.debugPort}
            </div>
          )}

          {account.status === 'running' ? (
            <button
              onClick={handleStop}
              disabled={isLoading}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-800 
                          rounded-md text-sm font-medium transition-colors"
            >
              {isLoading ? '停止中...' : '停止'}
            </button>
          ) : (
            <button
              onClick={handleStart}
              disabled={isLoading}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-800 
                          rounded-md text-sm font-medium transition-colors"
            >
              {isLoading ? '启动中...' : '启动'}
            </button>
          )}

          <button
            onClick={handleDelete}
            className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-900/20 
                        rounded-md transition-colors"
            title="删除账号"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}