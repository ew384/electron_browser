export interface BrowserAccount {
  id: string;
  name: string;
  status: 'idle' | 'running' | 'error';
  createdAt: number;
  config?: AccountConfig;
}

export interface BrowserInstance {
  accountId: string;
  windowId: number;
  status: 'starting' | 'running' | 'stopped';
  pid?: number;
  url?: string;
}

export interface AccountConfig {
  proxy?: string;
  userAgent?: string;
  fingerprint?: FingerprintConfig;
  behavior?: BehaviorConfig;
  viewport?: ViewportConfig;
}

export interface ViewportConfig {
  width: number;
  height: number;
  deviceScaleFactor: number;
}

export interface FingerprintConfig {
  canvas: CanvasFingerprintConfig;
  webgl: WebGLFingerprintConfig;
  audio: AudioFingerprintConfig;
  navigator: NavigatorFingerprintConfig;
  screen: ScreenFingerprintConfig;
  fonts: FontFingerprintConfig;
  timezone: TimezoneFingerprintConfig;
}

export interface CanvasFingerprintConfig {
  noise: number;
  enabled: boolean;
  seed?: number;
  algorithm: 'uniform' | 'gaussian' | 'perlin';
}

export interface WebGLFingerprintConfig {
  vendor: string;
  renderer: string;
  enabled: boolean;
  unmaskedVendor?: string;
  unmaskedRenderer?: string;
}

export interface AudioFingerprintConfig {
  noise: number;
  enabled: boolean;
  seed?: number;
}

export interface NavigatorFingerprintConfig {
  platform: string;
  language: string;
  languages: string[];
  hardwareConcurrency: number;
  maxTouchPoints: number;
  deviceMemory?: number;
  enabled: boolean;
  userAgent?: string;
}

export interface ScreenFingerprintConfig {
  width: number;
  height: number;
  pixelRatio: number;
  colorDepth: number;
  enabled: boolean;
}

export interface FontFingerprintConfig {
  available: string[];
  enabled: boolean;
  measurementMethod: 'canvas' | 'dom';
}

export interface TimezoneFingerprintConfig {
  name: string;
  offset: number;
  enabled: boolean;
}

export interface BehaviorConfig {
  mouseMovement?: MouseBehaviorConfig;
  typing?: TypingBehaviorConfig;
  enabled: boolean;
}

export interface MouseBehaviorConfig {
  speed: number;
  acceleration: number;
  jitter: number;
}

export interface TypingBehaviorConfig {
  wpm: number;
  errorRate: number;
}

export interface FingerprintQuality {
  score: number;
  issues: string[];
  consistency: boolean;
  entropy: number;
}

export interface WindowManagerState {
  instances: Map<string, BrowserInstance>;
  configs: Map<string, FingerprintConfig>;
}
