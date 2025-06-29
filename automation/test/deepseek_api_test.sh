curl -X POST http://localhost:3212/api/llm/test1/chat/deepseek \
  -H "Content-Type: application/json" \
  -d '{"prompt": "写一个python的hello world程序", "stream": false}'

  