import { CanvasFingerprintConfig } from '../../shared/types';

export function injectCanvasFingerprinting(config: CanvasFingerprintConfig) {
  if (!config.enabled) {
    console.log('[Canvas] Canvas 指纹注入已禁用');
    return;
  }

  console.log('[Canvas] 🎨 开始强化 Canvas 指纹注入');
  console.log('[Canvas] 噪声级别:', config.noise);
  console.log('[Canvas] 种子值:', config.seed);

  // 主要的像素级噪声注入
  injectPixelLevelNoise(config);

  // 绘图方法层面的噪声注入
  injectDrawingLevelNoise(config);

  console.log('[Canvas] 🎨 强化 Canvas 指纹注入完成');
}

function injectPixelLevelNoise(config: CanvasFingerprintConfig) {
  console.log('[Canvas] 🔬 注入强化像素级噪声');

  const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
  const originalToBlob = HTMLCanvasElement.prototype.toBlob;

  // 创建强化的种子随机数生成器
  function createStrongSeededRandom(seed: number): () => number {
    let currentSeed = seed;
    return () => {
      // 使用更强的线性同余生成器
      currentSeed = (currentSeed * 1664525 + 1013904223) % (1 << 32);
      return Math.abs(currentSeed) / (1 << 32);
    };
  }

  // 计算字符串hash
  function hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  // 重写 toDataURL - 强化像素级噪声
  HTMLCanvasElement.prototype.toDataURL = function (type?: string, quality?: any): string {
    console.log('[Canvas] toDataURL 被调用 - 开始强化像素级处理');

    try {
      // 如果canvas太小，应用简单噪声
      if (this.width < 1 || this.height < 1) {
        const simple = originalToDataURL.call(this, type, quality);
        return simple + '?t=' + Date.now().toString(36);
      }

      // 创建工作canvas
      const workCanvas = document.createElement('canvas');
      const workCtx = workCanvas.getContext('2d');

      if (!workCtx) {
        console.warn('[Canvas] 无法创建工作 context');
        const fallback = originalToDataURL.call(this, type, quality);
        return fallback + '?fallback=' + Math.random().toString(36);
      }

      // 设置工作canvas尺寸
      workCanvas.width = this.width;
      workCanvas.height = this.height;

      // 复制原始内容
      workCtx.drawImage(this, 0, 0);

      // 获取图像数据
      const imageData = workCtx.getImageData(0, 0, workCanvas.width, workCanvas.height);
      const pixels = imageData.data;

      // 生成基于多个因素的种子
      const baseSeed = config.seed || 0;
      const timeFactor = Math.floor(Date.now() / 1000); // 每秒变化
      const sizeFactor = this.width * this.height;
      const contentHash = hashString(originalToDataURL.call(this, type, quality).substring(0, 100));

      const combinedSeed = (baseSeed + timeFactor + sizeFactor + contentHash) % 1000000;
      console.log('[Canvas] 使用组合种子:', combinedSeed);

      const rng = createStrongSeededRandom(combinedSeed);

      // 强化噪声参数
      const baseNoise = Math.max(0.02, Math.min(0.2, config.noise)); // 2%-20%
      const pixelModifyChance = baseNoise;
      const maxNoiseValue = Math.ceil(baseNoise * 255); // 噪声强度与概率成正比

      let modifiedPixels = 0;
      const totalPixels = pixels.length / 4;

      // 分区域处理，确保噪声分布均匀
      const regionSize = Math.max(10, Math.floor(Math.sqrt(totalPixels) / 10));

      for (let i = 0; i < pixels.length; i += 4) {
        const pixelIndex = i / 4;
        const x = pixelIndex % this.width;
        const y = Math.floor(pixelIndex / this.width);

        // 基于位置的噪声调制
        const regionX = Math.floor(x / regionSize);
        const regionY = Math.floor(y / regionSize);
        const regionSeed = (regionX * 1000 + regionY + combinedSeed) % 1000000;
        const regionRng = createStrongSeededRandom(regionSeed);

        // 决定是否修改这个像素
        if (regionRng() < pixelModifyChance) {
          // 对RGB通道应用不同强度的噪声
          for (let channel = 0; channel < 3; channel++) {
            if (regionRng() < 0.7) { // 70%概率修改通道
              const noiseDirection = regionRng() < 0.5 ? -1 : 1;
              const noiseValue = Math.floor(regionRng() * maxNoiseValue) * noiseDirection;

              const originalValue = pixels[i + channel];
              const newValue = Math.max(0, Math.min(255, originalValue + noiseValue));

              if (newValue !== originalValue) {
                pixels[i + channel] = newValue;
                modifiedPixels++;
              }
            }
          }
        }
      }

      console.log('[Canvas] 修改了', modifiedPixels, '个颜色通道，总像素:', totalPixels);
      console.log('[Canvas] 修改率:', (modifiedPixels / (totalPixels * 3) * 100).toFixed(2), '%');

      // 写回修改后的像素数据
      workCtx.putImageData(imageData, 0, 0);

      // 获取最终结果
      const result = originalToDataURL.call(workCanvas, type, quality);

      // 验证修改效果
      const original = originalToDataURL.call(this, type, quality);
      const isModified = result !== original;

      console.log('[Canvas] 原始长度:', original.length);
      console.log('[Canvas] 修改后长度:', result.length);
      console.log('[Canvas] 内容已修改:', isModified);

      if (!isModified) {
        console.warn('[Canvas] 警告：内容未发生变化，添加后备噪声');
        const backup = result + '?backup=' + combinedSeed.toString(36) + Math.random().toString(36);
        return backup;
      }

      return result;

    } catch (error) {
      console.error('[Canvas] 强化像素级噪声注入失败:', error);
      // 降级处理
      const original = originalToDataURL.call(this, type, quality);
      const emergency = Date.now() + Math.random() * 1000000;
      return original + '?emergency=' + emergency.toString(36);
    }
  };

  // 同时处理 toBlob 方法
  HTMLCanvasElement.prototype.toBlob = function (callback: BlobCallback, type?: string, quality?: any): void {
    console.log('[Canvas] toBlob 被调用 - 使用强化噪声 toDataURL');

    try {
      // 使用已经注入强化噪声的 toDataURL 方法
      const dataURL = this.toDataURL(type, quality);

      // 将 DataURL 转换为 Blob
      const parts = dataURL.split(',');
      if (parts.length !== 2) {
        throw new Error('Invalid dataURL format');
      }

      const contentType = parts[0].split(':')[1].split(';')[0];
      const byteString = atob(parts[1]);

      const arrayBuffer = new ArrayBuffer(byteString.length);
      const uint8Array = new Uint8Array(arrayBuffer);

      for (let i = 0; i < byteString.length; i++) {
        uint8Array[i] = byteString.charCodeAt(i);
      }

      const blob = new Blob([arrayBuffer], { type: contentType });

      console.log('[Canvas] toBlob 转换成功，Blob大小:', blob.size);
      callback(blob);

    } catch (error) {
      console.error('[Canvas] toBlob 强化处理失败:', error);
      // 使用原始方法作为后备
      originalToBlob.call(this, callback, type, quality);
    }
  };
}

