<template>
  <div class="chat-interface">
    <!-- 聊天区域头部 -->
    <div class="chat-header">
      <div class="current-agent-info">
        <div class="agent-avatar">
          <div class="default-avatar">
            {{ currentAgent.name.charAt(0).toUpperCase() }}
          </div>
        </div>
        <div class="agent-details">
          <h4 class="agent-name">{{ currentAgent.name }}</h4>
          <p class="agent-description">{{ currentAgent.description }}</p>
        </div>
      </div>
      <div class="chat-actions">
        <!-- 连接状态指示器 -->
        <div class="connection-status">
          <span :class="['status-dot', { connected: isConnected }]"></span>
          <span class="status-text">{{ connectionStatus }}</span>
        </div>
        <el-button type="text" icon="el-icon-refresh" @click="clearChat">清空对话</el-button>
      </div>
    </div>

    <!-- 聊天消息区域 -->
    <div ref="messagesContainer" class="chat-messages">
      <!-- 欢迎消息 -->
      <div v-if="messages.length === 0" class="welcome-section">
        <h2 class="welcome-title">{{ currentAgent.name }}</h2>
        <p class="welcome-subtitle">{{ currentAgent.description }}</p>

        <!-- 快捷操作建议 -->
        <div class="quick-actions">
          <h3>💡 试试这些功能:</h3>
          <div class="action-grid">
            <div
              v-for="action in quickActions"
              :key="action.id"
              class="action-card"
              @click="sendQuickMessage(action.message)"
            >
              <i :class="action.icon"></i>
              <span>{{ action.title }}</span>
              <p class="action-desc">{{ action.description }}</p>
            </div>
          </div>
        </div>
      </div>

      <!-- 对话消息列表 -->
      <div v-for="message in messages" :key="message.id" class="message-item">
        <div :class="['message', message.type]">
          <div v-if="message.type !== 'user'" class="message-avatar">
            <div class="avatar-circle" :class="message.type">
              {{ getAvatarText(message.type) }}
            </div>
          </div>

          <div class="message-content">
            <div class="message-bubble" :class="message.type">
              <!-- 工作流状态显示 -->
              <div v-if="message.workflowInfo" class="workflow-info">
                <div class="workflow-header">
                  <i class="el-icon-s-operation"></i>
                  <span>{{ message.workflowInfo.name }}</span>
                  <span class="workflow-status" :class="message.workflowInfo.status">
                    {{ getWorkflowStatusText(message.workflowInfo.status) }}
                  </span>
                </div>
                <div v-if="message.workflowInfo.currentStep" class="current-step">
                  当前步骤: {{ message.workflowInfo.currentStep }}
                </div>
              </div>

              <!-- 步骤执行结果 -->
              <div v-if="message.stepResult" class="step-result">
                <div class="step-header">
                  <i class="el-icon-check"></i>
                  <span>{{ message.stepResult.stepName }}</span>
                  <span
                    class="step-status"
                    :class="message.stepResult.success ? 'success' : 'failed'"
                  >
                    {{ message.stepResult.success ? '✅' : '❌' }}
                  </span>
                </div>
                <div v-if="message.stepResult.data" class="step-data">
                  <pre>{{ formatStepData(message.stepResult.data) }}</pre>
                </div>
              </div>

              <!-- 进度条 -->
              <div v-if="message.progress !== undefined" class="progress-container">
                <div class="progress-bar">
                  <div class="progress-fill" :style="{ width: message.progress + '%' }"></div>
                </div>
                <span class="progress-text">{{ message.progress }}%</span>
              </div>

              <!-- 常规消息文本 -->
              <div v-if="message.content" class="message-text">{{ message.content }}</div>

              <!-- 附件 -->
              <div
                v-if="message.attachments && message.attachments.length > 0"
                class="message-attachments"
              >
                <div v-for="file in message.attachments" :key="file.id" class="attachment-item">
                  <i class="el-icon-document"></i>
                  <span>{{ file.name }}</span>
                </div>
              </div>
            </div>
            <div class="message-time">{{ formatTime(message.timestamp) }}</div>
          </div>
        </div>
      </div>

      <!-- 加载状态 -->
      <div v-if="isLoading" class="message-item">
        <div class="message system">
          <div class="message-avatar">
            <div class="avatar-circle system">
              <i class="el-icon-loading"></i>
            </div>
          </div>
          <div class="message-content">
            <div class="message-bubble system loading">
              <div class="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
              </div>
              <span class="loading-text">正在处理...</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 输入区域 -->
    <div class="chat-input-area">
      <!-- 文件预览区域 -->
      <div v-if="attachedFiles.length > 0" class="attached-files">
        <div v-for="file in attachedFiles" :key="file.id" class="attached-file">
          <div class="file-info">
            <i class="el-icon-document"></i>
            <span class="file-name">{{ file.name }}</span>
            <span class="file-size">({{ formatFileSize(file.size) }})</span>
          </div>
          <el-button
            type="text"
            icon="el-icon-close"
            class="remove-btn"
            @click="removeFile(file.id)"
          />
        </div>
      </div>

      <!-- 输入框区域 -->
      <div class="input-container">
        <div class="input-wrapper">
          <el-input
            ref="messageInput"
            v-model="inputMessage"
            type="textarea"
            :autosize="{ minRows: 1, maxRows: 6 }"
            :placeholder="inputPlaceholder"
            class="message-input"
            :disabled="!isConnected || isLoading"
            @keydown.native.enter.exact.prevent="sendMessage"
            @keydown.native.enter.shift.exact="addNewLine"
          />

          <!-- 输入框内的操作按钮 -->
          <div class="input-actions">
            <!-- 文件上传按钮 -->
            <el-upload
              :show-file-list="false"
              :before-upload="handleFileUpload"
              :auto-upload="false"
              :disabled="!isConnected || isLoading"
              multiple
              class="file-upload"
            >
              <el-button
                type="text"
                icon="el-icon-paperclip"
                class="action-btn upload-btn"
                :disabled="!isConnected || isLoading"
              />
            </el-upload>

            <!-- 发送按钮 -->
            <el-button
              type="primary"
              icon="el-icon-position"
              class="send-btn"
              :disabled="!canSend"
              :loading="isLoading"
              @click="sendMessage"
            />
          </div>
        </div>

        <!-- 底部提示文字 -->
        <div class="input-hint">
          <span class="hint-text">{{ inputHintText }}</span>
          <span class="hint-shortcut">Enter to send, Shift+Enter for new line</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'ChatInterface',
  data() {
    return {
      // WebSocket 连接
      ws: null,
      isConnected: false,
      isLoading: false,
      sessionId: null,

      // 消息相关
      inputMessage: '',
      messages: [],
      attachedFiles: [],

      // Agent 信息
      currentAgent: {
        id: 1,
        name: 'Content Creation Agent',
        description:
          '👋 您好！我可以帮您完成内容创作和发布。支持抖音下载、文案生成、多平台发布等功能。'
      },

      // 快捷操作
      quickActions: [
        {
          id: 1,
          title: '抖音内容创作',
          message: '下载抖音视频并生成旅行文案',
          description: '从抖音链接下载内容，生成相关文案',
          icon: 'el-icon-video-camera'
        },
        {
          id: 2,
          title: '文案生成',
          message: '生成关于非洲旅行的文案',
          description: '基于主题生成高质量文案内容',
          icon: 'el-icon-edit-outline'
        },
        {
          id: 3,
          title: '测试下载',
          message: '帮我下载 https://v.douyin.com/ieFfbDsj/ 的内容',
          description: '测试抖音内容下载功能',
          icon: 'el-icon-download'
        },
        {
          id: 4,
          title: '继续执行',
          message: '继续',
          description: '继续执行当前工作流的下一步',
          icon: 'el-icon-right'
        }
      ]
    }
  },

  computed: {
    canSend() {
      return (
        (this.inputMessage.trim() || this.attachedFiles.length > 0) &&
        this.isConnected &&
        !this.isLoading
      )
    },

    connectionStatus() {
      return this.isConnected ? '已连接' : '连接中...'
    },

    inputPlaceholder() {
      if (!this.isConnected) return '正在连接服务器...'
      if (this.isLoading) return '正在处理中，请等待...'
      return '输入您的需求，比如"下载抖音视频并生成文案"'
    },

    inputHintText() {
      if (!this.isConnected) return '等待连接...'
      return '发送消息给AI助手'
    }
  },

  mounted() {
    this.connectToAgent()

    // 聚焦输入框
    this.$nextTick(() => {
      if (this.$refs.messageInput) {
        this.$refs.messageInput.focus()
      }
    })
  },

  beforeDestroy() {
    this.disconnectFromAgent()
  },

  methods: {
    // WebSocket 连接管理
    connectToAgent() {
      const wsUrl = process.env.VUE_APP_AGENT_WS_URL || 'ws://localhost:3214'
      console.log('连接到Agent服务:', wsUrl)

      this.ws = new WebSocket(wsUrl)

      this.ws.onopen = () => {
        console.log('Agent WebSocket连接成功')
        this.isConnected = true
        this.$message.success('已连接到AI助手')
      }

      this.ws.onmessage = event => {
        const data = JSON.parse(event.data)
        console.log('收到Agent消息:', data)
        this.handleAgentMessage(data)
      }

      this.ws.onclose = () => {
        console.log('Agent WebSocket连接关闭')
        this.isConnected = false
        this.$message.warning('与AI助手的连接已断开')

        // 5秒后重连
        setTimeout(() => {
          if (!this.isConnected) {
            this.connectToAgent()
          }
        }, 5000)
      }

      this.ws.onerror = error => {
        console.error('Agent WebSocket错误:', error)
        this.isConnected = false
        this.$message.error('连接AI助手失败')
      }
    },

    disconnectFromAgent() {
      if (this.ws) {
        this.ws.close()
        this.ws = null
      }
    },

    // 处理Agent消息
    handleAgentMessage(data) {
      switch (data.type) {
        case 'welcome':
          this.sessionId = data.sessionId
          this.addMessage('system', data.message)
          break

        case 'workflow_started':
          this.addMessage('system', `🚀 ${data.message}`, {
            workflowInfo: {
              name: data.workflow,
              status: 'started',
              currentStep: data.next_step?.name
            }
          })
          break

        case 'need_more_info':
        case 'need_clarification':
          this.addMessage('assistant', data.message)
          break

        case 'step_executing':
          this.isLoading = true
          this.addMessage('system', `⚙️ ${data.message}`, {
            progress: data.progress || 0
          })
          break

        case 'step_progress':
          this.updateLastMessageProgress(data.progress, data.message)
          break

        case 'step_completed':
          this.isLoading = false
          this.addMessage('assistant', `✅ ${data.message}`, {
            stepResult: {
              stepName: data.completed_step,
              success: true,
              data: data.result
            }
          })
          break

        case 'workflow_completed':
          this.isLoading = false
          this.addMessage('system', `🎉 ${data.message}`, {
            workflowInfo: {
              name: '工作流',
              status: 'completed'
            }
          })
          if (data.summary) {
            this.addMessage('assistant', data.summary)
          }
          break

        case 'step_failed':
        case 'error':
          this.isLoading = false
          this.addMessage('system', `❌ ${data.message}`, {
            stepResult: {
              stepName: data.step || '未知步骤',
              success: false,
              error: data.error || data.message
            }
          })
          break

        default:
          this.addMessage('system', JSON.stringify(data, null, 2))
      }
    },

    // 消息管理
    addMessage(type, content, extra = {}) {
      const message = {
        id: Date.now() + Math.random(),
        type: type,
        content: content,
        timestamp: Date.now(),
        ...extra
      }

      this.messages.push(message)
      this.$nextTick(() => {
        this.scrollToBottom()
      })
    },

    updateLastMessageProgress(progress, message) {
      const lastMessage = this.messages[this.messages.length - 1]
      if (lastMessage && lastMessage.type === 'system') {
        lastMessage.progress = progress
        if (message) {
          lastMessage.content = message
        }
      }
    },

    // 发送消息
    async sendMessage() {
      if (!this.canSend) return

      const messageContent = this.inputMessage.trim()
      const attachments = [...this.attachedFiles]

      // 添加用户消息
      this.addMessage('user', messageContent, {
        attachments: attachments.length > 0 ? attachments : null
      })

      // 发送到Agent
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(
          JSON.stringify({
            type: 'user_message',
            content: messageContent,
            attachments: attachments
          })
        )
      }

      // 清空输入
      this.inputMessage = ''
      this.attachedFiles = []
    },

    sendQuickMessage(message) {
      this.inputMessage = message
      this.sendMessage()
    },

    addNewLine() {
      this.inputMessage += '\n'
    },

    // 文件管理
    handleFileUpload(file) {
      const maxSize = 10 * 1024 * 1024 // 10MB
      if (file.size > maxSize) {
        this.$message.error('文件大小不能超过 10MB')
        return false
      }

      const fileObj = {
        id: Date.now() + Math.random(),
        name: file.name,
        size: file.size,
        type: file.type,
        file: file
      }

      this.attachedFiles.push(fileObj)
      this.$message.success(`文件 "${file.name}" 已添加`)
      return false
    },

    removeFile(fileId) {
      const index = this.attachedFiles.findIndex(f => f.id === fileId)
      if (index > -1) {
        this.attachedFiles.splice(index, 1)
      }
    },

    // 工具方法
    clearChat() {
      this.$confirm('确定要清空所有对话记录吗？', '提示', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      })
        .then(() => {
          this.messages = []
          this.$message.success('对话已清空')
        })
        .catch(() => {})
    },

    scrollToBottom() {
      const container = this.$refs.messagesContainer
      if (container) {
        container.scrollTop = container.scrollHeight
      }
    },

    formatTime(timestamp) {
      const date = new Date(timestamp)
      const now = new Date()

      if (date.toDateString() === now.toDateString()) {
        return date.toLocaleTimeString('zh-CN', {
          hour: '2-digit',
          minute: '2-digit'
        })
      } else {
        return date.toLocaleString('zh-CN', {
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        })
      }
    },

    formatFileSize(bytes) {
      if (bytes === 0) return '0 B'
      const k = 1024
      const sizes = ['B', 'KB', 'MB', 'GB']
      const i = Math.floor(Math.log(bytes) / Math.log(k))
      return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
    },

    getAvatarText(type) {
      const avatars = {
        assistant: 'A',
        system: 'S',
        user: 'U'
      }
      return avatars[type] || 'S'
    },

    getWorkflowStatusText(status) {
      const statusMap = {
        started: '已启动',
        running: '执行中',
        completed: '已完成',
        failed: '失败'
      }
      return statusMap[status] || status
    },

    formatStepData(data) {
      if (typeof data === 'object') {
        return JSON.stringify(data, null, 2)
      }
      return String(data)
    }
  }
}
</script>

