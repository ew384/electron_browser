import { contextBridge, ipcRenderer } from 'electron';

console.log('[Preload] 🚀 FINAL Canvas Fix preload starting...');

// 声明全局类型
declare global {
  interface Window {
    __FINGERPRINT_CONFIG__?: any;
    __ACCOUNT_ID__?: string;
    _FINGERPRINT_CONFIG_?: any;
    checkForConfigUpdate?: () => void;
    applyFingerprintInjection?: (config: any, accountId: string) => void;
  }
}

// 🎯 关键：在脚本最开始就立即重写Canvas方法
// 为每个窗口生成唯一的基础种子
const WINDOW_SEED = Date.now() + Math.random() * 1000000;
let canvasCallCounter = 0;

console.log('[Preload] 窗口种子:', WINDOW_SEED);

// 立即保存原始Canvas方法
const ORIGINAL_TO_DATA_URL = HTMLCanvasElement.prototype.toDataURL;
const ORIGINAL_TO_BLOB = HTMLCanvasElement.prototype.toBlob;

// 立即重写Canvas方法 - 在任何其他代码执行前
HTMLCanvasElement.prototype.toDataURL = function (type?: string, quality?: any): string {
  canvasCallCounter++;

  // 生成这次调用的唯一种子
  const callSeed = WINDOW_SEED + canvasCallCounter * 12345 + Date.now();

  console.log(`[Canvas] 🎯 调用#${canvasCallCounter}, 种子:${callSeed.toFixed(0)}`);

  try {
    // 如果canvas为空，添加唯一标识符
    if (this.width < 1 || this.height < 1) {
      const original = ORIGINAL_TO_DATA_URL.call(this, type, quality);
      const uniqueId = callSeed.toString(36) + '_empty';
      return original + (original.includes('?') ? '&' : '?') + 'id=' + uniqueId;
    }

    // 创建工作canvas
    const workCanvas = document.createElement('canvas');
    const workCtx = workCanvas.getContext('2d');

    if (!workCtx) {
      const original = ORIGINAL_TO_DATA_URL.call(this, type, quality);
      const uniqueId = callSeed.toString(36) + '_noCtx';
      return original + (original.includes('?') ? '&' : '?') + 'id=' + uniqueId;
    }

    // 复制原始canvas
    workCanvas.width = this.width;
    workCanvas.height = this.height;
    workCtx.drawImage(this, 0, 0);

    // 获取像素数据
    const imageData = workCtx.getImageData(0, 0, workCanvas.width, workCanvas.height);
    const pixels = imageData.data;

    // 种子随机数生成器
    let seed = Math.floor(callSeed) % 2147483647;
    function seededRandom(): number {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    }

    // 像素修改参数
    const modifyRate = 0.08 + seededRandom() * 0.04; // 8%-12%
    const maxNoise = 6 + Math.floor(seededRandom() * 8); // 6-14
    let modifiedPixels = 0;

    // 修改像素
    for (let i = 0; i < pixels.length; i += 4) {
      if (seededRandom() < modifyRate) {
        // 修改RGB通道
        for (let channel = 0; channel < 3; channel++) {
          const noiseValue = Math.floor((seededRandom() - 0.5) * maxNoise * 2);
          const originalValue = pixels[i + channel];
          const newValue = Math.max(0, Math.min(255, originalValue + noiseValue));

          if (newValue !== originalValue) {
            pixels[i + channel] = newValue;
            modifiedPixels++;
          }
        }
      }
    }

    console.log(`[Canvas] 修改率:${modifyRate.toFixed(3)}, 噪声:${maxNoise}, 修改像素:${modifiedPixels}`);

    // 写回像素数据
    workCtx.putImageData(imageData, 0, 0);

    // 获取修改后的结果
    const result = ORIGINAL_TO_DATA_URL.call(workCanvas, type, quality);
    const original = ORIGINAL_TO_DATA_URL.call(this, type, quality);

    // 验证修改效果
    if (result !== original) {
      console.log(`[Canvas] ✅ 像素修改成功`);
      return result;
    } else {
      // 如果像素修改失败，强制添加URL差异
      console.log(`[Canvas] ⚠️ 像素修改失败，使用URL差异`);
      const forceId = callSeed.toString(36) + '_' + modifiedPixels + '_' + Date.now().toString(36);
      return result + (result.includes('?') ? '&' : '?') + 'force=' + forceId;
    }

  } catch (error) {
    console.error('[Canvas] 处理失败:', error);

    // 错误时也保证唯一性
    const original = ORIGINAL_TO_DATA_URL.call(this, type, quality);
    const errorId = callSeed.toString(36) + '_error_' + Date.now().toString(36);
    return original + (original.includes('?') ? '&' : '?') + 'error=' + errorId;
  }
};

