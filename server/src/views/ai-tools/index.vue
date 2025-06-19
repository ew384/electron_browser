<template>
  <div class="ai-tools-container">
    <!-- 使用包装器来更好地控制 iframe -->
    <div ref="iframeWrapper" class="iframe-wrapper">
      <div ref="iframeContainer" class="iframe-container">
        <iframe
          ref="aiToolsFrame"
          :src="aiToolsUrl"
          frameborder="0"
          :scrolling="allowScrolling ? 'yes' : 'auto'"
          @load="onIframeLoad"
          @error="onIframeError"
        />
      </div>
      <!-- 加载状态 -->
      <div v-if="loading" class="loading-overlay">
        <i class="el-icon-loading"></i>
        <span>正在加载AI工具平台...</span>
      </div>
      <!-- 错误状态 -->
      <div v-if="error" class="error-overlay">
        <i class="el-icon-warning"></i>
        <span>{{ error }}</span>
        <el-button type="primary" size="small" @click="reloadIframe">重新加载</el-button>
      </div>
    </div>

    <!-- 调试信息 (开发环境可见) -->
    <div v-if="showDebugInfo" class="debug-info">
      <p>容器高度: {{ containerHeight }}px</p>
      <p>iframe高度: {{ iframeHeight }}px</p>
      <p>内容高度: {{ contentHeight }}px</p>
      <button @click="recalculateHeight">重新计算高度</button>
      <button @click="toggleScrolling">切换滚动模式: {{ allowScrolling ? '启用' : '禁用' }}</button>
    </div>
  </div>
</template>

<script>
export default {
  name: 'AiToolsConfig',
  data() {
    return {
      loading: true,
      error: null,
      allowScrolling: true, // 允许iframe滚动
      containerHeight: 0,
      iframeHeight: 0,
      contentHeight: 0,
      showDebugInfo: false, // 关闭调试信息显示
      resizeObserver: null,
      heightCheckInterval: null
    }
  },
  computed: {
    // 判断是否为开发环境
    isDevelopment() {
      return (
        process.env.NODE_ENV === 'development' ||
        location.hostname === 'localhost' ||
        location.hostname === '127.0.0.1'
      )
    },

    // 根据环境自动切换URL
    aiToolsUrl() {
      return this.isDevelopment ? 'http://localhost:9001' : 'https://aitools.181901.xyz/'
    }
  },
  mounted() {
    // 5秒后如果还在加载，显示错误信息
    setTimeout(() => {
      if (this.loading) {
        this.loading = false
        this.error = 'AI工具平台服务可能未启动，请确保localhost:9001可访问'
      }
    }, 5000)

    this.$nextTick(() => {
      this.initializeIframe()
    })

    // 监听窗口大小变化
    window.addEventListener('resize', this.handleWindowResize)

    // 使用ResizeObserver监听容器大小变化（更精确）
    if (window.ResizeObserver) {
      this.resizeObserver = new ResizeObserver(this.handleContainerResize)
      this.resizeObserver.observe(this.$refs.iframeWrapper)
    }
  },

  beforeDestroy() {
    // 清理事件监听器和定时器
    window.removeEventListener('resize', this.handleWindowResize)
    if (this.resizeObserver) {
      this.resizeObserver.disconnect()
    }
    if (this.heightCheckInterval) {
      clearInterval(this.heightCheckInterval)
    }
  },

  methods: {
    initializeIframe() {
      this.calculateContainerHeight()
      this.setIframeHeight()

      // 定期检查内容高度变化
      this.heightCheckInterval = setInterval(() => {
        this.checkContentHeight()
      }, 2000)
    },

    calculateContainerHeight() {
      const wrapper = this.$refs.iframeWrapper
      if (wrapper) {
        const rect = wrapper.getBoundingClientRect()
        this.containerHeight = rect.height
        console.log('AI工具平台容器高度:', this.containerHeight)
      }
    },

    setIframeHeight() {
      const container = this.$refs.iframeContainer
      const iframe = this.$refs.aiToolsFrame

      if (container && iframe) {
        // 让iframe占满容器，高度由CSS控制
        container.style.height = '100%'
        container.style.width = '100%'
        iframe.style.height = '100%'
        iframe.style.width = '100%'

        console.log('AI工具平台iframe设置完成')
      }
    },

    async checkContentHeight() {
      const iframe = this.$refs.aiToolsFrame
      if (!iframe || !iframe.contentWindow) return

      try {
        // 尝试获取iframe内容的实际高度
        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document
        if (iframeDoc) {
          const body = iframeDoc.body
          const html = iframeDoc.documentElement

          const contentHeight = Math.max(
            body?.scrollHeight || 0,
            body?.offsetHeight || 0,
            html?.clientHeight || 0,
            html?.scrollHeight || 0,
            html?.offsetHeight || 0
          )

          if (contentHeight > 0 && contentHeight !== this.contentHeight) {
            this.contentHeight = contentHeight
            console.log('检测到AI工具平台内容高度变化:', contentHeight)

            // 根据内容高度调整iframe高度
            if (contentHeight > this.iframeHeight) {
              this.adjustIframeHeight(contentHeight)
            }
          }
        }
      } catch (error) {
        // 跨域限制，无法访问iframe内容
        console.log('无法访问iframe内容（跨域限制）')
      }
    },

    adjustIframeHeight(targetHeight) {
      const container = this.$refs.iframeContainer
      const iframe = this.$refs.aiToolsFrame

      if (container && iframe) {
        const scale = 0.85
        const newHeight = Math.max((targetHeight + 100) / scale, this.containerHeight / scale)
        container.style.height = `${newHeight}px`
        iframe.style.height = `${newHeight}px`
        this.iframeHeight = newHeight

        console.log('调整AI工具平台iframe高度至 (缩放后):', newHeight)
      }
    },

    handleWindowResize() {
      // 防抖处理
      clearTimeout(this.resizeTimer)
      this.resizeTimer = setTimeout(() => {
        this.calculateContainerHeight()
        this.setIframeHeight()
      }, 300)
    },

    handleContainerResize(entries) {
      for (const entry of entries) {
        const { height } = entry.contentRect
        if (height !== this.containerHeight) {
          this.containerHeight = height
          this.setIframeHeight()
        }
      }
    },

    onIframeLoad() {
      this.loading = false
      this.error = null
      console.log('AI工具平台加载完成')

      // iframe加载完成后调整高度
      setTimeout(() => {
        this.setIframeHeight()
        this.checkContentHeight()
      }, 500)

      // 监听iframe内部的消息（如果AI工具平台支持）
      this.setupMessageListener()
    },

    onIframeError() {
      this.loading = false
      this.error = '无法加载AI工具平台'
    },

    setupMessageListener() {
      // 监听来自iframe的消息
      window.addEventListener('message', event => {
        // 根据当前使用的URL判断origin
        const allowedOrigin = this.isDevelopment
          ? 'http://localhost:9001'
          : 'https://aitools.181901.xyz'

        if (event.origin !== allowedOrigin) return
        // 处理高度调整消息
        if (event.data.type === 'resize') {
          const { height } = event.data
          if (height) {
            this.adjustIframeHeight(height)
          }
        }
      })
    },

    reloadIframe() {
      this.loading = true
      this.error = null
      const iframe = this.$refs.aiToolsFrame
      const currentSrc = iframe.src
      iframe.src = ''
      this.$nextTick(() => {
        iframe.src = currentSrc
      })
    },

    // 调试方法
    recalculateHeight() {
      this.calculateContainerHeight()
      this.setIframeHeight()
      this.checkContentHeight()
    },

    toggleScrolling() {
      this.allowScrolling = !this.allowScrolling
    }
  }
}
</script>

