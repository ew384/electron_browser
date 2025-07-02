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
        <el-button type="text" icon="el-icon-refresh" @click="clearChat">清空对话</el-button>
      </div>
    </div>

    <!-- 聊天消息区域 -->
    <div ref="messagesContainer" class="chat-messages">
      <!-- 欢迎消息 -->
      <div v-if="!hasUserInteracted" class="welcome-section">
        <h2 class="welcome-title">{{ currentAgent.name }}</h2>
        <p class="welcome-subtitle">{{ currentAgent.description }}</p>
        <!-- 🆕 添加这部分 -->
        <div v-if="systemWelcomeMessage" class="system-welcome-message">
          <div class="welcome-message-bubble">
            {{ systemWelcomeMessage }}
          </div>
        </div>
        <!-- 快捷操作建议 -->
        <div class="quick-actions">
          <div class="action-grid">
            <div
              v-for="action in quickActions"
              :key="action.id"
              class="action-card"
              @click="sendQuickMessage(action.message)"
            >
              <i :class="action.icon"></i>
              <span>{{ action.title }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 对话消息列表 -->
      <template v-if="hasUserInteracted">
        <div v-for="message in messages" :key="message.id" class="message-item">
          <div :class="['message', message.type]">
            <div v-if="message.type === 'assistant'" class="message-avatar">
              <div class="avatar-circle">
                {{ currentAgent.name.charAt(0).toUpperCase() }}
              </div>
            </div>

            <div class="message-content">
              <div class="message-bubble">
                <div
                  v-if="message.attachments && message.attachments.length > 0"
                  class="message-attachments"
                >
                  <div v-for="file in message.attachments" :key="file.id" class="attachment-item">
                    <i class="el-icon-document"></i>
                    <span>{{ file.name }}</span>
                  </div>
                </div>
                <div class="message-text">{{ message.content }}</div>
              </div>
              <div class="message-time">{{ formatTime(message.timestamp) }}</div>
            </div>
          </div>
        </div>
      </template>
      <!-- 加载状态 -->
      <div v-if="isLoading" class="message-item">
        <div class="message assistant">
          <div class="message-avatar">
            <div class="avatar-circle">
              {{ currentAgent.name.charAt(0).toUpperCase() }}
            </div>
          </div>
          <div class="message-content">
            <div class="message-bubble loading">
              <div class="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
              </div>
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
            placeholder="Send a message"
            class="message-input"
            @keydown.native.enter.exact.prevent="sendMessage"
            @keydown.native.enter.shift.exact="addNewLine"
          />

          <!-- 输入框内的操作按钮 -->
          <div class="input-actions">
            <!-- 文件上传按钮 -->
            <el-upload
              action="#"
              :show-file-list="false"
              :before-upload="handleFileUpload"
              :auto-upload="false"
              multiple
              class="file-upload"
            >
              <el-button
                type="text"
                icon="el-icon-paperclip"
                class="action-btn upload-btn"
                :disabled="isLoading"
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
          <span class="hint-text">Send a message</span>
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
      inputMessage: '',
      messages: [],
      attachedFiles: [],
      isLoading: false,
      hasUserInteracted: false, // 🆕 添加这一行
      systemWelcomeMessage: '', // 🆕 添加这一行
      currentAgent: {
        id: 1,
        name: 'Browser Agent',
        description: '您好！我可以帮您完成内容创作和发布。'
      },
      quickActions: [
        {
          id: 1,
          title: '回复评论',
          message: '请帮我批量回复平台评论',
          icon: 'el-icon-edit'
        },
        {
          id: 2,
          title: '一键发布',
          message: '请帮我一键发布我的视频到各自媒体平台',
          icon: 'el-icon-view'
        },
        {
          id: 3,
          title: '创建工作流',
          message: '能帮我自动创建工作流吗',
          icon: 'el-icon-question'
        },
        {
          id: 4,
          title: '创意构思',
          message: '帮我想一些创意点子',
          icon: 'el-icon-magic-stick'
        }
      ],
      isConnected: false, // 添加连接状态
      ws: null, // WebSocket实例
      sessionId: null // 会话ID
    }
  },
  computed: {
    canSend() {
      return (
        (this.inputMessage.trim() || this.attachedFiles.length > 0) &&
        this.isConnected &&
        !this.isLoading
      ) // 🆕 添加连接状态检查
    }
  },

  mounted() {
    this.connectToAgent()
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
    // 🆕 添加WebSocket连接方法
    connectToAgent() {
      const wsUrl = process.env.VUE_APP_AGENT_WS_URL || 'ws://localhost:3214'
      console.log('连接到Agent服务:', wsUrl)

      try {
        this.ws = new WebSocket(wsUrl)

        this.ws.onopen = () => {
          console.log('Agent WebSocket连接成功')
          this.isConnected = true
          this.$message.success('已连接到AI助手')
        }

        this.ws.onmessage = event => {
          try {
            const data = JSON.parse(event.data)
            console.log('收到Agent消息:', data)
            this.handleAgentMessage(data)
          } catch (e) {
            console.error('解析Agent消息失败:', e, event.data)
          }
        }

        this.ws.onclose = event => {
          console.log('Agent WebSocket连接关闭', event.code, event.reason)
          this.isConnected = false

          // 只有在非正常关闭时才显示警告
          if (event.code !== 1000) {
            this.$message.warning('与AI助手连接断开')
          }

          // 5秒后重连
          setTimeout(() => {
            if (!this.isConnected) {
              console.log('尝试重新连接...')
              this.connectToAgent()
            }
          }, 5000)
        }

        this.ws.onerror = error => {
          console.error('Agent WebSocket错误:', error)
          this.isConnected = false
          this.$message.error('连接AI助手失败')
        }
      } catch (error) {
        console.error('创建WebSocket连接失败:', error)
        this.isConnected = false
        this.$message.error('无法创建WebSocket连接')
      }
    },

    disconnectFromAgent() {
      if (this.ws) {
        this.ws.close()
        this.ws = null
      }
    },

    // 🆕 处理Agent消息
    handleAgentMessage(data) {
      switch (data.type) {
        case 'welcome':
          this.sessionId = data.sessionId
          this.systemWelcomeMessage = data.message // 🆕 存储欢迎消息
          break

        case 'workflow_started':
          this.hasUserInteracted = true // 🆕 标记用户已交互
          this.addAssistantMessage(`🚀 ${data.message}`)
          break

        case 'need_more_info':
        case 'need_clarification':
          this.hasUserInteracted = true // 🆕 标记用户已交互
          this.addAssistantMessage(data.message)
          break

        case 'step_executing':
          this.hasUserInteracted = true // 🆕 标记用户已交互
          this.isLoading = true
          this.addAssistantMessage(`⚙️ ${data.message}`)
          break

        case 'step_completed':
          this.hasUserInteracted = true // 🆕 标记用户已交互
          this.isLoading = false
          this.addAssistantMessage(`✅ ${data.message}`)
          break

        case 'workflow_completed':
          this.hasUserInteracted = true // 🆕 标记用户已交互
          this.isLoading = false
          this.addAssistantMessage(`🎉 ${data.message}`)
          if (data.summary) {
            this.addAssistantMessage(data.summary)
          }
          break

        case 'step_failed':
        case 'error':
          this.hasUserInteracted = true // 🆕 标记用户已交互
          this.isLoading = false
          this.addAssistantMessage(`❌ ${data.message}`)
          break

        default:
          this.hasUserInteracted = true // 🆕 标记用户已交互
          this.addAssistantMessage(JSON.stringify(data, null, 2))
      }
    },

    // 🆕 添加助手消息的辅助方法
    addAssistantMessage(content) {
      const message = {
        id: Date.now() + Math.random(),
        type: 'assistant',
        content: content,
        timestamp: Date.now()
      }

      this.messages.push(message)
      this.$nextTick(() => {
        this.scrollToBottom()
      })
    },

    // 🆕 修改发送消息方法
    async sendMessage() {
      if (!this.canSend) return
      this.hasUserInteracted = true
      const messageContent = this.inputMessage.trim()
      const attachments = [...this.attachedFiles]

      // 创建用户消息（保持原有UI）
      const userMessage = {
        id: Date.now(),
        type: 'user',
        content: messageContent,
        attachments: attachments.length > 0 ? attachments : null,
        timestamp: Date.now()
      }

      this.messages.push(userMessage)

      // 🆕 发送到Agent
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

      // 滚动到底部
      this.$nextTick(() => {
        this.scrollToBottom()
      })
    },

    // 其他方法保持不变...
    sendQuickMessage(message) {
      this.hasUserInteracted = true
      this.inputMessage = message
      this.sendMessage()
    },

    addNewLine() {
      this.inputMessage += '\n'
    },

    handleFileUpload(file) {
      const maxSize = 10 * 1024 * 1024
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

    clearChat() {
      this.$confirm('确定要清空所有对话记录吗？', '提示', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      })
        .then(() => {
          this.messages = []
          this.hasUserInteracted = false
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
    }
  }
}
</script>

<style lang="scss" scoped>
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
  .system-welcome-message {
    margin: 20px 0 30px 0;
    display: flex;
    justify-content: center;

    .welcome-message-bubble {
      background: #f8f9fa;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      padding: 16px 20px;
      max-width: 600px;
      color: #374151;
      font-size: 14px;
      line-height: 1.6;
      text-align: left;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
      white-space: pre-line;
    }
  }
  .welcome-avatar {
    margin-bottom: 24px;

    .avatar-circle {
      width: 80px;
      height: 80px;
      background: linear-gradient(135deg, #5e31d8, #6d42e0);
      color: white;
      border-radius: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 600;
      font-size: 32px;
      box-shadow: 0 8px 25px rgba(94, 49, 216, 0.3);
    }
  }

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
        }
      }
    }
  }
}

