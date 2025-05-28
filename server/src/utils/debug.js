// 将这个脚本放在 server/src/utils/debug.js
// 在浏览器控制台中运行来调试

async function debugBrowserLaunch() {
    console.log('=== 开始调试浏览器启动流程 ===');

    // 1. 检查 Electron API 是否可用
    console.log('1. 检查 Electron API:', window.electronAPI ? '✅ 可用' : '❌ 不可用');

    if (!window.electronAPI) {
        console.error('Electron API 未找到！请确保在 Electron 环境中运行');
        return;
    }

    // 2. 获取账号列表
    console.log('2. 获取账号列表...');
    const accountsResult = await window.electronAPI.getAccounts();
    console.log('   账号列表结果:', accountsResult);

    if (!accountsResult.success || !accountsResult.accounts.length) {
        console.log('3. 没有账号，创建测试账号...');
        const testAccount = {
            id: `test_${Date.now()}`,
            name: '测试账号',
            status: 'idle',
            createdAt: Date.now()
        };

        const createResult = await window.electronAPI.createAccount(testAccount);
        console.log('   创建账号结果:', createResult);

        if (!createResult.success) {
            console.error('创建账号失败:', createResult.error);
            return;
        }
    }

    // 4. 再次获取账号列表
    const updatedAccounts = await window.electronAPI.getAccounts();
    console.log('4. 更新后的账号列表:', updatedAccounts);

    if (updatedAccounts.accounts && updatedAccounts.accounts.length > 0) {
        const firstAccount = updatedAccounts.accounts[0];
        console.log('5. 尝试启动第一个账号的浏览器:', firstAccount);

        try {
            const launchResult = await window.electronAPI.launchBrowser(firstAccount.id);
            console.log('   启动结果:', launchResult);

            if (!launchResult.success) {
                console.error('启动失败:', launchResult.error);
            } else {
                console.log('✅ 浏览器启动成功！');
            }
        } catch (error) {
            console.error('启动过程中出错:', error);
        }
    }

    console.log('=== 调试完成 ===');
}

// 导出函数以便在控制台使用
window.debugBrowserLaunch = debugBrowserLaunch;

console.log('调试脚本已加载。在控制台运行 debugBrowserLaunch() 来测试浏览器启动。');