<style lang="scss" scoped>
// 保留原有样式，添加新的样式

.connection-status {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-right: 12px;
  font-size: 12px;

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #dc3545;

    &.connected {
      background: #28a745;
    }
  }

  .status-text {
    color: #6b7280;
  }
}

.workflow-info {
  background: #f8f9fa;
  border-left: 4px solid #007bff;
  padding: 12px;
  margin-bottom: 8px;
  border-radius: 6px;

  .workflow-header {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 500;
    margin-bottom: 4px;

    .workflow-status {
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: normal;

      &.started {
        background: #e3f2fd;
        color: #1976d2;
      }
      &.running {
        background: #fff3e0;
        color: #f57c00;
      }
      &.completed {
        background: #e8f5e8;
        color: #2e7d32;
      }
      &.failed {
        background: #ffebee;
        color: #d32f2f;
      }
    }
  }

  .current-step {
    font-size: 12px;
    color: #666;
  }
}

.step-result {
  background: #f8f9fa;
  border-left: 4px solid #28a745;
  padding: 12px;
  margin-bottom: 8px;
  border-radius: 6px;

  .step-header {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 500;
    margin-bottom: 8px;

    .step-status {
      &.failed {
        color: #dc3545;
      }
    }
  }

  .step-data {
    background: white;
    padding: 8px;
    border-radius: 4px;
    border: 1px solid #dee2e6;

    pre {
      margin: 0;
      font-family: 'Monaco', 'Menlo', monospace;
      font-size: 12px;
      white-space: pre-wrap;
      word-break: break-word;
      max-height: 200px;
      overflow-y: auto;
    }
  }
}

