// electron/renderer/components/BatchOperationToolbar.tsx - 批量操作工具栏

import React, { useState } from 'react';
import { BrowserAccount, PlatformType } from '../../shared/types';

interface BatchOperationToolbarProps {
    selectedCount: number;
    totalCount: number;
    selectedAccounts: BrowserAccount[];
    onSelectAll: () => void;
    onClearSelection: () => void;
    onBatchLogin: (platform: PlatformType) => Promise<void>;
    onBatchValidateCookies: () => Promise<void>;
    onBatchDelete: () => Promise<void>;
    onExport: () => Promise<void>;
}

export const BatchOperationToolbar: React.FC<BatchOperationToolbarProps> = ({
    selectedCount,
    totalCount,
    selectedAccounts,
    onSelectAll,
    onClearSelection,
    onBatchLogin,
    onBatchValidateCookies,
    onBatchDelete,
    onExport
}) => {
    const [showLoginMenu, setShowLoginMenu] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [isOperating, setIsOperating] = useState(false);

    // 获取选中账号的平台分布
    const platformDistribution = selectedAccounts.reduce((acc, account) => {
        if (account.platform) {
            acc[account.platform] = (acc[account.platform] || 0) + 1;
        }
        return acc;
    }, {} as Record<PlatformType, number>);

    const platforms = [
        { id: 'douyin', name: '抖音', icon: '🎵' },
        { id: 'wechat', name: '微信视频号', icon: '💬' },
        { id: 'xiaohongshu', name: '小红书', icon: '📔' },
        { id: 'kuaishou', name: '快手', icon: '⚡' },
        { id: 'bilibili', name: 'B站', icon: '📺' }
    ] as const;

    const handleBatchLogin = async (platform: PlatformType) => {
        setIsOperating(true);
        setShowLoginMenu(false);
        try {
            await onBatchLogin(platform);
        } finally {
            setIsOperating(false);
        }
    };

    const handleBatchValidate = async () => {
        setIsOperating(true);
        try {
            await onBatchValidateCookies();
        } finally {
            setIsOperating(false);
        }
    };

    const handleBatchDelete = async () => {
        setIsOperating(true);
        setShowDeleteConfirm(false);
        try {
            await onBatchDelete();
        } finally {
            setIsOperating(false);
        }
    };

    const handleExport = async () => {
        setIsOperating(true);
        try {
            await onExport();
        } finally {
            setIsOperating(false);
        }
    };

    return (
        <>
            <div className="bg-blue-50 border-b border-blue-200 px-4 py-3">
                <div className="flex items-center justify-between">
                    {/* 左侧：选择信息 */}
                    <div className="flex items-center space-x-4">
                        <div className="flex items-center space-x-2">
                            <span className="text-sm font-medium text-blue-900">
                                已选择 {selectedCount} / {totalCount} 个账号
                            </span>
                            {selectedCount > 0 && (
                                <div className="flex items-center space-x-1 text-xs text-blue-700">
                                    {Object.entries(platformDistribution).map(([platform, count]) => {
                                        const platformInfo = platforms.find(p => p.id === platform);
                                        return (
                                            <span key={platform} className="bg-blue-100 px-2 py-1 rounded">
                                                {platformInfo?.icon} {count}
                                            </span>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <div className="flex items-center space-x-2">
                            <button
                                onClick={selectedCount === totalCount ? onClearSelection : onSelectAll}
                                className="text-sm text-blue-600 hover:text-blue-800 underline"
                            >
                                {selectedCount === totalCount ? '取消全选' : '全选'}
                            </button>
                            {selectedCount > 0 && (
                                <button
                                    onClick={onClearSelection}
                                    className="text-sm text-blue-600 hover:text-blue-800 underline"
                                >
                                    清空选择
                                </button>
                            )}
                        </div>
                    </div>

                    {/* 右侧：批量操作按钮 */}
                    {selectedCount > 0 && (
                        <div className="flex items-center space-x-2">
                            {/* 批量登录 */}
                            <div className="relative">
                                <button
                                    onClick={() => setShowLoginMenu(!showLoginMenu)}
                                    disabled={isOperating}
                                    className="px-3 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 disabled:opacity-50 text-sm font-medium transition-colors"
                                >
                                    🔑 批量登录 ▼
                                </button>

                                {showLoginMenu && (
                                    <div className="absolute top-full right-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-10 min-w-48">
                                        <div className="py-1">
                                            <div className="px-3 py-2 text-xs text-gray-500 border-b">
                                                选择登录平台
                                            </div>
                                            {platforms.map((platform) => {
                                                const count = platformDistribution[platform.id as PlatformType] || 0;
                                                return (
                                                    <button
                                                        key={platform.id}
                                                        onClick={() => handleBatchLogin(platform.id as PlatformType)}
                                                        disabled={count === 0}
                                                        className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center justify-between ${count === 0 ? 'text-gray-400 cursor-not-allowed' : 'text-gray-700'
                                                            }`}
                                                    >
                                                        <span>{platform.icon} {platform.name}</span>
                                                        {count > 0 && (
                                                            <span className="text-xs bg-blue-100 text-blue-800 px-1 rounded">
                                                                {count}
                                                            </span>
                                                        )}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* 批量验证Cookie */}
                            <button
                                onClick={handleBatchValidate}
                                disabled={isOperating}
                                className="px-3 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50 text-sm font-medium transition-colors"
                            >
                                🔍 验证Cookie
                            </button>

                            {/* 导出 */}
                            <button
                                onClick={handleExport}
                                disabled={isOperating}
                                className="px-3 py-2 bg-purple-500 text-white rounded-md hover:bg-purple-600 disabled:opacity-50 text-sm font-medium transition-colors"
                            >
                                📥 导出
                            </button>

                            {/* 批量删除 */}
                            <button
                                onClick={() => setShowDeleteConfirm(true)}
                                disabled={isOperating}
                                className="px-3 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 disabled:opacity-50 text-sm font-medium transition-colors"
                            >
                                🗑️ 删除
                            </button>

                            {/* 操作中指示器 */}
                            {isOperating && (
                                <div className="flex items-center space-x-2 text-blue-600">
                                    <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                                    <span className="text-sm">操作中...</span>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* 点击外部关闭菜单 */}
            {showLoginMenu && (
                <div
                    className="fixed inset-0 z-5"
                    onClick={() => setShowLoginMenu(false)}
                />
            )}

            {/* 删除确认对话框 */}
            {showDeleteConfirm && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
                        <h3 className="text-lg font-medium text-gray-900 mb-4">确认批量删除</h3>
                        <div className="mb-4">
                            <p className="text-gray-600 mb-3">
                                确定要删除选中的 {selectedCount} 个账号吗？此操作无法撤销。
                            </p>

                            {/* 显示将被删除的账号列表 */}
                            <div className="max-h-32 overflow-y-auto bg-gray-50 rounded p-3">
                                <div className="text-sm text-gray-700 space-y-1">
                                    {selectedAccounts.slice(0, 5).map((account) => (
                                        <div key={account.id} className="flex items-center space-x-2">
                                            <span>•</span>
                                            <span>{account.name}</span>
                                            {account.platform && (
                                                <span className="text-xs text-gray-500">
                                                    ({platforms.find(p => p.id === account.platform)?.name})
                                                </span>
                                            )}
                                        </div>
                                    ))}
                                    {selectedAccounts.length > 5 && (
                                        <div className="text-xs text-gray-500 italic">
                                            还有 {selectedAccounts.length - 5} 个账号...
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end space-x-3">
                            <button
                                onClick={() => setShowDeleteConfirm(false)}
                                disabled={isOperating}
                                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 disabled:opacity-50 transition-colors"
                            >
                                取消
                            </button>
                            <button
                                onClick={handleBatchDelete}
                                disabled={isOperating}
                                className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 disabled:opacity-50 transition-colors"
                            >
                                {isOperating ? '删除中...' : '确认删除'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};