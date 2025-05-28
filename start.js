#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('🚀 启动防关联浏览器应用...');

// 检查必要的目录和文件
function checkEnvironment() {
    const requiredDirs = [
        'dist/electron',
        'server/dist',
        'data'
    ];

    const requiredFiles = [
        'dist/electron/main/index.js',
        'dist/electron/preload/index.js'
    ];

    console.log('📋 检查环境...');

    for (const dir of requiredDirs) {
        if (!fs.existsSync(dir)) {
            console.log(`📁 创建目录: ${dir}`);
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    let missingFiles = [];
    for (const file of requiredFiles) {
        if (!fs.existsSync(file)) {
            missingFiles.push(file);
        }
    }

    if (missingFiles.length > 0) {
        console.log('❌ 缺少必要文件，需要先构建:');
        missingFiles.forEach(file => console.log(`   - ${file}`));
        return false;
    }

    console.log('✅ 环境检查通过');
    return true;
}

// 构建 Electron 应用
function buildElectron() {
    return new Promise((resolve, reject) => {
        console.log('🔨 构建 Electron 应用...');

        const build = spawn('npm', ['run', 'build:electron'], {
            stdio: 'inherit',
            shell: true
        });

        build.on('close', (code) => {
            if (code === 0) {
                console.log('✅ Electron 构建完成');
                resolve();
            } else {
                console.error('❌ Electron 构建失败');
                reject(new Error(`Build failed with code ${code}`));
            }
        });

        build.on('error', (error) => {
            console.error('❌ 构建过程出错:', error);
            reject(error);
        });
    });
}

// 启动应用
function startApp() {
    console.log('🎯 启动应用...');

    const electron = spawn('npm', ['run', 'electron:dev'], {
        stdio: 'inherit',
        shell: true,
        env: {
            ...process.env,
            NODE_ENV: 'development'
        }
    });

    electron.on('close', (code) => {
        console.log(`应用退出，代码: ${code}`);
        process.exit(code);
    });

    electron.on('error', (error) => {
        console.error('启动失败:', error);
        process.exit(1);
    });

    // 处理退出信号
    process.on('SIGINT', () => {
        console.log('\n🛑 收到退出信号，正在关闭应用...');
        electron.kill('SIGTERM');
    });

    process.on('SIGTERM', () => {
        console.log('\n🛑 收到终止信号，正在关闭应用...');
        electron.kill('SIGTERM');
    });
}

// 主函数
async function main() {
    try {
        // 检查环境
        if (!checkEnvironment()) {
            console.log('🔨 开始构建...');
            await buildElectron();
        }

        // 启动应用
        startApp();

    } catch (error) {
        console.error('❌ 启动失败:', error);
        process.exit(1);
    }
}

// 运行
main();