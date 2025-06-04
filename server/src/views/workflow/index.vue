<template>
  <div class="workflow-container">
    <!-- 头部操作区 -->
    <div class="workflow-header">
      <div class="header-left">
        <h2 class="page-title">
          <i class="el-icon-s-operation"></i>
          工作流管理
        </h2>
        <p class="page-description">创建和管理您的自动化工作流程</p>
      </div>
      <div class="header-right">
        <el-button type="primary" icon="el-icon-plus" @click="createWorkflow">新建工作流</el-button>
        <el-button icon="el-icon-refresh" @click="refreshWorkflows">刷新</el-button>
      </div>
    </div>

    <!-- 工作流分类标签 -->
    <div class="workflow-tabs">
      <el-tabs v-model="activeTab" @tab-click="handleTabClick">
        <el-tab-pane label="运营精选" name="featured">
          <el-badge :value="featuredWorkflows.length" class="tab-badge">
            <span></span>
          </el-badge>
        </el-tab-pane>
        <el-tab-pane label="数据分析" name="analytics">
          <el-badge :value="analyticsWorkflows.length" class="tab-badge">
            <span></span>
          </el-badge>
        </el-tab-pane>
        <el-tab-pane label="库存管理" name="inventory">
          <el-badge :value="inventoryWorkflows.length" class="tab-badge">
            <span></span>
          </el-badge>
        </el-tab-pane>
        <el-tab-pane label="客户服务" name="customer">
          <el-badge :value="customerWorkflows.length" class="tab-badge">
            <span></span>
          </el-badge>
        </el-tab-pane>
      </el-tabs>
    </div>

    <!-- 工作流列表 -->
    <div class="workflow-grid">
      <div
        v-for="workflow in currentWorkflows"
        :key="workflow.id"
        class="workflow-card"
        @click="openWorkflow(workflow)"
      >
        <div class="card-header">
          <div class="workflow-icon">
            <i :class="workflow.icon"></i>
          </div>
          <div class="workflow-status">
            <el-tag :type="workflow.status === 'active' ? 'success' : 'info'" size="mini">
              {{ workflow.status === 'active' ? '已启用' : '未启用' }}
            </el-tag>
          </div>
        </div>

        <div class="card-content">
          <h3 class="workflow-title">{{ workflow.title }}</h3>
          <p class="workflow-description">{{ workflow.description }}</p>

          <div class="workflow-meta">
            <span class="meta-item">
              <i class="el-icon-time"></i>
              {{ workflow.lastRun || '未运行' }}
            </span>
            <span class="meta-item">
              <i class="el-icon-data-line"></i>
              执行{{ workflow.runCount || 0 }}次
            </span>
          </div>
        </div>

        <div class="card-actions">
          <el-button size="mini" @click.stop="configureWorkflow(workflow)">配置</el-button>
          <el-button
            type="primary"
            size="mini"
            :loading="workflow.running"
            @click.stop="runWorkflow(workflow)"
          >
            {{ workflow.running ? '运行中' : '运行' }}
          </el-button>
        </div>
      </div>

      <!-- 空状态 -->
      <div v-if="currentWorkflows.length === 0" class="empty-state">
        <i class="el-icon-s-operation empty-icon"></i>
        <h3>暂无工作流</h3>
        <p>点击"新建工作流"开始创建您的第一个自动化流程</p>
        <el-button type="primary" @click="createWorkflow">立即创建</el-button>
      </div>
    </div>

    <!-- 工作流创建/编辑对话框 -->
    <el-dialog
      :title="dialogMode === 'create' ? '创建工作流' : '编辑工作流'"
      :visible.sync="showDialog"
      width="80%"
      :before-close="handleDialogClose"
    >
      <div class="workflow-editor">
        <div class="editor-sidebar">
          <h4>工作流模板</h4>
          <div class="template-list">
            <div
              v-for="template in workflowTemplates"
              :key="template.id"
              class="template-item"
              @click="selectTemplate(template)"
            >
              <i :class="template.icon"></i>
              <span>{{ template.name }}</span>
            </div>
          </div>
        </div>

        <div class="editor-main">
          <el-form :model="currentWorkflow" label-width="100px">
            <el-form-item label="工作流名称">
              <el-input v-model="currentWorkflow.title" placeholder="请输入工作流名称"></el-input>
            </el-form-item>
            <el-form-item label="描述">
              <el-input
                v-model="currentWorkflow.description"
                type="textarea"
                placeholder="请输入工作流描述"
                :rows="3"
              ></el-input>
            </el-form-item>
            <el-form-item label="分类">
              <el-select v-model="currentWorkflow.category" placeholder="请选择分类">
                <el-option label="运营精选" value="featured"></el-option>
                <el-option label="数据分析" value="analytics"></el-option>
                <el-option label="库存管理" value="inventory"></el-option>
                <el-option label="客户服务" value="customer"></el-option>
              </el-select>
            </el-form-item>
          </el-form>

          <!-- 这里可以集成工作流设计器 -->
          <div class="workflow-designer">
            <div class="designer-placeholder">
              <i class="el-icon-connection"></i>
              <p>工作流设计器</p>
              <p class="placeholder-desc">在这里可以集成第三方工作流设计器或开发自定义设计器</p>
            </div>
          </div>
        </div>
      </div>

      <div slot="footer" class="dialog-footer">
        <el-button @click="showDialog = false">取消</el-button>
        <el-button type="primary" @click="saveWorkflow">保存</el-button>
      </div>
    </el-dialog>
  </div>
