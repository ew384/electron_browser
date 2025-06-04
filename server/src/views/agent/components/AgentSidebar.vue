<template>
  <div class="agent-sidebar-content">
    <!-- 侧边栏头部 -->
    <div class="sidebar-header">
      <h3 class="title">智能体</h3>
      <div class="header-actions">
        <el-button type="primary" size="small" icon="el-icon-plus" @click="showCreateAgent">
          新建
        </el-button>
      </div>
    </div>

    <!-- 搜索框 -->
    <div class="search-section">
      <el-input
        v-model="searchKeyword"
        placeholder="搜索智能体..."
        prefix-icon="el-icon-search"
        size="small"
        clearable
      />
    </div>

    <!-- 智能体分类 -->
    <div class="agent-categories">
      <div
        class="category-item"
        :class="{ active: selectedCategory === 'all' }"
        @click="selectCategory('all')"
      >
        <i class="el-icon-s-home"></i>
        <span>全部智能体</span>
        <span class="count">{{ totalAgents }}</span>
      </div>

      <div
        class="category-item"
        :class="{ active: selectedCategory === 'my' }"
        @click="selectCategory('my')"
      >
        <i class="el-icon-user"></i>
        <span>我的智能体</span>
        <span class="count">{{ myAgents }}</span>
      </div>

      <div
        class="category-item"
        :class="{ active: selectedCategory === 'recent' }"
        @click="selectCategory('recent')"
      >
        <i class="el-icon-time"></i>
        <span>最近使用</span>
        <span class="count">{{ recentAgents }}</span>
      </div>
    </div>

    <!-- 智能体列表 -->
    <div class="agent-list">
      <div class="list-header">
        <span class="list-title">智能体列表</span>
        <el-dropdown trigger="click" size="small">
          <span class="sort-btn">
            <i class="el-icon-sort"></i>
          </span>
          <el-dropdown-menu slot="dropdown">
            <el-dropdown-item @click.native="sortBy('name')">按名称排序</el-dropdown-item>
            <el-dropdown-item @click.native="sortBy('created')">按创建时间</el-dropdown-item>
            <el-dropdown-item @click.native="sortBy('used')">按使用频率</el-dropdown-item>
          </el-dropdown-menu>
        </el-dropdown>
      </div>

      <div class="list-content">
        <!-- 示例智能体项目 -->
        <div
          v-for="agent in filteredAgents"
          :key="agent.id"
          class="agent-item"
          :class="{ active: selectedAgent === agent.id }"
          @click="selectAgent(agent)"
        >
          <div class="agent-avatar">
            <img v-if="agent.avatar" :src="agent.avatar" :alt="agent.name" />
            <div v-else class="default-avatar">
              {{ agent.name.charAt(0).toUpperCase() }}
            </div>
          </div>

          <div class="agent-info">
            <div class="agent-name">{{ agent.name }}</div>
            <div class="agent-desc">{{ agent.description }}</div>
            <div class="agent-meta">
              <span class="agent-type">{{ agent.type }}</span>
              <span class="agent-time">{{ formatTime(agent.lastUsed) }}</span>
            </div>
          </div>

          <div class="agent-actions">
            <el-dropdown trigger="click" size="mini">
              <span class="action-btn">
                <i class="el-icon-more"></i>
              </span>
              <el-dropdown-menu slot="dropdown">
                <el-dropdown-item @click.native="editAgent(agent)">编辑</el-dropdown-item>
                <el-dropdown-item @click.native="cloneAgent(agent)">克隆</el-dropdown-item>
                <el-dropdown-item divided @click.native="deleteAgent(agent)">删除</el-dropdown-item>
              </el-dropdown-menu>
            </el-dropdown>
          </div>
        </div>

        <!-- 空状态 -->
        <div v-if="filteredAgents.length === 0" class="empty-state">
          <i class="el-icon-chat-dot-square"></i>
          <p>暂无智能体</p>
          <el-button type="text" @click="showCreateAgent">创建第一个智能体</el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'AgentSidebar',
  props: {
    collapsed: {
      type: Boolean,
      default: false
    }
  },
  data() {
    return {
      searchKeyword: '',
      selectedCategory: 'all',
      selectedAgent: null,
      sortField: 'name',
      // 示例数据
      agents: [
        {
          id: 1,
          name: '数据分析助手',
          description: '专业分析数据',
          type: '通用',
          avatar: '',
          lastUsed: Date.now() - 1000 * 60 * 30,
          created: Date.now() - 1000 * 60 * 60 * 24 * 7,
          usageCount: 15
        },
        {
          id: 2,
          name: '应用执行助手',
          description: '专业执行应用流程',
          type: '编程',
          avatar: '',
          lastUsed: Date.now() - 1000 * 60 * 60 * 2,
          created: Date.now() - 1000 * 60 * 60 * 24 * 3,
          usageCount: 8
        }
      ]
    }
  },
  computed: {
    totalAgents() {
      return this.agents.length
    },
    myAgents() {
      return this.agents.filter(agent => agent.type !== '系统').length
    },
    recentAgents() {
      return this.agents.filter(agent => Date.now() - agent.lastUsed < 1000 * 60 * 60 * 24 * 7)
        .length
    },
    filteredAgents() {
      let filtered = this.agents

      // 按分类过滤
      if (this.selectedCategory === 'my') {
        filtered = filtered.filter(agent => agent.type !== '系统')
      } else if (this.selectedCategory === 'recent') {
        filtered = filtered.filter(agent => Date.now() - agent.lastUsed < 1000 * 60 * 60 * 24 * 7)
      }

      // 按搜索关键词过滤
      if (this.searchKeyword) {
        const keyword = this.searchKeyword.toLowerCase()
        filtered = filtered.filter(
          agent =>
            agent.name.toLowerCase().includes(keyword) ||
            agent.description.toLowerCase().includes(keyword)
        )
      }

      // 排序
      filtered.sort((a, b) => {
        switch (this.sortField) {
          case 'name':
            return a.name.localeCompare(b.name)
          case 'created':
            return b.created - a.created
          case 'used':
            return b.usageCount - a.usageCount
          default:
            return 0
        }
      })

      return filtered
    }
  },
  methods: {
    selectCategory(category) {
      this.selectedCategory = category
    },

    selectAgent(agent) {
      this.selectedAgent = agent.id
      this.$emit('select-agent', agent)
    },

    sortBy(field) {
      this.sortField = field
    },

    showCreateAgent() {
      this.$message.info('创建智能体功能开发中...')
    },

    editAgent(agent) {
      this.$message.info('编辑智能体: ${agent.name}')
    },

    deleteAgent(agent) {
      this.$confirm(`确定要删除智能体 "${agent.name}" 吗？`, '提示', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      })
        .then(() => {
          const index = this.agents.findIndex(a => a.id === agent.id)
          if (index > -1) {
            this.agents.splice(index, 1)
            this.$message.success('删除成功')
          }
        })
        .catch(() => {})
    },

    formatTime(timestamp) {
      const now = Date.now()
      const diff = now - timestamp

      if (diff < 1000 * 60) {
        return '刚刚'
      } else if (diff < 1000 * 60 * 60) {
        return `${Math.floor(diff / (1000 * 60))}分钟前`
      } else if (diff < 1000 * 60 * 60 * 24) {
        return `${Math.floor(diff / (1000 * 60 * 60))}小时前`
      } else {
        return `${Math.floor(diff / (1000 * 60 * 60 * 24))}天前`
      }
    }
  }
}
</script>