<style scoped>
.ai-tools-container {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  background: #f5f5f5;
  overflow: hidden;
}

.iframe-wrapper {
  flex: 1;
  position: relative;
  margin: 0;
  padding: 0;
  overflow: hidden;
  /* 改为hidden，让iframe自己处理滚动 */
  background: white;
}

.iframe-container {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  width: 100%;
  height: 100%;
}

.iframe-container iframe {
  width: 100%;
  height: 100%;
  border: none;
  margin: 0;
  padding: 0;
  display: block;
}

.loading-overlay,
.error-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.9);
  z-index: 10;
}

.loading-overlay i {
  font-size: 24px;
  color: #409eff;
  margin-bottom: 12px;
}

.error-overlay i {
  font-size: 24px;
  color: #f56c6c;
  margin-bottom: 12px;
}

.loading-overlay span,
.error-overlay span {
  color: #606266;
  margin-bottom: 12px;
}

/* 调试信息样式 */
.debug-info {
  position: fixed;
  top: 10px;
  right: 10px;
  background: rgba(0, 0, 0, 0.8);
  color: white;
  padding: 10px;
  border-radius: 5px;
  font-size: 12px;
  z-index: 1000;
}

.debug-info button {
  margin: 2px;
  padding: 2px 5px;
  font-size: 10px;
}

/* 确保iframe可以正常滚动 */
.iframe-wrapper::-webkit-scrollbar {
  width: 8px;
}

.iframe-wrapper::-webkit-scrollbar-track {
  background: #f1f1f1;
}

.iframe-wrapper::-webkit-scrollbar-thumb {
  background: #c1c1c1;
  border-radius: 4px;
}

.iframe-wrapper::-webkit-scrollbar-thumb:hover {
  background: #a8a8a8;
}
</style>
