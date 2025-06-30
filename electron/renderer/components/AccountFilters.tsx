// electron/renderer/components/AccountFilters.tsx - 账号筛选器组件

import React from 'react';
import { PlatformConfig, AccountGroup, PlatformType, AccountStatus, CookieStatus } from '../../shared/types';

interface AccountFiltersProps {
    filters: {
        platform?: PlatformType;
        status?: AccountStatus;
        cookieStatus?: CookieStatus;
        group?: string;
    };
    platforms: PlatformConfig[];
    groups: AccountGroup[];
    onFiltersChange: (filters: any) => void;
    onClearFilters: () => void;
}

const statusOptions = [
    { value: 'idle', label: '空闲', color: '#10B981' },
    { value: 'running', label: '运行中', color: '#3B82F6' },
    { value: 'logging_in', label: '登录中', color: '#F59E0B' },
    { value: 'login_failed', label: '登录失败', color: '#EF4444' },
    { value: 'cookie_expired', label: 'Cookie过期', color: '#8B5CF6' }
];

const cookieStatusOptions = [
    { value: 'valid', label: '有效', icon: '✅' },
    { value: 'invalid', label: '无效', icon: '❌' },
    { value: 'expired', label: '过期', icon: '⏰' },
    { value: 'unknown', label: '未知', icon: '❓' }
];

export const AccountFilters: React.FC<AccountFiltersProps> = ({
    filters,
    platforms,
    groups,
    onFiltersChange,
    onClearFilters
}) => {
    const hasActiveFilters = Object.values(filters).some(value => value !== undefined && value !== '');

    const handleFilterChange = (key: string, value: string) => {
        onFiltersChange({
            ...filters,
            [key]: value || undefined
        });
    };

    return (
        <div className="bg-gray-50 rounded-lg p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-gray-700">筛选条件</h3>
                {hasActiveFilters && (
                    <button
                        onClick={onClearFilters}
                        className="text-sm text-blue-600 hover:text-blue-800 underline"
                    >
                        清除筛选
                    </button>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {/* 平台筛选 */}
                <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                        平台
                    </label>
                    <select
                        value={filters.platform || ''}
                        onChange={(e) => handleFilterChange('platform', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                        <option value="">全部平台</option>
                        {platforms.map((platform) => (
                            <option key={platform.id} value={platform.id}>
                                {platform.icon} {platform.displayName}
                            </option>
                        ))}
                    </select>
                </div>

                {/* 状态筛选 */}
                <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                        账号状态
                    </label>
                    <select
                        value={filters.status || ''}
                        onChange={(e) => handleFilterChange('status', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                        <option value="">全部状态</option>
                        {statusOptions.map((status) => (
                            <option key={status.value} value={status.value}>
                                {status.label}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Cookie状态筛选 */}
                <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                        Cookie状态
                    </label>
                    <select
                        value={filters.cookieStatus || ''}
                        onChange={(e) => handleFilterChange('cookieStatus', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                        <option value="">全部Cookie状态</option>
                        {cookieStatusOptions.map((status) => (
                            <option key={status.value} value={status.value}>
                                {status.icon} {status.label}
                            </option>
                        ))}
                    </select>
                </div>

                {/* 分组筛选 */}
                <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                        分组
                    </label>
                    <select
                        value={filters.group || ''}
                        onChange={(e) => handleFilterChange('group', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                        <option value="">全部分组</option>
                        <option value="__no_group__">无分组</option>
                        {groups.map((group) => (
                            <option key={group.id} value={group.id}>
                                📁 {group.name}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {/* 活跃筛选器显示 */}
            {hasActiveFilters && (
                <div className="mt-3 pt-3 border-t border-gray-200">
                    <div className="flex items-center space-x-2 text-sm">
                        <span className="text-gray-600">当前筛选:</span>
                        {filters.platform && (
                            <span className="inline-flex items-center px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs">
                                平台: {platforms.find(p => p.id === filters.platform)?.displayName}
                                <button
                                    onClick={() => handleFilterChange('platform', '')}
                                    className="ml-1 text-blue-600 hover:text-blue-800"
                                >
                                    ×
                                </button>
                            </span>
                        )}
                        {filters.status && (
                            <span className="inline-flex items-center px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs">
                                状态: {statusOptions.find(s => s.value === filters.status)?.label}
                                <button
                                    onClick={() => handleFilterChange('status', '')}
                                    className="ml-1 text-green-600 hover:text-green-800"
                                >
                                    ×
                                </button>
                            </span>
                        )}
                        {filters.cookieStatus && (
                            <span className="inline-flex items-center px-2 py-1 bg-purple-100 text-purple-800 rounded-full text-xs">
                                Cookie: {cookieStatusOptions.find(s => s.value === filters.cookieStatus)?.label}
                                <button
                                    onClick={() => handleFilterChange('cookieStatus', '')}
                                    className="ml-1 text-purple-600 hover:text-purple-800"
                                >
                                    ×
                                </button>
                            </span>
                        )}
                        {filters.group && (
                            <span className="inline-flex items-center px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs">
                                分组: {filters.group === '__no_group__' ? '无分组' : groups.find(g => g.id === filters.group)?.name}
                                <button
                                    onClick={() => handleFilterChange('group', '')}
                                    className="ml-1 text-yellow-600 hover:text-yellow-800"
                                >
                                    ×
                                </button>
                            </span>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};