<style lang="scss" scoped>
.agent-sidebar-content {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 20px 16px;
}

.sidebar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;

  .title {
    font-size: 18px;
    font-weight: 600;
    color: #1f2937;
    margin: 0;
  }
}

.search-section {
  margin-bottom: 20px;
}

.agent-categories {
  margin-bottom: 20px;

  .category-item {
    display: flex;
    align-items: center;
    padding: 8px 12px;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;
    margin-bottom: 4px;

    &:hover {
      background: #f3f4f6;
    }

    &.active {
      background: #5e31d8;
      color: white;
    }

    i {
      margin-right: 8px;
      font-size: 16px;
    }

    span:first-of-type {
      flex: 1;
      font-size: 14px;
    }

    .count {
      font-size: 12px;
      background: rgba(0, 0, 0, 0.1);
      padding: 2px 6px;
      border-radius: 10px;

      .active & {
        background: rgba(255, 255, 255, 0.2);
      }
    }
  }
}

.agent-list {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;

  .list-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;

    .list-title {
      font-size: 14px;
      font-weight: 500;
      color: #6b7280;
    }

    .sort-btn {
      padding: 4px;
      border-radius: 4px;
      cursor: pointer;
      color: #6b7280;

      &:hover {
        background: #f3f4f6;
        color: #374151;
      }
    }
  }

  .list-content {
    flex: 1;
    overflow-y: auto;
  }
}

.agent-item {
  display: flex;
  align-items: flex-start;
  padding: 12px 8px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  margin-bottom: 8px;
  border: 1px solid transparent;

  &:hover {
    background: #f8f9fa;
    border-color: #e5e7eb;
  }

  &.active {
    background: #f0f7ff;
    border-color: #5e31d8;
  }

  .agent-avatar {
    width: 36px;
    height: 36px;
    border-radius: 8px;
    overflow: hidden;
    margin-right: 12px;
    flex-shrink: 0;

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .default-avatar {
      width: 100%;
      height: 100%;
      background: #5e31d8;
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 600;
      font-size: 14px;
    }
  }

  .agent-info {
    flex: 1;
    min-width: 0;

    .agent-name {
      font-size: 14px;
      font-weight: 500;
      color: #1f2937;
      margin-bottom: 4px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .agent-desc {
      font-size: 12px;
      color: #6b7280;
      line-height: 1.4;
      margin-bottom: 6px;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .agent-meta {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      color: #9ca3af;

      .agent-type {
        background: #f3f4f6;
        padding: 2px 6px;
        border-radius: 4px;
      }
    }
  }

  .agent-actions {
    margin-left: 8px;
    opacity: 0;
    transition: opacity 0.2s;

    .action-btn {
      padding: 4px;
      border-radius: 4px;
      cursor: pointer;
      color: #6b7280;

      &:hover {
        background: #f3f4f6;
        color: #374151;
      }
    }
  }

  &:hover .agent-actions {
    opacity: 1;
  }
}

.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: #6b7280;

  i {
    font-size: 48px;
    margin-bottom: 16px;
    opacity: 0.5;
  }

  p {
    margin: 0 0 12px 0;
    font-size: 14px;
  }
}

// 滚动条样式
.list-content::-webkit-scrollbar {
  width: 4px;
}

.list-content::-webkit-scrollbar-track {
  background: transparent;
}

.list-content::-webkit-scrollbar-thumb {
  background: #d1d5db;
  border-radius: 2px;
}

.list-content::-webkit-scrollbar-thumb:hover {
  background: #9ca3af;
}
</style>