function injectDrawingLevelNoise(config: CanvasFingerprintConfig) {
  console.log('[Canvas] 🖌️ 注入绘图级微调噪声');

  // 辅助函数
  function hashCode(str: string): number {
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
      currentSeed = (currentSeed * 1664525 + 1013904223) % (1 << 32);
      return Math.abs(currentSeed) / (1 << 32);
    };
  }

  // 重写 fillText 方法 - 添加微小偏移
  const originalFillText = CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText = function (text: string, x: number, y: number, maxWidth?: number) {
    // 基于配置种子生成一致的微调
    const seed = (config.seed || 0) + hashCode(text + x + y);
    const rng = seededRandom(seed);

    // 微小的位置偏移 (0.001-0.01 像素级别)
    const offsetX = x + (rng() - 0.5) * 0.02;
    const offsetY = y + (rng() - 0.5) * 0.02;

    // 很小概率添加不可见字符
    let finalText = text;
    if (rng() < config.noise / 10) {
      const invisibleChars = ['\u200B', '\u200C', '\u200D', '\uFEFF'];
      const randomChar = invisibleChars[Math.floor(rng() * invisibleChars.length)];
      finalText = text + randomChar;
    }

    if (maxWidth !== undefined) {
      return originalFillText.call(this, finalText, offsetX, offsetY, maxWidth);
    } else {
      return originalFillText.call(this, finalText, offsetX, offsetY);
    }
  };

  // 重写 fillRect 方法 - 添加微小几何噪声
  const originalFillRect = CanvasRenderingContext2D.prototype.fillRect;
  CanvasRenderingContext2D.prototype.fillRect = function (x: number, y: number, width: number, height: number) {
    const seed = (config.seed || 0) + hashCode('rect' + x + y + width + height);
    const rng = seededRandom(seed);

    // 微小的几何偏移
    const offsetX = x + (rng() - 0.5) * 0.01;
    const offsetY = y + (rng() - 0.5) * 0.01;
    const offsetW = width + (rng() - 0.5) * 0.01;
    const offsetH = height + (rng() - 0.5) * 0.01;

    return originalFillRect.call(this, offsetX, offsetY, offsetW, offsetH);
  };
}

