// electron/main/platform-adapter.ts - 平台适配器
export interface PlatformConfig {
    networkConfig: {
        httpBindAddress: string;
        useIPv4Only: boolean;
        websocketProtocol: 'ipv4' | 'ipv6' | 'auto';
    };
    chromeConfig: {
        launchArgs: string[];
        debugPortRange: [number, number];
        sandboxMode: boolean;
    };
    systemConfig: {
        maxConcurrentBrowsers: number;
        memoryLimit: string;
        tempDirPath: string;
    };
    features: {
        fingerprintGeneration: boolean;
        proxySupport: boolean;
        screenshotAPI: boolean;
    };
}

export class PlatformAdapter {
    private static instance: PlatformAdapter;
    private config: PlatformConfig;

    private constructor() {
        this.config = this.detectPlatformConfig();
        this.logPlatformInfo();
    }

    static getInstance(): PlatformAdapter {
        if (!PlatformAdapter.instance) {
            PlatformAdapter.instance = new PlatformAdapter();
        }
        return PlatformAdapter.instance;
    }

    private detectPlatformConfig(): PlatformConfig {
        const platform = process.platform;
        const arch = process.arch;
        const version = process.getSystemVersion();

        console.log(`[PlatformAdapter] 检测到系统: ${platform} ${arch} ${version}`);

        switch (platform) {
            case 'darwin': // macOS
                return this.getMacOSConfig(version);
            case 'linux':
                return this.getLinuxConfig();
            case 'win32':
                return this.getWindowsConfig();
            default:
                console.warn(`[PlatformAdapter] 未知平台 ${platform}，使用保守配置`);
                return this.getDefaultConfig();
        }
    }

    private getMacOSConfig(version: string): PlatformConfig {
        // macOS特殊处理：强制IPv4，处理安全策略
        const isBigSurOrLater = this.compareVersion(version, '11.0.0') >= 0;
        
        return {
            networkConfig: {
                httpBindAddress: '127.0.0.1',  // 🔧 强制IPv4解决macOS问题
                useIPv4Only: true,
                websocketProtocol: 'ipv4'
            },
            chromeConfig: {
                launchArgs: [
                    '--no-sandbox',
                    '--disable-web-security',
                    '--disable-features=VizDisplayCompositor',
                    '--disable-gpu-sandbox',
                    // macOS Big Sur+特殊参数
                    ...(isBigSurOrLater ? ['--no-first-run', '--disable-default-apps'] : [])
                ],
                debugPortRange: [9711, 9720],
                sandboxMode: false
            },
            systemConfig: {
                maxConcurrentBrowsers: 4,  // macOS内存管理较好
                memoryLimit: '4GB',
                tempDirPath: process.env.TMPDIR || '/tmp'
            },
            features: {
                fingerprintGeneration: true,
                proxySupport: true,
                screenshotAPI: true
            }
        };
    }