.progress-container {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 8px 0;

  .progress-bar {
    flex: 1;
    height: 4px;
    background: #e9ecef;
    border-radius: 2px;
    overflow: hidden;

    .progress-fill {
      height: 100%;
      background: #007bff;
      transition: width 0.3s ease;
    }
  }

  .progress-text {
    font-size: 12px;
    color: #6c757d;
    min-width: 35px;
  }
}

.message-bubble {
  &.system {
    background: #e3f2fd;
    border-left: 4px solid #2196f3;

    &.loading {
      display: flex;
      align-items: center;
      gap: 8px;

      .loading-text {
        font-size: 14px;
        color: #666;
      }
    }
  }
}

.avatar-circle {
  &.system {
    background: #2196f3;
  }

  &.assistant {
    background: #28a745;
  }
}

.action-grid {
  .action-card {
    .action-desc {
      margin: 4px 0 0 0;
      font-size: 12px;
      color: #6b7280;
      line-height: 1.3;
    }
  }
}

.quick-actions {
  h3 {
    color: #374151;
    font-size: 16px;
    margin-bottom: 16px;
    text-align: left;
  }
}

// 保留所有原有样式...
.chat-interface {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #ffffff;
}

.chat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  border-bottom: 1px solid #e5e7eb;
  background: #ffffff;

  .current-agent-info {
    display: flex;
    align-items: center;

    .agent-avatar {
      width: 40px;
      height: 40px;
      margin-right: 12px;

      .default-avatar {
        width: 100%;
        height: 100%;
        background: #5e31d8;
        color: white;
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 600;
        font-size: 16px;
      }
    }

    .agent-details {
      .agent-name {
        margin: 0 0 4px 0;
        font-size: 16px;
        font-weight: 600;
        color: #1f2937;
      }

      .agent-description {
        margin: 0;
        font-size: 12px;
        color: #6b7280;
        line-height: 1.4;
      }
    }
  }

  .chat-actions {
    display: flex;
    align-items: center;

    ::v-deep .el-button {
      color: #6b7280;

      &:hover {
        color: #5e31d8;
      }
    }
  }
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 0;
  scroll-behavior: smooth;
}