</template>

<script>
export default {
  name: 'WorkflowManagement',
  data() {
    return {
      activeTab: 'featured',
      showDialog: false,
      dialogMode: 'create', // 'create' | 'edit'
      currentWorkflow: {
        title: '',
        description: '',
        category: 'featured',
        status: 'inactive'
      },

      // 模拟数据 - 实际项目中应该从API获取
      workflows: [
        {
          id: 1,
          title: '子商户订单报表',
          description: '自动汇总和分析子商户历史订单数据，生成详细报表',
          category: 'featured',
          icon: 'el-icon-data-line',
          status: 'active',
          lastRun: '2小时前',
          runCount: 15
        },
        {
          id: 2,
          title: '店铺状态健康检查',
          description: '自动检查店铺健康状态，包含表现检查、操作中断等',
          category: 'featured',
          icon: 'el-icon-view',
          status: 'active',
          lastRun: '1天前',
          runCount: 8
        },
        {
          id: 3,
          title: 'IP库存效率优化',
          description: '亚马逊不会提醒您IP库存效率低，但您可以利用RPA提高运营效率',
          category: 'inventory',
          icon: 'el-icon-box',
          status: 'inactive',
          lastRun: null,
          runCount: 0
        },
        {
          id: 4,
          title: '批量上传商品',
          description: '去现有商品表来批量上传新商品信息',
          category: 'inventory',
          icon: 'el-icon-upload2',
          status: 'inactive',
          lastRun: null,
          runCount: 0
        }
      ],

      workflowTemplates: [
        { id: 1, name: '数据采集', icon: 'el-icon-download' },
        { id: 2, name: '报表生成', icon: 'el-icon-data-line' },
        { id: 3, name: '状态监控', icon: 'el-icon-view' },
        { id: 4, name: '批量操作', icon: 'el-icon-s-operation' },
        { id: 5, name: '通知提醒', icon: 'el-icon-bell' }
      ]
    }
  },

  computed: {
    featuredWorkflows() {
      return this.workflows.filter(w => w.category === 'featured')
    },
    analyticsWorkflows() {
      return this.workflows.filter(w => w.category === 'analytics')
    },
    inventoryWorkflows() {
      return this.workflows.filter(w => w.category === 'inventory')
    },
    customerWorkflows() {
      return this.workflows.filter(w => w.category === 'customer')
    },
    currentWorkflows() {
      switch (this.activeTab) {
        case 'featured':
          return this.featuredWorkflows
        case 'analytics':
          return this.analyticsWorkflows
        case 'inventory':
          return this.inventoryWorkflows
        case 'customer':
          return this.customerWorkflows
        default:
          return []
      }
    }
  },

  mounted() {
    this.loadWorkflows()
  },

  methods: {
    async loadWorkflows() {
      // 这里应该调用API获取工作流数据
      // const response = await this.$http.get('/api/workflows')
      // this.workflows = response.data
      console.log('加载工作流数据...')
    },

    handleTabClick(tab) {
      console.log('切换到标签:', tab.name)
    },

    createWorkflow() {
      this.dialogMode = 'create'
      this.currentWorkflow = {
        title: '',
        description: '',
        category: this.activeTab,
        status: 'inactive'
      }
      this.showDialog = true
    },

    openWorkflow(workflow) {
      console.log('打开工作流:', workflow)
      // 这里可以集成工作流的详细视图或编辑器
    },

    configureWorkflow(workflow) {
      this.dialogMode = 'edit'
      this.currentWorkflow = { ...workflow }
      this.showDialog = true
    },

    async runWorkflow(workflow) {
      this.$set(workflow, 'running', true)

      try {
        // 调用API执行工作流
        // await this.$http.post(`/api/workflows/${workflow.id}/run`)

        // 模拟执行时间
        await new Promise(resolve => setTimeout(resolve, 2000))

        workflow.lastRun = '刚刚'
        workflow.runCount = (workflow.runCount || 0) + 1
        workflow.status = 'active'

        this.$message.success('工作流执行成功')
      } catch (error) {
        this.$message.error('工作流执行失败')
      } finally {
        this.$set(workflow, 'running', false)
      }
    },

    refreshWorkflows() {
      this.loadWorkflows()
      this.$message.success('数据已刷新')
    },

    selectTemplate(template) {
      console.log('选择模板:', template)
      // 这里可以根据模板设置工作流的默认配置
    },

    saveWorkflow() {
      if (!this.currentWorkflow.title) {
        this.$message.error('请输入工作流名称')
        return
      }

      if (this.dialogMode === 'create') {
        const newWorkflow = {
          ...this.currentWorkflow,
          id: Date.now(),
          icon: 'el-icon-s-operation',
          runCount: 0
        }
        this.workflows.push(newWorkflow)
        this.$message.success('工作流创建成功')
      } else {
        const index = this.workflows.findIndex(w => w.id === this.currentWorkflow.id)
        if (index !== -1) {
          this.workflows.splice(index, 1, this.currentWorkflow)
          this.$message.success('工作流保存成功')
        }
      }

      this.showDialog = false
    },

    handleDialogClose() {
      this.showDialog = false
    }
  }
}
</script>

