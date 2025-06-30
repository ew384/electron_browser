// electron/renderer/components/AccountCard.tsx - 扩展的账号卡片组件

import React, { useState } from 'react';
import { BrowserAccount, PlatformType } from '../../shared/types';
import { useAccountStore } from '../stores/accountStore';

interface AccountCardProps {
  account: BrowserAccount;
  isSelected?: boolean;
  isBatchMode?: boolean;
  onSelect?: (accountId: string) => void;
  onEdit?: (account: BrowserAccount) => void;
  onDelete?: (accountId: string) => void;
  onLogin?: (accountId: string, platform: PlatformType) => void;
  onValidateCookie?: (accountId: string, platform: PlatformType) => void;
}

const platformConfigs = {
  douyin: { name: '抖音', icon: '🎵', color: '#000000' },
  wechat: { name: '微信视频号', icon: '💬', color: '#07C160' },
  xiaohongshu: { name: '小红书', icon: '📔', color: '#FF2442' },
  kuaishou: { name: '快手', icon: '⚡', color: '#FF6600' },
  bilibili: { name: 'B站', icon: '📺', color: '#00A1D6' },
  tiktok: { name: 'TikTok', icon: '🎬', color: '#000000' },
  youtube: { name: 'YouTube', icon: '▶️', color: '#FF0000' }
};

const statusConfigs = {
  idle: { name: '空闲', color: '#10B981', bgColor: '#ECFDF5' },
  running: { name: '运行中', color: '#3B82F6', bgColor: '#EFF6FF' },
  logging_in: { name: '登录中', color: '#F59E0B', bgColor: '#FFFBEB' },
  login_failed: { name: '登录失败', color: '#EF4444', bgColor: '#FEF2F2' },
  cookie_expired: { name: 'Cookie过期', color: '#8B5CF6', bgColor: '#F5F3FF' }
};

const cookieStatusConfigs = {
  valid: { name: '有效', color: '#10B981', icon: '✅' },
  invalid: { name: '无效', color: '#EF4444', icon: '❌' },
  expired: { name: '过期', color: '#F59E0B', icon: '⏰' },
  unknown: { name: '未知', color: '#6B7280', icon: '❓' }
};

