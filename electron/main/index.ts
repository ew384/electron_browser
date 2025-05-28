import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import { spawn } from 'child_process';
import { WindowManager } from './window-manager';
import './ipc-handlers';

let mainWindow: BrowserWindow | null = null;
let vueServer: any = null;
const windowManager = new WindowManager();

// 启动 Vue 开发服务器
function startVueServer() {
  if (process.env.NODE_ENV === 'development') {
    console.log('[Main] Starting Vue development server...');
    vueServer = spawn('npm', ['run', 'dev'], {
      cwd: path.join(__dirname, '../../../server'),
      shell: true,
      stdio: 'inherit'
    });

    vueServer.on('error', (error: Error) => {
      console.error('[Main] Vue server error:', error);
    });
  }
}

function createMainWindow() {
  console.log('[Main] Creating main window...');

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true
    },
    show: false // 先不显示，等加载完成再显示
  });

  // 开发环境连接到 Vue 开发服务器
  if (process.env.NODE_ENV === 'development') {
    console.log('[Main] Loading development URL...');
    mainWindow.loadURL('http://localhost:9527').then(() => {
      console.log('[Main] Development URL loaded successfully');
      mainWindow?.show();
      mainWindow?.webContents.openDevTools();
    }).catch((error) => {
      console.error('[Main] Failed to load development URL:', error);
      // 如果开发服务器还没准备好，等待一段时间后重试
      setTimeout(() => {
        mainWindow?.loadURL('http://localhost:9527').then(() => {
          mainWindow?.show();
        }).catch((retryError) => {
          console.error('[Main] Retry failed:', retryError);
        });
      }, 3000);
    });
  } else {
    // 生产环境加载打包后的文件
    const indexPath = path.join(__dirname, '../../server/dist/index.html');
    console.log('[Main] Loading production file:', indexPath);
    mainWindow.loadFile(indexPath).then(() => {
      mainWindow?.show();
    });
  }

  mainWindow.on('closed', () => {
    console.log('[Main] Main window closed');
    mainWindow = null;
  });

  // 监听页面加载完成
  mainWindow.webContents.once('did-finish-load', () => {
    console.log('[Main] Page loaded successfully');
  });

  // 监听页面加载失败
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('[Main] Page failed to load:', errorCode, errorDescription);
  });
}

// 改进的 IPC 处理器，确保正确的错误处理
ipcMain.handle('launch-browser', async (event, browserId) => {
  console.log('[Main] IPC: launch-browser called with:', browserId);
  try {
    const browserWindow = await windowManager.createBrowserInstance(browserId, {});
    console.log('[Main] IPC: Browser instance created successfully');
    return { success: true, windowId: browserWindow.windowId };
  } catch (error) {
    console.error('[Main] IPC: Failed to launch browser:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

ipcMain.handle('close-browser', async (event, browserId) => {
  console.log('[Main] IPC: close-browser called with:', browserId);
  try {
    await windowManager.closeInstance(browserId);
    console.log('[Main] IPC: Browser instance closed successfully');
    return { success: true };
  } catch (error) {
    console.error('[Main] IPC: Failed to close browser:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

// 应用准备就绪
app.whenReady().then(() => {
  console.log('[Main] App is ready');

  if (process.env.NODE_ENV === 'development') {
    startVueServer();
    // 等待 Vue 服务器启动
    setTimeout(createMainWindow, 5000);
  } else {
    createMainWindow();
  }
});

// 所有窗口关闭
app.on('window-all-closed', () => {
  console.log('[Main] All windows closed');

  if (vueServer) {
    console.log('[Main] Killing Vue server');
    vueServer.kill();
  }

  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// macOS 激活应用
app.on('activate', () => {
  console.log('[Main] App activated');
  if (mainWindow === null) {
    createMainWindow();
  }
});

// 处理未捕获的异常
process.on('uncaughtException', (error) => {
  console.error('[Main] Uncaught exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Main] Unhandled rejection at:', promise, 'reason:', reason);
});