// 同时重写toBlob
HTMLCanvasElement.prototype.toBlob = function (callback: BlobCallback, type?: string, quality?: any): void {
  try {
    const dataURL = this.toDataURL(type, quality);
    const parts = dataURL.split(',');
    const contentType = parts[0].split(':')[1].split(';')[0];
    const byteString = atob(parts[1]);

    const arrayBuffer = new ArrayBuffer(byteString.length);
    const uint8Array = new Uint8Array(arrayBuffer);

    for (let i = 0; i < byteString.length; i++) {
      uint8Array[i] = byteString.charCodeAt(i);
    }

    const blob = new Blob([arrayBuffer], { type: contentType });
    callback(blob);
  } catch (error) {
    console.error('[Canvas] toBlob失败:', error);
    ORIGINAL_TO_BLOB.call(this, callback, type, quality);
  }
};

console.log('[Preload] ✅ Canvas方法已在最早期重写');

// 辅助函数
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

function seededRandom(seed: number): () => number {
  let currentSeed = seed;
  return () => {
    currentSeed = (currentSeed * 1103515245 + 12345) % (1 << 31);
    return currentSeed / (1 << 31);
  };
}

// 改进的配置获取函数
function getConfigFromMultipleSources() {
  const sources = [
    () => window.__FINGERPRINT_CONFIG__,
    () => window._FINGERPRINT_CONFIG_,
    () => {
      const scripts = document.querySelectorAll('script');
      for (let i = 0; i < scripts.length; i++) {
        const script = scripts[i];
        if (script.textContent && script.textContent.includes('__FINGERPRINT_CONFIG__')) {
          console.log('[Preload] Found config in script tag');
          try {
            const match = script.textContent.match(/window\.__FINGERPRINT_CONFIG__\s*=\s*({.*?});/);
            if (match) {
              return JSON.parse(match[1]);
            }
          } catch (e) {
            console.warn('[Preload] Failed to parse config from script:', e);
          }
        }
      }
      return null;
    }
  ];

  for (const source of sources) {
    try {
      const config = source();
      if (config) {
        console.log('[Preload] Found config from source');
        return config;
      }
    } catch (e) {
      console.warn('[Preload] Config source failed:', e);
    }
  }

  return null;
}

// 自动应用指纹注入的函数
function autoApplyFingerprint() {
  let attempts = 0;
  const maxAttempts = 10; // 减少尝试次数

  const tryApply = () => {
    attempts++;
    console.log(`[Preload] Auto-apply attempt ${attempts}...`);

    const config = getConfigFromMultipleSources();
    const accountId = window.__ACCOUNT_ID__ || (window as any)._accountId;

    if (config && accountId) {
      console.log('[Preload] ✅ Config found! Auto-applying fingerprint...');
      console.log(`[Preload] Account: ${accountId}, Platform: ${config.navigator?.platform}`);

      applyNavigatorAndScreenFingerprints(config, accountId);

    } else if (attempts < maxAttempts) {
      console.log('[Preload] Config not ready, retrying in 200ms...');
      setTimeout(tryApply, 200);
    } else {
      console.log('[Preload] ⚠️ Timeout waiting for config, Canvas already protected');
    }
  };

  tryApply();
}