.welcome-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 60px 40px;
  min-height: 400px;

  .welcome-title {
    font-size: 32px;
    font-weight: 600;
    color: #1f2937;
    margin: 0 0 12px 0;
  }

  .welcome-subtitle {
    font-size: 16px;
    color: #6b7280;
    margin: 0 0 40px 0;
    max-width: 500px;
    line-height: 1.5;
  }

  .quick-actions {
    width: 100%;
    max-width: 600px;

    .action-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;

      .action-card {
        padding: 20px;
        border: 1px solid #e5e7eb;
        border-radius: 12px;
        cursor: pointer;
        transition: all 0.2s;
        background: #ffffff;
        text-align: left;

        &:hover {
          border-color: #5e31d8;
          box-shadow: 0 4px 12px rgba(94, 49, 216, 0.15);
          transform: translateY(-2px);
        }

        i {
          font-size: 24px;
          color: #5e31d8;
          margin-bottom: 8px;
          display: block;
        }

        span {
          font-size: 14px;
          font-weight: 500;
          color: #374151;
          display: block;
        }
      }
    }
  }
}

.message-item {
  padding: 12px 24px;

  .message {
    display: flex;
    align-items: flex-start;
    max-width: 100%;

    &.user {
      flex-direction: row-reverse;

      .message-content {
        margin-right: 12px;
        margin-left: 0;

        .message-bubble {
          background: #5e31d8;
          color: white;
          border-radius: 18px 18px 4px 18px;
        }
      }
    }

    &.assistant,
    &.system {
      .message-content {
        margin-left: 12px;

        .message-bubble {
          background: #f3f4f6;
          color: #1f2937;
          border-radius: 18px 18px 18px 4px;

          &.loading {
            padding: 12px 16px;
          }
        }
      }
    }

    .message-avatar {
      width: 32px;
      height: 32px;
      flex-shrink: 0;

      .avatar-circle {
        width: 100%;
        height: 100%;
        color: white;
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 600;
        font-size: 12px;
      }
    }

    .message-content {
      flex: 1;
      min-width: 0;

      .message-bubble {
        padding: 12px 16px;
        word-wrap: break-word;
        line-height: 1.5;
        font-size: 14px;

        .message-attachments {
          margin-bottom: 8px;

          .attachment-item {
            display: inline-flex;
            align-items: center;
            background: rgba(255, 255, 255, 0.2);
            padding: 4px 8px;
            border-radius: 6px;
            margin-right: 8px;
            margin-bottom: 4px;
            font-size: 12px;

            i {
              margin-right: 4px;
            }
          }
        }

        .message-text {
          white-space: pre-wrap;
        }
      }

      .message-time {
        font-size: 11px;
        color: #9ca3af;
        margin-top: 4px;
        text-align: right;
      }
    }
  }

  .user .message-content .message-time {
    text-align: left;
  }
}