<style lang="scss" scoped>
.workflow-container {
  padding: 20px;
  background: #f5f5f5;
  min-height: calc(100vh - 50px);
}

.workflow-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 30px;
  background: white;
  padding: 24px;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);

  .header-left {
    .page-title {
      margin: 0 0 8px 0;
      color: #212224;
      font-size: 24px;
      font-weight: 600;

      i {
        color: #5e31d8;
        margin-right: 8px;
      }
    }

    .page-description {
      margin: 0;
      color: #666;
      font-size: 14px;
    }
  }

  .header-right {
    display: flex;
    gap: 12px;
  }
}

.workflow-tabs {
  background: white;
  border-radius: 8px;
  padding: 0 24px;
  margin-bottom: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);

  ::v-deep .el-tabs__header {
    margin: 0;
  }

  ::v-deep .el-tabs__item {
    height: 60px;
    line-height: 60px;
    font-size: 16px;

    &.is-active {
      color: #5e31d8;
    }
  }

  ::v-deep .el-tabs__active-bar {
    background-color: #5e31d8;
  }

  .tab-badge {
    ::v-deep .el-badge__content {
      background-color: #5e31d8;
    }
  }
}

.workflow-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 20px;
  margin-bottom: 40px;
}

.workflow-card {
  background: white;
  border-radius: 12px;
  padding: 20px;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  border: 2px solid transparent;

  &:hover {
    transform: translateY(-4px);
    box-shadow: 0 8px 24px rgba(94, 49, 216, 0.15);
    border-color: #5e31d8;
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;

    .workflow-icon {
      width: 48px;
      height: 48px;
      border-radius: 8px;
      background: linear-gradient(135deg, #5e31d8, #8b5cf6);
      display: flex;
      align-items: center;
      justify-content: center;

      i {
        font-size: 24px;
        color: white;
      }
    }
  }

  .card-content {
    margin-bottom: 20px;

    .workflow-title {
      margin: 0 0 8px 0;
      font-size: 18px;
      font-weight: 600;
      color: #212224;
    }

    .workflow-description {
      margin: 0 0 16px 0;
      color: #666;
      font-size: 14px;
      line-height: 1.5;
    }

    .workflow-meta {
      display: flex;
      gap: 16px;

      .meta-item {
        display: flex;
        align-items: center;
        font-size: 12px;
        color: #999;

        i {
          margin-right: 4px;
        }
      }
    }
  }

  .card-actions {
    display: flex;
    gap: 8px;
  }
}

.empty-state {
  grid-column: 1 / -1;
  text-align: center;
  padding: 80px 20px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);

  .empty-icon {
    font-size: 64px;
    color: #ddd;
    margin-bottom: 16px;
  }

  h3 {
    margin: 0 0 8px 0;
    color: #666;
    font-size: 18px;
  }

  p {
    margin: 0 0 24px 0;
    color: #999;
    font-size: 14px;
  }
}

