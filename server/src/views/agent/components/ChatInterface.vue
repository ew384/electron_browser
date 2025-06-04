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
      <div v-if="messages.length === 0" class="welcome-section">
        <h2 class="welcome-title">{{ currentAgent.name }}</h2>
        <p class="welcome-subtitle">{{ currentAgent.description }}</p>

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
      currentAgent: {
        id: 1,
        name: 'Browser Agent',
        description: 'Hi there, what can I help with?'
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
      ]
    }
  },
  computed: {
    canSend() {
      return (this.inputMessage.trim() || this.attachedFiles.length > 0) && !this.isLoading
    }
  },
  mounted() {
    // 聚焦输入框
    this.$nextTick(() => {
      if (this.$refs.messageInput) {
        this.$refs.messageInput.focus()
      }
    })
  },
  methods: {
    async sendMessage() {
      if (!this.canSend) return

      const messageContent = this.inputMessage.trim()
      const attachments = [...this.attachedFiles]

      // 创建用户消息
      const userMessage = {
        id: Date.now(),
        type: 'user',
        content: messageContent,
        attachments: attachments.length > 0 ? attachments : null,
        timestamp: Date.now()
      }

      this.messages.push(userMessage)

      // 清空输入
      this.inputMessage = ''
      this.attachedFiles = []

      // 滚动到底部
      this.$nextTick(() => {
        this.scrollToBottom()
      })

      // TODO: 接入大模型API
      // this.isLoading = true
      console.log('发送消息:', messageContent)
      console.log('附件:', attachments)
    },

    sendQuickMessage(message) {
      this.inputMessage = message
      this.sendMessage()
    },

    addNewLine() {
      this.inputMessage += '\n'
    },

    handleFileUpload(file) {
      // 检查文件大小限制 (10MB)
      const maxSize = 10 * 1024 * 1024
      if (file.size > maxSize) {
        this.$message.error('文件大小不能超过 10MB')
        return false
      }

      // 添加文件到附件列表
      const fileObj = {
        id: Date.now() + Math.random(),
        name: file.name,
        size: file.size,
        type: file.type,
        file: file
      }

      this.attachedFiles.push(fileObj)
      this.$message.success(`文件 "${file.name}" 已添加`)
      return false // 阻止自动上传
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

    &.assistant {
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
        background: #5e31d8;
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