export const AccountCard: React.FC<AccountCardProps> = ({
  account,
  isSelected = false,
  isBatchMode = false,
  onSelect,
  onEdit,
  onDelete,
  onLogin,
  onValidateCookie
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [showActions, setShowActions] = useState(false);

  const platform = account.platform ? platformConfigs[account.platform] : null;
  const status = statusConfigs[account.status] || statusConfigs.idle;
  const cookieStatus = cookieStatusConfigs[account.cookieStatus || 'unknown'];

  const handleCardClick = () => {
    if (isBatchMode && onSelect) {
      onSelect(account.id);
    }
  };

  const handleLogin = async () => {
    if (!account.platform || !onLogin) return;

    setIsLoading(true);
    try {
      await onLogin(account.id, account.platform);
    } finally {
      setIsLoading(false);
    }
  };

  const handleValidateCookie = async () => {
    if (!account.platform || !onValidateCookie) return;

    setIsLoading(true);
    try {
      await onValidateCookie(account.id, account.platform);
    } finally {
      setIsLoading(false);
    }
  };

  const formatLastLogin = (timestamp?: number) => {
    if (!timestamp) return '从未登录';
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return '今天登录';
    if (days === 1) return '昨天登录';
    if (days < 7) return `${days}天前登录`;
    if (days < 30) return `${Math.floor(days / 7)}周前登录`;
    return `${Math.floor(days / 30)}个月前登录`;
  };

  return (
    <div
      className={`
        relative bg-white rounded-lg border transition-all duration-200 hover:shadow-md
        ${isSelected ? 'border-blue-500 shadow-lg ring-2 ring-blue-200' : 'border-gray-200'}
        ${isBatchMode ? 'cursor-pointer' : ''}
      `}
      onClick={handleCardClick}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* 选择指示器 */}
      {isBatchMode && (
        <div className="absolute top-3 left-3 z-10">
          <div className={`
            w-5 h-5 rounded-full border-2 flex items-center justify-center
            ${isSelected ? 'bg-blue-500 border-blue-500' : 'bg-white border-gray-300'}
          `}>
            {isSelected && <span className="text-white text-xs">✓</span>}
          </div>
        </div>
      )}

      {/* 卡片主体 */}
      <div className="p-4">
        {/* 头部信息 */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center space-x-3">
            {/* 头像/平台图标 */}
            <div className="relative">
              {account.avatar ? (
                <img
                  src={account.avatar}
                  alt={account.name}
                  className="w-12 h-12 rounded-full object-cover"
                />
              ) : (
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold text-lg"
                  style={{ backgroundColor: platform?.color || '#6B7280' }}
                >
                  {platform?.icon || account.name.charAt(0).toUpperCase()}
                </div>
              )}

              {/* 状态指示点 */}
              <div
                className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white"
                style={{ backgroundColor: status.color }}
                title={status.name}
              />
            </div>

            {/* 账号信息 */}
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-gray-900 truncate">
                {account.name}
              </h3>
              {account.username && (
                <p className="text-sm text-gray-500 truncate">
                  @{account.username}
                </p>
              )}
              <div className="flex items-center space-x-2 mt-1">
                {platform && (
                  <span
                    className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium text-white"
                    style={{ backgroundColor: platform.color }}
                  >
                    {platform.icon} {platform.name}
                  </span>
                )}
                {account.group && (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                    📁 {account.group}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* 状态信息 */}
          <div className="flex flex-col items-end space-y-1">
            <span
              className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium"
              style={{
                color: status.color,
                backgroundColor: status.bgColor
              }}
            >
              {status.name}
            </span>
            <span
              className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium"
              style={{ color: cookieStatus.color }}
              title={`Cookie状态: ${cookieStatus.name}`}
            >
              {cookieStatus.icon} {cookieStatus.name}
            </span>
          </div>
        </div>

        {/* 详细信息 */}
        <div className="space-y-2 text-sm text-gray-600">
          <div className="flex justify-between">
            <span>最后登录:</span>
            <span>{formatLastLogin(account.lastLoginTime)}</span>
          </div>

          {account.debugPort && (
            <div className="flex justify-between">
              <span>调试端口:</span>
              <span className="font-mono">{account.debugPort}</span>
            </div>
          )}

          <div className="flex justify-between">
            <span>创建时间:</span>
            <span>{account.createdAt ? new Date(account.createdAt).toLocaleDateString() : '-'}</span>
          </div>
        </div>

        {/* 标签 */}
        {account.tags && account.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {account.tags.map((tag, index) => (
              <span
                key={index}
                className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-blue-50 text-blue-700"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}

        {/* 备注 */}
        {account.notes && (
          <div className="mt-3 p-2 bg-gray-50 rounded text-sm text-gray-600">
            {account.notes}
          </div>
        )}
      </div>

      {/* 操作按钮 */}
      {!isBatchMode && (showActions || isLoading) && (
        <div className="absolute inset-0 bg-white bg-opacity-95 rounded-lg flex items-center justify-center">
          <div className="flex space-x-2">
            {/* 登录按钮 */}
            {account.platform && (
              <button
                onClick={handleLogin}
                disabled={isLoading || account.status === 'running' || account.status === 'logging_in'}
                className="px-3 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors"
              >
                {isLoading ? '处理中...' : '登录'}
              </button>
            )}

            {/* 验证Cookie按钮 */}
            {account.platform && (
              <button
                onClick={handleValidateCookie}
                disabled={isLoading}
                className="px-3 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors"
              >
                验证Cookie
              </button>
            )}

            {/* 编辑按钮 */}
            <button
              onClick={() => onEdit?.(account)}
              disabled={isLoading}
              className="px-3 py-2 bg-yellow-500 text-white rounded-md hover:bg-yellow-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors"
            >
              编辑
            </button>

            {/* 删除按钮 */}
            <button
              onClick={() => onDelete?.(account.id)}
              disabled={isLoading || account.status === 'running'}
              className="px-3 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors"
            >
              删除
            </button>
          </div>
        </div>
      )}

      {/* 加载指示器 */}
      {isLoading && (
        <div className="absolute top-2 right-2">
          <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      )}
    </div>
  );
};