.workflow-editor {
  display: flex;
  height: 500px;
  gap: 20px;

  .editor-sidebar {
    width: 200px;
    border-right: 1px solid #eee;
    padding-right: 20px;

    h4 {
      margin: 0 0 16px 0;
      color: #212224;
      font-size: 16px;
    }

    .template-list {
      .template-item {
        display: flex;
        align-items: center;
        padding: 8px 12px;
        border-radius: 6px;
        cursor: pointer;
        transition: background-color 0.2s;

        &:hover {
          background-color: #f5f5f5;
        }

        i {
          margin-right: 8px;
          color: #5e31d8;
        }

        span {
          font-size: 14px;
          color: #666;
        }
      }
    }
  }

  .editor-main {
    flex: 1;

    .workflow-designer {
      margin-top: 20px;
      border: 2px dashed #ddd;
      border-radius: 8px;
      height: 300px;
      display: flex;
      align-items: center;
      justify-content: center;

      .designer-placeholder {
        text-align: center;
        color: #999;

        i {
          font-size: 48px;
          margin-bottom: 16px;
          display: block;
        }

        p {
          margin: 0;
          font-size: 16px;

          &.placeholder-desc {
            font-size: 12px;
            margin-top: 8px;
          }
        }
      }
    }
  }
}

.dialog-footer {
  text-align: right;
}

// 响应式设计
@media (max-width: 768px) {
  .workflow-container {
    padding: 16px;
  }

  .workflow-header {
    flex-direction: column;
    gap: 16px;
    align-items: stretch;
  }

  .workflow-grid {
    grid-template-columns: 1fr;
  }

  .workflow-editor {
    flex-direction: column;
    height: auto;

    .editor-sidebar {
      width: 100%;
      border-right: none;
      border-bottom: 1px solid #eee;
      padding-right: 0;
      padding-bottom: 20px;
      margin-bottom: 20px;

      .template-list {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }
    }
  }
}
</style>
