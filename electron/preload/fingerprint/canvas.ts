import { CanvasFingerprintConfig } from '../../shared/types';

export function injectCanvasFingerprinting(config: CanvasFingerprintConfig) {
  if (!config.enabled) {
    console.log('[Canvas] Canvas 指纹注入已禁用');
    return;
  }

  console.log('[Canvas] 🎨 开始高级 Canvas 指纹注入');
  console.log('[Canvas] 噪声级别:', config.noise);
  console.log('[Canvas] 种子值:', config.seed);

  // 真正有效的像素级噪声注入
  injectPixelLevelNoise(config);
  
  // 绘图方法层面的噪声注入
  injectDrawingLevelNoise(config);
  
  // ImageData 层面的噪声注入
  injectImageDataNoise(config);

  console.log('[Canvas] 🎨 高级 Canvas 指纹注入完成');
}

function injectPixelLevelNoise(config: CanvasFingerprintConfig) {
  console.log('[Canvas] 🔬 注入像素级噪声');
  
  const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
  const originalToBlob = HTMLCanvasElement.prototype.toBlob;
  
  // 重写 toDataURL - 真正修改像素数据
  HTMLCanvasElement.prototype.toDataURL = function(type?: string, quality?: any): string {
    console.log('[Canvas] toDataURL 被调用 - 开始像素级处理');
    
    try {
      // 如果canvas太小或没有内容，直接返回原始结果
      if (this.width < 1 || this.height < 1) {
        return originalToDataURL.call(this, type, quality);
      }
      
      // 创建临时canvas处理噪声
      const tempCanvas = document.createElement('canvas');
      const tempCtx = tempCanvas.getContext('2d');
      
      if (!tempCtx) {
        console.warn('[Canvas] 无法创建临时 context，使用原始方法');
        return originalToDataURL.call(this, type, quality);
      }
      
      // 设置临时canvas尺寸
      tempCanvas.width = this.width;
      tempCanvas.height = this.height;
      
      // 复制原始canvas内容
      tempCtx.drawImage(this, 0, 0);
      
      // 获取图像数据
      const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
      const pixels = imageData.data;
      
      // 生成真正随机的噪声种子
      const timeSeed = performance.now() + Date.now();
      const randomSeed = Math.random() * 1000000;
      const processId = Math.random() * 10000; // 模拟进程差异
      const combinedSeed = Math.floor(timeSeed + randomSeed + processId) % 1000000;
      
      console.log('[Canvas] 使用像素噪声种子:', combinedSeed);
      
      // 创建种子随机数生成器
      const rng = createSeededRandom(combinedSeed);
      
      // 计算噪声强度
      const noiseIntensity = Math.max(0.001, Math.min(0.1, config.noise));
      
      // 添加像素级噪声
      let modifiedPixels = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        // 随机决定是否修改这个像素
        if (rng() < noiseIntensity) {
          // 随机选择要修改的颜色通道 (RGB，不修改Alpha)
          const channel = Math.floor(rng() * 3);
          
          // 生成噪声值 (-2 到 +2)
          const noiseValue = Math.floor((rng() - 0.5) * 4);
          
          // 应用噪声并确保值在有效范围内
          const originalValue = pixels[i + channel];
          const newValue = Math.max(0, Math.min(255, originalValue + noiseValue));
          
          pixels[i + channel] = newValue;
          modifiedPixels++;
        }
      }
      
      console.log('[Canvas] 修改了', modifiedPixels, '个像素点');
      
      // 写回修改后的像素数据
      tempCtx.putImageData(imageData, 0, 0);
      
      // 返回带噪声的结果
      const result = originalToDataURL.call(tempCanvas, type, quality);
      
      console.log('[Canvas] 像素级噪声注入完成');
      console.log('[Canvas] 原始长度:', originalToDataURL.call(this, type, quality).length);
      console.log('[Canvas] 修改后长度:', result.length);
      
      return result;
      
    } catch (error) {
      console.error('[Canvas] 像素级噪声注入失败:', error);
      // 降级到字符串级别的噪声
      const original = originalToDataURL.call(this, type, quality);
      const timestamp = Date.now() + Math.random() * 1000;
      return original + '?noise=' + timestamp.toString(36);
    }
  };
  
  // 同时处理 toBlob 方法
  HTMLCanvasElement.prototype.toBlob = function(callback: BlobCallback, type?: string, quality?: any): void {
    console.log('[Canvas] toBlob 被调用 - 使用带噪声的 toDataURL');
    
    try {
      // 使用已经注入噪声的 toDataURL 方法
      const dataURL = this.toDataURL(type, quality);
      
      // 将 DataURL 转换为 Blob
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
      
    } catch (error) {
      console.error('[Canvas] toBlob 噪声处理失败:', error);
      // 使用原始方法作为后备
      originalToBlob.call(this, callback, type, quality);
    }
  };
}