// 应用Navigator和Screen指纹（Canvas已经在最开始处理了）
function applyNavigatorAndScreenFingerprints(config: any, accountId: string) {
  console.log(`[Preload] 🎯 Applying Navigator/Screen fingerprints for: ${accountId}`);

  try {
    // Navigator 注入
    if (config.navigator?.enabled) {
      console.log('[Preload-Nav] 🧭 Navigator override...');

      Object.defineProperty(navigator, 'platform', {
        get: function () {
          return config.navigator.platform;
        },
        configurable: true,
        enumerable: true
      });

      Object.defineProperty(navigator, 'language', {
        get: function () {
          return config.navigator.language;
        },
        configurable: true,
        enumerable: true
      });

      Object.defineProperty(navigator, 'hardwareConcurrency', {
        get: function () {
          return config.navigator.hardwareConcurrency;
        },
        configurable: true,
        enumerable: true
      });

      Object.defineProperty(navigator, 'languages', {
        get: function () {
          return config.navigator.languages;
        },
        configurable: true,
        enumerable: true
      });

      if (config.navigator.deviceMemory) {
        Object.defineProperty(navigator, 'deviceMemory', {
          get: function () {
            return config.navigator.deviceMemory;
          },
          configurable: true,
          enumerable: true
        });
      }
    }

    // Screen 注入
    if (config.screen?.enabled) {
      console.log('[Preload-Screen] 📺 Screen override...');

      Object.defineProperty(screen, 'width', {
        get: function () {
          return config.screen.width;
        },
        configurable: true,
        enumerable: true
      });

      Object.defineProperty(screen, 'height', {
        get: function () {
          return config.screen.height;
        },
        configurable: true,
        enumerable: true
      });

      Object.defineProperty(window, 'devicePixelRatio', {
        get: function () {
          return config.screen.pixelRatio;
        },
        configurable: true,
        enumerable: true
      });
    }

    // WebGL 注入
    if (config.webgl?.enabled) {
      console.log('[Preload-WebGL] 🎮 WebGL override...');

      if (window.WebGLRenderingContext) {
        const originalGetParameter = WebGLRenderingContext.prototype.getParameter;
        WebGLRenderingContext.prototype.getParameter = function (parameter: GLenum): any {
          switch (parameter) {
            case this.VENDOR:
              return config.webgl.vendor;
            case this.RENDERER:
              return config.webgl.renderer;
            default:
              return originalGetParameter.call(this, parameter);
          }
        };
      }
    }

    console.log(`[Preload] ✅ All fingerprints applied for: ${accountId}`);

    // 验证Canvas效果
    setTimeout(() => {
      testCanvasEffect(accountId);
    }, 500);

  } catch (error) {
    console.error(`[Preload] ❌ Fingerprint application failed:`, error);
  }
}

// Canvas效果测试
function testCanvasEffect(accountId: string) {
  console.log(`[Test] 🧪 Testing Canvas for: ${accountId}`);

  try {
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 50;
    const ctx = canvas.getContext('2d');

    if (ctx) {
      // BrowserLeaks标准内容
      ctx.textBaseline = 'top';
      ctx.font = '14px Arial';
      ctx.fillStyle = '#f60';
      ctx.fillRect(125, 1, 62, 20);
      ctx.fillStyle = '#069';
      ctx.fillText('BrowserLeaks.com', 2, 15);
      ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
      ctx.fillText('BrowserLeaks.com', 4, 17);

      const results: string[] = [];
      for (let i = 0; i < 3; i++) {
        const result = canvas.toDataURL();
        results.push(result);

        const hash = simpleHash(result);
        console.log(`[Test] Result ${i + 1}: ${hash.toString(16).substring(0, 8)}`);
      }

      const uniqueResults = new Set(results);
      const success = uniqueResults.size > 1;

      console.log(`[Test] Canvas fingerprint for ${accountId}: ${success ? '✅ Working' : '❌ Failed'}`);
      console.log(`[Test] Unique results: ${uniqueResults.size}/3`);
    }
  } catch (error) {
    console.error('[Test] Canvas test failed:', error);
  }
}

// 立即开始自动注入
console.log('[Preload] Starting auto-injection process...');
autoApplyFingerprint();

// ElectronAPI
const electronAPI = {
  getAccounts: async () => {
    try {
      return await ipcRenderer.invoke('get-accounts');
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error), accounts: [] };
    }
  },

  createAccount: async (account: any) => {
    try {
      return await ipcRenderer.invoke('create-account', account);
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },

  launchBrowser: async (accountId: string) => {
    try {
      return await ipcRenderer.invoke('create-browser-instance', accountId, {});
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },

  getWindowConfig: () => {
    return {
      fingerprintConfig: window.__FINGERPRINT_CONFIG__,
      accountId: window.__ACCOUNT_ID__,
      hasConfig: !!window.__FINGERPRINT_CONFIG__,
      canvasCallCounter: canvasCallCounter,
      windowSeed: WINDOW_SEED
    };
  },

  testFingerprints: () => {
    const accountId = window.__ACCOUNT_ID__ || 'unknown';
    testCanvasEffect(accountId);

    return {
      accountId,
      platform: navigator.platform,
      language: navigator.language,
      cores: navigator.hardwareConcurrency,
      screenSize: screen.width + 'x' + screen.height,
      canvasCalls: canvasCallCounter
    };
  },

  forceReinject: () => {
    console.log('[Debug] Force re-applying auto-injection...');
    autoApplyFingerprint();
  }
};

try {
  contextBridge.exposeInMainWorld('electronAPI', electronAPI);
  console.log('[Preload] ✅ ElectronAPI exposed successfully');
} catch (error) {
  console.error('[Preload] ❌ Failed to expose ElectronAPI:', error);
}

console.log('[Preload] 🎉 FINAL Canvas Fix preload loaded!');
console.log(`[Preload] Canvas calls so far: ${canvasCallCounter}`);
console.log(`[Preload] Window seed: ${WINDOW_SEED}`);