// electron/renderer/components/AccountStats.tsx - 账号统计组件

import React from 'react';

interface AccountStatsProps {
    stats: {
        total: number;
        byPlatform: Record<string, number>;
        byStatus: Record<string, number>;
        byCookieStatus: Record<string, number>;
    };
}

const platformConfigs = {
    douyin: { name: '抖音', icon: '🎵', color: '#000000' },
    wechat: { name: '微信视频号', icon: '💬', color: '#07C160' },
    xiaohongshu: { name: '小红书', icon: '📔', color: '#FF2442' },
    kuaishou: { name: '快手', icon: '⚡', color: '#FF6600' },
    bilibili: { name: 'B站', icon: '📺', color: '#00A1D6' },
    tiktok: { name: 'TikTok', icon: '🎬', color: '#000000' },
    youtube: { name: 'YouTube', icon: '▶️', color: '#FF0000' }
} as const;

const statusConfigs = {
    idle: { name: '空闲', color: '#10B981', bgColor: '#ECFDF5' },
    running: { name: '运行中', color: '#3B82F6', bgColor: '#EFF6FF' },
    logging_in: { name: '登录中', color: '#F59E0B', bgColor: '#FFFBEB' },
    login_failed: { name: '登录失败', color: '#EF4444', bgColor: '#FEF2F2' },
    cookie_expired: { name: 'Cookie过期', color: '#8B5CF6', bgColor: '#F5F3FF' }
} as const;

const cookieStatusConfigs = {
    valid: { name: '有效', color: '#10B981', icon: '✅' },
    invalid: { name: '无效', color: '#EF4444', icon: '❌' },
    expired: { name: '过期', color: '#F59E0B', icon: '⏰' },
    unknown: { name: '未知', color: '#6B7280', icon: '❓' }
} as const;

