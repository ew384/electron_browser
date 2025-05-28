<template>
  <div class="browser-container">
    <!-- 工具栏 -->
    <div class="toolbar">
      <el-button type="primary" icon="el-icon-plus" @click="showCreateDialog">
        {{ $t('browser.create') }}
      </el-button>
      <el-button icon="el-icon-refresh" @click="refreshList">
        {{ $t('browser.refresh') }}
      </el-button>
    </div>

    <!-- 浏览器列表 -->
    <el-table
      v-loading="loading"
      :data="browserList"
      style="width: 100%"
      @row-dblclick="handleRowDblClick"
    >
      <el-table-column prop="id" label="ID" width="200" />
      <el-table-column prop="name" :label="$t('browser.name')" />
      <el-table-column prop="group" :label="$t('browser.group')" width="150">
        <template slot-scope="scope">
          <el-tag v-if="scope.row.group" size="small">{{ scope.row.group }}</el-tag>
          <span v-else>-</span>
        </template>
      </el-table-column>
      <el-table-column prop="status" :label="$t('browser.status')" width="100">
        <template slot-scope="scope">
          <el-tag :type="scope.row.status === 'running' ? 'success' : 'info'" size="small">
            {{ scope.row.status === 'running' ? $t('browser.running') : $t('browser.stopped') }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="$t('browser.fingerprint')" width="120">
        <template slot-scope="scope">
          <el-button type="text" size="small" @click="showFingerprintDialog(scope.row)">
            {{ $t('browser.viewFingerprint') }}
          </el-button>
        </template>
      </el-table-column>
      <el-table-column :label="$t('browser.actions')" width="300" fixed="right">
        <template slot-scope="scope">
          <el-button
            v-if="scope.row.status !== 'running'"
            type="primary"
            size="small"
            @click="launchBrowser(scope.row)"
          >
            {{ $t('browser.launch') }}
          </el-button>
          <el-button v-else type="danger" size="small" @click="closeBrowser(scope.row)">
            {{ $t('browser.close') }}
          </el-button>
          <el-button type="warning" size="small" @click="showEditDialog(scope.row)">
            {{ $t('browser.edit') }}
          </el-button>
          <el-button type="danger" size="small" @click="deleteBrowser(scope.row)">
            {{ $t('browser.delete') }}
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 创建/编辑对话框 -->
    <el-dialog
      :title="editMode ? $t('browser.edit') : $t('browser.create')"
      :visible.sync="dialogVisible"
      width="600px"
    >
      <el-form ref="browserForm" :model="browserForm" :rules="rules" label-width="120px">
        <el-form-item :label="$t('browser.name')" prop="name">
          <el-input v-model="browserForm.name" />
        </el-form-item>
        <el-form-item :label="$t('browser.group')">
          <el-select v-model="browserForm.group" clearable>
            <el-option
              v-for="group in groupList"
              :key="group.id"
              :label="group.name"
              :value="group.name"
            />
          </el-select>
        </el-form-item>
        <el-form-item :label="$t('browser.proxy')">
          <el-input v-model="browserForm.proxy" placeholder="http://127.0.0.1:8080" />
        </el-form-item>
        <el-form-item :label="$t('browser.userAgent')">
          <el-input
            v-model="browserForm.userAgent"
            type="textarea"
            :rows="3"
            placeholder="留空使用默认值"
          />
        </el-form-item>
      </el-form>
      <div slot="footer">
        <el-button @click="dialogVisible = false">{{ $t('common.cancel') }}</el-button>
        <el-button type="primary" @click="saveBrowser">{{ $t('common.save') }}</el-button>
      </div>
    </el-dialog>

    <!-- 指纹详情对话框 -->
    <el-dialog
      :title="$t('browser.fingerprintDetails')"
      :visible.sync="fingerprintDialogVisible"
      width="800px"
    >
      <div slot="footer">
        <el-button @click="fingerprintDialogVisible = false">{{ $t('common.close') }}</el-button>
        <el-button type="primary" @click="regenerateFingerprint">
          {{ $t('browser.regenerateFingerprint') }}
        </el-button>
      </div>
    </el-dialog>
  </div>
</template>

<script>
import { getGroupList } from '@/api/native'
import electronBridge from '@/utils/electron-bridge'

export default {
  name: 'BrowserList',
  data() {
    return {
      loading: false,
      browserList: [],
      groupList: [],
      dialogVisible: false,
      editMode: false,
      browserForm: {
        id: '',
        name: '',
        group: '',
        proxy: '',
        userAgent: '',
        config: {}
      },
      rules: {
        name: [{ required: true, message: '请输入浏览器名称', trigger: 'blur' }]
      },
      fingerprintDialogVisible: false,
      currentFingerprint: null,
      currentBrowserId: null
    }
  },
  created() {
    this.init()
  },
  methods: {
    async init() {
      await this.loadGroupList()
      await this.refreshList()
    },

    async loadGroupList() {
      try {
        this.groupList = await getGroupList()
      } catch (error) {
        console.error('Failed to load groups:', error)
      }
    },

    async refreshList() {
      this.loading = true
      try {
        const result = await electronBridge.getAccounts()
        if (result.success) {
          this.browserList = result.accounts
        } else {
          this.$message.error('获取浏览器列表失败')
        }
      } catch (error) {
        this.$message.error('获取浏览器列表失败: ' + error.message)
      } finally {
        this.loading = false
      }
    },

    showCreateDialog() {
      this.editMode = false
      this.browserForm = {
        id: '',
        name: `浏览器 ${this.browserList.length + 1}`,
        group: '',
        proxy: '',
        userAgent: '',
        config: {}
      }
      this.dialogVisible = true
    },

    showEditDialog(browser) {
      this.editMode = true
      this.browserForm = { ...browser }
      this.dialogVisible = true
    },

    async saveBrowser() {
      this.$refs.browserForm.validate(async valid => {
        if (valid) {
          try {
            const account = {
              ...this.browserForm,
              id: this.browserForm.id || Date.now().toString(),
              status: 'stopped',
              createdAt: this.browserForm.createdAt || Date.now()
            }

            const result = await electronBridge.createAccount(account)
            if (result.success) {
              this.$message.success(this.editMode ? '修改成功' : '创建成功')
              this.dialogVisible = false
              await this.refreshList()
            } else {
              this.$message.error(result.error || '操作失败')
            }
          } catch (error) {
            this.$message.error('操作失败: ' + error.message)
          }
        }
      })
    },

    async launchBrowser(browser) {
      try {
        const result = await electronBridge.launchBrowser(browser.id)
        if (result.success) {
          this.$message.success('浏览器启动成功')
          browser.status = 'running'
        } else {
          this.$message.error('启动失败: ' + result.error)
        }
      } catch (error) {
        this.$message.error('启动失败: ' + error.message)
      }
    },

    async closeBrowser(browser) {
      try {
        const result = await electronBridge.closeBrowser(browser.id)
        if (result.success) {
          this.$message.success('浏览器已关闭')
          browser.status = 'stopped'
        } else {
          this.$message.error('关闭失败: ' + result.error)
        }
      } catch (error) {
        this.$message.error('关闭失败: ' + error.message)
      }
    },

    async deleteBrowser(browser) {
      try {
        await this.$confirm('确定要删除该浏览器吗？', '提示', {
          confirmButtonText: '确定',
          cancelButtonText: '取消',
          type: 'warning'
        })

        const result = await electronBridge.deleteAccount(browser.id)
        if (result.success) {
          this.$message.success('删除成功')
          await this.refreshList()
        } else {
          this.$message.error('删除失败: ' + result.error)
        }
      } catch (error) {
        if (error !== 'cancel') {
          this.$message.error('删除失败: ' + error.message)
        }
      }
    },

    handleRowDblClick(row) {
      if (row.status !== 'running') {
        this.launchBrowser(row)
      }
    },

    async showFingerprintDialog(browser) {
      this.currentBrowserId = browser.id
      this.currentFingerprint = browser.config?.fingerprint || {}
      this.fingerprintDialogVisible = true
    },

    async regenerateFingerprint() {
      try {
        const result = await electronBridge.generateFingerprint(this.currentBrowserId)
        if (result.success) {
          this.currentFingerprint = result.config
          this.$message.success('指纹已重新生成')
          // 更新浏览器配置
          const browser = this.browserList.find(b => b.id === this.currentBrowserId)
          if (browser) {
            browser.config = browser.config || {}
            browser.config.fingerprint = result.config
          }
        }
      } catch (error) {
        this.$message.error('生成指纹失败: ' + error.message)
      }
    }
  }
}
</script>

<style scoped>
.browser-container {
  padding: 20px;
}

.toolbar {
  margin-bottom: 20px;
}
</style>
