import { FingerprintConfig, FingerprintQuality } from '../../shared/types';

export class FingerprintValidator {
  static validateFingerprint(config: FingerprintConfig): FingerprintQuality {
    const issues: string[] = [];
    let score = 100;

    // 检查Canvas配置
    if (config.canvas.enabled) {
      if (config.canvas.noise < 0.05 || config.canvas.noise > 0.5) {
        issues.push('Canvas noise level may be detectable');
        score -= 10;
      }
    }

    // 检查WebGL配置
    if (config.webgl.enabled) {
      if (!this.isValidGPU(config.webgl.vendor, config.webgl.renderer)) {
        issues.push('Invalid GPU vendor/renderer combination');
        score -= 20;
      }
    }

    // 检查Navigator配置一致性
    if (config.navigator.enabled) {
      if (!this.isConsistentPlatform(config.navigator.platform, config.navigator.maxTouchPoints)) {
        issues.push('Platform and touch points inconsistent');
        score -= 15;
      }
    }

    // 检查屏幕分辨率合理性
    if (config.screen.enabled) {
      if (!this.isCommonResolution(config.screen.width, config.screen.height)) {
        issues.push('Uncommon screen resolution may stand out');
        score -= 5;
      }
    }

    return {
      score: Math.max(0, score),
      issues,
      consistency: issues.length === 0,
      entropy: this.calculateEntropy(config)
    };
  }

  private static isValidGPU(vendor: string, renderer: string): boolean {
    const validCombinations = [
      { vendor: /NVIDIA/i, renderer: /GeForce|Quadro|Tesla/i },
      { vendor: /AMD/i, renderer: /Radeon|FirePro/i },
      { vendor: /Intel/i, renderer: /Intel.*Graphics/i },
      { vendor: /Google Inc\./i, renderer: /ANGLE/i }
    ];

    return validCombinations.some(combo => 
      combo.vendor.test(vendor) && combo.renderer.test(renderer)
    );
  }

  private static isConsistentPlatform(platform: string, maxTouchPoints: number): boolean {
    if (platform === 'Win32' && maxTouchPoints >= 0) return true;
    if (platform.includes('Mac') && maxTouchPoints >= 0) return true;
    if (platform.includes('Linux') && maxTouchPoints >= 0) return true;
    return true; // 简化检查
  }

  private static isCommonResolution(width: number, height: number): boolean {
    const commonResolutions = [
      [1920, 1080], [1366, 768], [1536, 864], [1440, 900],
      [1280, 720], [2560, 1440], [1600, 900], [1024, 768]
    ];
    return commonResolutions.some(([w, h]) => w === width && h === height);
  }

  private static calculateEntropy(config: FingerprintConfig): number {
    let entropy = 0;
    entropy += config.canvas.enabled ? Math.log2(100) : 0;
    entropy += config.webgl.enabled ? Math.log2(50) : 0;
    entropy += config.navigator.enabled ? Math.log2(200) : 0;
    entropy += config.screen.enabled ? Math.log2(20) : 0;
    return entropy;
  }
}
