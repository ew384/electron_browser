/**
 * 全局常量配置
 */

export const APP_CONFIG = {
  name: '防关联浏览器',
  version: '1.0.0',
  author: 'Browser Manager Team'
} as const;

export const WINDOW_CONFIG = {
  main: {
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600
  },
  browser: {
    width: 1280,
    height: 720,
    minWidth: 800,
    minHeight: 600
  }
} as const;

export const IPC_CHANNELS = {
  // 账号管理
  CREATE_ACCOUNT: 'create-account',
  DELETE_ACCOUNT: 'delete-account',
  UPDATE_ACCOUNT: 'update-account',
  GET_ACCOUNTS: 'get-accounts',
  
  // 浏览器实例管理
  CREATE_BROWSER_INSTANCE: 'create-browser-instance',
  DESTROY_BROWSER_INSTANCE: 'destroy-browser-instance',
  GET_INSTANCE_STATUS: 'get-instance-status',
  
  // 预留扩展通道
  INJECT_FINGERPRINT: 'inject-fingerprint',
  UPDATE_PROXY: 'update-proxy',
  EXECUTE_BEHAVIOR: 'execute-behavior'
} as const;

export const DEFAULT_USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
] as const;