export const AccountStats: React.FC<AccountStatsProps> = ({ stats }) => {
    // 计算百分比
    const calculatePercentage = (count: number) => {
        return stats.total > 0 ? Math.round((count / stats.total) * 100) : 0;
    };

    // 获取最大值用于进度条
    const maxPlatformCount = Math.max(...Object.values(stats.byPlatform));
    const maxStatusCount = Math.max(...Object.values(stats.byStatus));
    const maxCookieCount = Math.max(...Object.values(stats.byCookieStatus));

    return (
        <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
            <h3 className="text-sm font-medium text-gray-700 mb-4">账号统计</h3>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* 平台分布 */}
                <div>
                    <h4 className="text-xs font-medium text-gray-600 mb-3 uppercase tracking-wide">
                        平台分布
                    </h4>
                    <div className="space-y-2">
                        {Object.entries(stats.byPlatform)
                            .sort(([, a], [, b]) => b - a)
                            .map(([platform, count]) => {
                                const config = platformConfigs[platform as keyof typeof platformConfigs];
                                const percentage = calculatePercentage(count);
                                const barWidth = maxPlatformCount > 0 ? (count / maxPlatformCount) * 100 : 0;

                                return (
                                    <div key={platform} className="flex items-center justify-between">
                                        <div className="flex items-center space-x-2 min-w-0 flex-1">
                                            <span className="text-sm">
                                                {config?.icon || '📱'} {config?.name || platform}
                                            </span>
                                            <div className="flex-1 bg-gray-200 rounded-full h-2 min-w-0">
                                                <div
                                                    className="h-2 rounded-full transition-all duration-300"
                                                    style={{
                                                        width: `${barWidth}%`,
                                                        backgroundColor: config?.color || '#6B7280'
                                                    }}
                                                />
                                            </div>
                                        </div>
                                        <div className="flex items-center space-x-2 text-sm text-gray-600 ml-2">
                                            <span className="font-medium">{count}</span>
                                            <span className="text-xs text-gray-500">({percentage}%)</span>
                                        </div>
                                    </div>
                                );
                            })}
                        {Object.keys(stats.byPlatform).length === 0 && (
                            <div className="text-sm text-gray-500 italic">暂无数据</div>
                        )}
                    </div>
                </div>

                {/* 状态分布 */}
                <div>
                    <h4 className="text-xs font-medium text-gray-600 mb-3 uppercase tracking-wide">
                        状态分布
                    </h4>
                    <div className="space-y-2">
                        {Object.entries(stats.byStatus)
                            .sort(([, a], [, b]) => b - a)
                            .map(([status, count]) => {
                                const config = statusConfigs[status as keyof typeof statusConfigs];
                                const percentage = calculatePercentage(count);
                                const barWidth = maxStatusCount > 0 ? (count / maxStatusCount) * 100 : 0;

                                return (
                                    <div key={status} className="flex items-center justify-between">
                                        <div className="flex items-center space-x-2 min-w-0 flex-1">
                                            <span
                                                className="w-3 h-3 rounded-full flex-shrink-0"
                                                style={{ backgroundColor: config?.color || '#6B7280' }}
                                            />
                                            <span className="text-sm">{config?.name || status}</span>
                                            <div className="flex-1 bg-gray-200 rounded-full h-2 min-w-0">
                                                <div
                                                    className="h-2 rounded-full transition-all duration-300"
                                                    style={{
                                                        width: `${barWidth}%`,
                                                        backgroundColor: config?.color || '#6B7280'
                                                    }}
                                                />
                                            </div>
                                        </div>
                                        <div className="flex items-center space-x-2 text-sm text-gray-600 ml-2">
                                            <span className="font-medium">{count}</span>
                                            <span className="text-xs text-gray-500">({percentage}%)</span>
                                        </div>
                                    </div>
                                );
                            })}
                        {Object.keys(stats.byStatus).length === 0 && (
                            <div className="text-sm text-gray-500 italic">暂无数据</div>
                        )}
                    </div>
                </div>

                {/* Cookie状态分布 */}
                <div>
                    <h4 className="text-xs font-medium text-gray-600 mb-3 uppercase tracking-wide">
                        Cookie状态
                    </h4>
                    <div className="space-y-2">
                        {Object.entries(stats.byCookieStatus)
                            .sort(([, a], [, b]) => b - a)
                            .map(([cookieStatus, count]) => {
                                const config = cookieStatusConfigs[cookieStatus as keyof typeof cookieStatusConfigs];
                                const percentage = calculatePercentage(count);
                                const barWidth = maxCookieCount > 0 ? (count / maxCookieCount) * 100 : 0;

                                return (
                                    <div key={cookieStatus} className="flex items-center justify-between">
                                        <div className="flex items-center space-x-2 min-w-0 flex-1">
                                            <span className="text-sm">
                                                {config?.icon || '❓'} {config?.name || cookieStatus}
                                            </span>
                                            <div className="flex-1 bg-gray-200 rounded-full h-2 min-w-0">
                                                <div
                                                    className="h-2 rounded-full transition-all duration-300"
                                                    style={{
                                                        width: `${barWidth}%`,
                                                        backgroundColor: config?.color || '#6B7280'
                                                    }}
                                                />
                                            </div>
                                        </div>
                                        <div className="flex items-center space-x-2 text-sm text-gray-600 ml-2">
                                            <span className="font-medium">{count}</span>
                                            <span className="text-xs text-gray-500">({percentage}%)</span>
                                        </div>
                                    </div>
                                );
                            })}
                        {Object.keys(stats.byCookieStatus).length === 0 && (
                            <div className="text-sm text-gray-500 italic">暂无数据</div>
                        )}
                    </div>
                </div>
            </div>

            {/* 总计信息 */}
            <div className="mt-4 pt-4 border-t border-gray-200">
                <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">总计账号数量</span>
                    <span className="font-semibold text-gray-900">{stats.total} 个</span>
                </div>

                {/* 健康度指标 */}
                <div className="mt-2 flex items-center justify-between text-sm">
                    <span className="text-gray-600">Cookie健康度</span>
                    <div className="flex items-center space-x-2">
                        {stats.total > 0 ? (
                            <>
                                <div className="w-16 bg-gray-200 rounded-full h-2">
                                    <div
                                        className="h-2 bg-green-500 rounded-full transition-all duration-300"
                                        style={{
                                            width: `${calculatePercentage(stats.byCookieStatus.valid || 0)}%`
                                        }}
                                    />
                                </div>
                                <span className="font-medium text-green-600">
                                    {calculatePercentage(stats.byCookieStatus.valid || 0)}%
                                </span>
                            </>
                        ) : (
                            <span className="text-gray-400">暂无数据</span>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};