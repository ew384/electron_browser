// 在你的主进程添加这个调试 IPC 处理器
// electron/main/debug-handlers.ts

import { ipcMain, BrowserWindow } from 'electron';
import { WindowManager } from './window-manager';

// 添加到你的 ipc-handlers.ts 文件中
ipcMain.handle('debug-window-info', async (event) => {
    try {
        const webContents = event.sender;
        const window = BrowserWindow.fromWebContents(webContents);

        if (!window) {
            return {
                success: false,
                error: 'No window found',
                context: 'main-window-likely'
            };
        }

        const allWindows = BrowserWindow.getAllWindows();
        const windowManager = new WindowManager();
        const allInstances = windowManager.getAllInstances();

        // 检查当前窗口是否是浏览器实例
        const currentInstance = allInstances.find(inst => inst.windowId === window.id);

        const debugInfo = {
            success: true,
            currentWindow: {
                id: window.id,
                title: window.getTitle(),
                url: window.webContents.getURL()
            },
            isMainWindow: window.getTitle().includes('防关联浏览器') || window.webContents.getURL().includes('localhost:9527'),
            isBrowserInstance: !!currentInstance,
            browserInstanceInfo: currentInstance ? {
                accountId: currentInstance.accountId,
                status: currentInstance.status
            } : null,
            allWindows: allWindows.map(w => ({
                id: w.id,
                title: w.getTitle(),
                url: w.webContents.getURL()
            })),
            allInstances: allInstances.map(inst => ({
                accountId: inst.accountId,
                windowId: inst.windowId,
                status: inst.status
            }))
        };

        console.log('[Debug] Window info:', debugInfo);
        return debugInfo;
    } catch (error: any) {
        return { success: false, error: error.message };
    }
});

// 获取指纹配置的详细调试信息
ipcMain.handle('debug-fingerprint-detailed', async (event) => {
    try {
        const webContents = event.sender;
        const window = BrowserWindow.fromWebContents(webContents);

        if (!window) {
            return { success: false, error: 'No window context' };
        }

        const windowManager = new WindowManager();
        const allInstances = windowManager.getAllInstances();
        const currentInstance = allInstances.find(inst => inst.windowId === window.id);

        const debugInfo = {
            windowId: window.id,
            windowTitle: window.getTitle(),
            windowUrl: window.webContents.getURL(),
            instanceFound: !!currentInstance,
            accountId: currentInstance?.accountId,
            fingerprintFromWindowManager: null as any,
            fingerprintFromStaticMap: null as any,
            allInstancesCount: allInstances.length,
            allInstances: allInstances.map(inst => ({
                accountId: inst.accountId,
                windowId: inst.windowId,
                hasFingerprintConfig: !!windowManager.getFingerprintConfig(inst.accountId)
            }))
        };

        if (currentInstance) {
            debugInfo.fingerprintFromWindowManager = windowManager.getFingerprintConfig(currentInstance.accountId);
            // 尝试访问静态方法
            try {
                debugInfo.fingerprintFromStaticMap = (WindowManager as any).getFingerprintConfigForWindow(window.id);
            } catch (e) {
                debugInfo.fingerprintFromStaticMap = 'Error accessing static method: ' + e;
            }
        }

        console.log('[Debug] Detailed fingerprint info:', debugInfo);
        return { success: true, info: debugInfo };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
});

// 强制为当前窗口设置指纹配置
ipcMain.handle('debug-force-set-fingerprint', async (event) => {
    try {
        const webContents = event.sender;
        const window = BrowserWindow.fromWebContents(webContents);

        if (!window) {
            return { success: false, error: 'No window context' };
        }

        // 生成一个测试指纹配置
        const { FingerprintGenerator } = await import('./fingerprint/generator');
        const testConfig = FingerprintGenerator.generateFingerprint('debug-test-' + window.id);

        // 强制设置到静态 Map 中
        (WindowManager as any).windowFingerprintMap = (WindowManager as any).windowFingerprintMap || new Map();
        (WindowManager as any).windowFingerprintMap.set(window.id, testConfig);

        console.log('[Debug] Force set fingerprint for window', window.id);

        // 通知 preload 脚本重新注入
        webContents.send('fingerprint-config-updated', testConfig);

        return {
            success: true,
            windowId: window.id,
            configSet: true,
            platform: testConfig.navigator.platform,
            language: testConfig.navigator.language
        };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
});