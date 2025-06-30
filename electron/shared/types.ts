// 平台类型枚举
export type PlatformType = 'douyin' | 'wechat' | 'xiaohongshu' | 'kuaishou' | 'bilibili' | 'tiktok' | 'youtube';

// Cookie 状态类型
export type CookieStatus = 'valid' | 'invalid' | 'expired' | 'unknown';

// 账号状态扩展
export type AccountStatus = 'idle' | 'running' | 'logging_in' | 'login_failed' | 'cookie_expired';
export interface BrowserAccount {
  id: string;
  name: string;
  status: 'idle' | 'running' | 'error';
  createdAt: number;
  config?: AccountConfig;
  debugPort?: number;
  updatedAt?: number;
  platform?: PlatformType;           // 绑定的平台
  group?: string;                    // 分组信息
  cookieStatus?: CookieStatus;       // Cookie状态
  lastLoginTime?: number;            // 最后登录时间
  lastCookieCheck?: number;          // 最后Cookie检查时间
  notes?: string;                    // 备注信息
  avatar?: string;                   // 头像URL
  username?: string;                 // 平台用户名
  tags?: string[];                   // 标签
}
// Cookie 数据接口
export interface AccountCookie {
  id?: string;
  accountId: string;
  platform: PlatformType;
  cookieData: any;                   // 存储序列化的cookie数据
  createdAt: number;
  lastValidated: number;
  isValid: boolean;
  expiresAt?: number;
  metadata?: {
    userAgent?: string;
    domain?: string;
    loginMethod?: string;
  };
}

// 登录会话接口
export interface LoginSession {
  id: string;
  accountId: string;
  platform: PlatformType;
  status: 'pending' | 'waiting_user' | 'completed' | 'failed' | 'timeout';
  browserInstanceId?: string;
  startTime: number;
  endTime?: number;
  errorMessage?: string;
  progress?: number;
}

// 平台配置接口
export interface PlatformConfig {
  id: PlatformType;
  name: string;
  displayName: string;
  icon: string;
  color: string;
  loginUrl: string;
  uploadUrl: string;
  features: {
    autoLogin: boolean;
    batchUpload: boolean;
    scheduling: boolean;
  };
  cookieValidation: {
    checkUrl: string;
    validationScript: string;
  };
}

// 账号分组接口
export interface AccountGroup {
  id: string;
  name: string;
  description?: string;
  color?: string;
  platform?: PlatformType;          // 可以按平台分组
  createdAt: number;
  accountIds: string[];
}

// API 响应类型
export interface AccountApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// 批量操作类型
export interface BatchOperation {
  id: string;
  type: 'login' | 'validate_cookie' | 'delete';
  accountIds: string[];
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  results: {
    accountId: string;
    success: boolean;
    error?: string;
  }[];
  startTime: number;
  endTime?: number;
}
export interface BrowserInstance {
  accountId: string;
  windowId: number;
  status: 'starting' | 'running' | 'stopped';
  pid?: number;
  url?: string;
  id?: string;
  debugPort?: number;
}

export interface AccountConfig {
  proxy?: string;
  userAgent?: string;
  fingerprint?: FingerprintConfig;
  behavior?: BehaviorConfig;
  viewport?: ViewportConfig;
  startUrl?: string;
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
