// server/src/api/workflow.js
import request from '@/utils/request'

const WORKFLOW_API_BASE = process.env.VUE_APP_WORKFLOW_API || 'http://localhost:3000/api'

export function getWorkflows(params = {}) {
  return request({
    url: `${WORKFLOW_API_BASE}/workflows`,
    method: 'get',
    params
  })
}

export function getWorkflowById(id) {
  return request({
    url: `${WORKFLOW_API_BASE}/workflows/${id}`,
    method: 'get'
  })
}

export function createWorkflow(data) {
  return request({
    url: `${WORKFLOW_API_BASE}/workflows`,
    method: 'post',
    data
  })
}

export function updateWorkflow(id, data) {
  return request({
    url: `${WORKFLOW_API_BASE}/workflows/${id}`,
    method: 'put',
    data
  })
}

export function deleteWorkflow(id) {
  return request({
    url: `${WORKFLOW_API_BASE}/workflows/${id}`,
    method: 'delete'
  })
}

export function executeWorkflow(id, params = {}) {
  return request({
    url: `${WORKFLOW_API_BASE}/workflows/${id}/execute`,
    method: 'post',
    data: params
  })
}

export function getWorkflowExecution(workflowId, executionId) {
  return request({
    url: `${WORKFLOW_API_BASE}/workflows/${workflowId}/executions/${executionId}`,
    method: 'get'
  })
}

export function getWorkflowExecutions(workflowId, params = {}) {
  return request({
    url: `${WORKFLOW_API_BASE}/workflows/${workflowId}/executions`,
    method: 'get',
    params
  })
}

export function getWorkflowTemplates() {
  return request({
    url: `${WORKFLOW_API_BASE}/workflows/templates`,
    method: 'get'
  })
}

export function getWorkflowCategories() {
  return request({
    url: `${WORKFLOW_API_BASE}/workflows/categories`,
    method: 'get'
  })
}

// 工作流统计数据
export function getWorkflowStats() {
  return request({
    url: `${WORKFLOW_API_BASE}/workflows/stats`,
    method: 'get'
  })
}

// 克隆工作流
export function cloneWorkflow(id, data = {}) {
  return request({
    url: `${WORKFLOW_API_BASE}/workflows/${id}/clone`,
    method: 'post',
    data
  })
}

// 导出工作流
export function exportWorkflow(id) {
  return request({
    url: `${WORKFLOW_API_BASE}/workflows/${id}/export`,
    method: 'get',
    responseType: 'blob'
  })
}

// 导入工作流
export function importWorkflow(file) {
  const formData = new FormData()
  formData.append('file', file)

  return request({
    url: `${WORKFLOW_API_BASE}/workflows/import`,
    method: 'post',
    data: formData,
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  })
}

// 启用/禁用工作流
export function toggleWorkflowStatus(id, enabled) {
  return request({
    url: `${WORKFLOW_API_BASE}/workflows/${id}/toggle`,
    method: 'patch',
    data: { enabled }
  })
}

// 获取工作流日志
export function getWorkflowLogs(id, params = {}) {
  return request({
    url: `${WORKFLOW_API_BASE}/workflows/${id}/logs`,
    method: 'get',
    params
  })
}

// 工作流测试运行
export function testWorkflow(id, data = {}) {
  return request({
    url: `${WORKFLOW_API_BASE}/workflows/${id}/test`,
    method: 'post',
    data
  })
}

export default {
  getWorkflows,
  getWorkflowById,
  createWorkflow,
  updateWorkflow,
  deleteWorkflow,
  executeWorkflow,
  getWorkflowExecution,
  getWorkflowExecutions,
  getWorkflowTemplates,
  getWorkflowCategories,
  getWorkflowStats,
  cloneWorkflow,
  exportWorkflow,
  importWorkflow,
  toggleWorkflowStatus,
  getWorkflowLogs,
  testWorkflow
}