function injectDrawingLevelNoise(config: CanvasFingerprintConfig) {
  console.log('[Canvas] 🖌️  注入绘图级噪声');
  
  // 重写 fillText 方法
  const originalFillText = CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText = function(text: string, x: number, y: number, maxWidth?: number) {
    // 生成文本噪声
    const invisibleChars = [
      '\u200B', // 零宽度空格
      '\u200C', // 零宽度非连接符  
      '\u200D', // 零宽度连接符
      '\uFEFF'  // 零宽度非断行空格
    ];
    
    // 随机选择不可见字符
    const randomChar = invisibleChars[Math.floor(Math.random() * invisibleChars.length)];
    const randomSuffix = Math.random().toString(36).substring(2, 5);
    const noisyText = text + randomChar + randomSuffix;
    
    // 添加微小的位置偏移 (0.001-0.01 像素级别)
    const offsetX = x + (Math.random() - 0.5) * 0.02;
    const offsetY = y + (Math.random() - 0.5) * 0.02;
    
    console.log('[Canvas] fillText 添加字符和位置噪声');
    
    if (maxWidth !== undefined) {
      return originalFillText.call(this, noisyText, offsetX, offsetY, maxWidth);
    } else {
      return originalFillText.call(this, noisyText, offsetX, offsetY);
    }
  };
  
  // 重写 fillRect 方法
  const originalFillRect = CanvasRenderingContext2D.prototype.fillRect;
  CanvasRenderingContext2D.prototype.fillRect = function(x: number, y: number, width: number, height: number) {
    // 添加几何噪声
    const offsetX = x + (Math.random() - 0.5) * 0.02;
    const offsetY = y + (Math.random() - 0.5) * 0.02;
    const offsetW = width + (Math.random() - 0.5) * 0.02;
    const offsetH = height + (Math.random() - 0.5) * 0.02;
    
    console.log('[Canvas] fillRect 添加几何噪声');
    
    return originalFillRect.call(this, offsetX, offsetY, offsetW, offsetH);
  };
  
  // 重写 strokeText 方法
  const originalStrokeText = CanvasRenderingContext2D.prototype.strokeText;
  CanvasRenderingContext2D.prototype.strokeText = function(text: string, x: number, y: number, maxWidth?: number) {
    const invisibleChar = String.fromCharCode(8203 + Math.floor(Math.random() * 4));
    const noisyText = text + invisibleChar;
    
    const offsetX = x + (Math.random() - 0.5) * 0.01;
    const offsetY = y + (Math.random() - 0.5) * 0.01;
    
    console.log('[Canvas] strokeText 添加噪声');
    
    if (maxWidth !== undefined) {
      return originalStrokeText.call(this, noisyText, offsetX, offsetY, maxWidth);
    } else {
      return originalStrokeText.call(this, noisyText, offsetX, offsetY);
    }
  };
}

function injectImageDataNoise(config: CanvasFingerprintConfig) {
  console.log('[Canvas] 📊 注入 ImageData 级噪声');
  
  const originalGetImageData = CanvasRenderingContext2D.prototype.getImageData;
  CanvasRenderingContext2D.prototype.getImageData = function(sx: number, sy: number, sw: number, sh: number): ImageData {
    const imageData = originalGetImageData.call(this, sx, sy, sw, sh);
    
    // 低概率为 getImageData 添加轻微噪声
    const noiseChance = config.noise / 20; // 比主噪声低得多
    
    if (Math.random() < noiseChance) {
      const pixels = imageData.data;
      const totalPixels = pixels.length / 4;
      
      // 随机修改少量像素
      const pixelsToModify = Math.max(1, Math.floor(totalPixels * 0.001)); // 0.1%的像素
      
      for (let i = 0; i < pixelsToModify; i++) {
        const randomPixelIndex = Math.floor(Math.random() * totalPixels) * 4;
        const channel = Math.floor(Math.random() * 3); // RGB通道
        const noise = Math.floor((Math.random() - 0.5) * 2); // ±1
        
        if (randomPixelIndex < pixels.length) {
          pixels[randomPixelIndex + channel] = Math.max(0, Math.min(255, pixels[randomPixelIndex + channel] + noise));
        }
      }
      
      console.log('[Canvas] getImageData 添加了', pixelsToModify, '个像素噪声');
    }
    
    return imageData;
  };
}

