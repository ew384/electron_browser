<!-- eslint-disable -->
<template>
  <div class="browser-container">
    <!-- 调试信息 -->
    <div v-if="debugMode" class="debug-info">
      <p>API状态: {{ apiStatus }}</p>
      <p>数据源: {{ dataSource }}</p>
      <p>Electron API 可用: {{ isElectronAvailable ? '是' : '否' }}</p>
      <p>浏览器数量: {{ browserList.length }}</p>
      <p>运行中实例: {{ browserList.filter(b => b.status === 'running').length }}</p>
      <p>最后更新: {{ lastUpdateTime }}</p>
    </div>
  
    <!-- 状态栏 -->
    <div class="status-bar" v-if="apiStatus">
      <el-alert :title="apiStatus"
        :type="dataSource === 'rpa-platform' ? 'success' : dataSource === 'electron-direct' ? 'warning' : 'error'"
        :closable="false" show-icon />
    </div>
  
    <!-- 工具栏 -->
    <div class="toolbar">
      <el-button type="primary" icon="el-icon-plus" @click="showCreateDialog">
        {{ $t('browser.create') }}
      </el-button>
      <el-button icon="el-icon-refresh" @click="refreshList">
        {{ $t('browser.refresh') }}
      </el-button>
      <el-button icon="el-icon-bug" @click="toggleDebug">
        调试模式
      </el-button>
    </div>
  
    <!-- 浏览器列表 -->
    <el-table v-loading="loading" :data="browserList" style="width: 100%" @row-dblclick="handleRowDblClick">
      <el-table-column prop="id" label="ID" width="180" />
      <el-table-column prop="name" :label="$t('browser.name')" min-width="120" />
      <el-table-column prop="group" :label="$t('browser.group')" width="120">
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
  
      <!-- 调试端口 -->
      <el-table-column label="调试端口" width="120">
        <template slot-scope="scope">
          <div v-if="scope.row.status === 'running' && scope.row.debugPort">
            <el-tooltip :content="`点击复制端口 ${scope.row.debugPort}`" placement="top">
              <el-tag type="success" size="small" @click="copyPort(scope.row.debugPort)"
                style="cursor: pointer; font-family: monospace;">
                {{ scope.row.debugPort }}
              </el-tag>
            </el-tooltip>
          </div>
          <div v-else-if="scope.row.status === 'running'">
            <el-tag type="warning" size="small">获取中...</el-tag>
          </div>
          <div v-else>
            <el-tag type="info" size="small">未运行</el-tag>
          </div>
        </template>
      </el-table-column>
  
      <!-- 标签页数量 -->
      <el-table-column label="标签页" width="80">
        <template slot-scope="scope">
          <span v-if="scope.row.status === 'running' && scope.row.tabsCount >= 0">
            {{ scope.row.tabsCount }}
          </span>
          <span v-else style="color: #909399;">-</span>
        </template>
      </el-table-column>
  
      <!-- 当前URL -->
      <el-table-column label="当前页面" min-width="200">
        <template slot-scope="scope">
          <div v-if="scope.row.url">
            <el-tooltip :content="scope.row.url" placement="top">
              <span style="color: #409eff; cursor: pointer; font-size: 12px;" @click="openUrl(scope.row.url)">
                {{ truncateUrl(scope.row.url) }}
              </span>
            </el-tooltip>
          </div>
          <span v-else style="color: #909399;">-</span>
        </template>
      </el-table-column>
  
      <!-- Chrome版本 -->
      <el-table-column label="Chrome版本" width="120">
        <template slot-scope="scope">
          <span v-if="scope.row.chromeVersion" style="font-size: 12px; color: #606266;">
            {{ extractChromeVersion(scope.row.chromeVersion) }}
          </span>
          <span v-else style="color: #909399;">-</span>
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
          <el-button v-if="scope.row.status !== 'running'" type="primary" size="small" @click="launchBrowser(scope.row)">
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
    <el-dialog :title="editMode ? $t('browser.edit') : $t('browser.create')" :visible.sync="dialogVisible" width="600px">
      <el-form ref="browserForm" :model="browserForm" :rules="rules" label-width="120px">
        <el-form-item :label="$t('browser.name')" prop="name">
          <el-input v-model="browserForm.name" />
        </el-form-item>
        <el-form-item :label="$t('browser.group')">
          <el-select v-model="browserForm.group" clearable>
            <el-option v-for="group in groupList" :key="group.id" :label="group.name" :value="group.name" />
          </el-select>
        </el-form-item>
        <el-form-item :label="$t('browser.proxy')">
          <el-input v-model="browserForm.proxy" placeholder="http://127.0.0.1:8080" />
        </el-form-item>
        <el-form-item :label="$t('browser.userAgent')">
          <el-input v-model="browserForm.userAgent" type="textarea" :rows="3" placeholder="留空使用默认值" />
        </el-form-item>
      </el-form>
      <div slot="footer">
        <el-button @click="dialogVisible = false">{{ $t('common.cancel') }}</el-button>
        <el-button type="primary" @click="saveBrowser">{{ $t('common.save') }}</el-button>
      </div>
    </el-dialog>
  
    <!-- 指纹详情对话框 -->
    <el-dialog :title="$t('browser.fingerprintDetails')" :visible.sync="fingerprintDialogVisible" width="800px">
      <pre v-if="currentFingerprint">{{ JSON.stringify(currentFingerprint, null, 2) }}</pre>
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

