import { contextBridge, ipcRenderer } from 'electron';

console.log('[Preload] 🚀 Auto-injection preload starting...');

// 声明全局类型
declare global {
  interface Window {
    __FINGERPRINT_CONFIG__?: any;
    __ACCOUNT_ID__?: string;
  }
}

// 自动应用指纹注入的函数
function autoApplyFingerprint() {
  let attempts = 0;
  const maxAttempts = 50;

  const tryApply = () => {
    attempts++;
    console.log(`[Preload] Auto-apply attempt ${attempts}...`);

    const config = window.__FINGERPRINT_CONFIG__;
    const accountId = window.__ACCOUNT_ID__;

    if (config && accountId) {
      console.log('[Preload] ✅ Config found! Auto-applying fingerprint...');
      console.log(`[Preload] Account: ${accountId}, Platform: ${config.navigator.platform}`);

      // 应用手动注入的相同逻辑
      applyFingerprintInjection(config, accountId);

    } else if (attempts < maxAttempts) {
      console.log('[Preload] Config not ready, retrying in 100ms...');
      setTimeout(tryApply, 100);
    } else {
      console.log('[Preload] ⚠️ Timeout waiting for config, using emergency injection');
      applyEmergencyInjection();
    }
  };

  tryApply();
}

// 应用指纹注入的核心函数
function applyFingerprintInjection(config: any, accountId: string) {
  console.log(`[Preload] 🎯 Auto-applying fingerprint for: ${accountId}`);

  try {
    // Navigator 注入
    if (config.navigator?.enabled) {
      console.log('[Preload-Nav] 🧭 Overriding Navigator properties...');

      Object.defineProperty(navigator, 'platform', {
        get: function () {
          console.log('[Nav] 🎯 platform accessed, returning:', config.navigator.platform);
          return config.navigator.platform;
        },
        configurable: true,
        enumerable: true
      });

      Object.defineProperty(navigator, 'language', {
        get: function () {
          console.log('[Nav] 🎯 language accessed, returning:', config.navigator.language);
          return config.navigator.language;
        },
        configurable: true,
        enumerable: true
      });

      Object.defineProperty(navigator, 'hardwareConcurrency', {
        get: function () {
          console.log('[Nav] 🎯 hardwareConcurrency accessed, returning:', config.navigator.hardwareConcurrency);
          return config.navigator.hardwareConcurrency;
        },
        configurable: true,
        enumerable: true
      });

      Object.defineProperty(navigator, 'languages', {
        get: function () {
          console.log('[Nav] 🎯 languages accessed, returning:', config.navigator.languages);
          return config.navigator.languages;
        },
        configurable: true,
        enumerable: true
      });

      if (config.navigator.deviceMemory) {
        Object.defineProperty(navigator, 'deviceMemory', {
          get: function () {
            console.log('[Nav] 🎯 deviceMemory accessed, returning:', config.navigator.deviceMemory);
            return config.navigator.deviceMemory;
          },
          configurable: true,
          enumerable: true
        });
      }

      console.log('[Preload-Nav] ✅ Navigator properties overridden');
    }

    // Screen 注入
    if (config.screen?.enabled) {
      console.log('[Preload-Screen] 📺 Overriding Screen properties...');

      Object.defineProperty(screen, 'width', {
        get: function () {
          console.log('[Screen] 🎯 width accessed, returning:', config.screen.width);
          return config.screen.width;
        },
        configurable: true,
        enumerable: true
      });

      Object.defineProperty(screen, 'height', {
        get: function () {
          console.log('[Screen] 🎯 height accessed, returning:', config.screen.height);
          return config.screen.height;
        },
        configurable: true,
        enumerable: true
      });

      Object.defineProperty(screen, 'availWidth', {
        get: function () {
          return config.screen.width;
        },
        configurable: true,
        enumerable: true
      });

      Object.defineProperty(screen, 'availHeight', {
        get: function () {
          return config.screen.height - 40;
        },
        configurable: true,
        enumerable: true
      });

      Object.defineProperty(window, 'devicePixelRatio', {
        get: function () {
          console.log('[Screen] 🎯 devicePixelRatio accessed, returning:', config.screen.pixelRatio);
          return config.screen.pixelRatio;
        },
        configurable: true,
        enumerable: true
      });

      console.log('[Preload-Screen] ✅ Screen properties overridden');
    }

    // Canvas 注入
    if (config.canvas?.enabled) {
      console.log('[Preload-Canvas] 🎨 Overriding Canvas methods...');

      const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;

      HTMLCanvasElement.prototype.toDataURL = function (type?: string, quality?: any): string {
        console.log('[Canvas] 🎯 toDataURL intercepted for:', accountId);

        const original = originalToDataURL.call(this, type, quality);
        const seed = config.canvas.seed;
        const noise = seed.toString(36) + Math.random().toString(36).slice(2);

        const result = original + '?seed=' + noise + '&acc=' + accountId.substring(0, 8);

        console.log('[Canvas] ✅ Fingerprint applied, length:', result.length);
        return result;
      };

      // 同时处理 toBlob
      const originalToBlob = HTMLCanvasElement.prototype.toBlob;
      HTMLCanvasElement.prototype.toBlob = function (callback: BlobCallback, type?: string, quality?: any): void {
        console.log('[Canvas] 🎯 toBlob intercepted for:', accountId);

        // 使用修改后的 toDataURL
        const dataURL = this.toDataURL(type, quality);

        // 转换为 Blob
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
      };

      console.log('[Preload-Canvas] ✅ Canvas methods overridden');
    }

    // WebGL 注入
    if (config.webgl?.enabled) {
      console.log('[Preload-WebGL] 🎮 Overriding WebGL...');

      if (window.WebGLRenderingContext) {
        const originalGetParameter = WebGLRenderingContext.prototype.getParameter;
        WebGLRenderingContext.prototype.getParameter = function (parameter: GLenum): any {
          switch (parameter) {
            case this.VENDOR:
              console.log('[WebGL] 🎯 VENDOR accessed, returning:', config.webgl.vendor);
              return config.webgl.vendor;
            case this.RENDERER:
              console.log('[WebGL] 🎯 RENDERER accessed, returning:', config.webgl.renderer);
              return config.webgl.renderer;
            default:
              return originalGetParameter.call(this, parameter);
          }
        };
      }

      if (window.WebGL2RenderingContext) {
        const originalGetParameter2 = WebGL2RenderingContext.prototype.getParameter;
        WebGL2RenderingContext.prototype.getParameter = function (parameter: GLenum): any {
          switch (parameter) {
            case this.VENDOR:
              return config.webgl.vendor;
            case this.RENDERER:
              return config.webgl.renderer;
            default:
              return originalGetParameter2.call(this, parameter);
          }
        };
      }

      console.log('[Preload-WebGL] ✅ WebGL overridden');
    }

    console.log(`[Preload] ✅ Auto-injection completed for: ${accountId}`);

    // 立即验证
    setTimeout(() => {
      console.log(`[Preload] 🧪 Auto-verification for ${accountId}:`);
      console.log('[Verify] Platform:', navigator.platform);
      console.log('[Verify] Language:', navigator.language);
      console.log('[Verify] Screen:', screen.width + 'x' + screen.height);
    }, 100);

  } catch (error) {
    console.error(`[Preload] ❌ Auto-injection failed for ${accountId}:`, error);
  }
}

