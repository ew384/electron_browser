import { injectCanvasFingerprinting, testCanvasInjection } from './canvas';
import { FingerprintConfig } from '../../shared/types';

export function injectAllFingerprints(config: FingerprintConfig) {
  console.log('[Fingerprint] 🚀 开始指纹注入流程');
  console.log('[Fingerprint] 配置摘要:', {
    canvas: config.canvas.enabled,
    webgl: config.webgl.enabled,
    navigator: config.navigator.enabled,
    screen: config.screen.enabled
  });

  try {
    // Canvas 指纹注入 - 优先级最高
    if (config.canvas.enabled) {
      console.log('[Fingerprint] === Canvas 指纹注入 ===');
      injectCanvasFingerprinting(config.canvas);
      
      // 延迟测试效果
      setTimeout(() => {
        testCanvasInjection();
      }, 300);
    }

    // Navigator 指纹注入
    if (config.navigator.enabled) {
      console.log('[Fingerprint] === Navigator 指纹注入 ===');
      injectNavigatorFingerprinting(config.navigator);
    }

    // WebGL 指纹注入
    if (config.webgl.enabled) {
      console.log('[Fingerprint] === WebGL 指纹注入 ===');
      injectWebGLFingerprinting(config.webgl);
    }

    // Screen 指纹注入
    if (config.screen.enabled) {
      console.log('[Fingerprint] === Screen 指纹注入 ===');
      injectScreenFingerprinting(config.screen);
    }

    console.log('[Fingerprint] ✅ 所有指纹注入完成');

  } catch (error) {
    console.error('[Fingerprint] ❌ 注入过程中出错:', error);
  }
}

function injectNavigatorFingerprinting(config: any) {
  console.log('[Navigator] 🧭 开始 Navigator 注入');

  try {
    // 使用 Object.defineProperty 来确保属性无法被检测
    const defineProperty = (obj: any, prop: string, value: any) => {
      try {
        Object.defineProperty(obj, prop, {
          value: value,
          writable: false,
          enumerable: true,
          configurable: true
        });
      } catch (e) {
        console.warn(`[Navigator] 无法设置 ${prop}:`, e);
      }
    };

    defineProperty(navigator, 'platform', config.platform);
    defineProperty(navigator, 'language', config.language);
    defineProperty(navigator, 'languages', Object.freeze([...config.languages]));
    defineProperty(navigator, 'hardwareConcurrency', config.hardwareConcurrency);
    defineProperty(navigator, 'maxTouchPoints', config.maxTouchPoints);

    if (config.deviceMemory !== undefined) {
      defineProperty(navigator, 'deviceMemory', config.deviceMemory);
    }

    console.log('[Navigator] ✅ Navigator 注入完成');
    console.log('[Navigator] 验证结果:', {
      platform: navigator.platform,
      language: navigator.language,
      hardwareConcurrency: navigator.hardwareConcurrency
    });

  } catch (error) {
    console.error('[Navigator] ❌ Navigator 注入失败:', error);
  }
}

function injectWebGLFingerprinting(config: any) {
  console.log('[WebGL] 🎮 开始 WebGL 注入');

  try {
    // WebGL 1.0 注入
    const originalGetParameter = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function(parameter: GLenum): any {
      switch (parameter) {
        case this.VENDOR:
          console.log('[WebGL] 返回伪装厂商:', config.vendor);
          return config.vendor;
        case this.RENDERER:
          console.log('[WebGL] 返回伪装渲染器:', config.renderer);
          return config.renderer;
        case this.VERSION:
          return 'WebGL 1.0 (OpenGL ES 2.0 Chromium)';
        case this.SHADING_LANGUAGE_VERSION:
          return 'WebGL GLSL ES 1.0 (OpenGL ES GLSL ES 1.0 Chromium)';
        default:
          return originalGetParameter.call(this, parameter);
      }
    };

    // WebGL 2.0 注入
    if (window.WebGL2RenderingContext) {
      const originalGetParameter2 = WebGL2RenderingContext.prototype.getParameter;
      WebGL2RenderingContext.prototype.getParameter = function(parameter: GLenum): any {
        switch (parameter) {
          case this.VENDOR:
            return config.vendor;
          case this.RENDERER:
            return config.renderer;
          case this.VERSION:
            return 'WebGL 2.0 (OpenGL ES 3.0 Chromium)';
          case this.SHADING_LANGUAGE_VERSION:
            return 'WebGL GLSL ES 3.00 (OpenGL ES GLSL ES 3.0 Chromium)';
          default:
            return originalGetParameter2.call(this, parameter);
        }
      };
    }

    console.log('[WebGL] ✅ WebGL 注入完成');

  } catch (error) {
    console.error('[WebGL] ❌ WebGL 注入失败:', error);
  }
}

function injectScreenFingerprinting(config: any) {
  console.log('[Screen] 📺 开始 Screen 注入');

  try {
    const defineProperty = (obj: any, prop: string, value: any) => {
      Object.defineProperty(obj, prop, {
        value: value,
        writable: false,
        enumerable: true,
        configurable: true
      });
    };

    defineProperty(screen, 'width', config.width);
    defineProperty(screen, 'height', config.height);
    defineProperty(screen, 'availWidth', config.width);
    defineProperty(screen, 'availHeight', config.height - 40);
    defineProperty(screen, 'colorDepth', config.colorDepth);
    defineProperty(screen, 'pixelDepth', config.colorDepth);

    Object.defineProperty(window, 'devicePixelRatio', {
      get: () => config.pixelRatio,
      set: () => {},
      enumerable: true,
      configurable: true
    });

    console.log('[Screen] ✅ Screen 注入完成');
    console.log('[Screen] 验证结果:', {
      width: screen.width,
      height: screen.height,
      pixelRatio: window.devicePixelRatio
    });

  } catch (error) {
    console.error('[Screen] ❌ Screen 注入失败:', error);
  }
}

let injected = false;
export function ensureInjected(config: FingerprintConfig) {
  if (!injected) {
    console.log('[Fingerprint] 🔄 执行首次指纹注入');
    injectAllFingerprints(config);
    injected = true;
  } else {
    console.log('[Fingerprint] ⏭️  指纹已注入，跳过重复注入');
  }
}