export default {
  name: 'BrowserList',
  data() {
    return {
      loading: false,
      browserList: [],
      groupList: [],
      dialogVisible: false,
      editMode: false,
      debugMode: false,
      lastUpdateTime: '',
      apiStatus: '', // API状态信息
      dataSource: '', // 数据来源标识
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
  computed: {
    isElectronAvailable() {
      return typeof window !== 'undefined' && window.electronAPI
    }
  },
  created() {
    this.init()
  },
  methods: {
    async init() {
      console.log('[BrowserList] Initializing...')
      await this.checkApiStatus()
      await this.loadGroupList()
      await this.refreshList()
    },

    // 检查API状态
    async checkApiStatus() {
      try {
        // 检查RPA Platform API和Electron API状态
        const response = await fetch('http://localhost:3001/api/electron/status')
        if (response.ok) {
          const result = await response.json()
          if (result.available) {
            this.apiStatus = '✅ RPA Platform + Electron API 可用'
            this.dataSource = 'rpa-platform'
          } else {
            this.apiStatus = '⚠️ RPA Platform可用，Electron API不可用'
            this.dataSource = 'electron-direct'
          }
        } else {
          throw new Error('RPA Platform API不可用')
        }
      } catch (error) {
        if (this.isElectronAvailable) {
          this.apiStatus = '⚠️ 仅Electron直接API可用'
          this.dataSource = 'electron-direct'
        } else {
          this.apiStatus = '❌ 所有API均不可用'
          this.dataSource = 'none'
        }
      }
    },

    toggleDebug() {
      this.debugMode = !this.debugMode
    },

    async loadGroupList() {
      try {
        this.groupList = await getGroupList()
        console.log('[BrowserList] Loaded groups:', this.groupList.length)
      } catch (error) {
        console.error('[BrowserList] Failed to load groups:', error)
      }
    },

    async refreshList() {
      console.log('[BrowserList] Refreshing browser list...')
      this.loading = true

      try {
        if (this.dataSource === 'rpa-platform') {
          // 优先使用 RPA Platform API (通过Electron HTTP API)
          await this.loadFromRpaPlatform()
        } else if (this.dataSource === 'electron-direct') {
          // 直接使用 Electron API
          await this.loadFromElectronDirect()
        } else {
          throw new Error('没有可用的API')
        }
      } catch (error) {
        console.error('[BrowserList] Failed to refresh list:', error)
        this.$message.error('获取浏览器列表失败: ' + error.message)
        this.browserList = []
      } finally {
        this.loading = false
      }
    },

    // 从RPA Platform API加载数据 (推荐方式)
    async loadFromRpaPlatform() {
      const response = await fetch('http://localhost:3001/api/browsers')

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const result = await response.json()
      if (!result.success) {
        throw new Error(result.error || 'RPA API返回失败')
      }

      this.browserList = result.browsers.map(browser => ({
        id: browser.id,
        name: browser.name,
        group: browser.group,
        status: browser.status,
        debugPort: browser.debugPort,
        url: browser.url,
        tabsCount: browser.tabsCount,
        chromeVersion: browser.chromeVersion,
        lastActive: browser.lastActive,
        createdAt: browser.createdAt,
        config: browser.config || {}
      }))

      this.lastUpdateTime = new Date().toLocaleTimeString()
      console.log('[BrowserList] Browser list updated from RPA Platform:', this.browserList.length)

      // 显示统计信息
      if (result.statistics) {
        const { running, total } = result.statistics
        if (running > 0) {
          this.$message.success(
            `✅ 通过RPA Platform获取到 ${running}/${total} 个运行中的浏览器实例`
          )
        } else if (total > 0) {
          this.$message.info(`📋 共有 ${total} 个浏览器实例，当前均未运行`)
        }
      }
    },

    // 直接从Electron API加载数据 (备选方案)
    async loadFromElectronDirect() {
      if (!this.isElectronAvailable) {
        throw new Error('Electron API 不可用')
      }

      const result = await window.electronAPI.getAccounts()

      if (!result || !result.success) {
        throw new Error(result?.error || 'Electron API调用失败')
      }

      this.browserList = result.accounts || []
      this.lastUpdateTime = new Date().toLocaleTimeString()
      console.log('[BrowserList] Browser list updated from Electron API:', this.browserList.length)

      // 获取端口信息
      await this.updatePorts()

      const runningCount = this.browserList.filter(b => b.status === 'running').length
      if (runningCount > 0) {
        this.$message.success(`✅ 通过Electron直接API获取到 ${runningCount} 个运行中的实例`)
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
            if (!this.isElectronAvailable) {
              this.$message.error('Electron API 不可用')
              return
            }

            const account = {
              ...this.browserForm,
              id:
                this.browserForm.id ||
                `account_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              status: 'idle',
              createdAt: this.browserForm.createdAt || Date.now()
            }

            console.log('[BrowserList] Creating account:', account)
            const result = await window.electronAPI.createAccount(account)
            console.log('[BrowserList] Create account result:', result)

            if (result && result.success) {
              this.$message.success(this.editMode ? '修改成功' : '创建成功')
              this.dialogVisible = false
              await this.refreshList()
            } else {
              console.error('[BrowserList] Create account failed:', result?.error)
              this.$message.error(result?.error || '操作失败')
            }
          } catch (error) {
            console.error('[BrowserList] Exception creating account:', error)
            this.$message.error('操作失败: ' + error.message)
          }
        }
      })
    },

    async launchBrowser(browser) {
      try {
        if (!this.isElectronAvailable) {
          this.$message.error('Electron API 不可用')
          return
        }

        console.log('[BrowserList] Launching browser:', browser.id)
        const result = await window.electronAPI.launchBrowser(browser.id, {})
        console.log('[BrowserList] Launch result:', result)

        if (result && result.success) {
          this.$message.success('浏览器启动成功')
          browser.status = 'running'
          // 刷新列表以获取最新状态
          setTimeout(async () => {
            await this.refreshList()
          }, 2000)
        } else {
          console.error('[BrowserList] Launch failed:', result?.error)
          this.$message.error('启动失败: ' + (result?.error || 'Unknown error'))
        }
      } catch (error) {
        console.error('[BrowserList] Exception launching browser:', error)
        this.$message.error('启动失败: ' + error.message)
      }
    },

    async closeBrowser(browser) {
      try {
        if (!this.isElectronAvailable) {
          this.$message.error('Electron API 不可用')
          return
        }

        const result = await window.electronAPI.closeBrowser(browser.id)
        if (result && result.success) {
          this.$message.success('浏览器已关闭')
          browser.status = 'idle'
          browser.debugPort = undefined
          // 刷新列表以获取最新状态
          setTimeout(async () => {
            await this.refreshList()
          }, 1000)
        } else {
          this.$message.error('关闭失败: ' + (result?.error || 'Unknown error'))
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

        if (!this.isElectronAvailable) {
          this.$message.error('Electron API 不可用')
          return
        }

        const result = await window.electronAPI.deleteAccount(browser.id)
        if (result && result.success) {
          this.$message.success('删除成功')
          await this.refreshList()
        } else {
          this.$message.error('删除失败: ' + (result?.error || 'Unknown error'))
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
      } else {
        // 如果正在运行，显示更多信息
        this.showBrowserDetails(row)
      }
    },

    // 新增：显示浏览器详情
    async showBrowserDetails(browser) {
      if (browser.debugPort) {
        try {
          const response = await fetch(`http://localhost:3001/api/browsers/${browser.id}/tabs`)
          if (response.ok) {
            const result = await response.json()
            if (result.success && result.tabs.length > 0) {
              const tabsInfo = result.tabs.map(tab => `${tab.title} (${tab.url})`).join('\n')
              this.$alert(
                `调试端口: ${browser.debugPort}\n标签页数: ${result.tabs.length}\n\n${tabsInfo}`,
                `浏览器详情 - ${browser.name}`,
                { confirmButtonText: '确定' }
              )
            } else {
              this.$message.info(`浏览器 ${browser.name} 当前没有打开的标签页`)
            }
          }
        } catch (error) {
          this.$message.warning('无法获取浏览器详情: ' + error.message)
        }
      }
    },

    async showFingerprintDialog(browser) {
      this.currentBrowserId = browser.id
      this.currentFingerprint = browser.config?.fingerprint || {}
      this.fingerprintDialogVisible = true
    },

    async regenerateFingerprint() {
      try {
        if (!this.isElectronAvailable) {
          this.$message.error('Electron API 不可用')
          return
        }

        const result = await window.electronAPI.generateFingerprint(this.currentBrowserId)
        if (result && result.success) {
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
    },

    // 复制端口号
    copyPort(port) {
      navigator.clipboard
        .writeText(port.toString())
        .then(() => {
          this.$message.success(`端口 ${port} 已复制到剪贴板`)
        })
        .catch(() => {
          this.$message.error('复制失败')
        })
    },

    // 获取端口信息 (仅在直接Electron API模式下使用)
    async updatePorts() {
      if (this.dataSource !== 'electron-direct') return

      for (const browser of this.browserList) {
        if (browser.status === 'running' && !browser.debugPort) {
          try {
            const result = await window.electronAPI.getChromeDebugPort(browser.id)
            if (result?.success && result.port) {
              this.$set(browser, 'debugPort', result.port)
            }
          } catch (error) {
            console.error('获取端口失败:', error)
          }
        }
      }
    },

    // 现有的refreshList方法已经包含了所有刷新逻辑，无需额外的强制刷新方法

    // 辅助方法：截断URL显示
    truncateUrl(url) {
      if (!url) return '-'
      if (url.length <= 50) return url
      return url.substring(0, 47) + '...'
    },

    // 提取Chrome版本号
    extractChromeVersion(versionString) {
      if (!versionString) return '-'

      // 从类似 "Chrome/120.0.6099.109" 的字符串中提取版本号
      const match = versionString.match(/Chrome\/(\d+\.\d+\.\d+\.\d+)/)
      if (match) {
        return match[1]
      }

      // 如果是完整的版本对象，尝试提取
      if (typeof versionString === 'string' && versionString.includes('.')) {
        return versionString.split(' ')[0]
      }

      return versionString.toString().substring(0, 20)
    },

    // 打开URL
    openUrl(url) {
      if (url && (url.startsWith('http') || url.startsWith('https'))) {
        window.open(url, '_blank')
      } else {
        this.$message.warning('无效的URL')
      }
    }
  }
}
</script>

<style scoped>
.browser-container {
  padding: 20px;
}

.status-bar {
  margin-bottom: 20px;
}

.toolbar {
  margin-bottom: 20px;
}

.debug-info {
  background: #f5f5f5;
  padding: 10px;
  margin-bottom: 20px;
  border-radius: 4px;
  font-family: monospace;
  font-size: 12px;
}

.debug-info p {
  margin: 5px 0;
}
</style>