.message-item {
  display: flex;
  align-items: flex-start;
  padding: 12px 24px;
  margin-bottom: 16px; // 增加消息间距

  .message {
    display: flex;
    align-items: flex-start;
    max-width: 85%; // 限制最大宽度为85%，而不是100%
    width: fit-content; // 🆕 关键：让宽度自适应内容

    &.user {
      flex-direction: row-reverse;
      margin-left: auto; // 🆕 用户消息右对齐

      .message-content {
        margin-right: 12px;
        margin-left: 0;

        .message-bubble {
          background: linear-gradient(135deg, #5e31d8, #6d42e0); // 🆕 渐变背景
          color: white;
          border-radius: 20px 20px 6px 20px; // 🆕 更现代的圆角
          box-shadow: 0 2px 12px rgba(94, 49, 216, 0.3); // 🆕 阴影效果
          max-width: none; // 移除最大宽度限制
          word-wrap: break-word;
          word-break: break-word; // 🆕 处理长单词换行
        }
      }
    }

    &.assistant {
      margin-right: auto; // 🆕 助手消息左对齐

      .message-content {
        margin-left: 12px;

        .message-bubble {
          background: #ffffff; // 🆕 纯白背景
          color: #1f2937;
          border-radius: 20px 20px 20px 6px; // 🆕 更现代的圆角
          border: 1px solid #e5e7eb; // 🆕 淡边框
          box-shadow: 0 1px 6px rgba(0, 0, 0, 0.08); // 🆕 轻微阴影
          max-width: none; // 移除最大宽度限制
          word-wrap: break-word;
          word-break: break-word; // 🆕 处理长单词换行

          &.loading {
            padding: 12px 16px;
            background: #f8f9fa; // 🆕 加载状态稍微不同的背景
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
        background: linear-gradient(135deg, #5e31d8, #6d42e0); // 🆕 渐变头像
        color: white;
        border-radius: 10px; // 🆕 更圆润的头像
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 600;
        font-size: 12px;
        box-shadow: 0 2px 8px rgba(94, 49, 216, 0.25); // 🆕 头像阴影
      }
    }

    .message-content {
      flex: 1;
      min-width: 0;

      .message-bubble {
        padding: 14px 18px; // 🆕 稍微增加内边距
        line-height: 1.6; // 🆕 增加行高提升可读性
        font-size: 14px;
        min-width: 40px; // 🆕 设置最小宽度
        max-width: 600px; // 🆕 设置最大宽度防止过长

        .message-attachments {
          margin-bottom: 8px;

          .attachment-item {
            display: inline-flex;
            align-items: center;
            background: rgba(255, 255, 255, 0.15); // 🆕 调整透明度
            padding: 6px 10px; // 🆕 调整内边距
            border-radius: 8px; // 🆕 更圆润
            margin-right: 8px;
            margin-bottom: 4px;
            font-size: 12px;

            i {
              margin-right: 6px;
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
        margin-top: 6px; // 🆕 稍微增加间距
        text-align: right;
      }
    }
  }

  // 🆕 用户消息的时间显示在左侧
  &:has(.user) .message-content .message-time {
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

              &:hover {
                background: #e5e7eb;
                color: #374151;
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

    .welcome-avatar .avatar-circle {
      width: 60px;
      height: 60px;
      font-size: 24px;
      border-radius: 15px;
    }

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
