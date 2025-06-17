<template>
  <div class="workflow-container">
    <div class="workflow-header">
      <h2>多平台发布工作流配置</h2>
      <p>通过此界面配置视频自动化发布到微信视频号、抖音等平台的工作流</p>
    </div>

    <!-- 使用包装器来更好地控制 iframe -->
    <div class="iframe-wrapper">
      <div class="iframe-container">
        <iframe
          ref="workflowFrame"
          src="http://localhost:3000"
          frameborder="0"
          scrolling="no"
          @load="onIframeLoad"
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
  </div>
</template>

<script>
export default {
  name: 'WorkflowConfig',
  data() {
    return {
      loading: true,
      error: null
    }
  },
  mounted() {
    // 5秒后如果还在加载，显示错误信息
    setTimeout(() => {
      if (this.loading) {
        this.loading = false
        this.error = 'RPA工作流服务可能未启动，请确保 http://localhost:3000 可访问'
      }
    }, 5000)

    // 页面挂载后调整iframe高度
    this.$nextTick(() => {
      this.fixIframeHeight()
    })

    // 监听窗口大小变化
    window.addEventListener('resize', this.fixIframeHeight)
  },

  beforeDestroy() {
    // 组件销毁前移除事件监听器
    window.removeEventListener('resize', this.fixIframeHeight)
  },

  methods: {
    fixIframeHeight() {
      const wrapper = this.$el.querySelector('.iframe-wrapper')
      const container = this.$el.querySelector('.iframe-container')

      if (wrapper && container) {
        const wrapperHeight = wrapper.offsetHeight
        // 给iframe容器设置一个稍微大一点的高度，覆盖底部白边
        const extraHeight = 50 // 额外增加的高度，可以调整这个值
        container.style.height = `${(wrapperHeight + extraHeight) / 0.85}px`
        console.log('调整iframe高度:', wrapperHeight, '->', (wrapperHeight + extraHeight) / 0.85)
      }
    },

    onIframeLoad() {
      this.loading = false
      this.error = null
      console.log('工作流配置界面加载完成')

      // iframe加载完成后再次调整高度
      setTimeout(() => {
        this.fixIframeHeight()
      }, 200)
    },

    reloadIframe() {
      this.loading = true
      this.error = null
      // 修复 ESLint 错误：通过重新设置URL来重新加载
      const iframe = this.$refs.workflowFrame
      const currentSrc = iframe.src
      iframe.src = ''
      this.$nextTick(() => {
        iframe.src = currentSrc
      })
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
}

.workflow-header {
  padding: 20px;
  background: white;
  border-bottom: 1px solid #e6e6e6;
  flex-shrink: 0;
}

.workflow-header h2 {
  margin: 0 0 8px 0;
  color: #303133;
  font-size: 18px;
}

.workflow-header p {
  margin: 0;
  color: #606266;
  font-size: 14px;
}

.iframe-wrapper {
  flex: 1;
  position: relative;
  margin: 0;
  padding: 0;
  overflow: hidden;
  background: white;
}

.iframe-container {
  position: absolute;
  top: 0;
  left: 0;
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
  zoom: 0.85;
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
</style>
