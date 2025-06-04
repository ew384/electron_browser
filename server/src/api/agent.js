import request from '@/utils/request'

// 获取智能体列表
export function getAgentList(params) {
  return request({
    url: '/api/agents',
    method: 'get',
    params
  })
}

// 创建智能体
export function createAgent(data) {
  return request({
    url: '/api/agents',
    method: 'post',
    data
  })
}

// 更新智能体
export function updateAgent(id, data) {
  return request({
    url: `/api/agents/${id}`,
    method: 'put',
    data
  })
}

// 删除智能体
export function deleteAgent(id) {
  return request({
    url: `/api/agents/${id}`,
    method: 'delete'
  })
}

// 获取智能体详情
export function getAgentDetail(id) {
  return request({
    url: `/api/agents/${id}`,
    method: 'get'
  })
}

// 发送聊天消息（预留接口）
export function sendChatMessage(data) {
  return request({
    url: '/api/chat/send',
    method: 'post',
    data
  })
}

// 获取聊天历史
export function getChatHistory(agentId, params) {
  return request({
    url: `/api/chat/history/${agentId}`,
    method: 'get',
    params
  })
}

// 清空聊天历史
export function clearChatHistory(agentId) {
  return request({
    url: `/api/chat/history/${agentId}`,
    method: 'delete'
  })
}

// 上传文件
export function uploadFile(file) {
  const formData = new FormData()
  formData.append('file', file)

  return request({
    url: '/api/upload',
    method: 'post',
    data: formData,
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  })
}