    private getLinuxConfig(): PlatformConfig {
        // Linux：原有配置保持不变，较为稳定
        const hasDisplay = !!process.env.DISPLAY;
        
        return {
            networkConfig: {
                httpBindAddress: 'localhost',   // Linux通常IPv4/IPv6都正常
                useIPv4Only: false,
                websocketProtocol: 'auto'
            },
            chromeConfig: {
                launchArgs: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    // 无显示环境特殊处理
                    ...(hasDisplay ? [] : ['--headless', '--virtual-time-budget=1000'])
                ],
                debugPortRange: [9711, 9720],
                sandboxMode: false
            },
            systemConfig: {
                maxConcurrentBrowsers: 6,  // Linux资源利用率高
                memoryLimit: '6GB',
                tempDirPath: '/tmp'
            },
            features: {
                fingerprintGeneration: true,
                proxySupport: true,
                screenshotAPI: hasDisplay
            }
        };
    }

    private getWindowsConfig(): PlatformConfig {
        // Windows：处理权限和路径问题
        const isWin10OrLater = this.compareVersion(process.getSystemVersion(), '10.0.0') >= 0;
        
        return {
            networkConfig: {
                httpBindAddress: 'localhost',
                useIPv4Only: false,
                websocketProtocol: 'auto'
            },
            chromeConfig: {
                launchArgs: [
                    '--no-sandbox',
                    '--disable-web-security',
                    '--disable-features=VizDisplayCompositor',
                    // Win10+特殊优化
                    ...(isWin10OrLater ? ['--enable-features=NetworkService'] : [])
                ],
                debugPortRange: [9711, 9720],
                sandboxMode: false
            },
            systemConfig: {
                maxConcurrentBrowsers: 3,  // Windows内存管理保守
                memoryLimit: '3GB',
                tempDirPath: process.env.TEMP || 'C:\\temp'
            },
            features: {
                fingerprintGeneration: true,
                proxySupport: true,
                screenshotAPI: true
            }
        };
    }

    private getDefaultConfig(): PlatformConfig {
        // 保守的默认配置
        return {
            networkConfig: {
                httpBindAddress: '127.0.0.1',  // 最安全的选择
                useIPv4Only: true,
                websocketProtocol: 'ipv4'
            },
            chromeConfig: {
                launchArgs: ['--no-sandbox', '--disable-web-security'],
                debugPortRange: [9711, 9720],
                sandboxMode: false
            },
            systemConfig: {
                maxConcurrentBrowsers: 2,
                memoryLimit: '2GB',
                tempDirPath: './temp'
            },
            features: {
                fingerprintGeneration: true,
                proxySupport: false,
                screenshotAPI: false
            }
        };
    }

    private compareVersion(version1: string, version2: string): number {
        const v1parts = version1.split('.').map(Number);
        const v2parts = version2.split('.').map(Number);
        
        for (let i = 0; i < Math.max(v1parts.length, v2parts.length); i++) {
            const v1part = v1parts[i] || 0;
            const v2part = v2parts[i] || 0;
            
            if (v1part > v2part) return 1;
            if (v1part < v2part) return -1;
        }
        return 0;
    }

    private logPlatformInfo(): void {
        console.log('[PlatformAdapter] ==================== 平台配置 ====================');
        console.log(`[PlatformAdapter] 平台: ${process.platform} ${process.arch}`);
        console.log(`[PlatformAdapter] 系统版本: ${process.getSystemVersion()}`);
        console.log(`[PlatformAdapter] Node版本: ${process.version}`);
        console.log(`[PlatformAdapter] 网络模式: ${this.config.networkConfig.useIPv4Only ? 'IPv4-only' : 'Auto'}`);
        console.log(`[PlatformAdapter] HTTP绑定: ${this.config.networkConfig.httpBindAddress}`);
        console.log(`[PlatformAdapter] 最大浏览器: ${this.config.systemConfig.maxConcurrentBrowsers}`);
        console.log(`[PlatformAdapter] 内存限制: ${this.config.systemConfig.memoryLimit}`);
        console.log('[PlatformAdapter] ================================================');
    }

    // 公共接口
    getConfig(): PlatformConfig {
        return { ...this.config }; // 返回副本避免修改
    }

    getNetworkConfig() {
        return this.config.networkConfig;
    }

    getChromeConfig() {
        return this.config.chromeConfig;
    }

    getSystemConfig() {
        return this.config.systemConfig;
    }

    isFeatureEnabled(feature: keyof PlatformConfig['features']): boolean {
        return this.config.features[feature];
    }

    // 网络相关辅助方法
    getHTTPBindAddress(): string {
        return this.config.networkConfig.httpBindAddress;
    }

    shouldUseIPv4Only(): boolean {
        return this.config.networkConfig.useIPv4Only;
    }

    formatWebSocketURL(host: string, port: number, path: string): string {
        const targetHost = this.config.networkConfig.useIPv4Only ? 
            host.replace('localhost', '127.0.0.1') : host;
        return `ws://${targetHost}:${port}${path}`;
    }

    formatHTTPURL(host: string, port: number, path: string): string {
        const targetHost = this.config.networkConfig.useIPv4Only ? 
            host.replace('localhost', '127.0.0.1') : host;
        return `http://${targetHost}:${port}${path}`;
    }

    // 运行时检测方法
    async validateNetworkConfig(): Promise<boolean> {
        try {
            // 测试HTTP服务器是否能正常绑定
            const http = require('http');
            const testServer = http.createServer();
            
            return new Promise<boolean>((resolve) => {
                testServer.listen(0, this.config.networkConfig.httpBindAddress, () => {
                    const actualPort = testServer.address()?.port;
                    console.log(`[PlatformAdapter] ✅ 网络配置验证成功，测试端口: ${actualPort}`);
                    testServer.close(() => resolve(true));
                });
                
                testServer.on('error', (error) => {
                    console.error(`[PlatformAdapter] ❌ 网络配置验证失败:`, error.message);
                    resolve(false);
                });
            });
        } catch (error) {
            console.error(`[PlatformAdapter] ❌ 网络配置验证异常:`, error);
            return false;
        }
    }
}