#!/bin/bash

# LLM API 测试案例集
# 使用前请确保 LLM 服务运行在 http://localhost:3212
__comment() {
{
  "success": true,
  "response": {
    "id": "chatcmpl-114a2a52-d6e7-4e39-a2cc-c259fbe1416a",
    "created": 1750994472,
    "model": "Claude 4.0 Sonnet",
    "messages": [
      {
        "role": "user",
        "content": "xxxx"
      },
      {
        "role": "assistant",
        "content": "xxxx"
      },
      {
        "role": "user",
        "content": "xxxx"
      },
      {
        "role": "assistant",
        "content": "xxxx"
      }
    ],
    "usage": {
      "prompt_tokens": -1,
      "completion_tokens": -1,
      "total_tokens": -1
    },
    "provider": "claude",
    "conversationId": "114a2a52-d6e7-4e39-a2cc-c259fbe1416a"
  },
  "conversationId": "114a2a52-d6e7-4e39-a2cc-c259fbe1416a",
  "provider": "claude",
  "timing": {
    "completedAt": 1750994472241
  }
}
}

set -e  # 遇到错误时退出

BASE_URL="http://127.0.0.1:3212"
API_KEY="test1"
PROVIDER="claude"

echo "🚀 开始 LLM API 测试..."
echo "📍 服务地址: $BASE_URL"
echo "🔑 API Key: $API_KEY"
echo "🤖 Provider: $PROVIDER"
echo ""


# ==================== 4. 简单对话测试 ====================
echo "4️⃣  测试简单对话..."
CHAT_RESPONSE=$(curl -s -X POST "$BASE_URL/api/llm/$API_KEY/chat/$PROVIDER" \
    -H "Content-Type: application/json" \
    -d '{"prompt": "请简单介绍一下你是谁"}')

echo "$CHAT_RESPONSE" | jq '.'

if [[ $(echo "$CHAT_RESPONSE" | jq -r '.success') == "true" ]]; then
    echo "✅ 简单对话测试成功"
    CONVERSATION_ID=$(echo "$CHAT_RESPONSE" | jq -r '.conversationId')
    echo "📝 对话ID: $CONVERSATION_ID"
else
    echo "❌ 简单对话测试失败"
    echo "$CHAT_RESPONSE" | jq '.error'
fi
echo ""

# ==================== 5. 代码生成测试 ====================
echo "5️⃣  测试代码生成..."
CODE_RESPONSE=$(curl -s -X POST "$BASE_URL/api/llm/$API_KEY/chat/$PROVIDER" \
    -H "Content-Type: application/json" \
    -d '{"prompt": "请用Python写一个计算给定单词里某个字母的数量函数"}')

echo "代码生成响应结构:"
echo "$CODE_RESPONSE"| jq '.'