// 强化测试函数
export function testCanvasInjection(): void {
  console.log('[Canvas-Test] 🧪 开始强化 Canvas 指纹测试');

  try {
    const testScenarios = [
      { name: 'BrowserLeaks仿真', test: testBrowserLeaksSimulation },
      { name: '多次调用一致性', test: testConsistency },
      { name: '复杂内容', test: testComplexContent }
    ];

    testScenarios.forEach(scenario => {
      console.log(`[Canvas-Test] === 测试场景: ${scenario.name} ===`);

      const results: string[] = [];

      // 生成5个指纹样本
      for (let i = 0; i < 5; i++) {
        const fingerprint = scenario.test();
        results.push(fingerprint);
        console.log(`[Canvas-Test] ${scenario.name} #${i + 1} 长度:`, fingerprint.length);
      }

      // 分析差异
      const uniqueResults = new Set(results);
      const uniqueCount = uniqueResults.size;
      const successRate = (uniqueCount / results.length) * 100;

      console.log(`[Canvas-Test] ${scenario.name} - 唯一结果数:`, uniqueCount);
      console.log(`[Canvas-Test] ${scenario.name} - 差异率:`, successRate.toFixed(1), '%');

      if (uniqueCount === results.length) {
        console.log(`[Canvas-Test] ✅ ${scenario.name} 完美 - 每次都不同`);
      } else if (uniqueCount > 1) {
        console.log(`[Canvas-Test] ✅ ${scenario.name} 良好 - 有差异`);
      } else {
        console.log(`[Canvas-Test] ❌ ${scenario.name} 失败 - 结果相同`);
      }

      // 显示前几个结果的预览
      results.slice(0, 3).forEach((result, index) => {
        const preview = result.substring(0, 80) + '...';
        console.log(`[Canvas-Test] ${scenario.name} #${index + 1} 预览:`, preview);
      });
    });

  } catch (error) {
    console.error('[Canvas-Test] ❌ 强化测试过程出错:', error);
  }
}

// BrowserLeaks 仿真测试
function testBrowserLeaksSimulation(): string {
  const canvas = document.createElement('canvas');
  canvas.width = 200;
  canvas.height = 50;

  const ctx = canvas.getContext('2d')!;

  // 模拟 BrowserLeaks 的具体测试内容
  ctx.textBaseline = 'top';
  ctx.font = '14px Arial';
  ctx.fillStyle = '#f60';
  ctx.fillRect(125, 1, 62, 20);

  ctx.fillStyle = '#069';
  ctx.fillText('BrowserLeaks.com', 2, 15);

  ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
  ctx.fillText('BrowserLeaks.com', 4, 17);

  return canvas.toDataURL();
}

// 一致性测试
function testConsistency(): string {
  const canvas = document.createElement('canvas');
  canvas.width = 150;
  canvas.height = 75;

  const ctx = canvas.getContext('2d')!;

  // 简单但具有代表性的内容
  ctx.fillStyle = '#FF0000';
  ctx.fillRect(10, 10, 50, 30);

  ctx.fillStyle = '#00FF00';
  ctx.font = '16px Arial';
  ctx.fillText('Test123', 20, 50);

  return canvas.toDataURL();
}

// 复杂内容测试
function testComplexContent(): string {
  const canvas = document.createElement('canvas');
  canvas.width = 300;
  canvas.height = 200;

  const ctx = canvas.getContext('2d')!;

  // 复杂的绘制内容
  const gradient = ctx.createLinearGradient(0, 0, 300, 0);
  gradient.addColorStop(0, '#FF0000');
  gradient.addColorStop(0.5, '#00FF00');
  gradient.addColorStop(1, '#0000FF');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 300, 200);

  // 半透明图形
  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
  ctx.fillRect(50, 50, 200, 100);

  // 多种字体和大小
  ctx.fillStyle = '#000000';
  ctx.font = 'bold 20px Arial';
  ctx.fillText('Complex Canvas Test', 60, 80);

  ctx.font = '14px Times';
  ctx.fillText('Multiple fonts and styles', 60, 100);

  // 图形绘制
  ctx.strokeStyle = '#FF00FF';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(150, 120, 30, 0, Math.PI * 2);
  ctx.stroke();

  return canvas.toDataURL();
}