.typing-indicator {
  display: flex;
  align-items: center;
  gap: 4px;

  span {
    width: 6px;
    height: 6px;
    background: #9ca3af;
    border-radius: 50%;
    animation: typing 1.4s infinite ease-in-out;

    &:nth-child(2) {
      animation-delay: 0.2s;
    }

    &:nth-child(3) {
      animation-delay: 0.4s;
    }
  }
}

@keyframes typing {
  0%,
  80%,
  100% {
    opacity: 0.3;
    transform: scale(0.8);
  }

  40% {
    opacity: 1;
    transform: scale(1);
  }
}

.chat-input-area {
  padding: 16px 24px 24px;
  background: #ffffff;
  border-top: 1px solid #e5e7eb;

  .attached-files {
    margin-bottom: 12px;

    .attached-file {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: #f3f4f6;
      padding: 8px 12px;
      border-radius: 8px;
      margin-bottom: 8px;

      .file-info {
        display: flex;
        align-items: center;
        flex: 1;

        i {
          margin-right: 8px;
          color: #6b7280;
        }

        .file-name {
          font-size: 14px;
          color: #374151;
          margin-right: 8px;
        }

        .file-size {
          font-size: 12px;
          color: #9ca3af;
        }
      }

      .remove-btn {
        color: #ef4444;

        &:hover {
          background: #fee2e2;
        }
      }
    }
  }

  .input-container {
    .input-wrapper {
      position: relative;
      display: flex;
      align-items: flex-end;
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      transition: all 0.2s;

      &:focus-within {
        border-color: #5e31d8;
        box-shadow: 0 0 0 3px rgba(94, 49, 216, 0.1);
      }

      .message-input {
        flex: 1;
        border: none;
        background: transparent;

        ::v-deep .el-textarea__inner {
          border: none;
          background: transparent;
          padding: 12px 16px;
          resize: none;
          font-size: 14px;
          line-height: 1.5;

          &:focus {
            box-shadow: none;
          }

          &::placeholder {
            color: #9ca3af;
          }

          &:disabled {
            color: #9ca3af;
            cursor: not-allowed;
          }
        }
      }

      .input-actions {
        display: flex;
        align-items: flex-end;
        gap: 4px;
        padding: 8px 12px;

        .action-btn {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #6b7280;
          border: none;
          background: transparent;
          transition: all 0.2s;

          &:hover:not(:disabled) {
            background: #e5e7eb;
            color: #374151;
          }

          &:disabled {
            opacity: 0.5;
            cursor: not-allowed;
          }
        }

        .file-upload {
          ::v-deep .el-upload {
            .el-button {
              width: 32px;
              height: 32px;
              border-radius: 8px;
              border: none;
              background: transparent;
              color: #6b7280;
              padding: 0;

              &:hover:not(:disabled) {
                background: #e5e7eb;
                color: #374151;
              }

              &:disabled {
                opacity: 0.5;
                cursor: not-allowed;
              }
            }
          }
        }

        .send-btn {
          background: #5e31d8;
          border-color: #5e31d8;
          color: white;

          &:hover:not(:disabled) {
            background: #6d42e0;
            border-color: #6d42e0;
          }

          &:disabled {
            background: #d1d5db;
            border-color: #d1d5db;
            cursor: not-allowed;
          }
        }
      }
    }

    .input-hint {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 8px;
      padding: 0 4px;

      .hint-text {
        font-size: 12px;
        color: #9ca3af;
        opacity: 0.6;
      }

      .hint-shortcut {
        font-size: 11px;
        color: #d1d5db;
      }
    }
  }
}

