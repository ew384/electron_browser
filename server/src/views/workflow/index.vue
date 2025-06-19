<template>
  <div class="workflow-container">
    <!-- 使用包装器来更好地控制 iframe -->
    <div ref="iframeWrapper" class="iframe-wrapper">
      <div ref="iframeContainer" class="iframe-container">
        <iframe
          ref="workflowFrame"
          src="http://localhost:3210"
          frameborder="0"
          :scrolling="allowScrolling ? 'yes' : 'auto'"
          @load="onIframeLoad"
          @error="onIframeError"
        />
      </div>
      <!-- 加载状态 -->
      <div v-if="loading" class="loading-overlay">
        <i class="el-icon-loading"></i>
        <span>正在加载工作流配置界面...</span>
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
  name: 'WorkflowConfig',
  data() {
    return {
      loading: true,
      error: null,
      allowScrolling: false, // 🔥 改为 false，禁用iframe滚动
      containerHeight: 0,
      iframeHeight: 0,
      contentHeight: 0,
      showDebugInfo: false,
      resizeObserver: null,
      heightCheckInterval: null
    }
  },
  mounted() {
    // 5秒后如果还在加载，显示错误信息
    setTimeout(() => {
      if (this.loading) {
        this.loading = false
        this.error = 'RPA工作流服务可能未启动，请确保rpa-platform可访问'
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
        console.log('容器高度:', this.containerHeight)
      }
    },

    setIframeHeight() {
      const container = this.$refs.iframeContainer
      const iframe = this.$refs.workflowFrame

      if (container && iframe) {
        // 让iframe占满容器，高度由CSS控制
        container.style.height = '100%'
        container.style.width = '100%'
        iframe.style.height = '100%'
        iframe.style.width = '100%'

        console.log('iframe设置完成')
      }
    },

    async checkContentHeight() {
      const iframe = this.$refs.workflowFrame
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
            console.log('检测到内容高度变化:', contentHeight)
          }
        }
      } catch (error) {
        // 跨域限制，无法访问iframe内容
        console.log('无法访问iframe内容（跨域限制）')
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
      console.log('工作流配置界面加载完成')

      // iframe加载完成后进行样式修复
      setTimeout(() => {
        this.fixIframeLayout()
        this.setIframeHeight()
        this.checkContentHeight()
      }, 500)

      // 监听iframe内部的消息
      this.setupMessageListener()
    },

    // 🔥 新增：修复iframe布局的方法
    fixIframeLayout() {
      const iframe = this.$refs.workflowFrame
      if (!iframe || !iframe.contentWindow) return

      try {
        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document
        if (iframeDoc) {
          // 检查是否已经注入过样式
          if (!iframeDoc.getElementById('rpa-layout-fix')) {
            const style = iframeDoc.createElement('style')
            style.id = 'rpa-layout-fix'
            style.textContent = `
              /* 确保RPA平台的布局在iframe中正确显示 */
              body {
                margin: 0 !important;
                padding: 0 !important;
                overflow: hidden !important;
              }
              
              /* 确保主容器占满iframe */
              .h-screen {
                height: 100vh !important;
                min-height: 100vh !important;
              }
              
              /* 确保顶部导航固定 */
              header {
                position: sticky !important;
                top: 0 !important;
                z-index: 1000 !important;
                background: white !important;
                box-shadow: 0 1px 3px rgba(0,0,0,0.1) !important;
              }
              
              /* 确保主内容区域可以滚动 */
              main {
                overflow-y: auto !important;
                height: calc(100vh - 64px) !important; /* 减去header高度 */
              }
              
              /* 禁用整体页面滚动 */
              html, body {
                overflow: hidden !important;
              }
            `
            iframeDoc.head.appendChild(style)
            console.log('✅ RPA布局修复样式已注入')
          }
        }
      } catch (error) {
        console.log('❌ 无法注入布局修复样式（跨域限制）:', error)
      }
    },

    onIframeError() {
      this.loading = false
      this.error = '无法加载工作流配置界面'
    },

    setupMessageListener() {
      // 监听来自iframe的消息
      window.addEventListener('message', event => {
        if (event.origin !== 'http://localhost:3210') return

        // 处理高度调整消息
        if (event.data.type === 'resize') {
          const { height } = event.data
          if (height) {
            console.log('收到iframe高度调整消息:', height)
          }
        }
      })
    },

    reloadIframe() {
      this.loading = true
      this.error = null
      const iframe = this.$refs.workflowFrame
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
.workflow-container {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  background: #f5f5f5;
  overflow: hidden;
  /* 🔥 确保外层不滚动 */
}

.iframe-wrapper {
  flex: 1;
  position: relative;
  margin: 0;
  padding: 0;
  overflow: hidden;
  /* 🔥 禁止wrapper滚动 */
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
  /* 🔥 让iframe内部处理滚动 */
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
</style>
