<template>
  <div class="agent-container">
    <!-- Agent 侧边栏 -->
    <div :class="['agent-sidebar', { collapsed: sidebarCollapsed }]">
      <AgentSidebar :collapsed="sidebarCollapsed" @toggle-sidebar="toggleSidebar" />
    </div>

    <!-- 主内容区 -->
    <div class="agent-main-content">
      <ChatInterface />
    </div>

    <!-- 侧边栏切换按钮 -->
    <div class="sidebar-toggle-btn" @click="toggleSidebar">
      <i :class="sidebarCollapsed ? 'el-icon-arrow-right' : 'el-icon-arrow-left'"></i>
    </div>
  </div>
</template>

<script>
import AgentSidebar from './components/AgentSidebar.vue'
import ChatInterface from './components/ChatInterface.vue'

export default {
  name: 'AgentIndex',
  components: {
    AgentSidebar,
    ChatInterface
  },
  data() {
    return {
      sidebarCollapsed: false
    }
  },
  methods: {
    toggleSidebar() {
      this.sidebarCollapsed = !this.sidebarCollapsed
    }
  }
}
</script>

<style lang="scss" scoped>
.agent-container {
  display: flex;
  height: calc(100vh - 84px); // 减去顶部导航栏高度
  position: relative;
  background: #f8f9fa;
}

.agent-sidebar {
  width: 280px;
  background: #ffffff;
  border-right: 1px solid #e5e7eb;
  transition: all 0.3s ease;
  overflow: hidden;
  flex-shrink: 0;

  &.collapsed {
    width: 0;
    border-right: none;
  }
}

.agent-main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sidebar-toggle-btn {
  position: absolute;
  top: 20px;
  left: 260px;
  width: 32px;
  height: 32px;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 10;
  transition: all 0.3s ease;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);

  &:hover {
    background: #f3f4f6;
  }

  .agent-sidebar.collapsed + .agent-main-content + & {
    left: 20px;
  }
}

// 响应式设计
@media (max-width: 768px) {
  .agent-sidebar {
    position: absolute;
    left: 0;
    top: 0;
    height: 100%;
    z-index: 20;
    width: 280px;

    &.collapsed {
      left: -280px;
    }
  }

  .sidebar-toggle-btn {
    left: 20px;

    .agent-sidebar.collapsed + .agent-main-content + & {
      left: 20px;
    }
  }
}
</style>