// 滚动条样式
.chat-messages::-webkit-scrollbar {
  width: 6px;
}

.chat-messages::-webkit-scrollbar-track {
  background: transparent;
}

.chat-messages::-webkit-scrollbar-thumb {
  background: #d1d5db;
  border-radius: 3px;
}

.chat-messages::-webkit-scrollbar-thumb:hover {
  background: #9ca3af;
}

// 响应式设计
@media (max-width: 768px) {
  .chat-header {
    padding: 12px 16px;

    .current-agent-info {
      .agent-avatar {
        width: 32px;
        height: 32px;
        margin-right: 8px;

        .default-avatar {
          border-radius: 8px;
          font-size: 14px;
        }
      }

      .agent-details {
        .agent-name {
          font-size: 14px;
        }

        .agent-description {
          font-size: 11px;
        }
      }
    }
  }

  .welcome-section {
    padding: 40px 20px;
    min-height: 300px;

    .welcome-title {
      font-size: 24px;
    }

    .welcome-subtitle {
      font-size: 14px;
    }

    .quick-actions .action-grid {
      grid-template-columns: 1fr;
      gap: 12px;

      .action-card {
        padding: 16px;
      }
    }
  }

  .message-item {
    padding: 8px 16px;
  }

  .chat-input-area {
    padding: 12px 16px 16px;
  }
}
</style>
