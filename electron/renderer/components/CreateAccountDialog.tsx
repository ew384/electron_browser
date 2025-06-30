// electron/renderer/components/CreateAccountDialog.tsx - 创建账号对话框

import React, { useState } from 'react';
import { BrowserAccount, PlatformType, AccountGroup, PlatformConfig } from '../../shared/types';

interface CreateAccountDialogProps {
    platforms: PlatformConfig[];
    groups: AccountGroup[];
    onSubmit: (accountData: Partial<BrowserAccount>) => Promise<boolean>;
    onCancel: () => void;
}

export const CreateAccountDialog: React.FC<CreateAccountDialogProps> = ({
    platforms,
    groups,
    onSubmit,
    onCancel
}) => {
    const [formData, setFormData] = useState<Partial<BrowserAccount>>({
        name: '',
        platform: undefined,
        group: undefined,
        username: '',
        notes: '',
        tags: []
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [newTag, setNewTag] = useState('');

    const validateForm = () => {
        const newErrors: Record<string, string> = {};

        if (!formData.name?.trim()) {
            newErrors.name = '账号名称不能为空';
        }

        if (!formData.platform) {
            newErrors.platform = '请选择平台';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!validateForm()) {
            return;
        }

        setIsSubmitting(true);
        try {
            const success = await onSubmit(formData);
            if (!success) {
                // 错误会通过 store 显示
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleInputChange = (field: keyof BrowserAccount, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }));
        // 清除相关错误
        if (errors[field]) {
            setErrors(prev => ({ ...prev, [field]: '' }));
        }
    };

    const handleAddTag = () => {
        const tag = newTag.trim();
        if (tag && !formData.tags?.includes(tag)) {
            handleInputChange('tags', [...(formData.tags || []), tag]);
            setNewTag('');
        }
    };

    const handleRemoveTag = (tagToRemove: string) => {
        handleInputChange('tags', formData.tags?.filter(tag => tag !== tagToRemove) || []);
    };

    const selectedPlatform = platforms.find(p => p.id === formData.platform);

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
                <div className="p-6">
                    <h2 className="text-xl font-semibold text-gray-900 mb-6">添加新账号</h2>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        {/* 账号名称 */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                账号名称 <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                value={formData.name || ''}
                                onChange={(e) => handleInputChange('name', e.target.value)}
                                placeholder="请输入账号名称"
                                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.name ? 'border-red-500' : 'border-gray-300'
                                    }`}
                            />
                            {errors.name && (
                                <p className="mt-1 text-sm text-red-600">{errors.name}</p>
                            )}
                        </div>

                        {/* 平台选择 */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                平台 <span className="text-red-500">*</span>
                            </label>
                            <select
                                value={formData.platform || ''}
                                onChange={(e) => handleInputChange('platform', e.target.value as PlatformType)}
                                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.platform ? 'border-red-500' : 'border-gray-300'
                                    }`}
                            >
                                <option value="">请选择平台</option>
                                {platforms.map((platform) => (
                                    <option key={platform.id} value={platform.id}>
                                        {platform.icon} {platform.displayName}
                                    </option>
                                ))}
                            </select>
                            {errors.platform && (
                                <p className="mt-1 text-sm text-red-600">{errors.platform}</p>
                            )}
                            {selectedPlatform && (
                                <p className="mt-1 text-sm text-gray-500">
                                    将会登录到: {selectedPlatform.loginUrl}
                                </p>
                            )}
                        </div>

                        {/* 用户名 */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                平台用户名
                            </label>
                            <input
                                type="text"
                                value={formData.username || ''}
                                onChange={(e) => handleInputChange('username', e.target.value)}
                                placeholder="请输入平台用户名（可选）"
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>

                        {/* 分组选择 */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                分组
                            </label>
                            <select
                                value={formData.group || ''}
                                onChange={(e) => handleInputChange('group', e.target.value || undefined)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="">无分组</option>
                                {groups.map((group) => (
                                    <option key={group.id} value={group.id}>
                                        📁 {group.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* 标签 */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                标签
                            </label>
                            <div className="flex items-center space-x-2 mb-2">
                                <input
                                    type="text"
                                    value={newTag}
                                    onChange={(e) => setNewTag(e.target.value)}
                                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                                    placeholder="输入标签按回车添加"
                                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                                <button
                                    type="button"
                                    onClick={handleAddTag}
                                    disabled={!newTag.trim()}
                                    className="px-3 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    添加
                                </button>
                            </div>
                            {formData.tags && formData.tags.length > 0 && (
                                <div className="flex flex-wrap gap-2">
                                    {formData.tags.map((tag, index) => (
                                        <span
                                            key={index}
                                            className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-800"
                                        >
                                            #{tag}
                                            <button
                                                type="button"
                                                onClick={() => handleRemoveTag(tag)}
                                                className="ml-1 text-blue-600 hover:text-blue-800"
                                            >
                                                ×
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* 备注 */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                备注
                            </label>
                            <textarea
                                value={formData.notes || ''}
                                onChange={(e) => handleInputChange('notes', e.target.value)}
                                placeholder="添加备注信息（可选）"
                                rows={3}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>

                        {/* 按钮组 */}
                        <div className="flex justify-end space-x-3 pt-4">
                            <button
                                type="button"
                                onClick={onCancel}
                                disabled={isSubmitting}
                                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 disabled:opacity-50 transition-colors"
                            >
                                取消
                            </button>
                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50 transition-colors"
                            >
                                {isSubmitting ? '创建中...' : '创建账号'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};