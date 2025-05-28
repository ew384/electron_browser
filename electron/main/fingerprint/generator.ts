import { FingerprintConfig } from '../../shared/types';

export class FingerprintGenerator {
  private static readonly COMMON_GPUS = [
    { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
    { vendor: 'Google Inc. (AMD)', renderer: 'ANGLE (AMD, AMD Radeon RX 6700 XT Direct3D11 vs_5_0 ps_5_0, D3D11)' },
    { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
    { vendor: 'Mozilla', renderer: 'Mozilla' },
  ];

  private static readonly COMMON_PLATFORMS = [
    'Win32', 'MacIntel', 'Linux x86_64', 'Linux i686'
  ];

  private static readonly COMMON_LANGUAGES = [
    ['en-US', 'en'], ['zh-CN', 'zh'], ['ja-JP', 'ja'], 
    ['ko-KR', 'ko'], ['de-DE', 'de'], ['fr-FR', 'fr']
  ];

  private static readonly COMMON_FONTS = [
    'Arial', 'Times New Roman', 'Courier New', 'Helvetica', 'Georgia',
    'Verdana', 'Trebuchet MS', 'Arial Black', 'Impact', 'Tahoma'
  ];

  private static readonly SCREEN_RESOLUTIONS = [
    { width: 1920, height: 1080 }, { width: 1366, height: 768 },
    { width: 1536, height: 864 }, { width: 1440, height: 900 },
    { width: 1280, height: 720 }, { width: 2560, height: 1440 }
  ];

  static generateFingerprint(seed?: string): FingerprintConfig {
    const rng = this.createSeededRandom(seed);
    const gpu = this.COMMON_GPUS[Math.floor(rng() * this.COMMON_GPUS.length)];
    const platform = this.COMMON_PLATFORMS[Math.floor(rng() * this.COMMON_PLATFORMS.length)];
    const languages = this.COMMON_LANGUAGES[Math.floor(rng() * this.COMMON_LANGUAGES.length)];
    const resolution = this.SCREEN_RESOLUTIONS[Math.floor(rng() * this.SCREEN_RESOLUTIONS.length)];

    return {
      canvas: {
        noise: 0.1 + rng() * 0.3,
        enabled: true,
        seed: Math.floor(rng() * 1000000),
        algorithm: 'gaussian'
      },
      webgl: {
        vendor: gpu.vendor,
        renderer: gpu.renderer,
        enabled: true,
        unmaskedVendor: gpu.vendor,
        unmaskedRenderer: gpu.renderer
      },
      audio: {
        noise: 0.05 + rng() * 0.15,
        enabled: true,
        seed: Math.floor(rng() * 1000000)
      },
      navigator: {
        platform,
        language: languages[0],
        languages: languages,
        hardwareConcurrency: 4 + Math.floor(rng() * 8),
        maxTouchPoints: platform.includes('Win') ? 0 : Math.floor(rng() * 5),
        deviceMemory: Math.pow(2, 2 + Math.floor(rng() * 3)),
        enabled: true
      },
      screen: {
        width: resolution.width,
        height: resolution.height,
        pixelRatio: 1 + Math.floor(rng() * 2),
        colorDepth: 24,
        enabled: true
      },
      fonts: {
        available: this.generateAvailableFonts(rng),
        enabled: true,
        measurementMethod: 'canvas'
      },
      timezone: {
        name: this.getTimezoneForPlatform(platform),
        offset: this.getTimezoneOffset(platform),
        enabled: true
      }
    };
  }

  private static createSeededRandom(seed?: string) {
    const seedNum = seed ? this.hashCode(seed) : Math.random() * 1000000;
    let currentSeed = seedNum;
    
    return () => {
      currentSeed = (currentSeed * 9301 + 49297) % 233280;
      return currentSeed / 233280;
    };
  }

  private static hashCode(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  private static generateAvailableFonts(rng: () => number): string[] {
    const count = 8 + Math.floor(rng() * 7);
    const shuffled = [...this.COMMON_FONTS].sort(() => rng() - 0.5);
    return shuffled.slice(0, count);
  }

  private static getTimezoneForPlatform(platform: string): string {
    const timezones: Record<string, string[]> = {
      'Win32': ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles'],
      'MacIntel': ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles'],
      'Linux x86_64': ['America/New_York', 'Europe/London', 'Europe/Berlin', 'Asia/Shanghai'],
      'Linux i686': ['America/New_York', 'Europe/London', 'Europe/Berlin']
    };
    const options = timezones[platform] || timezones['Win32'];
    return options[Math.floor(Math.random() * options.length)];
  }

  private static getTimezoneOffset(platform: string): number {
    return -new Date().getTimezoneOffset();
  }
}