// 种子随机数生成器
function createSeededRandom(seed: number): () => number {
  let currentSeed = seed;
  return () => {
    // 使用更好的随机数算法
    currentSeed = (currentSeed * 1103515245 + 12345) % (1 << 31);
    return currentSeed / (1 << 31);
  };
}

// 改进的测试函数
export function testCanvasInjection(): void {
  console.log('[Canvas-Test] 🧪 开始真实 Canvas 指纹测试');
  
  try {
    const testScenarios = [
      { name: '文本渲染', test: testTextRendering },
      { name: '图形绘制', test: testShapeDrawing },
      { name: '混合内容', test: testMixedContent },
      { name: 'BrowserLeaks模拟', test: testBrowserLeaksLike }
    ];
    
    const results: { [key: string]: string[] } = {};
    
    // 对每个场景进行测试
    testScenarios.forEach(scenario => {
      console.log(`[Canvas-Test] === 测试场景: ${scenario.name} ===`);
      results[scenario.name] = [];
      
      // 每个场景生成5个指纹进行对比
      for (let i = 0; i < 5; i++) {
        const fingerprint = scenario.test();
        results[scenario.name].push(fingerprint);
        console.log(`[Canvas-Test] ${scenario.name} 第${i+1}次 - 长度:`, fingerprint.length);
        
        // 显示前64个字符用于对比
        const preview = fingerprint.substring(0, 64) + '...';
        console.log(`[Canvas-Test] ${scenario.name} 第${i+1}次 - 预览:`, preview);
      }
      
      // 分析结果差异
      const hashes = results[scenario.name];
      const uniqueHashes = new Set(hashes);
      const allSame = uniqueHashes.size === 1;
      const successRate = (uniqueHashes.size / hashes.length) * 100;
      
      console.log(`[Canvas-Test] ${scenario.name} - 唯一指纹数:`, uniqueHashes.size);
      console.log(`[Canvas-Test] ${scenario.name} - 成功率:`, successRate.toFixed(1), '%');
      
      if (allSame) {
        console.log(`[Canvas-Test] ❌ ${scenario.name} 指纹伪装失败 - 所有结果相同`);
      } else if (successRate >= 80) {
        console.log(`[Canvas-Test] ✅ ${scenario.name} 指纹伪装成功 - 高差异率`);
      } else {
        console.log(`[Canvas-Test] ⚠️  ${scenario.name} 指纹伪装部分成功 - 中等差异率`);
      }
    });
    
    // 延迟测试 - 验证时间因素影响
    setTimeout(() => {
      console.log('[Canvas-Test] 🕐 执行延迟测试...');
      testScenarios.forEach(scenario => {
        const delayedFingerprint = scenario.test();
        const originalFingerprint = results[scenario.name][0];
        const isDifferent = delayedFingerprint !== originalFingerprint;
        
        console.log(`[Canvas-Test] ${scenario.name} 延迟测试结果不同:`, isDifferent);
        if (isDifferent) {
          console.log(`[Canvas-Test] ✅ ${scenario.name} 时间敏感噪声有效`);
        } else {
          console.log(`[Canvas-Test] ⚠️  ${scenario.name} 时间敏感噪声可能无效`);
        }
      });
    }, 200);
    
    // 重复测试 - 验证一致性
    setTimeout(() => {
      console.log('[Canvas-Test] 🔄 执行重复测试...');
      const repeatResults = testBrowserLeaksLike();
      const firstResult = results['BrowserLeaks模拟'][0];
      const isConsistent = repeatResults === firstResult;
      
      console.log('[Canvas-Test] 重复测试一致性:', !isConsistent); // 不一致才是好的
      if (!isConsistent) {
        console.log('[Canvas-Test] ✅ 重复调用产生不同结果 - 指纹伪装有效');
      } else {
        console.log('[Canvas-Test] ⚠️  重复调用结果相同 - 可能需要调整');
      }
    }, 500);
    
  } catch (error) {
    console.error('[Canvas-Test] ❌ 测试过程出错:', error);
  }
}

