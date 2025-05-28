/**
 * 状态栏组件 - 显示应用状态信息
 */
import React, { useEffect, useState } from 'react';
import { useAccountStore } from '../stores/accountStore';

export function StatusBar() {
  const { accounts } = useAccountStore();
  const [appVersion, setAppVersion] = useState('');

  useEffect(() => {
    window.electronAPI?.getAppVersion().then(setAppVersion);
  }, []);

  const runningCount = accounts.filter(account => account.status === 'running').length;
  const totalCount = accounts.length;

  return (
    <footer className="bg-gray-800 border-t border-gray-700 px-6 py-3">
      <div className="flex items-center justify-between text-sm text-gray-400">
        <div className="flex items-center space-x-6">
          <span>运行实例: {runningCount}/{totalCount}</span>
          <span>内存占用: 计算中...</span>
          <span className="flex items-center space-x-1">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span>系统正常</span>
          </span>
        </div>
        
        <div className="flex items-center space-x-4">
          <span>v{appVersion}</span>
          <span>{new Date().toLocaleTimeString('zh-CN')}</span>
        </div>
      </div>
    </footer>
  );
}