// 紧急注入（如果配置未找到）
function applyEmergencyInjection() {
  console.log('[Preload] 🚨 Applying emergency injection...');

  const emergencyConfig = {
    navigator: {
      enabled: true,
      platform: 'Win32',
      language: 'en-US',
      languages: ['en-US', 'en'],
      hardwareConcurrency: 8,
      deviceMemory: 8
    },
    screen: {
      enabled: true,
      width: 1920,
      height: 1080,
      pixelRatio: 1
    },
    canvas: {
      enabled: true,
      seed: Date.now()
    }
  };

  applyFingerprintInjection(emergencyConfig, 'emergency-' + Date.now());
}

// 立即开始自动注入
console.log('[Preload] Starting auto-injection process...');
autoApplyFingerprint();

// ElectronAPI
const electronAPI = {
  // 基本账号管理
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

  // 调试和测试方法
  getWindowConfig: () => {
    return {
      fingerprintConfig: window.__FINGERPRINT_CONFIG__,
      accountId: window.__ACCOUNT_ID__,
      hasConfig: !!window.__FINGERPRINT_CONFIG__,
      configKeys: window.__FINGERPRINT_CONFIG__ ? Object.keys(window.__FINGERPRINT_CONFIG__) : []
    };
  },

  testFingerprints: () => {
    const accountId = window.__ACCOUNT_ID__ || 'unknown';
    console.log(`[Test] === AUTO-INJECTED FINGERPRINT TEST FOR ${accountId} ===`);

    console.log('[Test] Navigator platform:', navigator.platform);
    console.log('[Test] Navigator language:', navigator.language);
    console.log('[Test] Navigator cores:', navigator.hardwareConcurrency);
    console.log('[Test] Screen size:', screen.width + 'x' + screen.height);
    console.log('[Test] Device pixel ratio:', window.devicePixelRatio);

    // Canvas 测试
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 50;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.textBaseline = 'top';
      ctx.font = '14px Arial';
      ctx.fillStyle = '#f60';
      ctx.fillRect(125, 1, 62, 20);
      ctx.fillStyle = '#069';
      ctx.fillText('BrowserLeaks Test', 2, 15);

      const result1 = canvas.toDataURL();
      const result2 = canvas.toDataURL();

      console.log('[Test] Canvas result 1 length:', result1.length);
      console.log('[Test] Canvas result 2 length:', result2.length);
      console.log('[Test] Canvas different:', result1 !== result2);
    }

    return {
      accountId,
      platform: navigator.platform,
      language: navigator.language,
      cores: navigator.hardwareConcurrency,
      screenSize: screen.width + 'x' + screen.height
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

console.log('[Preload] 🎉 Auto-injection preload script loaded!');