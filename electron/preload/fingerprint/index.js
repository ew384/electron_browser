"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.injectAllFingerprints = injectAllFingerprints;
exports.ensureInjected = ensureInjected;
function injectAllFingerprints(config) {
    try {
        console.log('[Fingerprint] Starting fingerprint injection...');
        // Canvas 指纹注入
        if (config.canvas.enabled) {
            injectCanvasFingerprinting(config.canvas);
        }
        // WebGL 指纹注入
        if (config.webgl.enabled) {
            injectWebGLFingerprinting(config.webgl);
        }
        // Navigator 指纹注入
        if (config.navigator.enabled) {
            injectNavigatorFingerprinting(config.navigator);
        }
        // Screen 指纹注入
        if (config.screen.enabled) {
            injectScreenFingerprinting(config.screen);
        }
        console.log('[Fingerprint] All fingerprint injections completed');
    }
    catch (error) {
        console.error('[Fingerprint] Error injecting fingerprints:', error);
    }
}
function injectCanvasFingerprinting(config) {
    const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function (...args) {
        const result = originalToDataURL.apply(this, args);
        return addCanvasNoise(result, config.noise, config.seed || Date.now());
    };
}
function injectWebGLFingerprinting(config) {
    const getParameter = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function (parameter) {
        if (parameter === this.VENDOR)
            return config.vendor;
        if (parameter === this.RENDERER)
            return config.renderer;
        return getParameter.apply(this, arguments);
    };
}
function injectNavigatorFingerprinting(config) {
    Object.defineProperties(navigator, {
        platform: { value: config.platform, writable: false, enumerable: true, configurable: true },
        language: { value: config.language, writable: false, enumerable: true, configurable: true },
        languages: { value: Object.freeze([...config.languages]), writable: false, enumerable: true, configurable: true },
        hardwareConcurrency: { value: config.hardwareConcurrency, writable: false, enumerable: true, configurable: true },
        maxTouchPoints: { value: config.maxTouchPoints, writable: false, enumerable: true, configurable: true }
    });
}
function injectScreenFingerprinting(config) {
    Object.defineProperties(screen, {
        width: { value: config.width, writable: false, enumerable: true, configurable: true },
        height: { value: config.height, writable: false, enumerable: true, configurable: true },
        colorDepth: { value: config.colorDepth, writable: false, enumerable: true, configurable: true }
    });
    Object.defineProperty(window, 'devicePixelRatio', {
        get: () => config.pixelRatio,
        set: () => { },
        enumerable: true,
        configurable: true
    });
}
function addCanvasNoise(dataURL, noiseLevel, seed) {
    try {
        // 简化的噪声添加
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx)
            return dataURL;
        const img = new Image();
        img.onload = () => {
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;
            const rng = createSeededRandom(seed);
            for (let i = 0; i < data.length; i += 4) {
                if (rng() < noiseLevel / 20) {
                    const noise = Math.floor((rng() - 0.5) * 2);
                    data[i] = Math.max(0, Math.min(255, data[i] + noise));
                    data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise));
                    data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise));
                }
            }
            ctx.putImageData(imageData, 0, 0);
        };
        img.src = dataURL;
        return canvas.toDataURL();
    }
    catch (e) {
        return dataURL;
    }
}
function createSeededRandom(seed) {
    let currentSeed = seed;
    return () => {
        currentSeed = (currentSeed * 9301 + 49297) % 233280;
        return currentSeed / 233280;
    };
}
let injected = false;
function ensureInjected(config) {
    if (!injected) {
        injectAllFingerprints(config);
        injected = true;
    }
}