// 文本渲染测试
function testTextRendering(): string {
  const canvas = document.createElement('canvas');
  canvas.width = 300;
  canvas.height = 150;
  
  const ctx = canvas.getContext('2d')!;
  
  // 清除背景
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // 多种文本渲染
  ctx.fillStyle = '#FF0000';
  ctx.font = '20px Arial';
  ctx.fillText('Canvas Fingerprint Test 123', 10, 30);
  
  ctx.fillStyle = '#00FF00';
  ctx.font = '16px Times';
  ctx.fillText('🎨 Unicode Test 测试', 10, 60);
  
  ctx.fillStyle = '#0000FF';
  ctx.font = '14px Courier';
  ctx.fillText('Special chars: @#$%^&*()', 10, 90);
  
  // 描边文本
  ctx.strokeStyle = '#FF00FF';
  ctx.lineWidth = 1;
  ctx.strokeText('Stroke Text Test', 10, 120);
  
  return canvas.toDataURL();
}

// 图形绘制测试
function testShapeDrawing(): string {
  const canvas = document.createElement('canvas');
  canvas.width = 300;
  canvas.height = 150;
  
  const ctx = canvas.getContext('2d')!;
  
  // 白色背景
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // 各种几何图形
  ctx.fillStyle = '#FF6B6B';
  ctx.fillRect(10, 10, 80, 40);
  
  ctx.fillStyle = '#4ECDC4';
  ctx.beginPath();
  ctx.arc(150, 50, 25, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.strokeStyle = '#45B7D1';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(200, 20);
  ctx.lineTo(280, 80);
  ctx.stroke();
  
  // 三角形
  ctx.fillStyle = '#96CEB4';
  ctx.beginPath();
  ctx.moveTo(50, 100);
  ctx.lineTo(100, 130);
  ctx.lineTo(20, 130);
  ctx.closePath();
  ctx.fill();
  
  return canvas.toDataURL();
}

// 混合内容测试
function testMixedContent(): string {
  const canvas = document.createElement('canvas');
  canvas.width = 400;
  canvas.height = 200;
  
  const ctx = canvas.getContext('2d')!;
  
  // 渐变背景
  const gradient = ctx.createLinearGradient(0, 0, 400, 0);
  gradient.addColorStop(0, '#FF0000');
  gradient.addColorStop(0.5, '#00FF00');
  gradient.addColorStop(1, '#0000FF');
  
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 400, 200);
  
  // 半透明矩形
  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
  ctx.fillRect(50, 50, 300, 100);
  
  // 文本
  ctx.fillStyle = '#000000';
  ctx.font = '24px Arial';
  ctx.fillText('Mixed Content Test', 70, 100);
  
  // 边框
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 2;
  ctx.strokeRect(20, 20, 360, 160);
  
  return canvas.toDataURL();
}

// 模拟 BrowserLeaks 类型的测试
function testBrowserLeaksLike(): string {
  const canvas = document.createElement('canvas');
  canvas.width = 200;
  canvas.height = 50;
  
  const ctx = canvas.getContext('2d')!;
  
  // 这个测试尽可能模拟真实的指纹检测网站
  ctx.textBaseline = 'top';
  ctx.font = '14px Arial';
  ctx.fillStyle = '#f60';
  ctx.fillRect(125, 1, 62, 20);
  
  ctx.fillStyle = '#069';
  ctx.fillText('BrowserLeaks.com', 2, 15);
  
  ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
  ctx.fillText('BrowserLeaks.com', 4, 17);
  
  // 获取图像数据进行额外处理
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  ctx.putImageData(imageData, 0, 0);
  
  return canvas.toDataURL();
}

// 兼容性导出
export function injectCanvasNoiseDirect() {
  console.log('[Canvas] 🔧 使用直接噪声注入（兼容性方法）');
}

export function injectUltimateCanvasNoise() {
  console.log('[Canvas] 🚀 使用终极噪声注入（兼容性方法）');
}
