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
    vueServer = spawn('npm', ['run', 'dev'], {
      cwd: path.join(__dirname, '../../../server'),
      shell: true,
      stdio: 'inherit'
    });
  }
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // 开发环境连接到 Vue 开发服务器
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:9527');
    mainWindow.webContents.openDevTools();
  } else {
    // 生产环境加载打包后的文件
    mainWindow.loadFile(path.join(__dirname, '../../server/dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC 通信桥接 - 连接 Vue 前端和 Electron 后端
ipcMain.handle('launch-browser', async (event, browserId) => {
  try {
    const browserWindow = await windowManager.createBrowserInstance(browserId, {
      // 从数据库或配置获取浏览器配置
    });
    return { success: true, windowId: browserWindow.windowId };  // 使用 windowId 而不是 id
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('close-browser', async (event, browserId) => {
  try {
    await windowManager.closeInstance(browserId);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

app.whenReady().then(() => {
  startVueServer();
  // 等待 Vue 服务器启动
  setTimeout(createMainWindow, 3000);
});

app.on('window-all-closed', () => {
  if (vueServer) {
    vueServer.kill();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createMainWindow();
  }
});
